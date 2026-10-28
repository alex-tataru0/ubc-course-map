import { facultyOf } from "./subjects";
import type { Course, Program, ProgramNode, ProgramRequirement } from "./types";

// How far you are through each requirement of a program, from the courses you've marked done.
//
// The main rule: a course counts toward one requirement only. If you took CPSC 304 and 317,
// "One of CPSC 304, 317, 344" gets one of them and "One more of …" gets the other, and a course
// used for a named requirement doesn't also count toward "9 credits of CPSC 300 or higher".
// Electives come last: any finished course no other row used counts toward them.

export type RowStatus =
  | "done"
  | "partial" // some of it is done
  | "todo"
  | "check"; // not about courses, e.g. "Additional Communication Requirement"

export interface RowProgress {
  status: RowStatus;
  counted: string[]; // your finished courses that count toward this row
  credits: number; // the credits of those courses
  check: string | null; // a condition we can't tell from your courses, shown as "Check: …"
}

// Credits for a course, from the calendar data. Courses we don't have (MATH, AI, …) and
// courses with a range of credits (CPSC 436: 1-6) are counted as 3, the usual size.
export type CreditsFor = (code: string) => number;

export function creditsLookup(courses: Course[]): CreditsFor {
  const known = new Map(courses.map((c) => [c.code, c.credits]));
  return (code) => {
    const credits = known.get(code);
    return credits !== undefined && /^\d+$/.test(credits) ? Number(credits) : 3;
  };
}

const level = (code: string) => Number(code.split(" ")[1].slice(0, 3));
const subject = (code: string) => code.split(" ")[0];

// Every course a tree names.
export function treeCourses(node: ProgramNode): string[] {
  if (typeof node === "string") return [node];
  if ("one_of" in node) return node.one_of.flatMap(treeCourses);
  if ("all_of" in node) return node.all_of.flatMap(treeCourses);
  if ("pick" in node) return node.of;
  if ("credits_from" in node) return node.credits_from;
  return [];
}

// The order rows get to claim courses: rows that name exact courses first, then "one of"
// rows (fewest choices first, so "One more of" a long list comes after "One of" a short one),
// then "pick N", then credits from a list ("9 credits from MATH 300, 301, …"), then credit
// rows by level (400-level before 300-level, so a 400-level course fills the 400 row before
// it's used for the 300 row), then electives, which take whatever is left (earlier years
// first: the calendar lets elective credits move between years), then rows we don't track.
function rank(node: ProgramNode): number {
  if (typeof node === "string" || "all_of" in node) return 0;
  if ("one_of" in node) return 1 + node.one_of.length / 1000;
  if ("pick" in node) return 2;
  if ("credits_from" in node) return 2.5;
  if ("credits_of" in node) return 3 - node.credits_of.min_level / 10000;
  if ("electives" in node) return 3.5;
  return 4;
}

// Progress for every row, in the same shape as program.years[i].requirements[j].
export function programProgress(
  program: Program,
  done: ReadonlySet<string>,
  creditsFor: CreditsFor,
): RowProgress[][] {
  const used = new Set<string>();
  const result: RowProgress[][] = program.years.map((year) => year.requirements.map(() => todo()));
  const rows = program.years.flatMap((year, y) =>
    year.requirements.map((requirement, r) => ({ y, r, requirement })),
  );
  // sort keeps rows of the same rank in the calendar's order.
  for (const { y, r, requirement } of rows.sort((a, b) => rank(a.requirement.tree) - rank(b.requirement.tree))) {
    result[y][r] = rowProgress(requirement, done, used, creditsFor);
  }
  return result;
}

function todo(): RowProgress {
  return { status: "todo", counted: [], credits: 0, check: null };
}

