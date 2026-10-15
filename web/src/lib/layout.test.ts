import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGraph, toGraphNode, undergradOnly } from "./graph";
import type { Graph, GraphEdge, GraphNode } from "./graph";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH, yearRows } from "./layout";
import type { Position } from "./layout";
import { splitCourses } from "./sections";
import type { CourseFile } from "./types";

function node(id: string): GraphNode {
  return { id, title: id, noRequirements: false };
}

function edge(source: string, target: string): GraphEdge {
  return { source, target, kind: "required" };
}

function overlaps(a: Position, b: Position): boolean {
  return (
    a.x < b.x + NODE_WIDTH && b.x < a.x + NODE_WIDTH &&
    a.y < b.y + NODE_HEIGHT && b.y < a.y + NODE_HEIGHT
  );
}

describe("yearRows", () => {
  it("puts each year below the one before", () => {
    const graph: Graph = { nodes: ["CPSC 310", "CPSC 110", "CPSC 210"].map(node), edges: [] };
    const rows = yearRows(graph);
    expect(rows.get("CPSC 110")).toBe(0);
    expect(rows.get("CPSC 210")).toBe(1);
    expect(rows.get("CPSC 310")).toBe(2);
  });

  it("drops a course below a prereq from the same year", () => {
    const graph: Graph = {
      nodes: ["CPSC 103", "CPSC 107", "CPSC 110", "CPSC 210"].map(node),
      edges: [edge("CPSC 103", "CPSC 107"), edge("CPSC 107", "CPSC 210")],
    };
    const rows = yearRows(graph);
    expect(rows.get("CPSC 103")).toBe(0);
    expect(rows.get("CPSC 110")).toBe(0);
    expect(rows.get("CPSC 107")).toBe(1);
    expect(rows.get("CPSC 210")).toBe(2);
  });

  it("puts courses numbered below 100 with the first year", () => {
    // SCIE 001 (Science One) is a first-year course.
    const graph: Graph = { nodes: ["SCIE 300", "SCIE 113", "SCIE 001"].map(node), edges: [] };
    const rows = yearRows(graph);
    expect(rows.get("SCIE 001")).toBe(0);
    expect(rows.get("SCIE 113")).toBe(0);
    expect(rows.get("SCIE 300")).toBe(1);
    expect(layoutGraph(graph).bands.map((b) => b.year)).toEqual([1, 3]);
  });

  it("wraps a long row into even pieces of at most 14", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `CPSC ${401 + i}`);
    const rows = yearRows({ nodes: ids.map(node), edges: [] });
    const firstRow = ids.filter((id) => rows.get(id) === 0);
    const secondRow = ids.filter((id) => rows.get(id) === 1);
    expect(firstRow).toEqual(ids.slice(0, 8));
    expect(secondRow).toEqual(ids.slice(8));
  });
});

describe("layoutGraph", () => {
  const graph: Graph = {
    nodes: ["CPSC 110", "CPSC 210", "CPSC 213"].map(node),
    edges: [edge("CPSC 110", "CPSC 210"), edge("CPSC 210", "CPSC 213")],
  };
  const sections = [
    { title: "Co-op", nodes: ["CPSC 298", "CPSC 299"].map(node) },
    { title: "Empty", nodes: [] },
    { title: "Other", nodes: ["CPSC 448"].map(node) },
  ];
  const { positions, labels } = layoutGraph(graph, sections);
  const pos = (id: string) => positions.get(id)!;

  it("puts every prereq above the course that needs it", () => {
    expect(pos("CPSC 110").y).toBeLessThan(pos("CPSC 210").y);
    expect(pos("CPSC 210").y).toBeLessThan(pos("CPSC 213").y);
  });

  it("puts each section's title, then its courses in a row, under the graph", () => {
    expect(labels.map((l) => l.text)).toEqual(["Co-op", "Other"]);
    const [coop, other] = labels;
    expect(coop.y).toBeGreaterThan(pos("CPSC 213").y + NODE_HEIGHT);
    expect(pos("CPSC 298").y).toBeGreaterThan(coop.y);
    expect(pos("CPSC 299").y).toBe(pos("CPSC 298").y);
    expect(pos("CPSC 299").x).toBeGreaterThan(pos("CPSC 298").x);
    expect(other.y).toBeGreaterThan(pos("CPSC 298").y + NODE_HEIGHT);
    expect(pos("CPSC 448").y).toBeGreaterThan(other.y);
  });

  it("puts a band behind each year, around its courses", () => {
    const { bands } = layoutGraph(graph);
    expect(bands.map((b) => b.year)).toEqual([1, 2]);
    const [first, second] = bands;
    expect(first.top).toBeLessThan(pos("CPSC 110").y);
    expect(first.bottom).toBeGreaterThan(pos("CPSC 110").y + NODE_HEIGHT);
    expect(second.top).toBeLessThan(pos("CPSC 210").y);
    expect(second.bottom).toBeGreaterThan(pos("CPSC 213").y + NODE_HEIGHT);
    expect(first.bottom).toBeLessThan(second.top);
  });

  it("has no titles without sections", () => {
    expect(layoutGraph(graph).labels).toEqual([]);
  });

  it("lays out a prereq that points up to a later year", () => {
    // MATH 131 (first year) accepts 68% in MATH 221 (second year) as one option.
    const upward: Graph = {
      nodes: ["MATH 131", "MATH 221"].map(node),
      edges: [edge("MATH 221", "MATH 131")],
    };
    const { positions } = layoutGraph(upward);
    expect(positions.get("MATH 131")!.y).toBeLessThan(positions.get("MATH 221")!.y);
  });
});

