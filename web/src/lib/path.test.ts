import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { undergradOnly } from "./graph";
import { planPath } from "./path";
import { ENGINEERING, SCIENCE } from "./subjects";
import type { CourseFile } from "./types";

const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
const courses = undergradOnly(data.courses);
const plan = (target: string, ...done: string[]) => planPath(target, courses, new Set(done));

const secondYear = ["CPSC 110", "CPSC 121", "CPSC 210", "CPSC 213", "CPSC 221"];

describe("planPath", () => {
  it("plans the CPSC courses by term, with a coreq in the same term", () => {
    // CPSC 121's coreq (CPSC 107 or 110) can be taken alongside it.
    expect(plan("CPSC 221")).toEqual({
      terms: [["CPSC 110", "CPSC 121"], ["CPSC 210"], ["CPSC 221"]],
      also: [{ kind: "check", text: "Principles of Mathematics 12 or Pre-calculus 12" }],
    });
  });

  it("lists courses from other subjects as groups to pick from", () => {
    expect(plan("CPSC 340", "CPSC 110", "CPSC 121")).toEqual({
      terms: [["CPSC 210"], ["CPSC 221"], ["CPSC 340"]],
      also: [
        { kind: "one-of", codes: ["MATH 152", "MATH 221", "MATH 223"] },
        { kind: "one-of", codes: ["MATH 200", "MATH 217", "MATH 226", "MATH 253", "MATH 254"] },
        {
          kind: "one-of",
          codes: ["STAT 241", "STAT 251", "ECON 325", "ECON 327", "MATH 302", "STAT 302", "MATH 318"],
        },
      ],
    });
  });

  it("skips what's done, including ticked courses from other subjects", () => {
    const path = plan("CPSC 340", ...secondYear, "MATH 221");
    expect(path.terms).toEqual([["CPSC 340"]]);
    expect(path.also).toHaveLength(2); // the MATH 152 / 221 / 223 group is done
  });

  it("picks a course over one that's not for students with credit for it", () => {
    // CPSC 302 takes CPSC 103 or 110, but CPSC 103 isn't for students who take CPSC 110.
    expect(plan("CPSC 302").terms).toEqual([["CPSC 110"], ["CPSC 302"]]);
  });

  it("uses a finished minimum-grade course instead of a new course, and says to check the grade", () => {
    expect(plan("CPSC 221", "CPSC 210", "MATH 226")).toEqual({
      terms: [["CPSC 221"]],
      also: [{ kind: "check", text: "68% or higher in MATH 226" }],
    });
  });

  it("lists standing and grade rules to check", () => {
    expect(plan("CPSC 491", ...secondYear)).toEqual({
      terms: [["CPSC 310", "CPSC 344"], ["CPSC 491"]],
      also: [{ kind: "check", text: "Third-year standing" }],
    });
    expect(plan("CPSC 415", ...secondYear).also).toEqual([
      { kind: "check", text: "76% or higher in CPSC 310" },
      { kind: "check", text: "76% or higher in CPSC 313" },
      { kind: "check", text: "76% or higher in CPSC 317" },
    ]);
  });

  it("keeps only the fuller of two matching restriction sentences", () => {
    expect(plan("CPSC 299")).toEqual({
      terms: [["CPSC 298"], ["CPSC 299"]],
      also: [
        {
          kind: "check",
          text: "Restricted to students admitted to the Co-operative Education Program in Computer Science",
        },
      ],
    });
  });

  it("lists a course we have no data for together with an equally good check", () => {
    // CPSC 445: "either BMEG 250 or six credits of BIOL beyond BIOL 111".
    expect(plan("CPSC 445", ...secondYear, "CPSC 320").also).toContainEqual({
      kind: "check",
      text: "BMEG 250 or six credits of BIOL beyond BIOL 111",
    });
  });

  it("gives an empty path for a finished course or one not on the map", () => {
    expect(plan("CPSC 221", ...secondYear)).toEqual({ terms: [], also: [] });
    expect(plan("MATH 200")).toEqual({ terms: [], also: [] });
  });
});

describe("planPath across CPSC, MATH and STAT", () => {
  const load = (subject: string): CourseFile =>
    JSON.parse(readFileSync(new URL(`../../../data/courses/${subject}.json`, import.meta.url), "utf8"));
  const all = undergradOnly(["cpsc", "math", "stat"].flatMap((subject) => load(subject).courses));
  const planAll = (target: string, ...done: string[]) => planPath(target, all, new Set(done));

  it("plans the MATH and STAT courses too, each after its own prereqs", () => {
    expect(planAll("CPSC 340")).toEqual({
      terms: [
        ["CPSC 110", "CPSC 121", "MATH 100"],
        ["CPSC 210", "MATH 101", "MATH 221"],
        ["CPSC 221", "MATH 200", "STAT 251"],
        ["CPSC 340"],
      ],
      also: [
        { kind: "check", text: "Principles of Mathematics 12 or Pre-calculus 12" },
        { kind: "check", text: "A score of 80% or higher in BC Pre-calculus 12" },
      ],
    });
  });

  it("takes a course over a choice that's only something to check", () => {
    // MATH 221 also accepts "advanced credit for MATH 100" or "SCIE 001 as a corequisite".
    expect(planAll("MATH 221").terms).toEqual([["MATH 100"], ["MATH 221"]]);
  });

  it("takes a course only some students can take as a last resort", () => {
    // STAT 200 accepts MATH 190, but only for forestry and nursing students.
    expect(planAll("STAT 200")).toEqual({
      terms: [["STAT 200"]],
      also: [
        {
          kind: "check",
          text:
            "any course on the MATH 100 credit exclusion list [ https://vancouver.calendar.ubc.ca/" +
            "faculties-colleges-and-schools/faculty-science/bachelor-science/credit-exclusion-lists ]" +
            " or SCIE 001",
        },
      ],
    });
  });

  it("prefers fewer minimum grades to check when the number of courses is the same", () => {
    // MATH 200 needs any of MATH 101, …; MATH 226 needs 80% in MATH 101 or 68% in MATH 121.
    const path = planAll("CPSC 340", "MATH 100");
    expect(path.terms.flat()).toContain("MATH 200");
    expect(path.terms.flat()).not.toContain("MATH 226");
    expect(path.also).toEqual([{ kind: "check", text: "Principles of Mathematics 12 or Pre-calculus 12" }]);
  });
});

