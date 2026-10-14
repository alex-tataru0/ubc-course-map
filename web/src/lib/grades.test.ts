import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RANGES, chartScale, gradesFor, notShown, percentLabel, recentInstructors, sessionRange, shares,
  termsOffered,
} from "./grades";
import { undergradOnly } from "./graph";
import type { CourseFile, GradesFile } from "./types";

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const grades: GradesFile = read("../../../data/grades/cpsc.json");
const courses: CourseFile = read("../../../data/courses/cpsc.json");
const codes = undergradOnly(courses.courses).map((c) => c.code);

describe("gradesFor", () => {
  const picked = gradesFor(grades, codes);

  it("keeps the courses on the page that have grades", () => {
    expect(Object.keys(picked)).toHaveLength(51);
    expect(picked["CPSC 221"]).toBe(grades.courses["CPSC 221"]);
  });

  it("leaves out graduate courses and courses with no grades", () => {
    expect(grades.courses["CPSC 540"]).toBeDefined();
    expect(picked["CPSC 540"]).toBeUndefined();
    expect(picked["CPSC 298"]).toBeUndefined(); // co-op work term
  });
});

describe("the grade data", () => {
  it("has a label for every grade range", () => {
    expect(RANGES).toHaveLength(grades.buckets.length);
    expect(RANGES[0].phrase).toBe("below 50%");
    expect(RANGES[10].phrase).toBe("90–100%");
  });

  it("covers 2021S to 2025W", () => {
    expect(sessionRange(grades.sessions)).toBe("2021S–2025W");
  });
});

describe("shares and notShown", () => {
  it("gives each range as a percentage of all students", () => {
    expect(shares([1, 3, 0], 4)).toEqual([25, 75, 0]);
  });

  it("counts students whose range isn't given", () => {
    expect(notShown({ grades: [1, 3, 0], reported: 4 })).toBe(0);
    expect(notShown({ grades: [1, 3, 0], reported: 6 })).toBe(2);
    expect(notShown(grades.courses["CPSC 221"])).toBe(163);
  });
});

describe("termsOffered", () => {
  it("counts terms, not rows", () => {
    expect(termsOffered(grades.courses["CPSC 221"])).toBe(9);
    // CPSC 436 has 23 rows (one per topic per term) in 5 terms.
    expect(grades.courses["CPSC 436"].terms).toHaveLength(23);
    expect(termsOffered(grades.courses["CPSC 436"])).toBe(5);
  });
});

describe("recentInstructors", () => {
  it("lists each instructor once, most recent first", () => {
    expect(recentInstructors(grades.courses["CPSC 221"].terms)).toEqual([
      "Vsevolod Lynov", "Geoffrey Tien", "Cinda Heeren", "Tom Magliery", "Steven Wolfman",
    ]);
  });
});

describe("chartScale", () => {
  it("rounds the top up to 5% and draws a line every 10%", () => {
    expect(chartScale(22.7)).toEqual({ top: 25, lines: [10, 20] });
    expect(chartScale(30)).toEqual({ top: 30, lines: [10, 20, 30] });
  });

  it("spaces the lines out on tall charts", () => {
    expect(chartScale(94.7)).toEqual({ top: 95, lines: [20, 40, 60, 80] });
  });

  it("never has a zero height", () => {
    expect(chartScale(0)).toEqual({ top: 5, lines: [] });
  });
});

describe("percentLabel", () => {
  it("rounds, but shows a tiny share as <1%", () => {
    expect(percentLabel(22.7)).toBe("23%");
    expect(percentLabel(0.3)).toBe("<1%");
    expect(percentLabel(0)).toBe("0%");
  });
});