describe("layoutGraph on the real CPSC data", () => {
  const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
  const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
  const { main, coop, other } = splitCourses(undergradOnly(data.courses));
  const graph = buildGraph(main);
  const { positions, labels } = layoutGraph(graph, [
    { title: "Co-op work terms", nodes: coop.map(toGraphNode) },
    { title: "Other CPSC courses", nodes: other.map(toGraphNode) },
  ]);
  const y = (id: string) => positions.get(id)!.y;
  const rows = yearRows(graph);

  it("puts 100, 103 and 110 on the top row", () => {
    expect(rows.get("CPSC 100")).toBe(0);
    expect(rows.get("CPSC 103")).toBe(0);
    expect(rows.get("CPSC 110")).toBe(0);
    expect(y("CPSC 110")).toBe(Math.min(...graph.nodes.map((n) => y(n.id))));
  });

  it("keeps the years in order", () => {
    const ys = (level: number) =>
      graph.nodes.filter((n) => n.id[5] === String(level)).map((n) => y(n.id));
    for (const level of [1, 2, 3]) {
      expect(Math.max(...ys(level))).toBeLessThan(Math.min(...ys(level + 1)));
    }
  });

  it("puts every prereq above the course that needs it", () => {
    for (const e of graph.edges) expect(y(e.source)).toBeLessThan(y(e.target));
  });

  it("is only as wide as the widest row", () => {
    const xs = graph.nodes.map((n) => positions.get(n.id)!.x);
    expect(Math.max(...xs) + NODE_WIDTH - Math.min(...xs)).toBeLessThanOrEqual(14 * (NODE_WIDTH + 30));
  });

  it("never has more than 14 courses in a row", () => {
    const counts = new Map<number, number>();
    for (const row of rows.values()) counts.set(row, (counts.get(row) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(14);
  });

  it("puts the co-op terms in order under the graph", () => {
    const coopIds = coop.map((c) => c.code);
    expect(labels[0].text).toBe("Co-op work terms");
    expect(new Set(coopIds.map(y)).size).toBe(1);
    const xs = coopIds.map((id) => positions.get(id)!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(y("CPSC 298")).toBeGreaterThan(Math.max(...graph.nodes.map((n) => y(n.id))));
  });

  it("has four year bands, in order, each holding its year's courses", () => {
    const { bands } = layoutGraph(graph);
    expect(bands.map((b) => b.year)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < bands.length; i++) expect(bands[i - 1].bottom).toBeLessThan(bands[i].top);
    for (const { id } of graph.nodes) {
      const band = bands.find((b) => b.year === Number(id[5]))!;
      expect(y(id)).toBeGreaterThan(band.top);
      expect(y(id) + NODE_HEIGHT).toBeLessThan(band.bottom);
    }
  });

  it("doesn't overlap any two courses", () => {
    const all = [...positions.values()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(overlaps(all[i], all[j])).toBe(false);
      }
    }
  });
});

describe.each(["math", "stat"])("layoutGraph on the real %s data", (subject) => {
  const url = new URL(`../../../data/courses/${subject}.json`, import.meta.url);
  const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
  const { main } = splitCourses(undergradOnly(data.courses));
  const graph = buildGraph(main);
  const { positions, bands } = layoutGraph(graph);
  const y = (id: string) => positions.get(id)!.y;

  it("places every course without overlaps", () => {
    expect(positions.size).toBe(main.length);
    const all = [...positions.values()];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
    }
  });

  it("puts every prereq above the course that needs it, except MATH 221 for MATH 131", () => {
    const upward = graph.edges.filter((e) => y(e.source) >= y(e.target));
    expect(upward.map((e) => `${e.source} -> ${e.target}`)).toEqual(
      subject === "math" ? ["MATH 221 -> MATH 131"] : [],
    );
  });

  it("has a band for each year it has courses in", () => {
    expect(bands.map((b) => b.year)).toEqual(subject === "math" ? [1, 2, 3, 4] : [2, 3, 4]);
  });
});
