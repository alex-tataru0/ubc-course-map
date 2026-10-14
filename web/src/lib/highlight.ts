import { ancestors, descendants } from "./graph";
import type { GraphEdge } from "./graph";

// How a course or edge is drawn while a course is selected.
// "normal" means nothing is selected.
export type Role = "selected" | "needs" | "unlocks" | "dimmed" | "normal";
export type EdgeRole = Exclude<Role, "selected">;

export interface Highlight {
  selected: string;
  // "all": needs is every course the selected one could need, directly or not.
  // "path": needs is only the courses still to take on your planned path (see path.ts).
  kind: "all" | "path";
  needs: Set<string>;
  unlocks: Set<string>; // every course it leads to
}

export function highlightFor(selected: string, edges: GraphEdge[]): Highlight {
  return {
    selected,
    kind: "all",
    needs: ancestors(selected, edges),
    unlocks: descendants(selected, edges),
  };
}

// The same, but lighting up only the courses on your path (`path`, not including `selected`).
export function pathHighlight(selected: string, path: Set<string>, edges: GraphEdge[]): Highlight {
  return { selected, kind: "path", needs: path, unlocks: descendants(selected, edges) };
}

export function nodeRole(highlight: Highlight | null, id: string): Role {
  if (highlight === null) return "normal";
  if (id === highlight.selected) return "selected";
  if (highlight.needs.has(id)) return "needs";
  if (highlight.unlocks.has(id)) return "unlocks";
  return "dimmed";
}

// An edge is on a "needs" path if it goes from one of the lit-up prereqs into the selected
// course or into another lit-up prereq. It's on an "unlocks" path if it starts at the
// selected course or at something the selected course unlocks.
export function edgeRole(highlight: Highlight | null, edge: GraphEdge): EdgeRole {
  if (highlight === null) return "normal";
  const intoNeeds = edge.target === highlight.selected || highlight.needs.has(edge.target);
  if (intoNeeds && highlight.needs.has(edge.source)) return "needs";
  if (edge.source === highlight.selected || highlight.unlocks.has(edge.source)) return "unlocks";
  return "dimmed";
}
