import dagre from "@dagrejs/dagre";
import type { Graph } from "./graph";

export const NODE_WIDTH = 110;
export const NODE_HEIGHT = 44;
const GAP = 30; // between nodes side by side
const RANK_GAP = 70; // between rows of the graph
const GRID_COLUMNS = 6; // loose courses per row in the grid below
const GRID_TOP_MARGIN = 100; // space between the graph and the grid

// Top-left corner, which is what React Flow expects.
export interface Position {
  x: number;
  y: number;
}

export interface Layout {
  positions: Map<string, Position>;
  // Where the grid of loose courses starts, so the page can label it. null if there are none.
  looseTop: number | null;
}

// Linked courses (with at least one edge) are laid out top to bottom by dagre,
// so prereqs sit above the courses they unlock. Loose courses (no edges)
// go in a grid underneath, so they don't look like starting points.
export function layoutGraph(graph: Graph): Layout {
  const linked = new Set(graph.edges.flatMap((e) => [e.source, e.target]));
  const positions = new Map<string, Position>();

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: GAP, ranksep: RANK_GAP });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) {
    if (linked.has(node.id)) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
  }
  for (const edge of graph.edges) g.setEdge(edge.source, edge.target);
  dagre.layout(g);

  // dagre gives the centre of each node; convert to the top-left corner.
  let bottom = 0;
  for (const id of g.nodes()) {
    const { x, y } = g.node(id);
    positions.set(id, { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 });
    bottom = Math.max(bottom, y + NODE_HEIGHT / 2);
  }

  const loose = graph.nodes.filter((n) => !linked.has(n.id));
  const looseTop = loose.length === 0 ? null : linked.size === 0 ? 0 : bottom + GRID_TOP_MARGIN;
  loose.forEach((node, i) => {
    const column = i % GRID_COLUMNS;
    const row = Math.floor(i / GRID_COLUMNS);
    positions.set(node.id, {
      x: column * (NODE_WIDTH + GAP),
      y: looseTop! + row * (NODE_HEIGHT + GAP),
    });
  });

  return { positions, looseTop };
}
