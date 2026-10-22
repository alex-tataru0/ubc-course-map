import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  creditsLookup,
  programCodes,
  programCourses,
  mapPrograms,
  programMajors,
  programProgress,
  programSubject,
  programSummary,
  shortName,
} from "./program";
import type { RowProgress } from "./program";
import type { CourseFile, Program, ProgramFile, ProgramNode } from "./types";

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const programs: ProgramFile = read("../../../data/programs/cpsc.json");
const engineering: ProgramFile = read("../../../data/programs/engineering.json");
const science: ProgramFile = read("../../../data/programs/science.json");
const courses: CourseFile = read("../../../data/courses/cpsc.json");
const creditsFor = creditsLookup(courses.courses);
const program = (id: string) => [...programs.programs, ...science.programs].find((p) => p.id === id)!;

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

describe("programMajors", () => {
  it("puts the six Computer Science programs under one major, in the calendar's order", () => {
    const majors = programMajors(programs.programs);
    expect(majors.map((m) => [m.subject, m.programs.length])).toEqual([["CPSC", 6]]);
    expect(majors[0].programs.map((p) => p.id)).toEqual([
      "cpsc-major", "cpsc-honours", "cpsc-ai-major", "cpsc-ai-honours", "cpsc-se-major", "cpsc-se-honours",
    ]);
  });

  it("lists the Science subjects in the menu's order, with combined programs under each subject", () => {
    const majors = programMajors([...science.programs, ...programs.programs]);
    expect(majors.map((m) => [m.subject, m.programs.length, m.combined.length])).toEqual([
      ["ASTR", 1, 1], ["ATSC", 2, 1], ["BIOL", 9, 6], ["CHEM", 2, 8], ["CPSC", 6, 12], ["DSCI", 1, 0],
      ["EOSC", 6, 5], ["ENVR", 2, 0], ["MATH", 3, 6], ["MICB", 2, 3], ["PHYS", 2, 7], ["STAT", 2, 4],
    ]);
    const math = majors.find((m) => m.subject === "MATH")!;
    expect(math.programs.map((p) => p.name)).toEqual([
      "Mathematics Major", "Mathematical Sciences Major", "Mathematics Honours",
    ]);
    // Computer Science and Mathematics shows under both subjects.
    const cpsc = majors.find((m) => m.subject === "CPSC")!;
    expect(cpsc.combined.map((p) => p.id)).toContain("cpsc-math-honours");
    expect(math.combined.map((p) => p.id)).toContain("cpsc-math-honours");
  });
});

describe("mapPrograms", () => {
  const all = [...science.programs, ...programs.programs];
  it("lists a subject's own programs, and a combined one only once it's picked", () => {
    const ids = (picked: Program | null, subject = "CPSC") => mapPrograms(all, subject, picked).map((p) => p.id);
    expect(ids(null)).toEqual([
      "cpsc-major", "cpsc-honours", "cpsc-ai-major", "cpsc-ai-honours", "cpsc-se-major", "cpsc-se-honours",
    ]);
    expect(ids(program("cpsc-biol-major"))).toContain("cpsc-biol-major");
    expect(ids(program("cpsc-biol-major"), "BIOL")).toContain("cpsc-biol-major");
    expect(ids(program("cpsc-biol-major"), "MATH")).not.toContain("cpsc-biol-major");
    expect(ids(program("math-major"))).not.toContain("math-major"); // not a combined program
  });
});

