import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ancestors, buildGraph, descendants, prereqCourses } from "./graph";
import type { GraphEdge } from "./graph";
import type { Course, CourseFile, ReqNode } from "./types";

// A minimal course record, with just the fields the graph cares about.
function course(code: string, tree: ReqNode | null = null): Course {
  return {
    code,
    title: `${code} title`,
    credits: "3",
    description: "",
    prereq: tree === null ? null : { text: "", tree, source: "rules", problems: [] },
    coreq: null,
    equivalency: null,
    recommended: null,
  };
}

describe("prereqCourses", () => {
  it("marks a single course as required", () => {
    expect(prereqCourses("CPSC 110")).toEqual(new Map([["CPSC 110", "required"]]));
  });

  it("marks all_of members as required", () => {
    const tree = { all_of: ["CPSC 121", "CPSC 210"] };
    expect(prereqCourses(tree)).toEqual(
      new Map([
        ["CPSC 121", "required"],
        ["CPSC 210", "required"],
      ]),
    );
  });

  it("marks one_of members as options", () => {
    const tree = { one_of: ["CPSC 107", "CPSC 110"] };
    expect(prereqCourses(tree)).toEqual(
      new Map([
        ["CPSC 107", "option"],
        ["CPSC 110", "option"],
      ]),
    );
  });

  it("treats a one_of with a single choice as required", () => {
    expect(prereqCourses({ one_of: ["CPSC 210"] })).toEqual(
      new Map([["CPSC 210", "required"]]),
    );
  });

  it("keeps courses under an all_of inside a one_of as options", () => {
    const tree = { one_of: [{ all_of: ["MATH 100", "MATH 101"] }, "MATH 120"] };
    expect(prereqCourses(tree).get("MATH 100")).toBe("option");
  });

  it("reads min_grade nodes and skips other nodes", () => {
    const tree = {
      all_of: [{ course: "MATH 226", min_grade: 68 }, { other: "Third-year standing" }],
    };
    expect(prereqCourses(tree)).toEqual(new Map([["MATH 226", "required"]]));
  });

  it("prefers required when a course appears twice", () => {
    const tree = { all_of: [{ one_of: ["CPSC 210", "CPEN 221"] }, "CPSC 210"] };
    expect(prereqCourses(tree).get("CPSC 210")).toBe("required");
  });
});

describe("buildGraph", () => {
  it("makes a node for every course and an edge from prereq to course", () => {
    const graph = buildGraph([
      course("CPSC 110"),
      course("CPSC 210", "CPSC 110"),
    ]);
    expect(graph.nodes).toEqual([
      { id: "CPSC 110", title: "CPSC 110 title", noRequirements: true },
      { id: "CPSC 210", title: "CPSC 210 title", noRequirements: false },
    ]);
    expect(graph.edges).toEqual([
      { source: "CPSC 110", target: "CPSC 210", kind: "required" },
    ]);
  });

  it("leaves out prereqs that aren't in the course list", () => {
    const graph = buildGraph([
      course("CPSC 121"),
      course("CPSC 221", { all_of: ["CPSC 121", "MATH 200"] }),
    ]);
    expect(graph.edges).toEqual([
      { source: "CPSC 121", target: "CPSC 221", kind: "required" },
    ]);
  });
});

describe("ancestors and descendants", () => {
  // A -> B -> C, and D -> C (an option)
  const edges: GraphEdge[] = [
    { source: "A", target: "B", kind: "required" },
    { source: "B", target: "C", kind: "required" },
    { source: "D", target: "C", kind: "option" },
  ];

  it("finds every prereq, direct or not, including options", () => {
    expect(ancestors("C", edges)).toEqual(new Set(["A", "B", "D"]));
  });

  it("finds every course a course leads to", () => {
    expect(descendants("A", edges)).toEqual(new Set(["B", "C"]));
  });

  it("is empty at the ends of the graph", () => {
    expect(ancestors("A", edges)).toEqual(new Set());
    expect(descendants("C", edges)).toEqual(new Set());
  });

  it("is empty for a course with no edges", () => {
    expect(ancestors("Z", edges)).toEqual(new Set());
  });

  it("stops on a cycle and leaves out the start", () => {
    const cycle: GraphEdge[] = [
      { source: "A", target: "B", kind: "required" },
      { source: "B", target: "A", kind: "required" },
    ];
    expect(ancestors("A", cycle)).toEqual(new Set(["B"]));
  });
});

describe("buildGraph on the real CPSC data", () => {
  const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
  const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
  const graph = buildGraph(data.courses);
  const ids = new Set(graph.nodes.map((n) => n.id));

  function edgesInto(code: string) {
    return graph.edges.filter((e) => e.target === code);
  }

  it("has a node for each of the 112 courses", () => {
    expect(graph.nodes).toHaveLength(112);
  });

  it("only has edges between CPSC courses in the file", () => {
    for (const edge of graph.edges) {
      expect(ids.has(edge.source)).toBe(true);
      expect(ids.has(edge.target)).toBe(true);
    }
  });

  it("draws CPSC 213's prereqs as required", () => {
    expect(edgesInto("CPSC 213")).toEqual([
      { source: "CPSC 121", target: "CPSC 213", kind: "required" },
      { source: "CPSC 210", target: "CPSC 213", kind: "required" },
    ]);
  });

  it("draws CPSC 221's prereqs as options", () => {
    // One of CPSC 210, CPEN 221 and either (a) one of CPSC 121, MATH 220, ... or (b) MATH 226
    expect(edgesInto("CPSC 221")).toEqual([
      { source: "CPSC 210", target: "CPSC 221", kind: "option" },
      { source: "CPSC 121", target: "CPSC 221", kind: "option" },
    ]);
  });

  it("doesn't draw coreqs", () => {
    // CPSC 121's only CPSC requirement is its coreq (one of CPSC 107, CPSC 110).
    expect(edgesInto("CPSC 121")).toEqual([]);
  });

  it("finds the whole chain behind CPSC 313", () => {
    // 313 needs 213 and (221 or DSCI 221); 213 needs 121 and 210;
    // 221 needs 210 and 121; 210 needs 107 or 110; 107 needs 103.
    expect(ancestors("CPSC 313", graph.edges)).toEqual(
      new Set(["CPSC 213", "CPSC 221", "CPSC 121", "CPSC 210", "CPSC 107", "CPSC 110", "CPSC 103"]),
    );
  });

  it("finds that CPSC 210 unlocks CPSC 213 and CPSC 221", () => {
    const unlocked = descendants("CPSC 210", graph.edges);
    expect(unlocked.has("CPSC 213")).toBe(true);
    expect(unlocked.has("CPSC 221")).toBe(true);
    expect(unlocked.has("CPSC 110")).toBe(false);
  });
});
