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

// Everything you need before `id`: its prereqs, their prereqs, and so on.
// Includes "option" edges, so it's every course that could be on the path.
export function ancestors(id: string, edges: GraphEdge[]): Set<string> {
  return reachable(id, neighbours(edges, "target", "source"));
}

// Everything `id` leads to: the courses that need it, the courses that need those, and so on.
export function descendants(id: string, edges: GraphEdge[]): Set<string> {
  return reachable(id, neighbours(edges, "source", "target"));
}

// For each course, the courses one step away in one direction.
// neighbours(edges, "target", "source") maps a course to its direct prereqs.
function neighbours(
  edges: GraphEdge[],
  from: "source" | "target",
  to: "source" | "target",
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge[from]) ?? [];
    list.push(edge[to]);
    map.set(edge[from], list);
  }
  return map;
}

// Breadth-first search from `start`. The result doesn't include `start` itself.
// `seen` stops it looping forever if the data ever has a cycle.
function reachable(start: string, next: Map<string, string[]>): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const code of next.get(current) ?? []) {
      if (!seen.has(code)) {
        seen.add(code);
        queue.push(code);
      }
    }
  }
  seen.delete(start);
  return seen;
}
