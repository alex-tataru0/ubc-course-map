import type { CreditsFor, RowStatus } from "./program";
import { SCIENCE } from "./subjects";
import type { Program } from "./types";

// The Faculty of Science's rules that every B.Sc. program shares, on top of the program's own
// course list. From the UBC Calendar's Bachelor of Science pages: General Degree Requirements,
// Lower-level Requirements, Upper-level Requirement, Science and Arts Requirements, Science
// Breadth Requirement and Communication Requirements. Unlike a program's rows, these don't
// claim courses: one course can count for the program and for several of these.

const level = (code: string) => Number(code.split(" ")[1].slice(0, 3));
const subject = (code: string) => code.split(" ")[0];
const lastTwo = (code: string) => level(code) % 100;

// Courses with Science credit: the Faculty of Science's subjects, AI, and some courses from
// other faculties (all BIOC, CAPS and PCTH; GEOS, which was GEOB; PSYC 348, 448 and PSYC
// numbered 60 to 89 in the last two digits; MEDG 410-421; FNH 350, 351, 450, 451).
const SCIENCE_SUBJECTS = new Set([
  ...SCIENCE.subjects.map((s) => s.code), "AI", "BIOC", "CAPS", "PCTH", "GEOS", "GEOB",
]);
const isSciencePsyc = (code: string) =>
  code === "PSYC 348" || code === "PSYC 448" || (lastTwo(code) >= 60 && lastTwo(code) <= 89);

export function isScience(code: string): boolean {
  const s = subject(code);
  if (SCIENCE_SUBJECTS.has(s)) return true;
  if (s === "PSYC") return isSciencePsyc(code);
  if (s === "MEDG") return level(code) >= 410 && level(code) <= 421;
  return ["FNH 350", "FNH 351", "FNH 450", "FNH 451"].includes(code);
}

// Laboratory Science Requirement: one of these.
export const LAB_COURSES = [
  "ASTR 101", "ASTR 102", "BIOL 140", "CHEM 111", "CHEM 115", "CHEM 121", "CHEM 123", "CHEM 135",
  "EOSC 111", "PHYS 101", "PHYS 107", "PHYS 109", "PHYS 119", "PHYS 159", "SCIE 001",
];

// Science Breadth Requirement: 3 credits in 6 of these 7 categories (5 for combined majors and
// honours). Science One (SCIE 001) counts for the first four.
export const BREADTH: { name: string; has: (code: string) => boolean }[] = [
  { name: "Mathematics", has: (c) => subject(c) === "MATH" && c !== "MATH 302" },
  { name: "Chemistry", has: (c) => subject(c) === "CHEM" && c !== "CHEM 100" && c !== "CHEM 300" },
  { name: "Physics", has: (c) => subject(c) === "PHYS" && c !== "PHYS 100" },
  {
    name: "Life Science",
    has: (c) =>
      (subject(c) === "BIOL" && c !== "BIOL 140" && c !== "BIOL 300") ||
      subject(c) === "BIOC" ||
      subject(c) === "MICB" ||
      (subject(c) === "PSYC" && lastTwo(c) >= 60 && lastTwo(c) <= 89) ||
      c === "GEOS 207" ||
      c === "GEOB 207",
  },
  { name: "Statistics", has: (c) => subject(c) === "STAT" || ["BIOL 300", "DSCI 100", "MATH 302"].includes(c) },
  { name: "Computer Science", has: (c) => subject(c) === "CPSC" || subject(c) === "AI" },
  {
    name: "Earth and Planetary Science",
    has: (c) =>
      ["ASTR", "ATSC", "ENVR", "EOSC", "GEOS", "GEOB"].includes(subject(c)) &&
      !["EOSC 111", "GEOS 207", "GEOB 207"].includes(c),
  },
];
const SCIENCE_ONE_CATEGORIES = 4;

// Additional Communication Requirement: 3 credits from these. Programs list it as a row of
// their own ("Additional Communication Requirement"), which withCommunicationCourses turns
// into a choice of these courses so it can be ticked off.
export const COMMUNICATION_COURSES = ["WRDS 150", "ENGL 110", "ENGL 111", "SCIE 300", "CHEM 300", "ENVR 200"];

export function withCommunicationCourses(program: Program): Program {
  return {
    ...program,
    years: program.years.map((year) => ({
      ...year,
      requirements: year.requirements.map((row) =>
        /^Additional Communications? Requirement$/.test(row.text)
          ? { ...row, tree: { one_of: COMMUNICATION_COURSES } }
          : row,
      ),
    })),
  };
}

// One of the rules, ready to show: how far along it is, and what fills it.
export interface ScienceRow {
  title: string;
  status: RowStatus;
  progress: string | null; // e.g. "61 of 72 cr", "5 of 6"
  counted: string[]; // for a choice of courses, the one that counts
  options: string[]; // courses that would fill it, while it isn't done
  categories: { name: string; done: boolean }[] | null; // for Science Breadth
  check: string | null; // what to check yourself
}

const statusOf = (have: number, need: number): RowStatus => (have >= need ? "done" : have > 0 ? "partial" : "todo");

// Honours and Combined Honours need 42 upper-level Science credits, majors 30. Combined majors
// and honours need 5 breadth categories, the others 6.
const isHonours = (program: Program) => /Honours/.test(program.name);
const isCombined = (program: Program) => /^Combined /.test(program.name);

export function scienceRows(program: Program, done: ReadonlySet<string>, creditsFor: CreditsFor): ScienceRow[] {
  const courses = [...done].sort();
  const credits = (codes: string[]) => codes.reduce((sum, code) => sum + creditsFor(code), 0);
  const row = (title: string, status: RowStatus, more: Partial<ScienceRow> = {}): ScienceRow => ({
    title, status, progress: null, counted: [], options: [], categories: null, check: null, ...more,
  });
  const creditRow = (title: string, codes: string[], need: number) => {
    const have = credits(codes);
    return row(title, statusOf(have, need), { progress: `${Math.min(have, need)} of ${need} cr` });
  };

  const lab = courses.filter((code) => LAB_COURSES.includes(code));

  const categories = BREADTH.map((category, i) => ({
    name: category.name,
    done: credits(courses.filter(category.has)) >= 3 || (i < SCIENCE_ONE_CATEGORIES && done.has("SCIE 001")),
  }));
  const breadthNeed = isCombined(program) ? 5 : 6;
  const breadthHave = Math.min(categories.filter((c) => c.done).length, breadthNeed);

  const science = courses.filter(isScience);
  const upper = courses.filter((code) => level(code) >= 300);
  const upperScienceNeed = isHonours(program) ? 42 : 30;

  return [
    row("One lab science course", lab.length > 0 ? "done" : "todo", {
      counted: lab.slice(0, 1),
      options: lab.length > 0 ? [] : LAB_COURSES,
    }),
    row(`3 credits in ${breadthNeed} of the 7 Science Breadth categories`, statusOf(breadthHave, breadthNeed), {
      progress: `${breadthHave} of ${breadthNeed}`,
      categories,
    }),
    creditRow("Science credits", science, 72),
    creditRow("Credits numbered 300 or higher", upper, 48),
    creditRow("…of which in Science", upper.filter(isScience), upperScienceNeed),
    row("12 Arts credits", "check", {
      check: "Arts courses aren't on this site. The communication course doesn't count toward these.",
    }),
    row("Foundational Biology, Chemistry and Physics", "check", {
      check:
        "Only if you came without Biology 11 or 12, Chemistry 12 or Physics 12: 3 credits of " +
        "100-level BIOL, CHEM or PHYS for each one missing.",
    }),
  ];
}
