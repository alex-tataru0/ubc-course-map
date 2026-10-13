"use client";

import {
  Background,
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { GraphEdge, GraphNode } from "@/lib/graph";
import { edgeRole, highlightFor, nodeRole } from "@/lib/highlight";
import type { EdgeRole, Highlight, Role } from "@/lib/highlight";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import type { Label, Position as Point } from "@/lib/layout";

// A course with its position, worked out at build time by layoutGraph.
export type PlacedCourse = GraphNode & Point;

interface CourseGraphProps {
  courses: PlacedCourse[];
  edges: GraphEdge[];
  labels: Label[]; // section titles, e.g. "Co-op work terms"
}

type CourseData = { code: string; title: string; noRequirements: boolean; role: Role };
type CourseNodeType = Node<CourseData, "course">;
type LabelNodeType = Node<{ text: string }, "label">;

// The box style for each role. The colours come from globals.css (--role-*).
const ROLE_CLASSES: Record<Role, string> = {
  normal: "border-zinc-300 dark:border-zinc-600",
  selected: "border-2 border-role-selected ring-4 ring-role-selected/30",
  needs: "border-2 border-role-needs",
  unlocks: "border-2 border-role-unlocks",
  dimmed: "border-zinc-300 opacity-25 dark:border-zinc-600",
};

// One course box: the code, the title cut off with "…" if it's too long,
// and "No requirements" for courses anyone can take.
// The handles are where edges attach. They're invisible because nobody draws new edges here.
function CourseNode({ data }: NodeProps<CourseNodeType>) {
  return (
    <div
      className={`flex h-full w-full cursor-pointer flex-col justify-center rounded-md border bg-white px-2 text-zinc-900 shadow-sm transition-opacity dark:bg-zinc-800 dark:text-zinc-100 ${ROLE_CLASSES[data.role]}`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <div className="text-sm font-semibold leading-tight">{data.code}</div>
      <div className="truncate text-[10px] leading-tight text-zinc-500 dark:text-zinc-400" title={data.title}>
        {data.title}
      </div>
      {data.noRequirements && (
        <div className="text-[10px] font-medium leading-tight text-zinc-700 dark:text-zinc-300">
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
    <div className="whitespace-nowrap text-sm font-semibold text-zinc-600 dark:text-zinc-300">
      {data.text}
    </div>
  );
}

// Defined outside the component so React Flow gets the same object on every render.
const nodeTypes = { course: CourseNode, label: LabelNode };

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

// The box in the top-left corner: a hint before anything is clicked, then a key
// for the colours with counts, so the colours never carry meaning on their own.
function InfoPanel({ highlight, title }: { highlight: Highlight | null; title?: string }) {
  if (highlight === null) {
    return <p>Click a course to see what it needs and what it unlocks.</p>;
  }
  const swatch = "inline-block h-3 w-3 rounded-sm border-2";
  return (
    <div className="space-y-1">
      <p className="font-semibold">
        <span className={`${swatch} mr-1.5 border-role-selected`} />
        {highlight.selected}
        {title && <span className="font-normal text-zinc-500 dark:text-zinc-400">: {title}</span>}
      </p>
      <p>
        <span className={`${swatch} mr-1.5 border-role-needs`} />
        Needs {highlight.needs.size} {highlight.needs.size === 1 ? "course" : "courses"} in CPSC
      </p>
      <p>
        <span className={`${swatch} mr-1.5 border-role-unlocks`} />
        Unlocks {highlight.unlocks.size} {highlight.unlocks.size === 1 ? "course" : "courses"}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Dashed lines are one of several options. Click the background or press Esc to clear.
      </p>
    </div>
  );
}

export default function CourseGraph({ courses, edges, labels }: CourseGraphProps) {
  const colorMode = useSystemColorMode();
  const [selected, setSelected] = useState<string | null>(null);

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
    const result: (CourseNodeType | LabelNodeType)[] = courses.map((c) => ({
      id: c.id,
      type: "course",
      position: { x: c.x, y: c.y },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      zIndex: 2, // above every edge, so lines pass behind the boxes instead of over their text
      data: { code: c.id, title: c.title, noRequirements: c.noRequirements, role: nodeRole(highlight, c.id) },
    }));
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
  }, [courses, labels, highlight]);

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

  const selectedTitle = courses.find((c) => c.id === selected)?.title;

  return (
    <ReactFlow
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={() => setSelected(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      colorMode={colorMode}
      minZoom={0.1}
      fitView
    >
      <Background />
      <Controls showInteractive={false} />
      <Panel
        position="top-left"
        className="max-w-sm rounded-md border border-zinc-200 bg-white/90 p-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90"
      >
        <InfoPanel highlight={highlight} title={selectedTitle} />
      </Panel>
    </ReactFlow>
  );
}
