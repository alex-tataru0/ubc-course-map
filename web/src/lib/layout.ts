import dagre, { type GraphLabel, type RankerFunction } from "@dagrejs/dagre";
import type { Graph, GraphNode } from "./graph";

export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 56;
const GAP = 30; // between nodes side by side
const RANK_GAP = 70; // between rows of the graph
const MAX_PER_ROW = 14; // longer rows of the graph wrap onto extra rows
const SECTION_COLUMNS = 8; // courses per row in the sections below the graph
const SECTION_GAP = 100; // space above each section
const LABEL_HEIGHT = 32; // space for a section's title
const BAND_PADDING = 20; // space between a year band's edge and its courses (under RANK_GAP / 2)
export const BAND_GUTTER = 150; // room on the left of each band for its label

// Top-left corner, which is what React Flow expects.
export interface Position {
  x: number;
  y: number;
}

// A titled group of courses shown under the graph, e.g. the co-op work terms.
export interface Section {
  title: string;
  nodes: GraphNode[];
}

export interface Label {
  text: string;
  x: number;
  y: number;
}

// The shaded strip behind one year of the graph, e.g. all the 200-level rows.
export interface Band {
  year: number; // 1 for 100-level, 2 for 200-level, ...
  top: number;
  bottom: number;
}

export interface Layout {
  positions: Map<string, Position>;
  labels: Label[]; // section titles
  bands: Band[]; // one per year, top to bottom
  width: number; // width of the widest row of the graph
}

// 1 for a 100-level course, 2 for 200-level, ... Courses numbered below 100, like SCIE 001
// (Science One), are first-year courses too, so they go with the 100-level ones.
function year(code: string): number {
  return Math.max(1, Math.floor(Number(code.match(/\d{3}/)![0]) / 100));
}

// Splits a list into the fewest pieces of at most `max`, keeping the pieces about the same size.
function splitEvenly<T>(items: T[], max: number): T[][] {
  const pieces = Math.ceil(items.length / max);
  const size = Math.ceil(items.length / pieces);
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// The row of each course in the graph, counting from 0 at the top.
// - Years go in order: every 100-level course is above every 200-level one, and so on.
// - Inside a year, a course sits one row below its lowest prereq from the same year (103 -> 107).
//   Prereqs from earlier years are already above it.
// - A row with more than MAX_PER_ROW courses wraps onto extra rows in course-number order.
//   That's safe because courses in the same row never need each other.
export function yearRows(graph: Graph): Map<string, number> {
  const prereqs = new Map<string, string[]>();
  for (const edge of graph.edges) {
    prereqs.set(edge.target, [...(prereqs.get(edge.target) ?? []), edge.source]);
  }

  const byYear = new Map<number, string[]>();
  for (const { id } of graph.nodes) {
    byYear.set(year(id), [...(byYear.get(year(id)) ?? []), id]);
  }

  const rows = new Map<string, number>();
  let nextRow = 0;
  for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
    const ids = byYear.get(y)!.sort();

    // Rows inside this year, counting from 0.
    const local = new Map<string, number>();
    const rowInYear = (id: string): number => {
      if (!local.has(id)) {
        local.set(id, 0); // set first, so a cycle in the data can't recurse forever
        const sameYear = (prereqs.get(id) ?? []).filter((p) => year(p) === y);
        local.set(id, Math.max(0, ...sameYear.map((p) => rowInYear(p) + 1)));
      }
      return local.get(id)!;
    };
    ids.forEach(rowInYear);

    // Turn them into rows of the whole graph, wrapping long ones.
    const deepest = Math.max(...local.values());
    for (let r = 0; r <= deepest; r++) {
      const row = ids.filter((id) => local.get(id) === r);
      for (const piece of splitEvenly(row, MAX_PER_ROW)) {
        for (const id of piece) rows.set(id, nextRow);
        nextRow++;
      }
    }
  }
  return rows;
}

