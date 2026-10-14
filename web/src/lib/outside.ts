import { prereqCourses } from "./graph";
import type { Course } from "./types";

// Courses the prerequisites mention that aren't in `courses`, sorted by code, so people can
// tick them as done even though they aren't on the map. Mostly other subjects (MATH 221 for
// CPSC 340), plus CPSC 261, which is no longer offered but still counts for CPSC 404 and 418.
// Okanagan codes (e.g. MATH_O 220) are left out, since the site is for UBC Vancouver.
export function outsideCourses(courses: Course[]): string[] {
  const own = new Set(courses.map((c) => c.code));
  const found = new Set<string>();
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

// The subjects CPSC prerequisites ask for most get their own group, in this order.
// The long tail (one or two courses each) shares a group.
const OWN_GROUPS = ["MATH", "STAT", "CPEN"];

export function groupBySubject(codes: string[]): SubjectGroup[] {
  const subject = (code: string) => code.split(" ")[0];
  const groups = OWN_GROUPS.map((title) => ({
    title,
    codes: codes.filter((code) => subject(code) === title),
  }));
  groups.push({
    title: "Everything else",
    codes: codes.filter((code) => !OWN_GROUPS.includes(subject(code))),
  });
  return groups.filter((group) => group.codes.length > 0);
}
