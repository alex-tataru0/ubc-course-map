"use client";

import {
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  type ColorMode,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { edgeRole, highlightFor, nodeRole, pathHighlight } from "@/lib/highlight";
import type { EdgeRole, Role } from "@/lib/highlight";
import { BAND_GUTTER, NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import { useDoneCourses } from "@/lib/doneCourses";
import { groupBySubject, outsideCourses } from "@/lib/outside";
import { planPath } from "@/lib/path";
import {
  creditsLookup,
  programCodes,
  programCourses,
  programProgress,
  programSubject,
  programSummary,
  shortName,
} from "@/lib/program";
import type { ProgramKind } from "@/lib/program";
import { useProgramChoice } from "@/lib/programChoice";
import { countStatuses, courseProgress, WONT_TAKE } from "@/lib/progress";
import type { CourseStatus } from "@/lib/progress";
import type { SubjectMap } from "@/lib/subjectMap";
import type { Elsewhere } from "@/lib/subjects";
import type { Course, CourseGrades, Program } from "@/lib/types";
import { centeredViewport, fullyVisible } from "@/lib/view";
import CourseDetails from "./CourseDetails";
import OutsideCourses from "./OutsideCourses";
import ProgramButton from "./ProgramButton";
import ProgramPanel from "./ProgramPanel";
import ProgramStripe from "./ProgramStripe";
import ProgressBar from "./ProgressBar";
import SelectionBar from "./SelectionBar";
import { FADED, PLAIN_BOX, STATUS_BOX, STATUS_TEXT, TickBox } from "./Status";

interface CourseGraphProps {
  map: SubjectMap; // the subject shown, with its courses already placed
  maps: SubjectMap[]; // every subject's map, to know where a course from another subject is
  onSubject: (code: string) => void; // show another subject's map
  addressCourse: string | null; // the course the address names (#math-221), to open
  onAddressCourse: (code: string | null) => void; // keeps the address on the open course
  elsewhere: Elsewhere; // links to courses on other faculties' pages
  details: Course[]; // the full calendar records of every subject, for the side panel
  grades: Record<string, CourseGrades>; // from UBCGrades, for the courses that have any
  gradeSessions: string[]; // the terms the grade data covers, oldest first
  programs: Program[]; // the programs you can pick, e.g. the Computer Science Major
  otherPrograms: Program[]; // other faculties' programs, in case one was picked on their page
  programUrl: string; // the calendar page they come from
  programsNote: string; // under the list of programs
  programsByMajor: boolean; // list them by major (Science) or each on its own (engineering)
  closed: string[]; // other faculties' courses this page's students usually can't take
}

type CourseData = {
  code: string;
  title: string;
  noRequirements: boolean;
  role: Role;
  status: CourseStatus | null; // null when no courses are marked done yet
  marking: boolean; // quick mode: show a tick box on every course
  pathTerm: number | null; // its term on the path shown on the map (1, 2, …), if any
  program: ProgramKind | null; // how the picked program names it, if it does
};
type CourseNodeType = Node<CourseData, "course">;
type LabelNodeType = Node<{ text: string }, "label">;
type BandNodeType = Node<{ year: number; shaded: boolean }, "band">;
type FlowNode = CourseNodeType | LabelNodeType | BandNodeType;

// The border for each highlight role, replacing the status border while a course is
// clicked. The colours come from globals.css (--role-*). null keeps the status border.
const ROLE_BORDERS: Record<Role, string | null> = {
  normal: null,
  selected: "border-2 border-role-selected ring-4 ring-role-selected/30",
  needs: "border-2 border-role-needs",
  unlocks: "border-2 border-role-unlocks",
  dimmed: null,
};

// One course box: the code, the title cut off with "…" if it's too long, and a third line:
// the course's status once some courses are marked done, otherwise "No requirements"
// for courses anyone can take. While marking courses, a tick box sits in the corner.
// Courses in the picked program get a stripe down the left edge.
// The handles are where edges attach. They're invisible because nobody draws new edges here.
function CourseNode({ data }: NodeProps<CourseNodeType>) {
  const { role, status } = data;
  const box = status ? STATUS_BOX[status] : PLAIN_BOX;
  const border = ROLE_BORDERS[role] ?? box.border;
  // While a course is clicked, its highlight decides what stands out: lit-up courses stay
  // solid even if you can't take them yet, and the rest dim. Otherwise statuses fade the
  // courses you can't take yet.
  let opacity = "";
  if (role === "dimmed") opacity = "opacity-25";
  else if (role === "normal" && status && FADED.has(status)) opacity = "opacity-50";
  return (
    <div
      className={`relative flex h-full w-full cursor-pointer flex-col justify-center rounded-lg pr-2.5 shadow-sm transition-opacity ${
        data.program ? "pl-3.5" : "pl-2.5"
      } ${box.fill} ${border} ${opacity}`}
    >
      {data.program && (
        // Inside the border, so the highlight and status borders still go all the way round.
        <ProgramStripe kind={data.program} className="absolute inset-y-0 left-0 w-[7px] rounded-l-[7px]" />
      )}
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <div className="text-[15px] font-semibold leading-tight">{data.code}</div>
      <div
        className={`truncate pr-3 text-[11px] leading-tight ${status === "done" ? "opacity-75" : "text-ink-muted"}`}
        title={data.title}
      >
        {data.title}
      </div>
      {status ? (
        <div className="mt-0.5 text-[11px] font-medium leading-tight">
          {status === "done" && "✓ "}
          {STATUS_TEXT[status]}
        </div>
      ) : (
        data.noRequirements && (
          <div className="mt-0.5 text-[11px] font-medium leading-tight">No requirements</div>
        )
      )}
      {data.marking && <TickBox checked={status === "done"} className="absolute right-1.5 top-1.5" />}
      {data.pathTerm !== null && (
        // The term number for a course on the path, on the box's top-right corner.
        <span
          className={`absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${
            role === "selected" ? "bg-role-selected" : "bg-role-needs"
          }`}
          aria-hidden
        >
          {data.pathTerm}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="opacity-0" />
    </div>
  );
}

// Plain text placed on the canvas, used for section titles.
function LabelNode({ data }: NodeProps<LabelNodeType>) {
  return (
    <div className="whitespace-nowrap text-base font-semibold text-ink">{data.text}</div>
  );
}

// The shaded strip behind one year of the graph, labelled on the left.
function BandNode({ data }: NodeProps<BandNodeType>) {
  return (
    <div className={`h-full w-full rounded-2xl ${data.shaded ? "bg-band-a" : "bg-band-b"}`}>
      <div className="px-5 pt-4" style={{ width: BAND_GUTTER }}>
        <div className="text-lg font-semibold text-ink">{data.year}00-level</div>
        <div className="text-xs text-ink-muted">Usually year {data.year}</div>
      </div>
    </div>
  );
}

// Defined outside the component so React Flow gets the same object on every render.
const nodeTypes = { course: CourseNode, label: LabelNode, band: BandNode };

// What screen readers announce on a focused course, replacing React Flow's default
// (which talks about moving and deleting nodes, which this site doesn't do).
const KEYBOARD_HINT = "Press Enter or Space to see what this course needs and unlocks. Press Escape to clear.";
const MARKING_HINT = "Press Enter or Space to mark or unmark this course as done. Press Escape to finish.";
// Below this zoom the course codes get hard to read, so narrow screens (phones) start
// on the first two years instead of the whole width of the graph.
const MIN_START_ZOOM = 0.5;
// Space left between the bars over the top-left of the graph and the first year at the start,
// so the bars don't cover the "100-level" label.
const TOP_GAP = 12;

function hintConfig(hint: string) {
  return { "node.a11yDescription.default": hint, "node.a11yDescription.keyboardDisabled": hint };
}
const exploreHints = hintConfig(KEYBOARD_HINT);
const markingHints = hintConfig(MARKING_HINT);

// Edge colours by role. undefined keeps React Flow's default grey.
const EDGE_COLORS: Record<EdgeRole, string | undefined> = {
  normal: undefined,
  needs: "var(--role-needs)",
  unlocks: "var(--role-unlocks)",
  dimmed: undefined,
};

// Light or dark, following the computer's setting.
// React Flow's own colorMode="system" doesn't work with the static export: the page is
// pre-rendered at build time with no screen to ask, so it gets "light", and React keeps
// that class when the page loads. useSyncExternalStore renders "light" at build time
// (getServerSnapshot), then re-renders with the real setting in the browser, and again
// whenever it changes.
const darkQuery = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(darkQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useSystemColorMode(): ColorMode {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(darkQuery).matches ? "dark" : "light"),
    () => "light",
  );
}

export default function CourseGraph({
  map,
  maps,
  onSubject,
  addressCourse,
  onAddressCourse,
  elsewhere,
  details,
  grades,
  gradeSessions,
  programs,
  otherPrograms,
  programUrl,
  programsNote,
  programsByMajor,
  closed,
}: CourseGraphProps) {
  const { subject, courses, edges, labels, bands, width, calendarUrl } = map;
  const colorMode = useSystemColorMode();
  // The highlighted course, and whether its side panel is open. Closing the panel keeps
  // the highlight, so the lines can be seen on a phone (where the panel covers the graph).
  const [selected, setSelected] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // The React Flow instance, so we can move the view. Set once the graph has loaded.
  const [flow, setFlow] = useState<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // The courses marked done (saved in the browser), and quick mode, where a click ticks
  // a course instead of opening it. In quick mode, the list of courses not on the map
  // (MATH, STAT, …) can be open where the side panel goes.
  const { done, toggle, clear } = useDoneCourses();
  const [marking, setMarking] = useState(false);
  const [outsideOpen, setOutsideOpen] = useState(false);

  const placed = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const records = useMemo(() => new Map(details.map((c) => [c.code, c])), [details]);
  const onMap = useMemo(() => new Set(placed.keys()), [placed]);
  // The subject whose map each course is on, so a course from another subject (MATH 221 in
  // CPSC 340's panel) can be opened on its own map.
  const mapOf = useMemo(
    () => new Map(maps.flatMap((m) => m.courses.map((c) => [c.id, m.subject] as const))),
    [maps],
  );
  const onAnyMap = useMemo(() => new Set(mapOf.keys()), [mapOf]);
  const closedSet = useMemo(() => new Set(closed), [closed]);

  // Every course's status, in every subject, since prerequisites cross subjects.
  // Shown on the graph once at least one course is marked done. The bar counts this map's.
  const progress = useMemo(() => courseProgress(details, done), [details, done]);
  const counts = useMemo(
    () => countStatuses(new Map([...progress].filter(([code]) => onMap.has(code)))),
    [progress, onMap],
  );
  const showProgress = done.size > 0;

  // Courses that the prerequisites on this map mention but that aren't on it, which can be
  // ticked without switching maps (MATH 221 on the CPSC map). A program's own map (CPSC for the
  // CS programs, ELEC for Electrical Engineering) also lists
  // the other courses they need (MATH 100, SCIE 113, …).
  const subjectPrograms = useMemo(
    () => programs.filter((p) => programSubject(p) === subject),
    [programs, subject],
  );
  const outside = useMemo(
    () =>
      outsideCourses(
        details.filter((c) => onMap.has(c.code)),
        programCodes(subjectPrograms),
      ),
    [details, onMap, subjectPrograms],
  );
  const outsideSet = useMemo(() => new Set(outside), [outside]);
  const outsideGroups = useMemo(() => groupBySubject(outside), [outside]);
  const outsideTicked = outside.filter((code) => done.has(code)).length;

  // The shortest path to the selected course from the courses done, shown in the side panel.
  // With "Show this path on the map" on, the map lights up just that path, with term numbers,
  // instead of every course the selected one could need. The switch stays as it is while
  // you click around. There's no path to a course you wouldn't take (CPSC 107 after 110).
  const [showPath, setShowPath] = useState(false);
  const path = useMemo(
    () =>
      selected === null ? null : planPath(selected, details, done, { home: onAnyMap, closed: closedSet }),
    [selected, details, done, onAnyMap, closedSet],
  );
  const selectedStatus = selected === null ? undefined : progress.get(selected)?.status;
  const wontTake = selectedStatus !== undefined && WONT_TAKE.has(selectedStatus);
  const pathOnMap = showPath && path !== null && path.terms.length > 0 && !wontTake;

  // On another subject's map, a course picked on the old one is let go, unless the new map
  // has it too. Adjusting state while rendering is how React suggests following a prop change.
  const [shownSubject, setShownSubject] = useState(subject);
  if (shownSubject !== subject) {
    setShownSubject(subject);
    if (selected !== null && !onMap.has(selected)) setSelected(null);
  }

  // A course named in the address opens with its panel: a link like /engineering#cpen-221, or
  // the back button. Only when the address changes, so closing a panel doesn't reopen it.
  const [shownAddress, setShownAddress] = useState<string | null>(null);
  if (shownAddress !== addressCourse) {
    setShownAddress(addressCourse);
    if (addressCourse !== null && addressCourse !== selected && placed.has(addressCourse)) {
      setSelected(addressCourse);
      setPanelOpen(true);
    }
  }

  const highlight = useMemo(() => {
    // A course from another map has nothing to light up on this one.
    if (selected === null || !onMap.has(selected)) return null;
    if (!pathOnMap) return highlightFor(selected, edges);
    const toTake = new Set(path.terms.flat().filter((code) => code !== selected));
    return pathHighlight(selected, toTake, edges);
  }, [selected, onMap, edges, pathOnMap, path]);

  // Each path course's term number (1, 2, …) for the badges on the map.
  const pathTerms = useMemo(() => {
    const terms = new Map<string, number>();
    if (pathOnMap) path.terms.forEach((codes, i) => codes.forEach((code) => terms.set(code, i + 1)));
    return terms;
  }, [pathOnMap, path]);

  // The picked program (saved in the browser) and its panel, which opens in the same place
  // as the course details. The course details cover it while they're open, with a link
  // back to it.
  const { programId, pickProgram } = useProgramChoice();
  // The saved program can be from another faculty's page. An old, unknown id is none.
  const program = [...programs, ...otherPrograms].find((p) => p.id === programId) ?? null;
  const [programOpen, setProgramOpen] = useState(false);
  const creditsFor = useMemo(() => creditsLookup(details), [details]);
  const programRows = useMemo(
    () => (program ? programProgress(program, done, creditsFor) : null),
    [program, done, creditsFor],
  );
  const programSummaryNow = programRows ? programSummary(programRows, done, creditsFor) : null;
  const programKinds = useMemo(() => (program ? programCourses(program) : null), [program]);

  // The view to start with: the whole width of the graph with the year labels on the
  // left, starting at the top of first year, below the bar. On screens too narrow to show
  // that at a readable size, it centres on the 100- and 200-level courses at MIN_START_ZOOM.
  // The fit-view button in the corner still shows everything.
  const showStart = (instance: ReactFlowInstance<FlowNode, Edge>) => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box || bands.length === 0) return;
    const margin = 16;
    const top = bands[0].top;
    let left = -BAND_GUTTER; // the year labels
    let right = width + 30; // the right end of the bands
    const fitZoom = (box.width - 2 * margin) / (right - left);
    // The first year starts below the bars, however tall they are: they wrap onto more lines
    // on phones, and grow once courses are marked or a program is picked.
    const bars = canvasRef.current?.querySelector(".react-flow__panel.top.left");
    const room = (bars ? bars.getBoundingClientRect().bottom - box.top : 60) + TOP_GAP;
    if (fitZoom < MIN_START_ZOOM) {
      const endOfYear2 = bands[Math.min(1, bands.length - 1)].bottom;
      const start = courses.filter((c) => c.y < endOfYear2);
      left = Math.min(...start.map((c) => c.x));
      right = Math.max(...start.map((c) => c.x + NODE_WIDTH));
    }
    const zoom = Math.min(1, Math.max(MIN_START_ZOOM, fitZoom));
    instance.setViewport({
      x: box.width / 2 - ((left + right) / 2) * zoom,
      y: room - top * zoom,
      zoom,
    });
  };

  const onInit = (instance: ReactFlowInstance<FlowNode, Edge>) => {
    setFlow(instance);
    showStart(instance);
  };

  // Another subject's map starts at its own start view. The effect below then brings a course
  // opened from another map (MATH 221 from CPSC 340's panel) into view.
  const viewSubject = useRef(subject);
  useEffect(() => {
    if (flow === null || viewSubject.current === subject) return;
    viewSubject.current = subject;
    showStart(flow);
    // Only a new subject should move the view, so showStart isn't a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, flow]);

  // When a course is selected, make sure it's in sight: on screen and not under the bars over
  // the top-left. The side panel takes room from the graph, and a course picked in the panel
  // can be anywhere. Waits one frame so the graph has its new size first.
  useEffect(() => {
    if (selected === null || flow === null) return;
    const frame = requestAnimationFrame(() => {
      const course = placed.get(selected);
      const canvas = canvasRef.current;
      if (!course || !canvas) return;
      const box = canvas.getBoundingClientRect();
      const bars = canvas.querySelector(".react-flow__panel.top.left")?.getBoundingClientRect();
      const topLeft = flow.flowToScreenPosition({ x: course.x, y: course.y });
      const bottomRight = flow.flowToScreenPosition({ x: course.x + NODE_WIDTH, y: course.y + NODE_HEIGHT });
      const courseBox = { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
      if (fullyVisible(courseBox, box, bars ? [bars] : [])) return;
      // Centred in the room below the bars. Worked out from the graph's size on the page,
      // because React Flow's own setCenter still uses the size from before the panel opened.
      const room = { left: 0, top: bars ? bars.bottom - box.top : 0, right: box.width, bottom: box.height };
      const middle = { x: course.x + NODE_WIDTH / 2, y: course.y + NODE_HEIGHT / 2 };
      flow.setViewport(centeredViewport(middle, room, flow.getZoom()), { duration: 400 });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, panelOpen, flow, placed]);

  // Esc clears the selection, and leaves quick mode.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setMarking(false);
        setOutsideOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const nodes = useMemo(() => {
    // Year bands go first and lowest, behind the edges. They ignore the mouse,
    // so clicking one counts as clicking the background.
    const result: FlowNode[] = bands.map((band, i) => ({
      id: `band-${band.year}`,
      type: "band",
      position: { x: -BAND_GUTTER, y: band.top },
      width: width + BAND_GUTTER + 30,
      height: band.bottom - band.top,
      zIndex: -1,
      selectable: false,
      focusable: false,
      style: { pointerEvents: "none" },
      data: { year: band.year, shaded: i % 2 === 0 },
    }));
    for (const c of courses) {
      // While marking, only "done" shows, so each box reads as ticked or not.
      let status: CourseStatus | null = null;
      if (marking) status = done.has(c.id) ? "done" : null;
      else if (showProgress) status = progress.get(c.id)?.status ?? null;
      // What screen readers say after the course name, e.g. "Can take" or "Not marked",
      // and how the picked program names it.
      const kind = programKinds?.get(c.id) ?? null;
      const parts = [marking ? (status ? "Marked as done" : "Not marked") : status && STATUS_TEXT[status]];
      if (kind && program) {
        parts.push(`${kind === "required" ? "Required for" : "One of the choices for"} ${program.name}`);
      }
      const spoken = parts.filter(Boolean).join(". ");
      result.push({
        id: c.id,
        type: "course",
        position: { x: c.x, y: c.y },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        zIndex: 2, // above every edge, so lines pass behind the boxes instead of over their text
        ariaLabel: spoken ? `${c.id}: ${c.title}. ${spoken}` : `${c.id}: ${c.title}`,
        data: {
          code: c.id,
          title: c.title,
          noRequirements: c.noRequirements,
          role: nodeRole(highlight, c.id),
          status,
          marking,
          pathTerm: pathTerms.get(c.id) ?? null,
          program: kind,
        },
      });
    }
    labels.forEach((label, i) => {
      result.push({
        id: `label-${i}`,
        type: "label",
        position: { x: label.x, y: label.y },
        data: { text: label.text },
        selectable: false,
        focusable: false,
      });
    });
    return result;
  }, [
    bands, width, courses, labels, highlight, progress, done, marking, showProgress, pathTerms,
    programKinds, program,
  ]);

  const flowEdges = useMemo(
    (): Edge[] =>
      edges.map((e) => {
        const role = edgeRole(highlight, e);
        const color = EDGE_COLORS[role];
        const lit = role === "needs" || role === "unlocks";
        return {
          id: `${e.source}->${e.target}`,
          source: e.source,
          target: e.target,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          zIndex: lit ? 1 : 0, // highlighted edges on top of the other edges (still under the boxes)
          style: {
            // Solid = required. Dashed = one of several options.
            strokeDasharray: e.kind === "option" ? "6 4" : undefined,
            stroke: color,
            strokeWidth: lit ? 2 : 1,
            opacity: role === "dimmed" ? 0.15 : 1,
          },
        };
      }),
    [edges, highlight],
  );

  // Clicking a course highlights it and opens its panel. Clicking it again clears it,
  // unless its panel was closed, in which case the panel opens again.
  // In quick mode a click ticks or unticks the course instead.
  const choose = (id: string) => {
    if (marking) {
      toggle(id);
    } else if (id === selected && panelOpen) {
      setSelected(null);
    } else {
      setSelected(id);
      setPanelOpen(true);
    }
  };

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type === "course") choose(node.id);
  };

  // Tab moves between courses (React Flow makes each one focusable and pans to it).
  // Enter or Space on a focused course works like a click.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const node = (event.target as HTMLElement).closest(".react-flow__node-course");
    const id = node?.getAttribute("data-id");
    if (id) {
      event.preventDefault(); // stop Space from scrolling the page
      choose(id);
    }
  };

  // Quick mode starts with nothing highlighted, so the only colours are the ticks.
  // On wide screens the list of other subjects opens beside the graph straight away;
  // on phones it would cover the graph, so it waits for its button.
  const startMarking = () => {
    setSelected(null);
    setPanelOpen(false);
    setMarking(true);
    setOutsideOpen(window.matchMedia("(min-width: 768px)").matches);
  };

  const finishMarking = () => {
    setMarking(false);
    setOutsideOpen(false);
  };

  // Opens a course's details, on its own subject's map if it's on another one.
  const openAnywhere = (code: string) => {
    const where = mapOf.get(code);
    if (where !== undefined && where !== subject) onSubject(where);
    setSelected(code);
    setPanelOpen(true);
  };

  // A course picked in the program panel. While marking, it's ticked instead, like on the map.
  const openCourse = (code: string) => {
    if (marking) toggle(code);
    else openAnywhere(code);
  };

  // Where keyboard focus goes when a side panel closes: the course on the map, the program
  // button, or the first button over the map (the list's own button while marking, "Edit my
  // courses" after).
  const courseBox = (code: string) =>
    document.querySelector<HTMLElement>(`.react-flow__node-course[data-id="${code}"]`);
  const programButton = () => document.getElementById("program-button");
  const firstBarButton = () => document.querySelector<HTMLElement>(".react-flow__panel.top.left button");

  const selectedCourse = selected === null ? undefined : records.get(selected);
  // The place beside the graph shows one panel at a time: the list of other subjects while
  // marking, then the course details, then the program.
  const showOutside = marking && outsideOpen;
  const showDetails = !showOutside && selectedCourse !== undefined && highlight !== null && panelOpen;
  const showProgram = programOpen && !showOutside && !showDetails;

  // The address follows the course whose panel is showing (#cpsc-221), and goes back to the
  // map's own (#cpsc) when it closes, so it can be copied to share the course. Only on a change:
  // on the first render nothing is open yet, and the address may be about to open a course.
  const openNow = showDetails ? selected : null;
  const lastOpen = useRef(openNow);
  useEffect(() => {
    if (lastOpen.current === openNow) return;
    lastOpen.current = openNow;
    onAddressCourse(openNow);
  }, [openNow, onAddressCourse]);

  // The button over the map opens the program panel, bringing it in front of the others,
  // or closes it if it's already showing.
  const toggleProgram = () => {
    if (showProgram) {
      setProgramOpen(false);
    } else {
      setProgramOpen(true);
      setPanelOpen(false);
      setOutsideOpen(false);
    }
  };

  return (
    // On wide screens the side panel sits beside the graph. On phones it covers the graph.
    <div className="relative flex h-full w-full">
      <div ref={canvasRef} onKeyDown={onKeyDown} className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onInit={onInit}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelected(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false} // Tab goes straight to the courses, not to each of the 70 lines
          elementsSelectable={false}
          colorMode={colorMode}
          minZoom={0.1}
          // Scrolling (two fingers on a trackpad, or a mouse wheel) moves around the map like
          // scrolling a page, at the same speed. Zooming is a pinch (trackpad or phone),
          // Ctrl or ⌘ + scroll, or the + and − buttons.
          panOnScroll
          panOnScrollSpeed={1}
          zoomOnScroll={false}
          ariaLabelConfig={marking ? markingHints : exploreHints}
        >
          <Controls showInteractive={false} />
          <Panel position="top-left" className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap items-start gap-2">
              <ProgressBar
                counts={counts}
                marked={done.size}
                outsideTicked={outsideTicked}
                marking={marking}
                outsideOpen={outsideOpen}
                onStart={startMarking}
                onFinish={finishMarking}
                onClear={clear}
                onToggleOutside={() => setOutsideOpen(!outsideOpen)}
              />
              {/* Only on pages with programs to pick. */}
              {programs.length > 0 && (
                <ProgramButton
                  program={program}
                  rowsDone={programSummaryNow?.rowsDone ?? 0}
                  rows={programSummaryNow?.rows ?? 0}
                  open={showProgram}
                  large={done.size === 0 && !marking}
                  onClick={toggleProgram}
                />
              )}
            </div>
            {highlight && !panelOpen && (
              <SelectionBar
                highlight={highlight}
                onDetails={() => setPanelOpen(true)}
                onClear={() => setSelected(null)}
              />
            )}
          </Panel>
        </ReactFlow>
      </div>
      {showDetails && (
        <CourseDetails
          course={selectedCourse}
          highlight={highlight}
          progress={showProgress ? progress.get(selectedCourse.code) : undefined}
          path={path}
          showPath={showPath}
          onShowPath={setShowPath}
          done={done}
          onToggle={toggle}
          subject={subject}
          onMap={onAnyMap}
          outside={outsideSet}
          elsewhere={elsewhere}
          grades={grades[selectedCourse.code]}
          gradeSessions={gradeSessions}
          calendarUrl={calendarUrl}
          onSelect={openAnywhere}
          onClose={() => setPanelOpen(false)}
          focusOnClose={() => courseBox(selectedCourse.code)}
          // Back to the program panel underneath, clearing the highlight.
          backTo={
            programOpen
              ? { label: program ? shortName(program) : "Pick a program", onBack: () => setSelected(null) }
              : undefined
          }
        />
      )}
      {showOutside && (
        <OutsideCourses
          subject={subject}
          withPrograms={subjectPrograms.length > 0}
          groups={outsideGroups}
          done={done}
          onToggle={toggle}
          onClose={() => setOutsideOpen(false)}
          focusOnClose={firstBarButton}
        />
      )}
      {showProgram && (
        <ProgramPanel
          programs={programs}
          program={program}
          progress={programRows}
          creditsFor={creditsFor}
          calendarUrl={programUrl}
          note={programsNote}
          byMajor={programsByMajor}
          onPick={pickProgram}
          onClose={() => setProgramOpen(false)}
          focusOnClose={programButton}
          onMap={onAnyMap}
          elsewhere={elsewhere}
          onOpen={openCourse}
          done={done}
          onToggle={toggle}
        />
      )}
    </div>
  );
}
