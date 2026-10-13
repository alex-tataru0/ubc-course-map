import { ancestors, descendants } from "./graph";
import type { GraphEdge } from "./graph";

// How a course or edge is drawn while a course is selected.
// "normal" means nothing is selected.
export type Role = "selected" | "needs" | "unlocks" | "dimmed" | "normal";
export type EdgeRole = Exclude<Role, "selected">;

export interface Highlight {
  selected: string;
  needs: Set<string>; // every course the selected one needs, directly or not
  unlocks: Set<string>; // every course it leads to
}

export function highlightFor(selected: string, edges: GraphEdge[]): Highlight {
  return {
    selected,
    needs: ancestors(selected, edges),
    unlocks: descendants(selected, edges),
  };
}

export function nodeRole(highlight: Highlight | null, id: string): Role {
  if (highlight === null) return "normal";
  if (id === highlight.selected) return "selected";
  if (highlight.needs.has(id)) return "needs";
  if (highlight.unlocks.has(id)) return "unlocks";
  return "dimmed";
}

// An edge is on a "needs" path if it points into the selected course or into one of
// its prereqs (then its source is a prereq too). It's on an "unlocks" path if it starts
// at the selected course or at something the selected course unlocks.
export function edgeRole(highlight: Highlight | null, edge: GraphEdge): EdgeRole {
  if (highlight === null) return "normal";
  if (edge.target === highlight.selected || highlight.needs.has(edge.target)) return "needs";
  if (edge.source === highlight.selected || highlight.unlocks.has(edge.source)) return "unlocks";
  return "dimmed";
}