function rowProgress(
  requirement: ProgramRequirement,
  done: ReadonlySet<string>,
  used: Set<string>,
  creditsFor: CreditsFor,
): RowProgress {
  const { tree } = requirement;
  const free = (code: string) => done.has(code) && !used.has(code);
  // Counts these courses toward this row, so no other row can use them.
  const claim = (codes: string[], status: RowStatus, check: string | null = null): RowProgress => {
    codes.forEach((code) => used.add(code));
    const credits = codes.reduce((sum, code) => sum + creditsFor(code), 0);
    return { status, counted: codes, credits, check };
  };

  if (typeof tree === "object" && ("credits_of" in tree || "credits_from" in tree || "electives" in tree)) {
    // The row's credits from any courses that fit: by subject and level, from a list, or for
    // electives, any course (by now, only the ones no other row used).
    const excluded = excludedCourses(requirement.notes);
    const fits =
      "credits_of" in tree
        ? (code: string) => {
            const { subjects, min_level, max_level = 999 } = tree.credits_of;
            return subjects.includes(subject(code)) && level(code) >= min_level && level(code) <= max_level;
          }
        : "credits_from" in tree
          ? (code: string) => tree.credits_from.includes(code)
          : () => true;
    const taken: string[] = [];
    let credits = 0;
    for (const code of [...done].filter((c) => free(c) && fits(c) && !excluded.has(c)).sort()) {
      if (credits >= requirement.credits) break;
      taken.push(code);
      credits += creditsFor(code);
    }
    return claim(taken, credits >= requirement.credits ? "done" : credits > 0 ? "partial" : "todo");
  }
  if (typeof tree === "object" && "other" in tree) {
    return { status: "check", counted: [], credits: 0, check: tree.other };
  }

  // Courses, lists, choices and "pick N", which can sit inside each other ("EOSC 212, or
  // EOSC 111 and one of EOSC 110, 112, …").
  const { codes, done: complete, check } = match(tree, free, new Set(), creditsFor);
  return claim(codes, complete ? "done" : codes.length > 0 ? "partial" : "todo", check);
}

// How far the free courses go toward one node of a tree: the courses it would use, whether
// that's enough, and anything to check yourself. `taken` holds courses already used by other
// parts of the same row.
interface Match {
  codes: string[];
  done: boolean;
  check: string | null;
}

function match(
  node: ProgramNode,
  free: (code: string) => boolean,
  taken: ReadonlySet<string>,
  creditsFor: CreditsFor,
): Match {
  const available = (code: string) => free(code) && !taken.has(code);
  if (typeof node === "string") {
    return available(node) ? { codes: [node], done: true, check: null } : { codes: [], done: false, check: null };
  }

  if ("all_of" in node) {
    // Every part, each with the courses the parts before it didn't use.
    const used = new Set(taken);
    const parts = node.all_of.map((child) => {
      const part = match(child, free, used, creditsFor);
      part.codes.forEach((code) => used.add(code));
      return part;
    });
    return {
      codes: parts.flatMap((part) => part.codes),
      done: parts.every((part) => part.done),
      check: parts.find((part) => part.check)?.check ?? null,
    };
  }

  if ("one_of" in node) {
    // The first choice you've fully done wins. If none is, the choice you're furthest into
    // (e.g. CPSC 103 of "CPSC 103 and 107") shows as partial.
    const choices = node.one_of.map((child) => match(child, free, taken, creditsFor));
    const full = choices.find((choice) => choice.done);
    if (full) return full;
    const best = [...choices].sort((a, b) => b.codes.length - a.codes.length)[0];
    return { codes: best?.codes ?? [], done: false, check: best?.codes.length ? best.check : null };
  }

  if ("pick" in node) {
    // Higher-level courses first, which helps with conditions like "at least 6 credits of
    // which must be 400 or above".
    const chosen = node.of
      .filter(available)
      .sort((a, b) => level(b) - level(a))
      .slice(0, node.pick);
    if (chosen.length < node.pick) return { codes: chosen, done: false, check: node.note ?? null };
    const condition = node.note?.match(/at least (\d+) credits of which must be (\d{3}) or above/);
    if (condition) {
      const [, needed, minimum] = condition.map(Number);
      const high = chosen.filter((code) => level(code) >= minimum);
      const ok = high.reduce((sum, code) => sum + creditsFor(code), 0) >= needed;
      return { codes: chosen, done: ok, check: ok ? null : node.note! };
    }
    // A condition we can't read: count the courses, and ask you to check it yourself.
    return { codes: chosen, done: true, check: node.note ?? null };
  }

  // Inside a list, words we can't track ("6 credits chosen from …") are for you to check: the
  // list counts as done once its courses are.
  if ("other" in node) return { codes: [], done: true, check: node.other };
  // Credit rows and electives only come as a whole row.
  return { codes: [], done: false, check: null };
}

// Courses a footnote rules out, e.g. "Credits gained from … Seminars (CPSC 490) cannot be used
// to fulfill this requirement.", "ECON 457 will not count towards 400-level electives", "Credit
// for PHIL 400 and PHIL 401 is not permitted …", "PSYC 340, 388, 440, or 488 may not be included …".
function excludedCourses(notes: string[]): Set<string> {
  const codes = notes
    .filter((note) => /can ?not be used|will not count|is not permitted|may not be included/i.test(note))
    .flatMap((note) => note.match(/[A-Z]{2,4} \d{3}/g) ?? []);
  return new Set(codes);
}

// Every course any of these programs names, sorted, e.g. for the list of courses not on the map.
export function programCodes(programs: Program[]): string[] {
  const rows = programs.flatMap((p) => p.years.flatMap((y) => y.requirements));
  const codes = rows.flatMap((r) => treeCourses(r.tree));
  return [...new Set(codes)].sort();
}

