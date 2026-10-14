import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  creditsLookup,
  programCodes,
  programCourses,
  programGroups,
  programProgress,
  programSummary,
  shortName,
} from "./program";
import type { RowProgress } from "./program";
import type { CourseFile, Program, ProgramFile } from "./types";

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const programs: ProgramFile = read("../../../data/programs/cpsc.json");
const courses: CourseFile = read("../../../data/courses/cpsc.json");
const creditsFor = creditsLookup(courses.courses);
const program = (id: string) => programs.programs.find((p) => p.id === id)!;

// Progress for one row, found by its calendar wording.
function row(p: Program, done: string[], text: string): RowProgress {
  const progress = programProgress(p, new Set(done), creditsFor);
  for (const [y, year] of p.years.entries()) {
    const r = year.requirements.findIndex((req) => req.text.startsWith(text));
    if (r !== -1) return progress[y][r];
  }
  throw new Error(`no row ${text}`);
}

describe("creditsLookup", () => {
  it("uses the calendar's credits, and 3 for courses we don't have or ranges", () => {
    expect(creditsFor("CPSC 110")).toBe(4);
    expect(creditsFor("CPSC 449")).toBe(6);
    expect(creditsFor("CPSC 436")).toBe(3); // "1-6"
    expect(creditsFor("MATH 200")).toBe(3);
  });
});

describe("programProgress", () => {
  const major = program("cpsc-major");

  it("shows nothing done when no courses are marked", () => {
    const progress = programProgress(major, new Set(), creditsFor).flat();
    expect(progress.filter((r) => r.status === "done")).toEqual([]);
    expect(progress.map((r) => r.status)).toContain("electives");
    expect(progress.map((r) => r.status)).toContain("check"); // the communication requirement
  });

  it("counts single courses, lists and choices", () => {
    expect(row(major, ["CPSC 121"], "CPSC 121").status).toBe("done");
    expect(row(major, ["CPSC 213"], "CPSC 213, 221")).toMatchObject({ status: "partial", counted: ["CPSC 213"] });
    expect(row(major, ["MATH 180"], "MATH 100 or")).toMatchObject({ status: "done", counted: ["MATH 180"] });
  });

  it("knows CPSC 103 and 107 together replace CPSC 110", () => {
    expect(row(major, ["CPSC 103", "CPSC 107"], "CPSC 110")).toMatchObject({
      status: "done", counted: ["CPSC 103", "CPSC 107"],
    });
    expect(row(major, ["CPSC 103"], "CPSC 110").status).toBe("partial");
  });

  it("fills the 400-level credits first, then the 300-level ones", () => {
    const done = ["CPSC 310", "CPSC 313", "CPSC 320", "CPSC 304", "CPSC 340", "CPSC 404", "CPSC 410", "CPSC 420", "CPSC 425"];
    // 310, 313 and 320 are named, so they don't count toward the credit rows.
    expect(row(major, done, "CPSC 310, 313, 320").status).toBe("done");
    expect(row(major, done, "CPSC or AI courses numbered 400")).toMatchObject({
      status: "done", counted: ["CPSC 404", "CPSC 410", "CPSC 420"], credits: 9,
    });
    expect(row(major, done, "CPSC or AI courses numbered 300")).toMatchObject({
      status: "done", counted: ["CPSC 304", "CPSC 340", "CPSC 425"], credits: 9,
    });
  });

  it("leaves out CPSC 490, as the footnote says", () => {
    expect(row(major, ["CPSC 490"], "CPSC or AI courses numbered 300").status).toBe("todo");
  });

  it("never counts one course for two rows", () => {
    const se = program("cpsc-se-major");
    const done = ["CPSC 304", "CPSC 317"];
    expect(row(se, done, "One of CPSC 304, 317, 344").counted).toEqual(["CPSC 304"]);
    expect(row(se, done, "One more of").counted).toEqual(["CPSC 317"]);
    expect(row(se, done, "One of CPSC 415").status).toBe("todo");
  });

  it("checks the AI option's 400-level condition", () => {
    const ai = program("cpsc-ai-major");
    const three = "Three of";
    expect(row(ai, ["CPSC 330", "CPSC 344", "CPSC 404"], three)).toMatchObject({
      status: "partial", check: "at least 6 credits of which must be 400 or above",
    });
    expect(row(ai, ["CPSC 330", "CPSC 404", "CPSC 406"], three)).toMatchObject({ status: "done", check: null });
    expect(row(ai, ["CPSC 330"], three)).toMatchObject({ status: "partial", counted: ["CPSC 330"] });
  });
});

describe("programCourses", () => {
  it("marks named courses as required and options as choices", () => {
    const kinds = programCourses(program("cpsc-major"));
    expect(kinds.get("CPSC 310")).toBe("required");
    expect(kinds.get("CPSC 110")).toBe("choice");
    expect(kinds.get("MATH 200")).toBe("required");
    expect(kinds.has("CPSC 404")).toBe(false); // only in "CPSC 400 or higher"
  });
});

describe("programSummary", () => {
  it("counts finished rows and spare credits", () => {
    const major = program("cpsc-major");
    const done = new Set(["CPSC 110", "CPSC 121", "CPSC 100"]);
    const summary = programSummary(programProgress(major, done, creditsFor), done, creditsFor);
    expect(summary.rowsDone).toBe(2);
    expect(summary.rows).toBe(13); // 17 rows minus 3 electives rows and the communication row
    expect(summary.spareCredits).toBe(3); // CPSC 100 isn't part of the major
  });
});

describe("programCodes", () => {
  it("lists every course the programs name, once each, sorted", () => {
    const codes = programCodes(programs.programs);
    expect(codes).toEqual([...new Set(codes)].sort());
    expect(codes).toContain("SCIE 113");
    expect(codes).toContain("AI 422");
    expect(codes).toContain("EECE 494");
  });
});

describe("programGroups", () => {
  it("puts each Major next to its Honours, with plan codes where the calendar has them", () => {
    const groups = programGroups(programs.programs);
    expect(groups.map((g) => g.title)).toEqual([
      "Computer Science",
      "Computer Science, Artificial Intelligence option",
      "Computer Science and Software Engineering",
    ]);
    expect(groups[0].options).toEqual([
      { id: "cpsc-major", kind: "Major", plan: "0376", credits: 120 },
      { id: "cpsc-honours", kind: "Honours", plan: "0154", credits: 132 },
    ]);
    expect(groups[1].options.map((o) => [o.kind, o.plan])).toEqual([
      ["Major", null],
      ["Honours", null],
    ]);
  });
});

describe("shortName", () => {
  it("shortens the names for the button over the map", () => {
    expect(programs.programs.map(shortName)).toEqual([
      "CS Major",
      "CS Honours",
      "CS Major, AI option",
      "CS Honours, AI option",
      "CS and SE Major",
      "CS and SE Honours",
    ]);
  });
});
