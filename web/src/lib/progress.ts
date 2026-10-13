import type { ReqNode } from "./types";

// Whether a requirement holds, given the courses someone has finished.
// "unknown" means it depends on something we can't check from a list of courses:
// a requirement that isn't a course (e.g. "Third-year standing"),
// or a minimum grade in a course they've taken (we don't know their grade).
export type Status = "met" | "unmet" | "unknown";

// Works out a requirement tree's status from the set of finished course codes,
// e.g. done = new Set(["CPSC 110", "CPSC 121"]).
export function requirementStatus(node: ReqNode, done: ReadonlySet<string>): Status {
  if (typeof node === "string") {
    return done.has(node) ? "met" : "unmet";
  }
  if ("course" in node) {
    // Not taken: unmet. Taken: it depends on the grade, which we don't know.
    return done.has(node.course) ? "unknown" : "unmet";
  }
  if ("other" in node) {
    return "unknown";
  }
  if ("one_of" in node) {
    return anyOf(node.one_of.map((child) => requirementStatus(child, done)));
  }
  return allOf(node.all_of.map((child) => requirementStatus(child, done)));
}

// "One of": a single met choice is enough. If none is met but one might be, it's unknown.
function anyOf(statuses: Status[]): Status {
  if (statuses.includes("met")) return "met";
  if (statuses.includes("unknown")) return "unknown";
  return "unmet";
}

// "All of": a single unmet part fails the whole group. If none fails but one might, it's unknown.
function allOf(statuses: Status[]): Status {
  if (statuses.includes("unmet")) return "unmet";
  if (statuses.includes("unknown")) return "unknown";
  return "met";
}
