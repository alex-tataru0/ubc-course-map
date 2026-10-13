import type { Course } from "./types";

// Courses that are off the usual path for a CPSC student, so they get their own section
// instead of a place in the graph: 259 is for Electrical Engineering students, and
// 448 and 490 need the department's permission. Picked by hand for now.
const OTHER_COURSES = new Set(["CPSC 259", "CPSC 448", "CPSC 490"]);

// Co-op work terms are found by title, so this also works for other subjects later.
export function isCoop(course: Course): boolean {
  return /co-operative work placement/i.test(course.title);
}

export interface SplitCourses {
  main: Course[]; // the prerequisite graph
  coop: Course[];
  other: Course[];
}

export function splitCourses(courses: Course[]): SplitCourses {
  const split: SplitCourses = { main: [], coop: [], other: [] };
  for (const course of courses) {
    if (isCoop(course)) split.coop.push(course);
    else if (OTHER_COURSES.has(course.code)) split.other.push(course);
    else split.main.push(course);
  }
  return split;
}
