import type { Course, ReqNode } from "./types";

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

// The parts of a tree whose status is "unknown" that you'd need to check yourself, in plain words,
// e.g. ["Third-year standing"] or ["Principles of Mathematics 12 or Pre-calculus 12"].
// Only the parts that decide the answer are listed: nothing already met,
// and in a "one of", only the choices that could still work.
export function toCheck(node: ReqNode, done: ReadonlySet<string>): string[] {
  if (typeof node === "string" || requirementStatus(node, done) !== "unknown") return [];
  if ("course" in node) return [`${node.min_grade}% or higher in ${node.course}`];
  if ("other" in node) return [node.other];
  if ("all_of" in node) return node.all_of.flatMap((child) => toCheck(child, done));
  const choices = node.one_of
    .map((child) => toCheck(child, done).join(" and "))
    .filter((choice) => choice !== "");
  return [choices.join(" or ")];
}

// The sentence in a description that says who can take the course, without its full stop, e.g.
// "Restricted to students admitted to the Co-operative Education Program in Computer Science".
const RESTRICTION = /(?:Restricted to|Available to|Open ordinarily to)[^.]*/;

export function restrictionOf(description: string): string | null {
  return description.match(RESTRICTION)?.[0] ?? null;
}

// The courses that rule this one out, from a sentence like
// "Not for students with credit for, or currently enrolled in, CPSC 210 or CPEN 221."
const EXCLUSION = /Not for [^.]*\./;
const COURSE_CODE = /\b[A-Z]{2,4} \d{3}\b/g;

export function exclusionsOf(description: string): string[] {
  const sentence = description.match(EXCLUSION);
  return sentence ? (sentence[0].match(COURSE_CODE) ?? []) : [];
}

// What a course looks like to someone who has finished the courses in `done`:
// - "done": finished.
// - "no-credit": they've finished a course that rules this one out (CPSC 100 after CPSC 110).
// - "locked": a requirement isn't met.
// - "check": nothing we know of is missing, but something can't be checked from courses alone.
// - "can-take": every requirement is met.
export type CourseStatus = "done" | "no-credit" | "locked" | "check" | "can-take";

export interface CourseProgress {
  status: CourseStatus;
  toCheck: string[]; // for "check": what to check yourself, e.g. ["Third-year standing"]
  excludedBy: string[]; // for "no-credit": the finished courses that rule it out, e.g. ["CPSC 110"]
}

// The progress of every course in `courses`, by course code.
// They're worked out together because a coreq can be taken at the same time:
// CPSC 121 needs CPSC 107 or 110 "before or at the same time", so it opens up
// as soon as you could start CPSC 110, not only once you've finished it.
export function courseProgress(
  courses: Course[],
  done: ReadonlySet<string>,
): Map<string, CourseProgress> {
  // Courses you could be taking now: finished ones, plus any whose prereqs are all met.
  const startable = new Set(done);
  for (const course of courses) {
    if (!course.prereq || requirementStatus(course.prereq.tree, done) === "met") {
      startable.add(course.code);
    }
  }

  const progress = new Map<string, CourseProgress>();
  for (const course of courses) {
    progress.set(course.code, progressOf(course, done, startable));
  }
  return progress;
}

function progressOf(
  course: Course,
  done: ReadonlySet<string>,
  startable: ReadonlySet<string>,
): CourseProgress {
  if (done.has(course.code)) {
    return { status: "done", toCheck: [], excludedBy: [] };
  }

  const excludedBy = exclusionsOf(course.description).filter((code) => done.has(code));
  if (excludedBy.length > 0) {
    return { status: "no-credit", toCheck: [], excludedBy };
  }

  const prereq = course.prereq ? requirementStatus(course.prereq.tree, done) : "met";
  const coreq = course.coreq ? requirementStatus(course.coreq.tree, startable) : "met";
  const restriction = restrictionOf(course.description);
  const status = allOf([prereq, coreq, restriction ? "unknown" : "met"]);

  if (status === "unmet") {
    return { status: "locked", toCheck: [], excludedBy: [] };
  }
  if (status === "met") {
    return { status: "can-take", toCheck: [], excludedBy: [] };
  }
  const items = [
    ...(course.prereq ? toCheck(course.prereq.tree, done) : []),
    ...(course.coreq ? toCheck(course.coreq.tree, startable) : []),
    ...(restriction ? [restriction] : []),
  ];
  return { status: "check", toCheck: items, excludedBy: [] };
}
