import { splitDescription } from "./details";
import { factStatus, HIGH_SCHOOL_COURSES, highSchoolExclusions, NO_FACTS } from "./facts";
import type { Facts } from "./facts";
import type { Course, ReqNode } from "./types";

// Whether a requirement holds, given the courses someone has finished.
// "unknown" means it depends on something we can't check from a list of courses:
// a requirement that isn't a course (e.g. "Permission of the Department Head"),
// or a minimum grade in a course they've taken (we don't know their grade).
// Year standing and high school courses are known if they've said (see facts.ts).
export type Status = "met" | "unmet" | "unknown";

// Works out a requirement tree's status from the set of finished course codes,
// e.g. done = new Set(["CPSC 110", "CPSC 121"]), and what else they've told us.
export function requirementStatus(node: ReqNode, done: ReadonlySet<string>, facts: Facts = NO_FACTS): Status {
  if (typeof node === "string") {
    return done.has(node) ? "met" : "unmet";
  }
  if ("course" in node) {
    // Not taken: unmet. Taken: it depends on the grade, which we don't know.
    return done.has(node.course) ? "unknown" : "unmet";
  }
  if ("other" in node) {
    return factStatus(node.other, facts) ?? "unknown";
  }
  if ("one_of" in node) {
    return anyOf(node.one_of.map((child) => requirementStatus(child, done, facts)));
  }
  return allOf(node.all_of.map((child) => requirementStatus(child, done, facts)));
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
export function toCheck(node: ReqNode, done: ReadonlySet<string>, facts: Facts = NO_FACTS): string[] {
  if (typeof node === "string" || requirementStatus(node, done, facts) !== "unknown") return [];
  if ("course" in node) return [`${node.min_grade}% or higher in ${node.course}`];
  if ("other" in node) return [node.other];
  if ("all_of" in node) return node.all_of.flatMap((child) => toCheck(child, done, facts));
  const choices = node.one_of
    .map((child) => toCheck(child, done, facts).join(" and "))
    .filter((choice) => choice !== "");
  return [choices.join(" or ")];
}

// The requirements a checklist answer rules out, e.g. ["Third-year standing"] for someone in
// first year, so a "Not yet" can say why. Only parts that aren't met are looked in.
export function notMetByFacts(node: ReqNode, done: ReadonlySet<string>, facts: Facts): string[] {
  if (typeof node === "string" || "course" in node || requirementStatus(node, done, facts) !== "unmet") return [];
  if ("other" in node) return [node.other];
  return ("one_of" in node ? node.one_of : node.all_of).flatMap((child) => notMetByFacts(child, done, facts));
}

// The sentence in a description that says who can take the course, without its full stop, e.g.
// "Restricted to students admitted to the Co-operative Education Program in Computer Science",
// "Not open to students in the Life Sciences", "Permission of the supervisor required" or
// CPSC 490's "… will comply with the Handbook for Student Directed Seminars".
// Only the description itself is read, not the requisites after it, where "or permission of
// the instructor" is one way to meet a prerequisite, not a restriction.
const RESTRICTION = new RegExp(
  "\\b(?:restricted to|available to|open (?:ordinarily |only )?to|enrolment limited to|" +
    "requires (?:the )?(?:permission|approval)|approval of|with approval|approved by|" +
    "Handbook for Student Directed Seminars)\\b|^Permission of\\b",
  "i",
);
// A sentence ends at a full stop followed by a capital letter or weekly hours ("[1*-6-0]"),
// so "the B.Sc. program" stays whole.
const SENTENCE_END = /(?<=\.)\s+(?=[A-Z[])/;

export function restrictionOf(description: string): string | null {
  const sentences = splitDescription(description).summary.split(SENTENCE_END);
  const sentence = sentences.find((s) => RESTRICTION.test(s));
  return sentence ? sentence.trim().replace(/\.+$/, "") : null;
}

// A course code, or a bare number after one in a list, which is in the same subject:
// "CHEM 233, 235" is CHEM 233 and CHEM 235.
const CODE_OR_NUMBER = /\b([A-Z]{2,4}) (\d{3})\b|(?:,\s*|\s(?:or|and)\s+|\/)(\d{3})\b/g;

function codesIn(text: string): string[] {
  const codes: string[] = [];
  let subject: string | null = null;
  for (const [, code, number, bare] of text.matchAll(CODE_OR_NUMBER)) {
    if (code) {
      subject = code;
      codes.push(`${code} ${number}`);
    } else if (subject) {
      codes.push(`${subject} ${bare}`);
    }
  }
  return codes;
}

// The courses named in the sentences of a course's description that match `sentence`,
// leaving out the course itself.
function codesInSentences(course: Pick<Course, "code" | "description">, sentence: RegExp): string[] {
  const codes = [...course.description.matchAll(sentence)].flatMap(([text]) => codesIn(text));
  return [...new Set(codes)].filter((code) => code !== course.code);
}

const NOT_FOR = /Not for [^.]*\./g;
// CPEN 355 says it another way: "Credit cannot be obtained for both CPEN 355 and CPSC 340."
const ONLY_ONE_OF =
  /Credit (?:will (?:only )?be granted for only one of|cannot be obtained for both) [^.]*\./g;

// The courses this one is a lesser choice than, from a sentence like
// "Not for students with credit for, or currently enrolled in, CPSC 210 or CPEN 221."
export function notForStudentsWith(course: Pick<Course, "code" | "description">): string[] {
  return codesInSentences(course, NOT_FOR);
}

// Every course that rules this one out: those, and the others in a sentence like
// "Credit will be granted for only one of BIOL 121 or BIOL 344."
export function exclusionsOf(course: Pick<Course, "code" | "description">): string[] {
  return [...new Set([...notForStudentsWith(course), ...codesInSentences(course, ONLY_ONE_OF)])];
}

// Whether a requirement could still be met by someone who can't take the courses in `ruledOut`
// for credit, if they took everything else. Things to check might work out, so they count.
function reachable(node: ReqNode, ruledOut: ReadonlyMap<string, unknown>): boolean {
  if (typeof node === "string") return !ruledOut.has(node);
  if ("course" in node) return !ruledOut.has(node.course);
  if ("other" in node) return true;
  if ("one_of" in node) return node.one_of.some((child) => reachable(child, ruledOut));
  return node.all_of.every((child) => reachable(child, ruledOut));
}

// Every course code in a requirement tree, in order.
function treeCodes(node: ReqNode): string[] {
  if (typeof node === "string") return [node];
  if ("course" in node) return [node.course];
  if ("other" in node) return [];
  return ("one_of" in node ? node.one_of : node.all_of).flatMap(treeCodes);
}

// What a course looks like to someone who has finished the courses in `done`:
// - "done": finished.
// - "no-credit": they've finished a course that rules this one out (CPSC 100 after CPSC 110),
//   or ticked a high school course that does (CHEM 111 with Chemistry 12).
// - "not-needed": every way into it goes through a "no-credit" course, so they wouldn't take it
//   (CPSC 107 needs CPSC 103, which isn't for students with CPSC 110).
// - "locked": a requirement isn't met.
// - "check": nothing we know of is missing, but something can't be checked from courses alone.
// - "can-take": every requirement is met.
export type CourseStatus = "done" | "no-credit" | "not-needed" | "locked" | "check" | "can-take";

// Courses someone wouldn't take, so the side panel and the map show no path to them.
export const WONT_TAKE: ReadonlySet<CourseStatus> = new Set(["no-credit", "not-needed"]);

export interface CourseProgress {
  status: CourseStatus;
  toCheck: string[]; // for "check": what to check yourself, e.g. ["Third-year standing"]
  // For "no-credit": the finished courses that rule it out, e.g. ["CPSC 110"], or the high
  // school courses, e.g. ["Chemistry 12"].
  // For "not-needed": the finished courses that rule out its way in.
  excludedBy: string[];
  blockedBy: string[]; // for "not-needed": its prerequisites that are "no-credit", e.g. ["CPSC 103"]
}

// The progress of every course in `courses`, by course code.
// They're worked out together because a coreq can be taken at the same time:
// CPSC 121 needs CPSC 107 or 110 "before or at the same time", so it opens up
// as soon as you could start CPSC 110, not only once you've finished it.
export function courseProgress(
  courses: Course[],
  done: ReadonlySet<string>,
  facts: Facts = NO_FACTS,
): Map<string, CourseProgress> {
  // Courses you could be taking now: finished ones, plus any whose prereqs are all met.
  const startable = new Set(done);
  for (const course of courses) {
    if (!course.prereq || requirementStatus(course.prereq.tree, done, facts) === "met") {
      startable.add(course.code);
    }
  }

  // Courses a finished course rules out, with the finished courses that do it, and courses
  // a high school course they've ticked rules out, with its name ("Chemistry 12").
  const ruledOut = new Map<string, string[]>();
  for (const course of courses) {
    const by = [
      ...exclusionsOf(course).filter((code) => done.has(code)),
      ...highSchoolExclusions(course.description)
        .filter((key) => facts.highSchool.has(key))
        .map((key) => HIGH_SCHOOL_COURSES.find((c) => c.key === key)!.name),
    ];
    if (by.length > 0 && !done.has(course.code)) ruledOut.set(course.code, by);
  }

  const progress = new Map<string, CourseProgress>();
  for (const course of courses) {
    progress.set(course.code, progressOf(course, done, startable, ruledOut, facts));
  }
  return progress;
}

const NOTHING = { toCheck: [], excludedBy: [], blockedBy: [] };

function progressOf(
  course: Course,
  done: ReadonlySet<string>,
  startable: ReadonlySet<string>,
  ruledOut: ReadonlyMap<string, string[]>,
  facts: Facts,
): CourseProgress {
  if (done.has(course.code)) {
    return { ...NOTHING, status: "done" };
  }

  const excludedBy = ruledOut.get(course.code);
  if (excludedBy) {
    return { ...NOTHING, status: "no-credit", excludedBy };
  }

  const prereq = course.prereq ? requirementStatus(course.prereq.tree, done, facts) : "met";
  if (course.prereq && prereq === "unmet" && !reachable(course.prereq.tree, ruledOut)) {
    const blockedBy = [...new Set(treeCodes(course.prereq.tree))].filter((code) => ruledOut.has(code));
    const by = [...new Set(blockedBy.flatMap((code) => ruledOut.get(code)!))];
    return { ...NOTHING, status: "not-needed", excludedBy: by, blockedBy };
  }
  const coreq = course.coreq ? requirementStatus(course.coreq.tree, startable, facts) : "met";
  const restriction = restrictionOf(course.description);
  const status = allOf([prereq, coreq, restriction ? "unknown" : "met"]);

  if (status === "unmet") {
    return { ...NOTHING, status: "locked" };
  }
  if (status === "met") {
    return { ...NOTHING, status: "can-take" };
  }
  const items = [
    ...(course.prereq ? toCheck(course.prereq.tree, done, facts) : []),
    ...(course.coreq ? toCheck(course.coreq.tree, startable, facts) : []),
    ...(restriction ? [restriction] : []),
  ];
  return { ...NOTHING, status: "check", toCheck: items };
}

// How many courses have each status, for the summary above the graph ("5 done · 9 you can take").
export function countStatuses(progress: Map<string, CourseProgress>): Record<CourseStatus, number> {
  const counts: Record<CourseStatus, number> = {
    done: 0,
    "no-credit": 0,
    "not-needed": 0,
    locked: 0,
    check: 0,
    "can-take": 0,
  };
  for (const { status } of progress.values()) counts[status]++;
  return counts;
}
