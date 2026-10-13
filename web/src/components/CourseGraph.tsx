"use client";

import {
  Controls,
  Handle,
  MarkerType,
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
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { GraphEdge, GraphNode } from "@/lib/graph";
import { edgeRole, highlightFor, nodeRole } from "@/lib/highlight";
import type { EdgeRole, Role } from "@/lib/highlight";
import { BAND_GUTTER, NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import type { Band, Label, Position as Point } from "@/lib/layout";
import type { Course } from "@/lib/types";
import CourseDetails from "./CourseDetails";

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

type CourseData = { code: string; title: string; noRequirements: boolean; role: Role };
type CourseNodeType = Node<CourseData, "course">;
type LabelNodeType = Node<{ text: string }, "label">;
type BandNodeType = Node<{ year: number; shaded: boolean }, "band">;
type FlowNode = CourseNodeType | LabelNodeType | BandNodeType;

// The box style for each role. The colours come from globals.css (--role-*).
const ROLE_CLASSES: Record<Role, string> = {
  normal: "border-line",
  selected: "border-2 border-role-selected ring-4 ring-role-selected/30",
  needs: "border-2 border-role-needs",
  unlocks: "border-2 border-role-unlocks",
  dimmed: "border-line opacity-25",
};

// One course box: the code, the title cut off with "…" if it's too long,
// and "No requirements" for courses anyone can take.
// The handles are where edges attach. They're invisible because nobody draws new edges here.
function CourseNode({ data }: NodeProps<CourseNodeType>) {
  return (
    <div
      className={`flex h-full w-full cursor-pointer flex-col justify-center rounded-lg border bg-surface px-2.5 text-ink shadow-sm transition-opacity ${ROLE_CLASSES[data.role]}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <div className="text-[15px] font-semibold leading-tight">{data.code}</div>
      <div className="truncate text-[11px] leading-tight text-ink-muted" title={data.title}>
        {data.title}
      </div>
      {data.noRequirements && (
        <div className="mt-0.5 text-[11px] font-medium leading-tight text-ink">
          No requirements
        </div>
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
  const [selected, setSelected] = useState<string | null>(null);
  // The React Flow instance, so we can move the view. Set once the graph has loaded.
  const [flow, setFlow] = useState<ReactFlowInstance<FlowNode, Edge> | null>(null);

  const placed = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const records = useMemo(() => new Map(details.map((c) => [c.code, c])), [details]);
  const onMap = useMemo(() => new Set(placed.keys()), [placed]);

  const highlight = useMemo(
    () => (selected === null ? null : highlightFor(selected, edges)),
    [selected, edges],
  );

  // Esc clears the selection.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
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
      result.push({
        id: c.id,
        type: "course",
        position: { x: c.x, y: c.y },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        zIndex: 2, // above every edge, so lines pass behind the boxes instead of over their text
        data: { code: c.id, title: c.title, noRequirements: c.noRequirements, role: nodeRole(highlight, c.id) },
      });
    }
    labels.forEach((label, i) => {
      result.push({
        id: `label-${i}`,
        type: "label",
        position: { x: label.x, y: label.y },
        data: { text: label.text },
        selectable: false,
      });
    });
    return result;
  }, [bands, width, courses, labels, highlight]);

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

  // Clicking a course selects it; clicking it again clears it.
  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type !== "course") return;
    setSelected((current) => (current === node.id ? null : node.id));
  };

  // Clicking a course code in the side panel selects it and moves the view to it,
  // since it may be off screen.
  const selectFromPanel = (code: string) => {
    setSelected(code);
    const course = placed.get(code);
    if (flow && course) {
      flow.setCenter(course.x + NODE_WIDTH / 2, course.y + NODE_HEIGHT / 2, {
        zoom: flow.getZoom(),
        duration: 400,
      });
    }
  };

  const selectedCourse = selected === null ? undefined : records.get(selected);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onInit={setFlow}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelected(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        colorMode={colorMode}
        minZoom={0.1}
        fitView
      >
        <Controls showInteractive={false} />
      </ReactFlow>
      {selectedCourse && highlight && (
        <CourseDetails
          course={selectedCourse}
          highlight={highlight}
          onMap={onMap}
          calendarUrl={calendarUrl}
          onSelect={selectFromPanel}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
