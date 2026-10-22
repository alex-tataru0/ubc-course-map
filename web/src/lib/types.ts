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
  recommended: string | null; // advice, not a requirement, e.g. "One of MATH 152, MATH 221 is recommended"
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

// Types for data/programs/<subject>.json, written by pipeline/build_programs.py.

// One node of a program requirement tree (see pipeline/program_rules.py).
export type ProgramNode =
  | string // a course code, e.g. "CPSC 121"
  | { one_of: ProgramNode[] }
  | { all_of: ProgramNode[] }
  | { pick: number; of: string[]; note?: string } // that many different courses from the list
  | { credits_of: { subjects: string[]; min_level: number; max_level?: number } } // e.g. CPSC or AI 300 and up; EOSC 300-level is 300 to 399
  | { credits_from: string[] } // the row's credits from any of these courses
  | { electives: true }
  | { other: string }; // e.g. "Additional Communication Requirement"

// One row of a program's requirement table.
export interface ProgramRequirement {
  text: string; // the calendar's wording, e.g. "CPSC 310, 313, 320"
  credits: number;
  tree: ProgramNode;
  source: "rules" | "llm";
  problems: string[];
  notes: string[]; // the row's footnotes
  credits_text?: string; // when the calendar gives a choice, e.g. "3 or 5" (credits is the smaller)
}

export interface ProgramYear {
  title: string; // "First Year", "Second Year", "Third and Fourth Years"
  credits: number;
  credits_text?: string; // e.g. "40 or 42"
  requirements: ProgramRequirement[];
}

export interface Program {
  id: string; // e.g. "cpsc-major"
  name: string; // e.g. "Computer Science Major"
  heading?: string; // the calendar's heading, e.g. "Major (0376): Computer Science (CPSC)"
  subjects?: string[]; // a combined program's subjects on the site, e.g. ["CPSC", "MATH"]
  sources?: string[]; // the calendar pages it comes from, when there are several (engineering)
  notes?: string[]; // about the whole program, e.g. which entry years its tables are for
  degree?: string; // added by the page, e.g. "Bachelor of Applied Science"
  total_credits: number;
  years: ProgramYear[];
}

export interface ProgramFile {
  source: string;
  programs: Program[];
}
