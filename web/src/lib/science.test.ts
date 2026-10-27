import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { creditsLookup, programProgress } from "./program";
import { BREADTH, COMMUNICATION_COURSES, isScience, scienceRows, withCommunicationCourses } from "./science";
import type { CourseFile, Program, ProgramFile } from "./types";

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const cpsc: ProgramFile = read("../../../data/programs/cpsc.json");
const science: ProgramFile = read("../../../data/programs/science.json");
const courses = ["cpsc", "math", "chem", "phys", "biol", "stat"].flatMap(
  (s) => (read(`../../../data/courses/${s}.json`) as CourseFile).courses,
);
const creditsFor = creditsLookup(courses);
const program = (id: string) => [...cpsc.programs, ...science.programs].find((p) => p.id === id)!;
const rows = (p: Program, done: string[], highSchool: string[] = []) =>
  Object.fromEntries(scienceRows(p, new Set(done), creditsFor, new Set(highSchool)).map((row) => [row.title, row]));

describe("isScience", () => {
  it("knows Science subjects and the Science courses of other faculties", () => {
    expect(["CPSC 110", "MATH 100", "AI 422", "BIOC 202", "GEOS 207", "SCIE 113"].every(isScience)).toBe(true);
    expect(["PSYC 360", "PSYC 348", "MEDG 410", "FNH 350"].every(isScience)).toBe(true);
    expect(["PSYC 101", "MEDG 422", "ENGL 110", "WRDS 150", "CPEN 221", "ECON 101"].some(isScience)).toBe(false);
  });
});

describe("BREADTH", () => {
  it("sorts courses into the 7 categories, with the calendar's exceptions", () => {
    const category = (code: string) => BREADTH.filter((c) => c.has(code)).map((c) => c.name);
    expect(category("MATH 100")).toEqual(["Mathematics"]);
    expect(category("MATH 302")).toEqual(["Statistics"]);
    expect(category("BIOL 300")).toEqual(["Statistics"]);
    expect(category("BIOL 140")).toEqual([]);
    expect(category("CHEM 300")).toEqual([]);
    expect(category("EOSC 111")).toEqual([]);
    expect(category("GEOS 207")).toEqual(["Life Science"]);
    expect(category("ATSC 201")).toEqual(["Earth and Planetary Science"]);
  });
});

describe("scienceRows", () => {
  const major = program("cpsc-major");
  const firstYears = ["SCIE 113", "CPSC 110", "CPSC 121", "MATH 100", "MATH 101", "CHEM 121", "PHYS 117", "BIOL 112"];

  it("starts with nothing done", () => {
    expect(Object.values(rows(major, [])).map((r) => r.status)).toEqual([
      "todo", "todo", "todo", "todo", "todo", "check", "check",
    ]);
  });

  it("counts the lab course, breadth and Science credits", () => {
    const r = rows(major, firstYears);
    expect(r["One lab science course"]).toMatchObject({ status: "done", counted: ["CHEM 121"], options: [] });
    const breadth = r["3 credits in 6 of the 7 Science Breadth categories"];
    expect(breadth.progress).toBe("5 of 6"); // no Statistics or Earth and Planetary Science yet
    expect(breadth.categories!.filter((c) => !c.done).map((c) => c.name)).toEqual([
      "Statistics", "Earth and Planetary Science",
    ]);
    expect(r["Science credits"]).toMatchObject({ status: "partial", progress: "27 of 72 cr" });
    expect(r["Credits numbered 300 or higher"].status).toBe("todo");
  });

  it("lists the lab courses while none is done", () => {
    expect(rows(major, [])["One lab science course"].options).toContain("PHYS 119");
  });

  it("asks honours for 42 upper-level Science credits and combined programs for 5 categories", () => {
    expect(rows(major, [])["…of which in Science"].progress).toBe("0 of 30 cr");
    expect(rows(program("cpsc-honours"), [])["…of which in Science"].progress).toBe("0 of 42 cr");
    expect(rows(program("cpsc-math-honours"), [])).toHaveProperty(["3 credits in 5 of the 7 Science Breadth categories"]);
  });

  describe("the foundational row", () => {
    const foundational = (done: string[], highSchool: string[] = []) =>
      rows(major, done, highSchool)["Foundational Biology, Chemistry and Physics"];

    it("is done with the high school courses ticked", () => {
      expect(foundational([], ["BIOL 11", "CHEM 12", "PHYS 12"])).toMatchObject({
        status: "done", counted: ["Biology 11", "Chemistry 12", "Physics 12"], check: null, ask: null,
      });
      expect(foundational([], ["BIOL 11", "BIOL 12", "CHEM 12", "PHYS 12"]).counted[0]).toBe("Biology 12");
    });

    it("is done with 3 credits of 100-level courses in each subject", () => {
      expect(foundational(firstYears)).toMatchObject({ status: "done", counted: ["BIOL 112", "CHEM 121", "PHYS 117"] });
      // MATH and 200-level courses don't count.
      expect(foundational(["BIOL 200", "CHEM 233", "PHYS 200"]).status).toBe("check");
    });

    it("names only the subjects still to check", () => {
      const row = foundational(["CHEM 121"], ["BIOL 12"]);
      expect(row).toMatchObject({ status: "check", counted: ["Biology 12", "CHEM 121"], ask: "Physics 12" });
      expect(row.check).toBe("Without Physics 12: 3 credits of 100-level PHYS (usually PHYS 100).");
      expect(foundational([]).ask).toBe("Biology 11 or Biology 12 or Chemistry 12 or Physics 12");
    });
  });

  it("gives Science One four breadth categories", () => {
    const breadth = rows(major, ["SCIE 001"])["3 credits in 6 of the 7 Science Breadth categories"];
    expect(breadth.progress).toBe("4 of 6");
  });
});

describe("withCommunicationCourses", () => {
  it("turns the Additional Communication Requirement into a choice of its courses", () => {
    const tracked = withCommunicationCourses(program("cpsc-major"));
    const row = tracked.years[0].requirements.find((r) => r.text === "Additional Communication Requirement")!;
    expect(row.tree).toEqual({ one_of: COMMUNICATION_COURSES });
    const progress = programProgress(tracked, new Set(["WRDS 150"]), creditsFor);
    const r = tracked.years[0].requirements.indexOf(row);
    expect(progress[0][r]).toMatchObject({ status: "done", counted: ["WRDS 150"] });
    // Data Science writes "Communications".
    const dsci = withCommunicationCourses(program("dsci-major"));
    const texts = dsci.years.flatMap((y) => y.requirements).filter((q) => q.text.startsWith("Additional Comm"));
    expect(texts.map((q) => q.tree)).toEqual([{ one_of: COMMUNICATION_COURSES }]);
  });
});
