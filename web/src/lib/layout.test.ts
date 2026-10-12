import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGraph, undergradOnly } from "./graph";
import type { Graph } from "./graph";
import { layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "./layout";
import type { Position } from "./layout";
import type { CourseFile } from "./types";

function overlaps(a: Position, b: Position): boolean {
  return (
    a.x < b.x + NODE_WIDTH && b.x < a.x + NODE_WIDTH &&
    a.y < b.y + NODE_HEIGHT && b.y < a.y + NODE_HEIGHT
  );
}

function node(id: string) {
  return { id, title: id };
}

describe("layoutGraph", () => {
  // A -> B -> C, plus two loose courses L1 and L2.
  const graph: Graph = {
    nodes: ["A", "B", "C", "L1", "L2"].map(node),
    edges: [
      { source: "A", target: "B", kind: "required" },
      { source: "B", target: "C", kind: "option" },
    ],
  };
  const { positions, looseTop } = layoutGraph(graph);
  const pos = (id: string) => positions.get(id)!;

  it("gives every node a position", () => {
    expect([...positions.keys()].sort()).toEqual(["A", "B", "C", "L1", "L2"]);
  });

  it("puts prereqs above the courses they unlock", () => {
    expect(pos("A").y).toBeLessThan(pos("B").y);
    expect(pos("B").y).toBeLessThan(pos("C").y);
  });

  it("puts loose courses in a row below the graph", () => {
    expect(looseTop).not.toBeNull();
    expect(pos("L1").y).toBe(looseTop);
    expect(pos("L2").y).toBe(looseTop);
    expect(pos("L1").y).toBeGreaterThan(pos("C").y + NODE_HEIGHT);
    expect(pos("L1").x).toBeLessThan(pos("L2").x);
  });

  it("wraps the grid after 6 courses", () => {
    const seven = { nodes: "1234567".split("").map(node), edges: [] };
    const layout = layoutGraph(seven);
    expect(layout.looseTop).toBe(0);
    expect(layout.positions.get("6")!.y).toBe(0);
    expect(layout.positions.get("7")!.y).toBeGreaterThan(0);
    expect(layout.positions.get("7")!.x).toBe(0);
  });

  it("has no grid when every course is linked", () => {
    const linked = { nodes: graph.nodes.slice(0, 3), edges: graph.edges };
    expect(layoutGraph(linked).looseTop).toBeNull();
  });
});

describe("layoutGraph on the real CPSC data", () => {
  const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
  const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
  const graph = buildGraph(undergradOnly(data.courses));
  const { positions, looseTop } = layoutGraph(graph);

  it("keeps only undergrad courses", () => {
    expect(graph.nodes.some((n) => n.id === "CPSC 500")).toBe(false);
    expect(graph.nodes.some((n) => n.id === "CPSC 490")).toBe(true);
  });

  it("puts every prereq above the course that needs it", () => {
    for (const edge of graph.edges) {
      expect(positions.get(edge.source)!.y).toBeLessThan(positions.get(edge.target)!.y);
    }
  });

  it("puts the 10 loose undergrad courses in the grid", () => {
    // 100, 259, 398, 399, 424, 430, 436, 448, 490, 499: no prereq links to other CPSC courses.
    const inGrid = graph.nodes.filter((n) => positions.get(n.id)!.y >= looseTop!);
    expect(inGrid.map((n) => n.id)).toContain("CPSC 436");
    expect(inGrid).toHaveLength(10);
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