describe("Science programs", () => {
  it("count credits from a list and from a level band", () => {
    const honours = program("math-honours");
    const fifteen = "15 credits from MATH 400-406";
    expect(row(honours, ["MATH 400", "MATH 412"], fifteen)).toMatchObject({
      status: "partial", counted: ["MATH 400", "MATH 412"], credits: 6,
    });
    expect(row(honours, ["MATH 407"], fifteen).status).toBe("todo"); // not in the list
    const chem = program("chem-major"); // "PHYS 100-level", 6 credits
    expect(row(chem, ["PHYS 131", "PHYS 118"], "PHYS 100-level")).toMatchObject({
      status: "done", counted: ["PHYS 118", "PHYS 131"],
    });
    expect(row(chem, ["PHYS 200"], "PHYS 100-level").status).toBe("todo"); // 200-level is too high
  });

  it("reads choices inside choices", () => {
    const geophysics = program("eosc-geophysics-honours");
    const eosc212 = "EOSC 212 (or EOSC 111";
    expect(row(geophysics, ["EOSC 212"], eosc212)).toMatchObject({ status: "done", counted: ["EOSC 212"] });
    expect(row(geophysics, ["EOSC 111"], eosc212)).toMatchObject({ status: "partial", counted: ["EOSC 111"] });
    expect(row(geophysics, ["EOSC 111", "EOSC 116"], eosc212)).toMatchObject({
      status: "done", counted: ["EOSC 111", "EOSC 116"],
    });
    // "Two of BIOL 415, 417, 434 or two of BIOL 417, 418, 434": 415 and 418 aren't a pair.
    const evolution = program("biol-evolution-honours");
    const two = "Two of BIOL 415, 417, 434 or";
    expect(row(evolution, ["BIOL 415", "BIOL 418"], two).status).toBe("partial");
    expect(row(evolution, ["BIOL 417", "BIOL 418"], two)).toMatchObject({ status: "done", counted: ["BIOL 418", "BIOL 417"] });
  });

  it("asks you to check the words in a list, and counts it done once its courses are", () => {
    const stat = program("stat-honours");
    const fourth = "In fourth year: STAT 404";
    const check = "6 credits chosen from MATH 418, 419, 420, 421 and statistics courses numbered 400 or above";
    expect(row(stat, ["STAT 404"], fourth)).toMatchObject({ status: "partial", check });
    expect(row(stat, ["STAT 404", "STAT 460", "STAT 461"], fourth)).toMatchObject({ status: "done", check });
  });

  it("marks only the courses always needed as required", () => {
    const kinds = programCourses(program("astr-major"));
    expect(kinds.get("MATH 215")).toBe("required"); // "MATH 221 (or 223), 215"
    expect(kinds.get("MATH 221")).toBe("choice");
  });

  it("keeps credit rows and electives at the top of a row, and words only inside lists", () => {
    // programProgress only reads credit rows, electives and "other" as a whole row, so the
    // pipeline must never put them inside a choice.
    const inside = (node: ProgramNode, top: boolean): string[] => {
      if (typeof node === "string") return [];
      const kind = Object.keys(node)[0];
      const children = "one_of" in node ? node.one_of : "all_of" in node ? node.all_of : [];
      return [
        ...(!top && ["credits_of", "credits_from", "electives"].includes(kind) ? [kind] : []),
        ...("one_of" in node ? node.one_of.filter((c) => typeof c === "object" && "other" in c).map(() => "other in one_of") : []),
        ...children.flatMap((c) => inside(c, false)),
      ];
    };
    const trees = science.programs.flatMap((p) => p.years.flatMap((y) => y.requirements.map((r) => r.tree)));
    expect(trees.flatMap((t) => inside(t, true))).toEqual([]);
  });
});

describe("programSubject", () => {
  it("is the subject at the start of the program's id", () => {
    expect(programSubject(program("cpsc-ai-major"))).toBe("CPSC");
    expect(engineering.programs.map(programSubject)).toEqual([
      "BMEG", "CHBE", "CHBE", "CIVL", "CPEN", "ELEC", "ENPH", "ENVE", "GEOL", "IGEN", "MANU",
      "MTRL", "MECH", "MINE",
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
    // The engineering majors keep their full names.
    expect(engineering.programs.map(shortName)).toEqual(engineering.programs.map((p) => p.name));
    expect(shortName(program("cpsc-math-honours"))).toBe("CS and Mathematics, Combined Honours");
    expect(shortName(program("math-major"))).toBe("Mathematics Major");
  });
});