describe("planPath across the Faculty of Science", () => {
  const load = (subject: string): CourseFile =>
    JSON.parse(readFileSync(new URL(`../../../data/courses/${subject}.json`, import.meta.url), "utf8"));
  const all = undergradOnly(SCIENCE.subjects.flatMap((s) => load(s.code.toLowerCase()).courses));
  const planAll = (target: string, ...done: string[]) => planPath(target, all, new Set(done));

  it("plans CPSC 340 the same way with every Science subject loaded", () => {
    expect(planAll("CPSC 340").terms).toEqual([
      ["CPSC 110", "CPSC 121", "MATH 100"],
      ["CPSC 210", "MATH 101", "MATH 221"],
      ["CPSC 221", "MATH 200", "STAT 251"],
      ["CPSC 340"],
    ]);
  });

  it("leaves Science One for last, since it takes students by application", () => {
    // EOSC 211 takes one of MATH 101, 103, 105, 121 or SCIE 001.
    expect(planAll("EOSC 211").terms).toEqual([["MATH 100"], ["MATH 101"], ["EOSC 211"]]);
  });

  it("counts on high school courses instead of courses for students without them", () => {
    // CHEM 123 takes CHEM 111 or 121. CHEM 111 isn't for students with Chemistry 12, and
    // CHEM 121 takes Chemistry 12 or CHEM 100.
    expect(planAll("CHEM 123")).toEqual({
      terms: [["CHEM 121"], ["CHEM 123"]],
      also: [{ kind: "check", text: "CHEM 12" }],
    });
  });

  it("takes courses over a choice that's several things to check", () => {
    // BIOL 200's option (c) is "8 transfer credits of first-year BIOL and 6 credits of
    // first-year CHEM".
    expect(planAll("BIOL 200").terms).toEqual([["BIOL 121"], ["BIOL 200"]]);
  });

  it("doesn't count on a high grade in a high school course", () => {
    // ASTR 200 takes PHYS 107 too, which needs 85% or higher in Physics 12.
    expect(planAll("ASTR 200").terms.flat()).not.toContain("PHYS 107");
  });
});

describe("planPath with both faculties loaded", () => {
  // Each faculty's page loads every course on the site, but plans as that faculty.
  const load = (subject: string): CourseFile =>
    JSON.parse(readFileSync(new URL(`../../../data/courses/${subject}.json`, import.meta.url), "utf8"));
  const coursesOf = (subjects: { code: string }[]) =>
    undergradOnly(subjects.flatMap((s) => load(s.code.toLowerCase()).courses));
  const science = coursesOf(SCIENCE.subjects);
  const engineering = coursesOf(ENGINEERING.subjects);
  const all = [...science, ...engineering];
  const codes = (list: typeof all) => new Set(list.map((c) => c.code));
  // The Science page: its own maps, with engineering courses as a last resort.
  const onScience = (target: string, ...done: string[]) =>
    planPath(target, all, new Set(done), { home: codes(science), closed: codes(engineering) });
  // The engineering page: its own maps, and Science courses as usual.
  const onEngineering = (target: string, ...done: string[]) =>
    planPath(target, all, new Set(done), { home: codes(engineering) });

  it("plans the Science page as before", () => {
    expect(onScience("CPSC 340").terms).toEqual(planPath("CPSC 340", science, new Set()).terms);
    // MATH 215 and MATH 255 need the same courses. MATH 255 leads to more courses only through
    // ELEC 221 (STAT 321 needs one of ELEC 221, STAT 305), which doesn't count here.
    expect(onScience("ASTR 407").terms.flat()).toContain("MATH 215");
    // PHYS 117 over the engineering PHYS 157, MATH 200 over MATH 253.
    expect(onScience("ATSC 301").terms.flat()).toContain("PHYS 117");
    expect(onScience("CHEM 304").terms.flat()).toContain("MATH 200");
  });

  it("only uses engineering courses on the Science page when there's no other way", () => {
    // MICB 322 could start with BMEG 245, one course shorter than BIOL 112 and MICB 201.
    expect(onScience("MICB 322").terms.flat()).not.toContain("BMEG 245");
    // CPSC 221 takes CPSC 210 or CPEN 221, even after APSC 160 (which leads to CPEN 221).
    expect(onScience("CPSC 221", "APSC 160").terms.flat()).toContain("CPSC 210");
    // EOSC 210's corequisite is one of CIVL 215, MINE 200: both engineering, so one is planned.
    expect(onScience("EOSC 210").terms).toEqual([["EOSC 210", "MINE 200"]]);
  });

  it("plans engineering courses with the Science courses they need", () => {
    expect(onEngineering("ELEC 201").terms).toEqual([
      ["MATH 100", "PHYS 157"],
      ["MATH 101", "MATH 152", "PHYS 158"],
      ["ELEC 201", "MATH 253", "MATH 256"],
    ]);
    expect(onEngineering("CPEN 331").terms).toEqual([
      ["APSC 160"],
      ["CPEN 211", "CPEN 221"],
      ["CPEN 212"],
      ["CPEN 331"],
    ]);
  });
});
