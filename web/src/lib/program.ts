import type { Course, Program, ProgramNode, ProgramRequirement } from "./types";

// How far you are through each requirement of a program, from the courses you've marked done.
//
// The main rule: a course counts toward one requirement only. If you took CPSC 304 and 317,
// "One of CPSC 304, 317, 344" gets one of them and "One more of …" gets the other, and a course
// used for a named requirement doesn't also count toward "9 credits of CPSC 300 or higher".

export type RowStatus =
  | "done"
  | "partial" // some of it is done
  | "todo"
  | "check" // not about courses, e.g. "Additional Communication Requirement"
  | "electives"; // any courses; we don't track these

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
  return [];
}

// The order rows get to claim courses: rows that name exact courses first, then "one of"
// rows (fewest choices first, so "One more of" a long list comes after "One of" a short one),
// then "pick N", then credit rows (400-level before 300-level, so a 400-level course fills the
// 400 row before it's used for the 300 row), then rows we don't track.
function rank(node: ProgramNode): number {
  if (typeof node === "string" || "all_of" in node) return 0;
  if ("one_of" in node) return 1 + node.one_of.length / 1000;
  if ("pick" in node) return 2;
  if ("credits_of" in node) return 3 - node.credits_of.min_level / 10000;
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

  if (typeof tree === "string" || "all_of" in tree) {
    const codes = treeCourses(tree);
    const have = codes.filter(free);
    return claim(have, have.length === codes.length ? "done" : have.length > 0 ? "partial" : "todo");
  }

  if ("one_of" in tree) {
    // The first choice you've fully done wins. If none is, the choice you're furthest into
    // (e.g. CPSC 103 of "CPSC 103 and 107") shows as partial.
    const choices = tree.one_of.map(treeCourses);
    const full = choices.find((codes) => codes.every(free));
    if (full) return claim(full, "done");
    const best = choices.map((codes) => codes.filter(free)).sort((a, b) => b.length - a.length)[0];
    return claim(best ?? [], best && best.length > 0 ? "partial" : "todo");
  }

  if ("pick" in tree) {
    // Higher-level courses first, which helps with conditions like "at least 6 credits of
    // which must be 400 or above".
    const chosen = tree.of
      .filter(free)
      .sort((a, b) => level(b) - level(a))
      .slice(0, tree.pick);
    if (chosen.length < tree.pick) {
      return claim(chosen, chosen.length > 0 ? "partial" : "todo", tree.note ?? null);
    }
    const condition = tree.note?.match(/at least (\d+) credits of which must be (\d{3}) or above/);
    if (condition) {
      const [, needed, minimum] = condition.map(Number);
      const high = chosen.filter((code) => level(code) >= minimum);
      const ok = high.reduce((sum, code) => sum + creditsFor(code), 0) >= needed;
      return claim(chosen, ok ? "done" : "partial", ok ? null : tree.note!);
    }
    // A condition we can't read: count the courses, and ask you to check it yourself.
    return claim(chosen, "done", tree.note ?? null);
  }

  if ("credits_of" in tree) {
    const { subjects, min_level } = tree.credits_of;
    const excluded = excludedCourses(requirement.notes);
    const fits = (code: string) =>
      free(code) && subjects.includes(subject(code)) && level(code) >= min_level && !excluded.has(code);
    const taken: string[] = [];
    let credits = 0;
    for (const code of [...done].filter(fits).sort()) {
      if (credits >= requirement.credits) break;
      taken.push(code);
      credits += creditsFor(code);
    }
    return claim(taken, credits >= requirement.credits ? "done" : credits > 0 ? "partial" : "todo");
  }

  if ("electives" in tree) return { status: "electives", counted: [], credits: 0, check: null };
  return { status: "check", counted: [], credits: 0, check: tree.other };
}

// Courses a footnote rules out, e.g. "Credits gained from … Seminars (CPSC 490) cannot be used
// to fulfill this requirement."
function excludedCourses(notes: string[]): Set<string> {
  const codes = notes
    .filter((note) => /can ?not be used/i.test(note))
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
      const required = typeof tree === "string" || "all_of" in tree;
      for (const code of treeCourses(tree)) {
        if (required || !kinds.has(code)) kinds.set(code, required ? "required" : "choice");
      }
    }
  }
  return kinds;
}

// A one-line summary: rows done out of rows we can track (not electives or "check" rows),
// and the credits of your other finished courses, which can count as electives.
export function programSummary(
  progress: RowProgress[][],
  done: ReadonlySet<string>,
  creditsFor: CreditsFor,
): { rowsDone: number; rows: number; spareCredits: number } {
  const rows = progress.flat().filter((row) => row.status !== "electives" && row.status !== "check");
  const counted = new Set(progress.flat().flatMap((row) => row.counted));
  const spare = [...done].filter((code) => !counted.has(code));
  return {
    rowsDone: rows.filter((row) => row.status === "done").length,
    rows: rows.length,
    spareCredits: spare.reduce((sum, code) => sum + creditsFor(code), 0),
  };
}

// A name short enough for the button over the map, e.g. "CS and SE Honours".
export function shortName(program: Program): string {
  return program.name
    .replace("Computer Science", "CS")
    .replace("Software Engineering", "SE")
    .replace("Artificial Intelligence", "AI");
}

// The programs as the picker shows them: one entry per major, in the calendar's order. A major
// with several paths (Computer Science: Major, Honours, the AI option, Software Engineering)
// opens to show them; one with a single path (Computer Engineering) is picked straight away.
export interface Major {
  subject: string; // e.g. "CPSC"
  programs: Program[];
}

export function programMajors(programs: Program[]): Major[] {
  const majors: Major[] = [];
  for (const program of programs) {
    const subject = programSubject(program);
    const major = majors.find((m) => m.subject === subject);
    if (major) major.programs.push(program);
    else majors.push({ subject, programs: [program] });
  }
  return majors;
}

// The subject whose map lists the courses a program needs from elsewhere: "cpsc-major" → CPSC,
// "mech" → MECH.
export function programSubject(program: Program): string {
  return program.id.split("-")[0].toUpperCase();
}
