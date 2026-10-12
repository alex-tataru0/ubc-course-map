// Types for data/courses/<subject>.json, written by pipeline/build_prereqs.py.

// One node of a requirement tree.
export type ReqNode =
  | string // a course code, e.g. "CPSC 210"
  | { one_of: ReqNode[] }
  | { all_of: ReqNode[] }
  | { course: string; min_grade: number } // e.g. 68% or higher in MATH 226
  | { other: string }; // anything that isn't a course, e.g. "Third-year standing"

export interface Requisite {
  text: string;
  tree: ReqNode;
  source: "rules" | "llm";
  problems: string[];
}

export interface Course {
  code: string;
  title: string;
  credits: string; // a string because some are ranges, e.g. "3-6"
  description: string;
  prereq: Requisite | null;
  coreq: Requisite | null;
  equivalency: string | null;
}

export interface CourseFile {
  subject: string;
  source: string;
  courses: Course[];
}
