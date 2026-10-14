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
import type { GraphEdge, GraphNode } from "@/lib/graph";
import { edgeRole, highlightFor, nodeRole } from "@/lib/highlight";
import type { EdgeRole, Role } from "@/lib/highlight";
import { BAND_GUTTER, NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import type { Band, Label, Position as Point } from "@/lib/layout";
import { useDoneCourses } from "@/lib/doneCourses";
import { groupBySubject, outsideCourses } from "@/lib/outside";
import { countStatuses, courseProgress } from "@/lib/progress";
import type { CourseStatus } from "@/lib/progress";
import type { Course } from "@/lib/types";
import CourseDetails from "./CourseDetails";
import OutsideCourses from "./OutsideCourses";
import ProgressBar from "./ProgressBar";
import SelectionBar from "./SelectionBar";
import { FADED, PLAIN_BOX, STATUS_BOX, STATUS_TEXT, TickBox } from "./Status";

// A course with its position, worked out at build time by layoutGraph.
export type PlacedCourse = GraphNode & Point;

interface CourseGraphProps {
  courses: PlacedCourse[];
  edges: GraphEdge[];
  labels: Label[]; // section titles, e.g. "Co-op work terms"
  bands: Band[]; // the shaded strip behind each year
  width: number; // width of the graph's widest row
  details: Course[]; // the full calendar records, for the side panel
  calendarUrl: string;
}

type CourseData = {
  code: string;
  title: string;
  noRequirements: boolean;
  role: Role;
  status: CourseStatus | null; // null when no courses are marked done yet
  marking: boolean; // quick mode: show a tick box on every course
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
// The handles are where edges attach. They're invisible because nobody draws new edges here.
function CourseNode({ data }: NodeProps<CourseNodeType>) {
  const { role, status } = data;
  const box = status ? STATUS_BOX[status] : PLAIN_BOX;
  const border = ROLE_BORDERS[role] ?? box.border;
  // Dimmed by a click wins over faded by status, so the lit-up path stays clear.
  const opacity = role === "dimmed" ? "opacity-25" : status && FADED.has(status) ? "opacity-50" : "";
  return (
    <div
      className={`relative flex h-full w-full cursor-pointer flex-col justify-center rounded-lg px-2.5 shadow-sm transition-opacity ${box.fill} ${border} ${opacity}`}
    >
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
// Room left above the first year at the start, so the bar over the top-left of the graph
// doesn't cover the "100-level" label. On phones the bar wraps onto two lines.
const TOP_ROOM = 72;
const TOP_ROOM_PHONE = 104;

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
  courses,
  edges,
  labels,
  bands,
  width,
  details,
  calendarUrl,
}: CourseGraphProps) {
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

  // Every course's status. Shown on the graph once at least one course is marked done.
  const progress = useMemo(() => courseProgress(details, done), [details, done]);
  const counts = useMemo(() => countStatuses(progress), [progress]);
  const showProgress = done.size > 0;

  // Courses the prerequisites mention that aren't on the map, which can be ticked too.
  const outside = useMemo(() => outsideCourses(details), [details]);
  const outsideSet = useMemo(() => new Set(outside), [outside]);
  const outsideGroups = useMemo(() => groupBySubject(outside), [outside]);
  const outsideTicked = outside.filter((code) => done.has(code)).length;

  const highlight = useMemo(
    () => (selected === null ? null : highlightFor(selected, edges)),
    [selected, edges],
  );

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
    let room = TOP_ROOM;
    if (fitZoom < MIN_START_ZOOM) {
      room = TOP_ROOM_PHONE;
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

  // When a course is selected, make sure it's on screen. The side panel takes room from the
  // graph, and a course picked in the panel can be anywhere. Waits one frame so the graph
  // has its new size first.
  useEffect(() => {
    if (selected === null || flow === null) return;
    const frame = requestAnimationFrame(() => {
      const course = placed.get(selected);
      const box = canvasRef.current?.getBoundingClientRect();
      if (!course || !box) return;
      const topLeft = flow.flowToScreenPosition({ x: course.x, y: course.y });
      const bottomRight = flow.flowToScreenPosition({ x: course.x + NODE_WIDTH, y: course.y + NODE_HEIGHT });
      const onScreen =
        topLeft.x >= box.left && topLeft.y >= box.top && bottomRight.x <= box.right && bottomRight.y <= box.bottom;
      if (!onScreen) {
        flow.setCenter(course.x + NODE_WIDTH / 2, course.y + NODE_HEIGHT / 2, {
          zoom: flow.getZoom(),
          duration: 400,
        });
      }
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
      // What screen readers say after the course name, e.g. "Can take" or "Not marked".
      const spoken = marking ? (status ? "Marked as done" : "Not marked") : status && STATUS_TEXT[status];
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
  }, [bands, width, courses, labels, highlight, progress, done, marking, showProgress]);

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

  const selectedCourse = selected === null ? undefined : records.get(selected);

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
          ariaLabelConfig={marking ? markingHints : exploreHints}
        >
          <Controls showInteractive={false} />
          <Panel position="top-left" className="flex flex-col items-start gap-2">
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
      {selectedCourse && highlight && panelOpen && (
        <CourseDetails
          course={selectedCourse}
          highlight={highlight}
          progress={showProgress ? progress.get(selectedCourse.code) : undefined}
          done={done}
          onToggle={toggle}
          onMap={onMap}
          outside={outsideSet}
          calendarUrl={calendarUrl}
          onSelect={setSelected}
          onClose={() => setPanelOpen(false)}
        />
      )}
      {marking && outsideOpen && (
        <OutsideCourses
          groups={outsideGroups}
          done={done}
          onToggle={toggle}
          onClose={() => setOutsideOpen(false)}
        />
      )}
    </div>
  );
}
