import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { subjectMap } from "./subjectMap";
import type { CourseFile } from "./types";

const load = (subject: string): CourseFile =>
  JSON.parse(readFileSync(new URL(`../../../data/courses/${subject}.json`, import.meta.url), "utf8"));

describe("subjectMap", () => {
  const cpsc = subjectMap(load("cpsc"));
  const math = subjectMap(load("math"));
  const stat = subjectMap(load("stat"));

  it("places every undergraduate course of the subject, and no other", () => {
    expect(cpsc.courses.length).toBe(load("cpsc").courses.filter((c) => Number(c.code.slice(5, 8)) < 500).length);
    expect(math.courses.every((c) => c.id.startsWith("MATH "))).toBe(true);
    expect(math.courses.some((c) => c.id === "MATH 527")).toBe(false);
  });

  it("puts the co-op work terms in their own section", () => {
    expect(math.labels.map((l) => l.text)).toEqual(["Co-op work terms"]);
    const coop = math.courses.filter((c) => ["MATH 398", "MATH 399", "MATH 498", "MATH 499"].includes(c.id));
    expect(new Set(coop.map((c) => c.y)).size).toBe(1);
    expect(math.edges.some((e) => e.target === "MATH 399")).toBe(false);
  });

  it("keeps CPSC's other section and its calendar link", () => {
    expect(cpsc.labels.map((l) => l.text)).toEqual([
      "Co-op work terms",
      "Other CPSC courses (for other programs, or by permission)",
    ]);
    expect(stat.calendarUrl).toBe("https://vancouver.calendar.ubc.ca/course-descriptions/subject/statv");
  });

  it("only draws lines between courses of the same subject", () => {
    for (const map of [cpsc, math, stat]) {
      const ids = new Set(map.courses.map((c) => c.id));
      for (const e of map.edges) {
        expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
      }
    }
  });
});
