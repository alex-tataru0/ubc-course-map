import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { undergradOnly } from "./graph";
import { isCoop, splitCourses } from "./sections";
import type { Course, CourseFile } from "./types";

function course(code: string, title: string): Course {
  return { code, title, credits: "3", description: "", prereq: null, coreq: null, equivalency: null };
}

describe("isCoop", () => {
  it("spots co-op work terms by title", () => {
    expect(isCoop(course("CPSC 298", "Co-operative Work Placement I"))).toBe(true);
    expect(isCoop(course("CPSC 110", "Computation, Programs, and Programming"))).toBe(false);
  });
});

describe("splitCourses on the real CPSC data", () => {
  const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
  const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
  const { main, coop, other } = splitCourses(undergradOnly(data.courses));
  const codes = (list: Course[]) => list.map((c) => c.code);

  it("puts the five co-op work terms in order", () => {
    expect(codes(coop)).toEqual(["CPSC 298", "CPSC 299", "CPSC 398", "CPSC 399", "CPSC 499"]);
  });

  it("puts the hand-picked courses in other", () => {
    expect(codes(other)).toEqual(["CPSC 259", "CPSC 448", "CPSC 490"]);
  });

  it("keeps the rest for the graph", () => {
    expect(main).toHaveLength(60 - 5 - 3);
    expect(codes(main)).toContain("CPSC 110");
  });
});
