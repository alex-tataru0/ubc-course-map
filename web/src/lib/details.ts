import type { ReqNode } from "./types";

// The labels that start the requisite part of a description, as in pipeline/requisites.py.
// "Recommended pre-requisite:" is advice, which the side panel shows on its own line.
const REQUISITE_LABEL =
  /\b(Recommended [Pp]re-?requisites?|Pre-?requisites?|Co-?requisites?|Equivalency):/;

// Weekly hours, e.g. "[3-2-0]" is 3 hours of lecture, 2 of lab and 0 of tutorial.
// A few courses use other shapes, like "[3-2]", "[1.5–1.5-0]" or "[3-0-2*]" (a * marks
// alternate weeks), so keep the text as is.
const HOURS = /\s*\[([\d.\s–*-]+)\]/;

// Some descriptions put this note after the prereq text (e.g. CPSC 299).
const CDF_NOTE = "This course is not eligible for Credit/D/Fail grading.";

export interface DescriptionParts {
  summary: string; // what the course is about, without the requisites
  hours: string | null; // e.g. "3-2-0"
}

// Splits a calendar description into the part worth reading and the weekly hours.
// The requisites are left out because the side panel shows them as a tree.
export function splitDescription(description: string): DescriptionParts {
  const labelAt = description.search(REQUISITE_LABEL);
  let summary = labelAt === -1 ? description : description.slice(0, labelAt);
  // Many engineering courses put the hours after the prereq, as in MECH 224's
  // "Prerequisite: MECH 224 or MECH 260. [2-2-0]", so look for them in the whole text.
  const hours = description.match(HOURS);
  summary = summary.replace(HOURS, "").trim();
  if (description.includes(CDF_NOTE) && !summary.includes(CDF_NOTE)) {
    summary = `${summary} ${CDF_NOTE}`;
  }
  return { summary, hours: hours ? hours[1].trim() : null };
}

// The children of a group of the given kind, or null if `node` isn't one.
function childrenOf(node: ReqNode, kind: "one_of" | "all_of"): ReqNode[] | null {
  if (typeof node !== "object") return null;
  if (kind === "one_of" && "one_of" in node) return node.one_of;
  if (kind === "all_of" && "all_of" in node) return node.all_of;
  return null;
}

// Makes a requirement tree easier to read without changing what it means:
// - a group with a single item becomes that item;
// - a group inside a group of the same kind is merged into it,
//   so "one of A, (one of B, C)" becomes "one of A, B, C".
export function simplifyTree(node: ReqNode): ReqNode {
  if (typeof node === "string" || "course" in node || "other" in node) return node;
  const kind = "one_of" in node ? "one_of" : "all_of";
  const items = childrenOf(node, kind)!
    .map(simplifyTree)
    .flatMap((child) => childrenOf(child, kind) ?? [child]);
  if (items.length === 1) return items[0];
  return kind === "one_of" ? { one_of: items } : { all_of: items };
}

// "MATH_O 220" -> "MATH 220 (Okanagan)". Vancouver codes stay as they are.
export function displayCode(code: string): string {
  const match = code.match(/^([A-Z]+)_O (\S+)$/);
  return match ? `${match[1]} ${match[2]} (Okanagan)` : code;
}
