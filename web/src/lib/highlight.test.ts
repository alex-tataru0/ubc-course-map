import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGraph, undergradOnly } from "./graph";
import type { GraphEdge } from "./graph";
import { edgeRole, highlightFor, nodeRole, pathHighlight } from "./highlight";
import { splitCourses } from "./sections";
import type { CourseFile } from "./types";

function edge(source: string, target: string): GraphEdge {
  return { source, target, kind: "required" };
}

describe("highlighting a selected course", () => {
  // A -> B -> C -> E, D -> C, and A -> X, which has nothing to do with C.
  const edges = [edge("A", "B"), edge("B", "C"), edge("D", "C"), edge("C", "E"), edge("A", "X")];
  const highlight = highlightFor("C", edges);

  it("draws everything normally when nothing is selected", () => {
    expect(nodeRole(null, "A")).toBe("normal");
    expect(edgeRole(null, edges[0])).toBe("normal");
  });

  it("gives each course a role", () => {
    expect(nodeRole(highlight, "C")).toBe("selected");
    expect(["A", "B", "D"].map((id) => nodeRole(highlight, id))).toEqual(["needs", "needs", "needs"]);
    expect(nodeRole(highlight, "E")).toBe("unlocks");
    expect(nodeRole(highlight, "X")).toBe("dimmed");
    expect(nodeRole(highlight, "F")).toBe("dimmed"); // not in the graph at all
  });

  it("colours the edges on paths into and out of the selected course", () => {
    expect(edgeRole(highlight, edge("A", "B"))).toBe("needs");
    expect(edgeRole(highlight, edge("B", "C"))).toBe("needs");
    expect(edgeRole(highlight, edge("D", "C"))).toBe("needs");
    expect(edgeRole(highlight, edge("C", "E"))).toBe("unlocks");
  });

  it("dims an edge from a prereq to an unrelated course", () => {
    expect(edgeRole(highlight, edge("A", "X"))).toBe("dimmed");
  });
});

describe("highlighting a planned path", () => {
  // A -> B -> C and D -> C, where B is on the path and D is another option for C.
  const edges = [edge("A", "B"), edge("B", "C"), edge("D", "C"), edge("C", "E")];
  const highlight = pathHighlight("C", new Set(["B"]), edges);

  it("lights up only the courses on the path", () => {
    expect(highlight.kind).toBe("path");
    expect(nodeRole(highlight, "B")).toBe("needs");
    expect(nodeRole(highlight, "D")).toBe("dimmed"); // another option, not on the path
    expect(nodeRole(highlight, "A")).toBe("dimmed"); // e.g. already done
    expect(nodeRole(highlight, "E")).toBe("unlocks");
  });

  it("lights up only the edges between courses on the path", () => {
    expect(edgeRole(highlight, edge("B", "C"))).toBe("needs");
    expect(edgeRole(highlight, edge("D", "C"))).toBe("dimmed");
    expect(edgeRole(highlight, edge("A", "B"))).toBe("dimmed");
  });
});

describe("highlighting on the real CPSC data", () => {
  const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
  const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
  const graph = buildGraph(splitCourses(undergradOnly(data.courses)).main);
  const highlight = highlightFor("CPSC 221", graph.edges);

  it("finds everything CPSC 221 needs", () => {
    // 221 needs 210 (or CPEN 221) and 121 (or MATH); 210 needs 107 or 110; 107 needs 103.
    expect(highlight.needs).toEqual(
      new Set(["CPSC 210", "CPSC 121", "CPSC 107", "CPSC 110", "CPSC 103"]),
    );
  });

  it("finds courses CPSC 221 unlocks and dims the rest", () => {
    expect(nodeRole(highlight, "CPSC 320")).toBe("unlocks");
    expect(nodeRole(highlight, "CPSC 313")).toBe("unlocks");
    expect(nodeRole(highlight, "CPSC 100")).toBe("dimmed");
  });
});
