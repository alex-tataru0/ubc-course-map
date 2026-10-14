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

// Types for data/grades/<subject>.json, written by pipeline/build_grades.py.

// One course in one term. Topics courses (CPSC 436C, 436N, …) get a row each.
export interface GradeTerm {
  session: string; // e.g. "2024W" (Winter Session, Sep to Apr) or "2024S" (Summer)
  topic?: string; // e.g. "C" for CPSC 436C
  title?: string; // UBCGrades' title for that topic, e.g. "CLOUD COMPUTING"
  reported: number; // students with a grade
  average: number;
  grades: number[]; // students in each grade range, in the order of GradesFile.buckets
  instructors: string[];
}

// A course's grades over all the terms in the file, plus each term.
export interface CourseGrades {
  reported: number;
  average: number;
  grades: number[];
  terms: GradeTerm[]; // newest first
}

export interface GradesFile {
  subject: string;
  campus: string;
  source: string;
  credit: string;
  sessions: string[]; // every term in the file, oldest first
  buckets: string[]; // the grade ranges, lowest first: "<50%", "50-54%", …, "90-100%"
  courses: Record<string, CourseGrades>;
}
