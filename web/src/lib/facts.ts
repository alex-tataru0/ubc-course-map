import type { Status } from "./progress";
import type { Program } from "./types";

// Things about a student that aren't UBC courses, which some requirements ask for: their year
// standing ("Third-year standing") and high school courses ("PHYS 12"). Like the courses
// they've done, these come from a checklist they fill in, and anything they leave out stays
// "check yourself".

export interface Facts {
  standing: number | null; // 1 to 4 (4: fourth year or higher), null if not set
  highSchool: ReadonlySet<string>; // ticked high school courses, by the keys in HIGH_SCHOOL_COURSES
  program: Program | null; // the picked program, for "Third-year standing in Mining Engineering"
}

export const NO_FACTS: Facts = { standing: null, highSchool: new Set(), program: null };

// The high school courses on the checklist, with the ways the calendar writes each one.
export const HIGH_SCHOOL_COURSES: { key: string; name: string; texts: RegExp }[] = [
  { key: "BIOL 11", name: "Biology 11", texts: /^(?:BIOL|Biology) 11$/i },
  { key: "BIOL 12", name: "Biology 12", texts: /^(?:BIOL|Biology) 12$/i },
  { key: "CHEM 12", name: "Chemistry 12", texts: /^(?:CHEM|Chemistry) 12$/i },
  { key: "PHYS 11", name: "Physics 11", texts: /^(?:PHYS|Physics) 11$/i },
  { key: "PHYS 12", name: "Physics 12", texts: /^(?:PHYS|Physics) 12$/i },
  {
    key: "PREC 12",
    name: "Pre-calculus 12 (or Principles of Mathematics 12)",
    texts: /^(?:BC )?(?:Principles of Mathematics 12(?: or Pre-calculus 12)?|Pre-calculus 12)$/i,
  },
];

// "Not open to students with credit for Chemistry 12" (CHEM 100, 110 and 111, and PHYS 100 with
// PHYS 12), "Not open to students who have credit for Biology 12 (including AP, IB)" (BIOL 111):
// courses for students without a high school course.
const NOT_OPEN = /Not open to students (?:with|who have) credit for ((?:[A-Z]{3,4}|[A-Z][a-z]+) 1[12])\b/g;

// The high school courses that rule out a course, by key, from its description.
export function highSchoolExclusions(text: string): string[] {
  const keys = [...text.matchAll(NOT_OPEN)].flatMap(([, name]) =>
    HIGH_SCHOOL_COURSES.filter((course) => course.texts.test(name)).map((course) => course.key),
  );
  return [...new Set(keys)];
}

const YEARS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
const YEAR = "(first|second|third|fourth|1st|2nd|3rd|4th)";

// "Third-year standing", "3rd-year class standing or higher", "Third- or fourth-year class
// standing", "Open to all students with second-year, or higher, standing", "Fourth-year
// standing in Mining Engineering", "3rd-year class standing or higher in Science is required".
// Groups: the year, then where (if it says).
const STANDING = new RegExp(
  `^(?:A minimum of |at least |Open to all students with )?${YEAR}-?(?: or ${YEAR})?[- ]year` +
    "(?:,? or higher,?)?(?: class)? standing(?: or (?:higher|greater|above))?" +
    "(?: in (.+?))?(?: is required)?$",
  "i",
);
// "Class standing 2", "Completion of third year" (that is, fourth-year standing).
const CLASS_STANDING = /^Class standing (\d)$/i;
const COMPLETED = new RegExp(`^Completion of ${YEAR} year$`, "i");
// "Fourth-year standing or permission of the instructor", "Third-year standing and
// instructor's permission": the standing, then something else to check.
const WITH_MORE = /^(.+? standing) (or|and) ((?:the )?(?:instructor's )?permission\b.*|at least .*)$/i;

// The checklist questions a "check yourself" text asks, so a course panel can offer them right
// there: whether it's about year standing, and which high school courses it names. A high
// school course with a grade ("85% or higher in Physics 12") isn't asked: ticking it wouldn't
// answer that. One that rules the course out ("Not open to students with credit for CHEM 12")
// is: ticking it turns the course "no credit".
export function factQuestions(text: string): { standing: boolean; highSchool: string[] } {
  const parts = text.split(/,? or |,? and |; /).map((part) => part.trim());
  const named = /%|score/.test(text)
    ? []
    : HIGH_SCHOOL_COURSES.filter((course) => parts.some((part) => course.texts.test(part))).map((c) => c.key);
  const highSchool = [...new Set([...highSchoolExclusions(text), ...named])];
  const standing =
    factStatus(text, NO_FACTS) !== null && highSchool.length === 0
      ? true
      : parts.some((part) => standingStatus(part, NO_FACTS) !== null);
  return { standing, highSchool };
}

// What a fact-based requirement looks like with these facts, or null if it isn't one (then
// it's something to check, as before).
export function factStatus(text: string, facts: Facts): Status | null {
  const highSchool = HIGH_SCHOOL_COURSES.find((course) => course.texts.test(text));
  if (highSchool) return facts.highSchool.has(highSchool.key) ? "met" : "unknown";

  const more = WITH_MORE.exec(text);
  if (more) {
    const standing = standingStatus(more[1], facts);
    if (standing === null) return null;
    // The rest (permission, an average) is always something to check.
    if (more[2].toLowerCase() === "or") return standing === "met" ? "met" : "unknown";
    return standing === "unmet" ? "unmet" : "unknown";
  }
  return standingStatus(text, facts);
}

function standingStatus(text: string, facts: Facts): Status | null {
  let year: number;
  let place: string | null = null;
  const standing = STANDING.exec(text);
  const classStanding = CLASS_STANDING.exec(text);
  const completed = COMPLETED.exec(text);
  if (standing) {
    year = YEARS[standing[1].toLowerCase()];
    place = standing[3] ?? null;
  } else if (classStanding) {
    year = Number(classStanding[1]);
  } else if (completed) {
    year = YEARS[completed[1].toLowerCase()] + 1;
  } else {
    return null;
  }
  if (facts.standing === null) return "unknown";
  if (facts.standing < year) return "unmet";
  return place === null || inPlace(place, facts.program) ? "met" : "unknown";
}

// Whether the picked program is in a place a standing names: "the Faculty of Science", "BASc
// or BSc", "Mining Engineering", "any faculty". A place we can't match (an option, "a Life
// Science specialization", another faculty) stays something to check, and so does any place
// when no program is picked.
const SCIENCE = /^(?:the Faculty of )?Science$|^B\.?Sc\.?$/i;
const ENGINEERING = /^(?:Engineering|Applied Science|B\.?A\.?Sc\.?(?: program)?)$/i;
const PROGRAMS: Record<string, string> = {
  "Mining Engineering": "mine",
  "Mechanical Engineering": "mech",
  ENVE: "enve",
  ENVL: "enve",
  "ENVL program": "enve",
  IGEN: "igen",
  "Combined Honours Biophysics": "phys-biop-honours",
};

export function inPlace(place: string, program: Program | null): boolean {
  if (/^any (?:faculty|degree program)$/i.test(place)) return true;
  if (program === null) return false;
  // "Science, Land and Food Systems, or Forestry and Environmental Stewardship": any of them.
  const alternatives = place.replace(/ or related programs$/, "").split(/,? or |, /);
  return alternatives.some((alternative) => {
    const name = alternative.trim();
    if (SCIENCE.test(name)) return program.degree === "Bachelor of Science";
    if (ENGINEERING.test(name)) return program.degree === "Bachelor of Applied Science";
    return PROGRAMS[name] === program.id;
  });
}
