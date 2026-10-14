import { prereqCourses } from "./graph";
import { subjectOf } from "./subjects";
import type { Course } from "./types";

// Courses the prerequisites mention that aren't in `courses` (one subject's map), sorted by
// code, so people can tick them as done without leaving the map. Mostly other subjects
// (MATH 221 for CPSC 340), plus CPSC 261, which is no longer offered but still counts for
// CPSC 404 and 418.
// Okanagan codes (e.g. MATH_O 220) are left out, since the site is for UBC Vancouver.
// `also` adds more codes, e.g. the courses the programs name (SCIE 113, AI 240, …).
export function outsideCourses(courses: Course[], also: string[] = []): string[] {
  const own = new Set(courses.map((c) => c.code));
  const found = new Set(also.filter((code) => !own.has(code)));
  for (const course of courses) {
    for (const requisite of [course.prereq, course.coreq]) {
      if (!requisite) continue;
      for (const code of prereqCourses(requisite.tree).keys()) {
        if (!own.has(code) && !code.includes("_O ")) found.add(code);
      }
    }
  }
  return [...found].sort();
}

export interface SubjectGroup {
  title: string; // e.g. "MATH", or "Everything else"
  codes: string[];
}

// A subject with at least this many courses in the list gets its own group.
const OWN_GROUP_SIZE = 3;

// The subjects with the most courses get their own group, biggest first (for CPSC: MATH,
// STAT, CPEN). The long tail (one or two courses each) shares a group at the end.
export function groupBySubject(codes: string[]): SubjectGroup[] {
  const bySubject = new Map<string, string[]>();
  for (const code of codes) {
    bySubject.set(subjectOf(code), [...(bySubject.get(subjectOf(code)) ?? []), code]);
  }
  const own = [...bySubject]
    .filter(([, list]) => list.length >= OWN_GROUP_SIZE)
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .map(([title, list]) => ({ title, codes: list }));
  const ownTitles = new Set(own.map((group) => group.title));
  const rest = codes.filter((code) => !ownTitles.has(subjectOf(code)));
  return rest.length > 0 ? [...own, { title: "Everything else", codes: rest }] : own;
}
