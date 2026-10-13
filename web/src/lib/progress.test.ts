import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requirementStatus } from "./progress";
import type { CourseFile, ReqNode } from "./types";

const done = (...codes: string[]) => new Set(codes);

describe("requirementStatus", () => {
  it("checks a single course", () => {
    expect(requirementStatus("CPSC 110", done("CPSC 110"))).toBe("met");
    expect(requirementStatus("CPSC 110", done())).toBe("unmet");
  });

  it("needs every part of an all_of", () => {
    const tree: ReqNode = { all_of: ["CPSC 121", "CPSC 210"] };
    expect(requirementStatus(tree, done("CPSC 121", "CPSC 210"))).toBe("met");
    expect(requirementStatus(tree, done("CPSC 121"))).toBe("unmet");
  });

  it("needs any one choice of a one_of", () => {
    const tree: ReqNode = { one_of: ["CPSC 107", "CPSC 110"] };
    expect(requirementStatus(tree, done("CPSC 107"))).toBe("met");
    expect(requirementStatus(tree, done("CPSC 110"))).toBe("met");
    expect(requirementStatus(tree, done("CPSC 103"))).toBe("unmet");
  });

  it("can't tell whether a non-course requirement is met", () => {
    expect(requirementStatus({ other: "Third-year standing" }, done())).toBe("unknown");
  });

  it("can't tell whether a minimum grade is met once the course is taken", () => {
    const tree: ReqNode = { course: "MATH 226", min_grade: 68 };
    expect(requirementStatus(tree, done())).toBe("unmet");
    expect(requirementStatus(tree, done("MATH 226"))).toBe("unknown");
  });

  it("combines unknowns: a met choice wins in one_of, an unmet part wins in all_of", () => {
    const standing: ReqNode = { other: "Third-year standing" };
    expect(requirementStatus({ one_of: [standing, "CPSC 221"] }, done("CPSC 221"))).toBe("met");
    expect(requirementStatus({ one_of: [standing, "CPSC 221"] }, done())).toBe("unknown");
    expect(requirementStatus({ all_of: [standing, "CPSC 221"] }, done("CPSC 221"))).toBe("unknown");
    expect(requirementStatus({ all_of: [standing, "CPSC 221"] }, done())).toBe("unmet");
  });
});

describe("requirementStatus on the real CPSC data", () => {
  const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
  const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
  const prereq = (code: string) => data.courses.find((c) => c.code === code)!.prereq!.tree;

  it("opens CPSC 210 after CPSC 110, but not CPSC 213", () => {
    const firstYear = done("CPSC 110", "CPSC 121");
    expect(requirementStatus(prereq("CPSC 210"), firstYear)).toBe("met");
    expect(requirementStatus(prereq("CPSC 213"), firstYear)).toBe("unmet");
  });

  it("can't check CPSC 121's high-school math prereq", () => {
    expect(requirementStatus(prereq("CPSC 121"), done())).toBe("unknown");
  });

  it("opens CPSC 221 with CPSC 121, even though MATH 226 has a grade rule", () => {
    expect(requirementStatus(prereq("CPSC 221"), done("CPSC 210", "CPSC 121"))).toBe("met");
    expect(requirementStatus(prereq("CPSC 221"), done("CPSC 210", "MATH 226"))).toBe("unknown");
  });

  it("can't tell about CPSC 415, which needs 76% in its prereqs", () => {
    expect(requirementStatus(prereq("CPSC 415"), done("CPSC 310", "CPSC 313", "CPSC 317"))).toBe(
      "unknown",
    );
  });

  it("keeps CPSC 340 locked until its MATH and STAT prereqs are done", () => {
    const cpsc = done("CPSC 110", "CPSC 121", "CPSC 210", "CPSC 221");
    expect(requirementStatus(prereq("CPSC 340"), cpsc)).toBe("unmet");
    const withMath = new Set([...cpsc, "MATH 221", "MATH 200", "STAT 241"]);
    expect(requirementStatus(prereq("CPSC 340"), withMath)).toBe("met");
  });
});
