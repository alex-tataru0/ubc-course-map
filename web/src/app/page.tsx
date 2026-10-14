import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import FacultyView from "@/components/FacultyView";
import { gradesFor } from "@/lib/grades";
import { undergradOnly } from "@/lib/graph";
import { subjectMap } from "@/lib/subjectMap";
import { SCIENCE } from "@/lib/subjects";
import type { CourseFile, GradesFile, ProgramFile } from "@/lib/types";

export const metadata: Metadata = {
  title: "Faculty of Science · UBC Course Map",
  description: "Plan UBC Computer Science, Mathematics and Statistics courses with the prerequisite graph.",
};

// This is a server component. With the static export it runs once, during `npm run build`,
// so the finished site is plain HTML and JSON and never calls an API.
// process.cwd() is web/ during the build, and the pipeline's output sits next to it.
function loadJson(...parts: string[]) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "..", "data", ...parts), "utf8"));
}

function loadCourses(subject: string): CourseFile {
  return loadJson("courses", `${subject.toLowerCase()}.json`);
}

function loadGrades(subject: string): GradesFile {
  return loadJson("grades", `${subject.toLowerCase()}.json`);
}

function loadPrograms(subject: string): ProgramFile {
  return loadJson("programs", `${subject.toLowerCase()}.json`);
}

// The Faculty of Science page: one map per subject, picked from a menu.
export default function Home() {
  const files = SCIENCE.subjects.map((s) => loadCourses(s.code));
  // Every undergraduate course in the faculty, for the side panel, statuses and paths,
  // which cross subjects (CPSC 340 needs MATH 221).
  const details = files.flatMap((file) => undergradOnly(file.courses));
  const codes = details.map((c) => c.code);
  const gradeFiles = SCIENCE.subjects.map((s) => loadGrades(s.code));
  const programs = loadPrograms("CPSC");

  return (
    <FacultyView
      faculty={SCIENCE}
      maps={files.map(subjectMap)}
      details={details}
      grades={Object.assign({}, ...gradeFiles.map((file) => gradesFor(file, codes)))}
      gradeSessions={gradeFiles[0].sessions}
      programs={programs.programs}
      programUrl={programs.source}
      programSubject="CPSC"
    />
  );
}