// How a program names a course: always required, or one of a few choices.
export type ProgramKind = "required" | "choice";

// For the map: every course a program names, and whether it's always required or one of a
// few choices. A course that's required anywhere counts as required.
export function programCourses(program: Program): Map<string, ProgramKind> {
  const kinds = new Map<string, ProgramKind>();
  for (const year of program.years) {
    for (const { tree } of year.requirements) {
      const required = new Set(requiredCourses(tree));
      for (const code of treeCourses(tree)) {
        if (required.has(code) || !kinds.has(code)) kinds.set(code, required.has(code) ? "required" : "choice");
      }
    }
  }
  return kinds;
}

// The courses a tree always needs: itself, or the plain courses of a list, but not the ones
// inside a choice ("MATH 221 (or 223), 215" always needs MATH 215 only).
function requiredCourses(node: ProgramNode): string[] {
  if (typeof node === "string") return [node];
  if ("all_of" in node) return node.all_of.flatMap(requiredCourses);
  return [];
}

// A one-line summary: rows done out of rows we can track (not "check" rows), and the credits
// of your finished courses that no row used, not even the electives.
export function programSummary(
  progress: RowProgress[][],
  done: ReadonlySet<string>,
  creditsFor: CreditsFor,
): { rowsDone: number; rows: number; spareCredits: number } {
  const rows = progress.flat().filter((row) => row.status !== "check");
  const counted = new Set(progress.flat().flatMap((row) => row.counted));
  const spare = [...done].filter((code) => !counted.has(code));
  return {
    rowsDone: rows.filter((row) => row.status === "done").length,
    rows: rows.length,
    spareCredits: spare.reduce((sum, code) => sum + creditsFor(code), 0),
  };
}

// A name short enough for the button over the map, e.g. "CS and SE Honours", "CS and
// Mathematics, Combined Honours".
export function shortName(program: Program): string {
  return program.name
    .replace(/^(Combined (?:Major|Honours)) in (.+)$/, "$2, $1")
    .replace("Computer Science", "CS")
    .replace("Software Engineering", "SE")
    .replace("Artificial Intelligence", "AI");
}

// The programs as the picker shows them on the Science page: one entry per subject, in the
// subject menu's order. A subject with several programs (Computer Science: Major, Honours, the
// AI option, …) opens to show them, its own first, then the combined programs it's part of;
// one with a single program (Data Science) is picked straight away. A combined program shows
// under each of its subjects.
export interface Major {
  subject: string; // e.g. "CPSC"
  programs: Program[]; // its own, in the calendar's order
  combined: Program[]; // combined with another subject
}

export function programMajors(programs: Program[]): Major[] {
  const majors: Major[] = [];
  const majorOf = (subject: string) => {
    let major = majors.find((m) => m.subject === subject);
    if (!major) majors.push((major = { subject, programs: [], combined: [] }));
    return major;
  };
  for (const program of programs) {
    // A combined program is listed under each of its subjects in its own faculty: the B.A. in
    // Economics and Mathematics under Economics only, since Mathematics is on the Science page.
    const home = facultyOf(program.subjects?.[0] ?? programSubject(program));
    if (program.subjects) {
      program.subjects.filter((s) => facultyOf(s) === home).forEach((s) => majorOf(s).combined.push(program));
    } else majorOf(programSubject(program)).programs.push(program);
  }
  // A subject's place in its faculty's menu. sort keeps the others in the order they came.
  const place = (s: string) => facultyOf(s)?.subjects.findIndex((x) => x.code === s) ?? 1e9;
  return majors.sort((a, b) => place(a.subject) - place(b.subject));
}

// The programs whose courses a subject's map lists among its "Courses not on the map": the
// subject's own (MATH 100, SCIE 113, … on the CPSC map, for the CS programs; MATH 100 on the
// ELEC map for Electrical Engineering), and the picked program if it's a combined one with this
// subject (CS and Biology lists its BIOL courses on the CPSC map, and its CPSC courses on the
// BIOL map). Combined programs aren't listed until picked: the twelve with CS would add about
// 140 courses to the CPSC map.
export function mapPrograms(programs: Program[], subject: string, picked: Program | null): Program[] {
  const own = programs.filter((p) => !p.subjects && programSubject(p) === subject);
  return picked?.subjects?.includes(subject) ? [...own, picked] : own;
}

// The subject whose map lists the courses a program needs from elsewhere: "cpsc-major" → CPSC,
// "mech" → MECH.
export function programSubject(program: Program): string {
  return program.id.split("-")[0].toUpperCase();
}
