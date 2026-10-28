import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { factQuestions, factStatus, HIGH_SCHOOL_COURSES, highSchoolExclusions, inPlace, NO_FACTS } from "./facts";
import type { Facts } from "./facts";
import { planPath } from "./path";
import { courseProgress, notMetByFacts } from "./progress";
import type { Course, CourseFile, Program, ProgramFile, ReqNode } from "./types";

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const files: CourseFile[] = readdirSync(new URL("../../../data/courses/", import.meta.url)).map((f) =>
  read(`../../../data/courses/${f}`),
);
const courses: Course[] = files.flatMap((f) => f.courses);
const program = (file: string, id: string, degree: string): Program => ({
  ...(read(`../../../data/programs/${file}.json`) as ProgramFile).programs.find((p) => p.id === id)!,
  degree,
});
const csMajor = program("cpsc", "cpsc-major", "Bachelor of Science");
const mining = program("engineering", "mine", "Bachelor of Applied Science");
const facts = (more: Partial<Facts>): Facts => ({ ...NO_FACTS, ...more });
const ALL_HIGH_SCHOOL = new Set(HIGH_SCHOOL_COURSES.map((c) => c.key));

// Every non-course requirement in the undergraduate courses' prereqs and coreqs.
const texts = new Set<string>();
const walk = (node: ReqNode): void => {
  if (typeof node === "string" || "course" in node) return;
  if ("other" in node) texts.add(node.other);
  else ("one_of" in node ? node.one_of : node.all_of).forEach(walk);
};
for (const course of courses) {
  if (Number(course.code.split(" ")[1].slice(0, 3)) >= 500) continue;
  for (const requisite of [course.prereq, course.coreq]) if (requisite) walk(requisite.tree);
}