// Places the graph in the rows from yearRows, then each section underneath as a titled grid.
//
// dagre picks the left-to-right order inside each row, to keep edges from crossing.
// Its own x positions are very spread out (about 4000px for CPSC) because it leaves room
// to route edges that skip rows, but React Flow draws its own curves and ignores those
// routes. So we keep dagre's order and pack each row tightly, centred on the widest row.
export function layoutGraph(graph: Graph, sections: Section[] = []): Layout {
  const rows = yearRows(graph);
  const positions = new Map<string, Position>();
  const labels: Label[] = [];

  // dagre calls this instead of choosing rows itself. Its ranks go up in steps of 2,
  // because it doubles every edge's length inside (to leave room for edge labels) and
  // halves the gap between ranks to match, so row r is rank 2r. Nodes dagre adds for
  // its own use aren't in `rows`, so they get 0.
  const setRows: RankerFunction = (g) => {
    for (const id of g.nodes()) g.node(id).rank = 2 * (rows.get(id) ?? 0);
  };

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    // dagre accepts a function here (that's its RankerFunction type), but its GraphLabel
    // type only lists the built-in ranker names, hence the cast.
    ranker: setRows as unknown as GraphLabel["ranker"],
  });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  // dagre needs every edge to point down at least one row, but a few prereqs point up:
  // MATH 131 (first year) takes 68% in MATH 221 (second year) as one option. Those are still
  // drawn on the map; they just don't help dagre order the rows.
  for (const edge of graph.edges) {
    if (rows.get(edge.source)! < rows.get(edge.target)!) g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  // Group the courses by row, each row in dagre's left-to-right order.
  const byRow: string[][] = [];
  for (const { id } of graph.nodes) {
    const row = rows.get(id)!;
    byRow[row] = [...(byRow[row] ?? []), id];
  }
  for (const row of byRow) row.sort((a, b) => g.node(a).x - g.node(b).x);

  const rowWidth = (count: number) => count * (NODE_WIDTH + GAP) - GAP;
  const widest = Math.max(0, ...byRow.map((row) => rowWidth(row.length)));
  byRow.forEach((row, r) => {
    const left = (widest - rowWidth(row.length)) / 2;
    row.forEach((id, i) => {
      positions.set(id, { x: left + i * (NODE_WIDTH + GAP), y: r * (NODE_HEIGHT + RANK_GAP) });
    });
  });
  const bottom = byRow.length * (NODE_HEIGHT + RANK_GAP) - RANK_GAP;

  // A band from the first row of each year to its last row, with some padding.
  const bands: Band[] = [];
  for (const { id } of graph.nodes) {
    const y = year(id);
    const top = rows.get(id)! * (NODE_HEIGHT + RANK_GAP) - BAND_PADDING;
    const bottomEdge = top + NODE_HEIGHT + 2 * BAND_PADDING;
    const band = bands.find((b) => b.year === y);
    if (band) {
      band.top = Math.min(band.top, top);
      band.bottom = Math.max(band.bottom, bottomEdge);
    } else {
      bands.push({ year: y, top, bottom: bottomEdge });
    }
  }
  bands.sort((a, b) => a.year - b.year);

  let top = graph.nodes.length > 0 ? bottom + SECTION_GAP : 0;
  for (const section of sections) {
    if (section.nodes.length === 0) continue;
    labels.push({ text: section.title, x: 0, y: top });
    const firstRow = top + LABEL_HEIGHT;
    section.nodes.forEach((node, i) => {
      positions.set(node.id, {
        x: (i % SECTION_COLUMNS) * (NODE_WIDTH + GAP),
        y: firstRow + Math.floor(i / SECTION_COLUMNS) * (NODE_HEIGHT + GAP),
      });
    });
    const rowCount = Math.ceil(section.nodes.length / SECTION_COLUMNS);
    top = firstRow + rowCount * (NODE_HEIGHT + GAP) - GAP + SECTION_GAP;
  }

  return { positions, labels, bands, width: widest };
}
