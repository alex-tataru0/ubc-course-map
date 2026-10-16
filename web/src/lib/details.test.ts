import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayCode, simplifyTree, splitDescription } from "./details";
import type { CourseFile } from "./types";

const url = new URL("../../../data/courses/cpsc.json", import.meta.url);
const data: CourseFile = JSON.parse(readFileSync(url, "utf8"));
const description = (code: string) => data.courses.find((c) => c.code === code)!.description;

describe("splitDescription", () => {
  it("drops the requisites and pulls out the weekly hours", () => {
    const { summary, hours } = splitDescription(description("CPSC 221"));
    expect(summary).toBe(
      "Design and analysis of basic algorithms and data structures; algorithm analysis methods, " +
        "searching and sorting algorithms, basic data structures, graphs and concurrency.",
    );
    expect(hours).toBe("3-2-0");
  });

  it("keeps a description with no requisites or hours whole", () => {
    const { summary, hours } = splitDescription(description("CPSC 298"));
    expect(summary).toBe(description("CPSC 298"));
    expect(hours).toBeNull();
  });

  it("keeps the Credit/D/Fail note when it comes after the prereq", () => {
    const { summary } = splitDescription(
      "Work placement. Prerequisite: CPSC 298. This course is not eligible for Credit/D/Fail grading.",
    );
    expect(summary).toBe("Work placement. This course is not eligible for Credit/D/Fail grading.");
  });

  it("finds the hours after the prereq", () => {
    expect(splitDescription("Stress analysis. Prerequisite: MECH 224 or MECH 260. [2-2-0]")).toEqual({
      summary: "Stress analysis.",
      hours: "2-2-0",
    });
  });

  it("reads hours with a * for alternate weeks", () => {
    expect(splitDescription("Process control. [3-0-2*]").hours).toBe("3-0-2*");
  });

  it("leaves out a recommended prerequisite, which is shown on its own", () => {
    const { summary, hours } = splitDescription(
      "Weather. Recommended pre-requisite: completion of first-year science. [3-0-0]",
    );
    expect(summary).toBe("Weather.");
    expect(hours).toBe("3-0-0");
  });

  it("leaves out a hyphenated label", () => {
    // BIOL 307
    expect(splitDescription("Ecology. [2-3-0] Pre-requisites: Third-year standing.").summary).toBe(
      "Ecology.",
    );
  });
});

describe("simplifyTree", () => {
  it("merges a one_of inside a one_of", () => {
    // CPSC 221's second requirement.
    const tree = {
      one_of: [{ one_of: ["CPSC 121", "MATH 220", "MATH_O 220"] }, { course: "MATH 226", min_grade: 68 }],
    };
    expect(simplifyTree(tree)).toEqual({
      one_of: ["CPSC 121", "MATH 220", "MATH_O 220", { course: "MATH 226", min_grade: 68 }],
    });
  });

  it("merges an all_of inside an all_of, at any depth", () => {
    expect(simplifyTree({ all_of: ["A", { all_of: ["B", { all_of: ["C", "D"] }] }] })).toEqual({
      all_of: ["A", "B", "C", "D"],
    });
  });

  it("keeps a one_of inside an all_of, since they mean different things", () => {
    const tree = { all_of: ["A", { one_of: ["B", "C"] }] };
    expect(simplifyTree(tree)).toEqual(tree);
  });

  it("turns a group with one item into that item", () => {
    expect(simplifyTree({ one_of: ["CPSC 210"] })).toBe("CPSC 210");
    expect(simplifyTree({ all_of: [{ one_of: ["A", "B"] }] })).toEqual({ one_of: ["A", "B"] });
  });

  it("leaves single courses and text alone", () => {
    expect(simplifyTree("CPSC 110")).toBe("CPSC 110");
    expect(simplifyTree({ other: "Third-year standing" })).toEqual({ other: "Third-year standing" });
  });
});

describe("displayCode", () => {
  it("spells out Okanagan courses", () => {
    expect(displayCode("MATH_O 220")).toBe("MATH 220 (Okanagan)");
    expect(displayCode("HES_O 340")).toBe("HES 340 (Okanagan)");
  });

  it("leaves Vancouver courses alone", () => {
    expect(displayCode("CPSC 221")).toBe("CPSC 221");
  });
});