describe("factStatus", () => {
  it("reads high school courses, met once ticked", () => {
    expect(factStatus("PHYS 12", NO_FACTS)).toBe("unknown");
    expect(factStatus("PHYS 12", facts({ highSchool: new Set(["PHYS 12"]) }))).toBe("met");
    expect(factStatus("Biology 12", facts({ highSchool: new Set(["BIOL 12"]) }))).toBe("met");
    const preCalculus = facts({ highSchool: new Set(["PREC 12"]) });
    expect(factStatus("Principles of Mathematics 12 or Pre-calculus 12", preCalculus)).toBe("met");
    expect(factStatus("Principles of Mathematics 12", preCalculus)).toBe("met");
    // A grade in one is still something to check.
    expect(factStatus("85% or higher in Physics 12", facts({ highSchool: ALL_HIGH_SCHOOL }))).toBeNull();
  });

  it("reads year standing in its many wordings", () => {
    const second = facts({ standing: 2 });
    const third = facts({ standing: 3 });
    for (const text of [
      "Third-year standing", "3rd-year class standing or higher", "Third year standing", "Class standing 3",
      "A minimum of 3rd-year class standing or higher", "Third-year standing or greater",
      "Open to all students with third-year, or higher, standing in the Faculty of Science",
    ]) {
      expect(factStatus(text, second), text).toBe("unmet");
    }
    expect(factStatus("Third-year standing", third)).toBe("met");
    expect(factStatus("Fourth-year standing", third)).toBe("unmet");
    expect(factStatus("Completion of third year", third)).toBe("unmet"); // that's fourth-year standing
    expect(factStatus("Third- or fourth-year class standing and permission of the Department Head", third)).toBe("unknown");
    expect(factStatus("Third-year standing", NO_FACTS)).toBe("unknown");
  });

  it("reads 'Restricted to … standing' sentences", () => {
    const first = facts({ standing: 1 });
    const second = facts({ standing: 2 });
    for (const text of [
      "Restricted to students with second-year standing or above",
      "Restricted to students with second-year standing or higher",
      "Restricted to students with at least second-year standing",
      "Restricted to students with second year standing or above",
      "Restricted to second- or higher-year standing",
    ]) {
      expect(factStatus(text, first), text).toBe("unmet");
      expect(factStatus(text, second), text).toBe("met");
      expect(factStatus(text, NO_FACTS), text).toBe("unknown");
    }
    expect(factStatus("Restricted to students in fourth-year standing or higher", facts({ standing: 3 }))).toBe("unmet");
    expect(factStatus("Restricted to students with fourth year class standing", facts({ standing: 4 }))).toBe("met");
    const inScience = "Restricted to students with third-year standing or higher in B.A.Sc. or B.Sc";
    expect(factStatus(inScience, facts({ standing: 3, program: csMajor }))).toBe("met");
    expect(factStatus(inScience, facts({ standing: 3 }))).toBe("unknown"); // no program picked
    // A restriction that asks for more than a year isn't read.
    expect(factStatus("Restricted to Majors in PSYC or COGS or NSCI with second-year standing or higher", second)).toBeNull();
    expect(
      factStatus("Restricted to students with second-year standing or higher and a cumulative average at or above 76%", second),
    ).toBeNull();
  });

  it("checks the place against the picked program", () => {
    const text = "Third-year standing in the Faculty of Science";
    expect(factStatus(text, facts({ standing: 3 }))).toBe("unknown"); // no program picked
    expect(factStatus(text, facts({ standing: 3, program: csMajor }))).toBe("met");
    expect(factStatus(text, facts({ standing: 3, program: mining }))).toBe("unknown");
    expect(factStatus(text, facts({ standing: 2, program: csMajor }))).toBe("unmet");
    expect(factStatus("Third-year standing in Mining Engineering", facts({ standing: 4, program: mining }))).toBe("met");
    expect(inPlace("BASc or BSc", csMajor)).toBe(true);
    expect(inPlace("Science, Land and Food Systems, or Forestry and Environmental Stewardship", csMajor)).toBe(true);
    expect(inPlace("the Aerospace Option", mining)).toBe(false);
    expect(inPlace("any faculty", null)).toBe(true);
  });

  it("lets permission decide when the standing isn't enough", () => {
    const text = "Fourth-year standing or permission of the instructor";
    expect(factStatus(text, facts({ standing: 4 }))).toBe("met");
    expect(factStatus(text, facts({ standing: 3 }))).toBe("unknown");
    const both = "Third-year standing and permission of the instructor";
    expect(factStatus(both, facts({ standing: 2 }))).toBe("unmet");
    expect(factStatus(both, facts({ standing: 3 }))).toBe("unknown");
  });

  it("reads 98 of the data's non-course wordings, and changes nothing until the checklist is used", () => {
    const read = [...texts].filter((text) => factStatus(text, NO_FACTS) !== null);
    expect(read).toHaveLength(98);
    expect(read.every((text) => factStatus(text, NO_FACTS) === "unknown")).toBe(true);
  });
});

describe("factQuestions", () => {
  it("finds what the checklist could answer in a 'check yourself' item", () => {
    expect(factQuestions("BIOL 11 or BIOL 12")).toEqual({ standing: false, highSchool: ["BIOL 11", "BIOL 12"] });
    expect(factQuestions("Principles of Mathematics 12 or Pre-calculus 12")).toEqual({ standing: false, highSchool: ["PREC 12"] });
    expect(factQuestions("Fourth-year standing or permission of the instructor")).toEqual({ standing: true, highSchool: [] });
    expect(factQuestions("Third-year standing or 6 credits of MATH")).toEqual({ standing: true, highSchool: [] });
    // Ticking Physics 12 wouldn't answer a grade in it.
    expect(factQuestions("85% or higher in Physics 12")).toEqual({ standing: false, highSchool: [] });
    expect(factQuestions("advanced credit for MATH 100")).toEqual({ standing: false, highSchool: [] });
    // A high school course that rules the course out is asked, even next to a test score.
    expect(
      factQuestions("Not open to students with credit for CHEM 12. A satisfactory score on the UBC Chemistry Basic Skills Test"),
    ).toEqual({ standing: false, highSchool: ["CHEM 12"] });
  });
});

