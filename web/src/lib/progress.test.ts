import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { undergradOnly } from "./graph";
import {
  countStatuses,
  courseProgress,
  exclusionsOf,
  requirementStatus,
  restrictionOf,
  toCheck,
} from "./progress";
import type { CourseProgress } from "./progress";
import type { Course, CourseFile, ReqNode } from "./types";

const done = (...codes: string[]) => new Set(codes);

const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
const find = (code: string) => data.courses.find((c) => c.code === code)!;
const read = (subject: string): CourseFile =>
  JSON.parse(readFileSync(new URL(`../../../data/courses/${subject}.json`, import.meta.url), "utf8"));
const science = ["biol", "chem", "phys", "scie"].flatMap((subject) => read(subject).courses);
const findAny = (code: string) => science.find((c) => c.code === code)!;

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
  const prereq = (code: string) => find(code).prereq!.tree;

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

describe("toCheck", () => {
  const standing: ReqNode = { other: "Third-year standing" };

  it("lists a requirement that isn't a course", () => {
    expect(toCheck(standing, done())).toEqual(["Third-year standing"]);
  });

  it("leaves out the parts that are already met", () => {
    expect(toCheck({ all_of: [standing, "CPSC 221"] }, done("CPSC 221"))).toEqual([
      "Third-year standing",
    ]);
  });

  it("joins the choices that could still work in a one_of", () => {
    const tree: ReqNode = {
      one_of: [{ other: "Principles of Mathematics 12" }, "MATH 100", { other: "Pre-calculus 12" }],
    };
    expect(toCheck(tree, done())).toEqual(["Principles of Mathematics 12 or Pre-calculus 12"]);
  });

  it("names the grade for a minimum-grade course you've taken", () => {
    const tree: ReqNode = { course: "MATH 226", min_grade: 68 };
    expect(toCheck(tree, done("MATH 226"))).toEqual(["68% or higher in MATH 226"]);
  });

  it("lists nothing when the answer is already clear", () => {
    expect(toCheck({ all_of: [standing, "CPSC 221"] }, done())).toEqual([]);
    expect(toCheck({ one_of: [standing, "CPSC 221"] }, done("CPSC 221"))).toEqual([]);
  });
});

describe("restrictionOf and exclusionsOf", () => {
  it("finds the sentence saying who can take a course", () => {
    expect(restrictionOf(find("CPSC 298").description)).toBe(
      "Restricted to students admitted to the Co-operative Education Program in Computer Science",
    );
    expect(restrictionOf(find("CPSC 349").description)).toBe("Available to Honours students");
    expect(restrictionOf(find("CPSC 210").description)).toBeNull();
  });

  it("reads other ways of saying it", () => {
    expect(restrictionOf(find("CPSC 490").description)).toBe(
      "Course structure, enrolment and delivery methods will comply with the Handbook for Student Directed Seminars",
    );
    expect(restrictionOf(findAny("BIOL 448").description)).toBe("Permission of the supervisor required");
    expect(restrictionOf(findAny("PHYS 349").description)).toBe(
      "This course requires approval of the course instructor and program advisor in the Department of Physics and Astronomy",
    );
    expect(restrictionOf(findAny("CHEM 203").description)).toBe(
      "Only open to students in Chemistry or Biochemistry specializations",
    );
    // A full stop inside "B.Sc." doesn't end the sentence.
    expect(restrictionOf(findAny("SCIE 113").description)).toBe(
      "Enrolment limited to students in the B.Sc. program in Science",
    );
  });

  it("doesn't take other mentions of permission as a restriction", () => {
    // "May be taken more than once for credit with permission of the department."
    expect(restrictionOf(find("CPSC 436").description)).toBeNull();
    // "… or permission of the instructor" in a prerequisite is one way to meet it.
    expect(restrictionOf("A course. Prerequisite: CPSC 110 or permission of the instructor.")).toBeNull();
  });

  it("finds the courses that rule a course out", () => {
    expect(exclusionsOf(find("CPSC 100"))).toEqual(["CPSC 107", "CPSC 110", "APSC 160"]);
    expect(exclusionsOf(find("CPSC 203"))).toEqual(["CPSC 210", "CPEN 221"]);
    expect(exclusionsOf(find("CPSC 210"))).toEqual([]);
  });

  it("reads \"credit will be granted for only one of\", leaving out the course itself", () => {
    expect(exclusionsOf(findAny("BIOL 121"))).toEqual(["BIOL 344"]);
    // "CHEM 203 or CHEM 223, CHEM 225 or CHEM 233, 235": the bare 235 is CHEM 235.
    expect(exclusionsOf(findAny("CHEM 203"))).toEqual(["CHEM 223", "CHEM 225", "CHEM 233", "CHEM 235"]);
    expect(exclusionsOf(findAny("PHYS 450"))).toEqual(["PHYS 304", "CHEM 312"]);
  });
});

