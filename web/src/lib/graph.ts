import type { Course, ReqNode } from "./types";

// "required": every path to the course goes through all_of (or a one_of with a single choice).
// "option": the course is one of several choices somewhere above it in the tree.
export type EdgeKind = "required" | "option";

export interface GraphNode {
  id: string; // course code, e.g. "CPSC 210"
  title: string;
}

// An edge points from a prerequisite to the course that needs it.
export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Every course code in a tree, each with how it's required.
// A course that appears more than once counts as "required" if any appearance is required.
export function prereqCourses(tree: ReqNode): Map<string, EdgeKind> {
  const found = new Map<string, EdgeKind>();

  function visit(node: ReqNode, isOption: boolean): void {
    if (typeof node === "string") {
      add(node, isOption);
    } else if ("course" in node) {
      add(node.course, isOption);
    } else if ("one_of" in node) {
      const choices = node.one_of.length > 1;
      for (const child of node.one_of) visit(child, isOption || choices);
    } else if ("all_of" in node) {
      for (const child of node.all_of) visit(child, isOption);
    }
    // { other: ... } isn't a course, so it adds nothing.
  }

  function add(code: string, isOption: boolean): void {
    const kind: EdgeKind = isOption ? "option" : "required";
    if (found.get(code) !== "required") found.set(code, kind);
  }

  visit(tree, false);
  return found;
}

// Nodes for every course in the list, and prereq edges between them.
// Prereqs from outside the list (e.g. MATH 200 on the CPSC graph) get no edge;
// the side panel shows them instead. Coreqs aren't drawn either.
export function buildGraph(courses: Course[]): Graph {
  const nodes = courses.map((c) => ({ id: c.code, title: c.title }));
  const inGraph = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];

  for (const course of courses) {
    if (!course.prereq) continue;
    for (const [code, kind] of prereqCourses(course.prereq.tree)) {
      if (inGraph.has(code) && code !== course.code) {
        edges.push({ source: code, target: course.code, kind });
      }
    }
  }
  return { nodes, edges };
}
