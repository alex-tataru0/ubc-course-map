import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { undergradOnly } from "./graph";
import { groupBySubject, outsideCourses } from "./outside";
import type { CourseFile } from "./types";

const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
const outside = outsideCourses(undergradOnly(data.courses));

describe("outsideCourses", () => {
  it("finds the courses CPSC prerequisites mention that aren't on the map", () => {
    expect(outside).toHaveLength(53);
    expect(outside).toContain("MATH 221"); // for CPSC 340
    expect(outside).toContain("DSCI 221"); // an alternative to CPSC 221
    expect(outside).toContain("SCIE 001"); // Science One, for CPSC 302 and 303
    expect(outside).toContain("CPSC 261"); // no longer offered, for CPSC 404 and 418
  });

  it("leaves out the courses on the map and Okanagan codes", () => {
    expect(outside).not.toContain("CPSC 221");
    expect(outside.some((code) => code.includes("_O"))).toBe(false);
  });

  it("adds other codes it's given, unless they're on the map", () => {
    const more = outsideCourses(undergradOnly(data.courses), ["SCIE 113", "MATH 221", "CPSC 310"]);
    expect(more).toHaveLength(54);
    expect(more).toContain("SCIE 113");
    expect(more).not.toContain("CPSC 310");
    expect(more).toEqual([...more].sort());
  });

  it("sorts them by code", () => {
    expect(outside).toEqual([...outside].sort());
    expect(outside.slice(0, 2)).toEqual(["AI 240", "APSC 160"]);
  });
});

describe("groupBySubject", () => {
  it("puts MATH, STAT and CPEN first and the rest together", () => {
    const groups = groupBySubject(outside);
    expect(groups.map((g) => g.title)).toEqual(["MATH", "STAT", "CPEN", "Everything else"]);
    expect(groups.map((g) => g.codes.length)).toEqual([19, 6, 5, 23]);
    expect(groups[3].codes).toContain("DSCI 221");
  });

  it("skips groups with no courses", () => {
    expect(groupBySubject(["MATH 200", "PHYS 210"])).toEqual([
      { title: "MATH", codes: ["MATH 200"] },
      { title: "Everything else", codes: ["PHYS 210"] },
    ]);
  });
});
