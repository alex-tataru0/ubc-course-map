import { buildGraph, toGraphNode, undergradOnly } from "./graph";
import type { GraphEdge, GraphNode } from "./graph";
import { layoutGraph } from "./layout";
import type { Band, Label, Position } from "./layout";
import { splitCourses } from "./sections";
import type { CourseFile } from "./types";

// A course with its position on the map.
export type PlacedCourse = GraphNode & Position;

// Everything one subject's map needs. It's worked out during `npm run build`, so the
// browser never runs the layout.
export interface SubjectMap {
  subject: string; // e.g. "MATH"
  courses: PlacedCourse[];
  edges: GraphEdge[];
  labels: Label[]; // section titles, e.g. "Co-op work terms"
  bands: Band[]; // the shaded strip behind each year
  width: number; // width of the graph's widest row
  calendarUrl: string; // the calendar page with every course in the subject
}

// The undergraduate courses of one subject: the prerequisite graph, with the co-op work terms
// and courses that are off the usual path in sections underneath.
export function subjectMap(file: CourseFile): SubjectMap {
  const { main, coop, other } = splitCourses(undergradOnly(file.courses));
  const graph = buildGraph(main);
  const sections = [
    { title: "Co-op work terms", nodes: coop.map(toGraphNode) },
    { title: `Other ${file.subject} courses (for other programs, or by permission)`, nodes: other.map(toGraphNode) },
  ];
  const { positions, labels, bands, width } = layoutGraph(graph, sections);
  const nodes = [...graph.nodes, ...sections.flatMap((s) => s.nodes)];
  return {
    subject: file.subject,
    courses: nodes.map((node) => ({ ...node, ...positions.get(node.id)! })),
    edges: graph.edges,
    labels,
    bands,
    width,
    calendarUrl: file.source,
  };
}