describe("courseProgress", () => {
  // A made-up course with no description, for testing coreqs on their own.
  function course(code: string, prereq: ReqNode | null, coreq: ReqNode | null = null): Course {
    const requisite = (tree: ReqNode | null) =>
      tree === null ? null : { text: "", tree, source: "rules" as const, problems: [] };
    return {
      code,
      title: code,
      credits: "3",
      description: "",
      prereq: requisite(prereq),
      coreq: requisite(coreq),
      equivalency: null,
      recommended: null,
    };
  }

  it("lets you take a coreq at the same time, but not one that's still locked", () => {
    const courses = [
      course("A 100", null),
      course("B 100", "Z 100"),
      course("C 200", null, "A 100"),
      course("D 200", null, "B 100"),
    ];
    const before = courseProgress(courses, done());
    expect(before.get("C 200")!.status).toBe("can-take");
    expect(before.get("D 200")!.status).toBe("locked");
    expect(courseProgress(courses, done("Z 100")).get("D 200")!.status).toBe("can-take");
  });

  const courses = undergradOnly(data.courses);
  const statusOf = (progress: Map<string, CourseProgress>, ...codes: string[]) =>
    codes.map((code) => progress.get(code)!.status);

  it("shows a new student what they can take", () => {
    const progress = courseProgress(courses, done());
    expect(statusOf(progress, "CPSC 100", "CPSC 103", "CPSC 110")).toEqual([
      "can-take",
      "can-take",
      "can-take",
    ]);
    expect(statusOf(progress, "CPSC 210", "CPSC 221")).toEqual(["locked", "locked"]);
    // CPSC 121's coreq (CPSC 107 or 110) can be taken alongside it,
    // so the only thing left to check is the high-school math.
    expect(progress.get("CPSC 121")).toEqual({
      status: "check",
      toCheck: ["Principles of Mathematics 12 or Pre-calculus 12"],
      excludedBy: [],
      blockedBy: [],
    });
  });

  it("marks finished courses done and rules out the ones they replace", () => {
    const progress = courseProgress(courses, done("CPSC 110"));
    expect(statusOf(progress, "CPSC 110", "CPSC 210")).toEqual(["done", "can-take"]);
    expect(progress.get("CPSC 100")).toEqual({
      status: "no-credit",
      toCheck: [],
      excludedBy: ["CPSC 110"],
      blockedBy: [],
    });
    expect(progress.get("CPSC 103")!.status).toBe("no-credit");
  });

  it("doesn't count on a course that's ruled out", () => {
    // CPSC 107 needs CPSC 103, which isn't for students with CPSC 110.
    expect(courseProgress(courses, done("CPSC 110")).get("CPSC 107")).toEqual({
      status: "not-needed",
      toCheck: [],
      excludedBy: ["CPSC 110"],
      blockedBy: ["CPSC 103"],
    });
    // With CPSC 103 done instead, CPSC 107 is the next step.
    expect(courseProgress(courses, done("CPSC 103")).get("CPSC 107")!.status).toBe("can-take");
  });

  it("is still \"not yet\" when another way in is open", () => {
    const made = (code: string, prereq: ReqNode, description = ""): Course => ({
      ...course(code, prereq),
      description,
    });
    const list = [
      made("AAA 100", "ZZZ 100", "Not for students with credit for YYY 100."),
      made("BBB 200", { one_of: ["AAA 100", "XXX 100"] }),
      made("CCC 200", { all_of: ["AAA 100", "XXX 100"] }),
    ];
    const progress = courseProgress(list, done("YYY 100"));
    expect(progress.get("AAA 100")!.status).toBe("no-credit");
    expect(progress.get("BBB 200")!.status).toBe("locked"); // XXX 100 still works
    expect(progress.get("CCC 200")!.status).toBe("not-needed");
  });

  it("asks you to check courses restricted to some students", () => {
    const progress = courseProgress(courses, done());
    expect(statusOf(progress, "CPSC 298", "CPSC 349", "CPSC 448", "CPSC 490")).toEqual([
      "check",
      "check",
      "check",
      "check",
    ]);
    expect(progress.get("CPSC 349")!.toCheck).toEqual(["Available to Honours students"]);
    // The second co-op term still needs the first.
    expect(progress.get("CPSC 299")!.status).toBe("locked");
  });

  it("lists everything to check for an upper-year course", () => {
    const progress = courseProgress(courses, done("CPSC 221", "CPSC 310", "CPSC 344"));
    expect(progress.get("CPSC 491")!.toCheck).toEqual(["Third-year standing"]);

    const systems = courseProgress(courses, done("CPSC 310", "CPSC 313", "CPSC 317"));
    expect(systems.get("CPSC 415")!.toCheck).toEqual([
      "76% or higher in CPSC 310",
      "76% or higher in CPSC 313",
      "76% or higher in CPSC 317",
    ]);
  });
});

describe("countStatuses", () => {
  it("counts the courses with each status", () => {
    const courses = undergradOnly(data.courses);
    const counts = countStatuses(courseProgress(courses, done("CPSC 110", "CPSC 121")));
    expect(counts.done).toBe(2);
    expect(counts["no-credit"]).toBe(2); // CPSC 100 and 103
    expect(counts["not-needed"]).toBe(1); // CPSC 107
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(courses.length);
  });
});
