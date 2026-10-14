import type { CourseGrades, GradeTerm, GradesFile } from "./types";

// The grade ranges in data/grades/*.json, lowest first (BUCKETS in pipeline/grades.py),
// with a short label for the chart's axis and a phrase for its tooltips.
export const RANGES = [
  { tick: "<50", phrase: "below 50%" },
  { tick: "50", phrase: "50–54%" },
  { tick: "55", phrase: "55–59%" },
  { tick: "60", phrase: "60–63%" },
  { tick: "64", phrase: "64–67%" },
  { tick: "68", phrase: "68–71%" },
  { tick: "72", phrase: "72–75%" },
  { tick: "76", phrase: "76–79%" },
  { tick: "80", phrase: "80–84%" },
  { tick: "85", phrase: "85–89%" },
  { tick: "90+", phrase: "90–100%" },
];

// Only the courses the page shows, so it doesn't carry grades for the rest
// (graduate courses, for example).
export function gradesFor(file: GradesFile, codes: string[]): Record<string, CourseGrades> {
  const picked: Record<string, CourseGrades> = {};
  for (const code of codes) {
    if (code in file.courses) picked[code] = file.courses[code];
  }
  return picked;
}

// The share of students in each grade range, as a percentage of everyone with a grade.
export function shares(grades: number[], reported: number): number[] {
  return grades.map((count) => (100 * count) / reported);
}

// Students counted in `reported` but in no grade range, because UBC PAIR didn't give
// that range's count. The chart can't show them.
export function notShown({ grades, reported }: { grades: number[]; reported: number }): number {
  return reported - grades.reduce((sum, count) => sum + count, 0);
}

// How many terms the course ran in. A topics course like CPSC 436 has several rows per term.
export function termsOffered(course: CourseGrades): number {
  return new Set(course.terms.map((term) => term.session)).size;
}

// Everyone who taught the course, most recent first, each name once.
// (The terms are newest first, and a Set keeps the order names were first added in.)
export function recentInstructors(terms: GradeTerm[]): string[] {
  return [...new Set(terms.flatMap((term) => term.instructors))];
}

// "2021S–2025W": the first and last term in the data.
export function sessionRange(sessions: string[]): string {
  return sessions.length === 0 ? "" : `${sessions[0]}–${sessions[sessions.length - 1]}`;
}

// The chart's height in percent and its gridlines, from its tallest bar: rounded up to the
// next 5%, with a line every 10% (every 20% for tall charts, so the lines don't crowd).
export function chartScale(tallest: number): { top: number; lines: number[] } {
  const top = Math.max(5, Math.ceil(tallest / 5) * 5);
  const step = top > 40 ? 20 : 10;
  const lines = [];
  for (let line = step; line <= top; line += step) lines.push(line);
  return { top, lines };
}

// A percentage for a label: whole numbers, but "<1%" rather than "0%" for a few students.
export function percentLabel(share: number): string {
  return share > 0 && share < 0.5 ? "<1%" : `${Math.round(share)}%`;
}
