"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type ColorMode,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useSyncExternalStore } from "react";
import type { GraphEdge, GraphNode } from "@/lib/graph";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/layout";
import type { Label, Position as Point } from "@/lib/layout";

// A course with its position, worked out at build time by layoutGraph.
export type PlacedCourse = GraphNode & Point;

interface CourseGraphProps {
  courses: PlacedCourse[];
  edges: GraphEdge[];
  labels: Label[]; // section titles, e.g. "Co-op work terms"
}

type CourseNodeType = Node<{ code: string; title: string; noRequirements: boolean }, "course">;
type LabelNodeType = Node<{ text: string }, "label">;

// One course box: the code, the title cut off with "…" if it's too long,
// and "No requirements" for courses anyone can take.
// The handles are where edges attach. They're invisible because nobody draws new edges here.
function CourseNode({ data }: NodeProps<CourseNodeType>) {
  return (
    <div className="flex h-full w-full flex-col justify-center rounded-md border border-zinc-300 bg-white px-2 text-zinc-900 shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
      <Handle type="target" position={Position.Top} isConnectable={false} className="opacity-0" />
      <div className="text-sm font-semibold leading-tight">{data.code}</div>
      <div className="truncate text-[10px] leading-tight text-zinc-500 dark:text-zinc-400" title={data.title}>
        {data.title}
      </div>
      {data.noRequirements && (
        <div className="text-[10px] font-medium leading-tight text-emerald-700 dark:text-emerald-400">
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

export default function CourseGraph({ courses, edges, labels }: CourseGraphProps) {
  const colorMode = useSystemColorMode();

  const nodes = useMemo(() => {
    const result: (CourseNodeType | LabelNodeType)[] = courses.map((c) => ({
      id: c.id,
      type: "course",
      position: { x: c.x, y: c.y },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: { code: c.id, title: c.title, noRequirements: c.noRequirements },
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
  }, [courses, labels]);

  const flowEdges = useMemo(
    (): Edge[] =>
      edges.map((e) => ({
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        markerEnd: { type: MarkerType.ArrowClosed },
        // Solid = required. Dashed = one of several options.
        style: e.kind === "option" ? { strokeDasharray: "6 4" } : undefined,
      })),
    [edges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      colorMode={colorMode}
      minZoom={0.1}
      fitView
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
