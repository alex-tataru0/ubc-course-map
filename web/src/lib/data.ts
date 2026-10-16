import { readFileSync } from "node:fs";
import path from "node:path";
import type { CourseFile, GradesFile, ProgramFile } from "./types";

// Reads the pipeline's output. Only the pages use these, while `npm run build` runs, so the
// finished site is plain HTML and JSON and never calls an API.
// process.cwd() is web/ during the build, and the pipeline's output sits next to it.
function loadJson(...parts: string[]) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "..", "data", ...parts), "utf8"));
}

export function loadCourses(subject: string): CourseFile {
  return loadJson("courses", `${subject.toLowerCase()}.json`);
}

export function loadGrades(subject: string): GradesFile {
  return loadJson("grades", `${subject.toLowerCase()}.json`);
}

export function loadPrograms(subject: string): ProgramFile {
  return loadJson("programs", `${subject.toLowerCase()}.json`);
}
