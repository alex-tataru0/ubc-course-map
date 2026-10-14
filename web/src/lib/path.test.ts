import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { undergradOnly } from "./graph";
import { planPath } from "./path";
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

  it("gives an empty path for a finished course or one not on the map", () => {
    expect(plan("CPSC 221", ...secondYear)).toEqual({ terms: [], also: [] });
    expect(plan("MATH 200")).toEqual({ terms: [], also: [] });
  });
});