describe("highSchoolExclusions", () => {
  it("finds the high school courses that rule a course out", () => {
    const of = (code: string) => highSchoolExclusions(courses.find((c) => c.code === code)!.description);
    expect(of("CHEM 100")).toEqual(["CHEM 12"]); // "credit for Chemistry 12"
    expect(of("CHEM 111")).toEqual(["CHEM 12"]); // "credit for CHEM 12"
    expect(of("PHYS 100")).toEqual(["PHYS 12"]);
    expect(of("BIOL 111")).toEqual(["BIOL 12"]); // "who have credit for Biology 12 (including AP, IB)"
    expect(of("CHEM 121")).toEqual([]);
    const all = courses.filter((c) => highSchoolExclusions(c.description).length > 0).map((c) => c.code);
    expect(all.sort()).toEqual(["BIOL 111", "CHEM 100", "CHEM 110", "CHEM 111", "PHYS 100"]);
  });
});

describe("with facts", () => {
  const all = facts({ standing: 3, highSchool: ALL_HIGH_SCHOOL, program: csMajor });

  it("turns 'check first' into 'can take' or 'not yet'", () => {
    const status = (code: string, f: Facts = NO_FACTS) => courseProgress(courses, new Set(), f).get(code)!.status;
    expect(status("BIOL 350")).toBe("check"); // Third-year standing
    expect(status("BIOL 350", all)).toBe("can-take");
    expect(status("BIOL 350", facts({ standing: 1 }))).toBe("locked");
    expect(status("BIOL 112")).toBe("check"); // CHEM 12, and BIOL 11 or 12
    expect(status("BIOL 112", all)).toBe("can-take");
    expect(status("CPSC 121", all)).toBe("can-take"); // Pre-calculus 12, with CPSC 110 to take at the same time
  });

  it("turns courses for students without a high school course 'no credit' once it's ticked", () => {
    const progress = (code: string, f: Facts = NO_FACTS) => courseProgress(courses, new Set(), f).get(code)!;
    expect(progress("CHEM 111").status).toBe("check");
    expect(progress("CHEM 111", all)).toMatchObject({ status: "no-credit", excludedBy: ["Chemistry 12"] });
    expect(progress("PHYS 100", all)).toMatchObject({ status: "no-credit", excludedBy: ["Physics 12"] });
    expect(progress("BIOL 111", facts({ highSchool: new Set(["BIOL 12"]) })).status).toBe("no-credit");
    // Biology 11 alone doesn't rule BIOL 111 out.
    expect(progress("BIOL 111", facts({ highSchool: new Set(["BIOL 11"]) })).status).toBe("check");
    // A finished course still counts as done.
    expect(courseProgress(courses, new Set(["CHEM 111"]), all).get("CHEM 111")!.status).toBe("done");
  });

  it("says which answer makes a course 'not yet'", () => {
    const tree = courses.find((c) => c.code === "BIOL 350")!.prereq!.tree;
    expect(notMetByFacts(tree, new Set(), facts({ standing: 1 }))).toEqual(["Third-year standing"]);
    expect(notMetByFacts(tree, new Set(), all)).toEqual([]);
  });

  it("answers 'Restricted to students with … standing' from the year", () => {
    // PSYC 300 has no prerequisite: "Restricted to students with second-year standing or higher."
    const progress = (code: string, f: Facts = NO_FACTS) => courseProgress(courses, new Set(), f).get(code)!;
    expect(progress("PSYC 300")).toMatchObject({
      status: "check",
      toCheck: ["Restricted to students with second-year standing or higher"],
    });
    expect(progress("PSYC 300", facts({ standing: 1 })).status).toBe("locked");
    expect(progress("PSYC 300", facts({ standing: 2 })).status).toBe("can-take");
    // Other restrictions stay something to check.
    expect(progress("CPSC 298", all).status).toBe("check"); // the Co-op program
    const checks = (f: Facts) =>
      planPath("PSYC 300", courses, new Set(), { facts: f }).also.map((item) => ("text" in item ? item.text : ""));
    expect(checks(NO_FACTS)).toEqual(["Restricted to students with second-year standing or higher"]);
    expect(checks(facts({ standing: 2 }))).toEqual([]);
  });

  it("leaves high school courses out of a path once ticked", () => {
    const checks = (f: Facts) =>
      planPath("ASTR 101", courses, new Set(), { facts: f }).also.map((item) => ("text" in item ? item.text : ""));
    expect(checks(NO_FACTS).join(" | ")).toContain("Principles of Mathematics 12");
    expect(checks(all)).toEqual([]);
  });
});
