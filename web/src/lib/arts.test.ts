import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { areaOf, artsRows, breadthAreas } from "./arts";
import { creditsLookup } from "./program";
import type { ArtsDegree, CourseFile, ProgramFile } from "./types";

const read = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
const degree: ArtsDegree = read("../../../data/arts-degree.json");
const arts: ProgramFile = read("../../../data/programs/arts.json");
const courses = ["anth", "econ", "engl", "hist", "phil", "poli", "psyc", "soci", "wrds", "cpsc", "math", "stat"].flatMap(
  (s) => (read(`../../../data/courses/${s}.json`) as CourseFile).courses,
);
const creditsFor = creditsLookup(courses);
const program = (id: string) => arts.programs.find((p) => p.id === id)!;
const rows = (id: string, done: string[]) =>
  Object.fromEntries(artsRows(program(id), degree, new Set(done), creditsFor).map((row) => [row.title, row]));

const BREADTH = "Ways of Knowing breadth: 9, 6, 3 credits in one subject each";
const WRITING = "Writing: one of these courses, or Arts One";
const RESEARCH = "A research-intensive course";

describe("areaOf", () => {
  it("finds a subject's breadth area", () => {
    expect(areaOf("ECON", degree)).toBe("Social and Behavioural Systems");
    expect(areaOf("PHIL", degree)).toBe("Humanities and Creative Arts");
    expect(areaOf("CPSC", degree)).toBe("Natural and Physical Sciences");
    expect(areaOf("CPEN", degree)).toBeUndefined();
  });
});

describe("breadthAreas", () => {
  const areas = (majorArea: string, done: string[]) => breadthAreas(majorArea, degree, done, creditsFor);

  it("skips the Major's area and asks 9, 6 and 3 of the others", () => {
    const result = areas("Social and Behavioural Systems", []);
    expect(result.map((a) => a.name)).toEqual([
      "Humanities and Creative Arts", "Language as Meaning", "Natural and Physical Sciences",
    ]);
    // With nothing done, Language as Meaning (nothing on the site) gets the 3.
    expect(result.map((a) => a.need)).toEqual([9, 3, 6]);
    expect(result.map((a) => a.onSite)).toEqual([true, false, true]);
  });

  it("gives the 9 to the area with the most credits in one subject", () => {
    const result = areas("Social and Behavioural Systems", ["CPSC 110", "CPSC 121", "CPSC 210", "PHIL 120"]);
    expect(result).toEqual([
      { name: "Humanities and Creative Arts", need: 6, subject: "PHIL", credits: 3, onSite: true },
      { name: "Language as Meaning", need: 3, subject: null, credits: 0, onSite: false },
      { name: "Natural and Physical Sciences", need: 9, subject: "CPSC", credits: 9, onSite: true },
    ]);
  });

  it("counts one subject per area", () => {
    // 3 credits of MATH and 3 of STAT don't add up to 6 in one subject.
    const science = areas("Social and Behavioural Systems", ["MATH 100", "STAT 200"]).find(
      (a) => a.name === "Natural and Physical Sciences",
    )!;
    expect(science).toMatchObject({ subject: "MATH", credits: 3 });
  });
});

describe("artsRows", () => {
  it("starts with nothing done", () => {
    expect(Object.values(rows("econ-major", [])).map((r) => [r.title, r.status])).toEqual([
      [WRITING, "todo"],
      [RESEARCH, "todo"],
      [BREADTH, "todo"],
      ["Place and Power: 3 credits", "check"],
      ["Credits outside ECON", "todo"],
      ["Credits numbered 300 or higher", "todo"],
      ["Arts credits", "todo"],
    ]);
  });

  it("counts the writing course, and not for breadth", () => {
    const r = rows("econ-major", ["WRDS 150", "ENGL 110"]);
    expect(r[WRITING]).toMatchObject({ status: "done", counted: ["WRDS 150"], options: [] });
    expect(rows("econ-major", [])[WRITING].options).toContain("ENGL 100");
    // ENGL 110 counts for Humanities and Creative Arts, WRDS 150 doesn't.
    const humanities = r[BREADTH].areas!.find((a) => a.name === "Humanities and Creative Arts")!;
    expect(humanities).toMatchObject({ subject: "ENGL", credits: 3 });
  });

  it("asks for the Major's research courses", () => {
    expect(rows("psyc-major", [])[RESEARCH].options).toEqual(["PSYC 217"]);
    expect(rows("psyc-major", ["PSYC 217"])[RESEARCH]).toMatchObject({ status: "done", counted: ["PSYC 217"] });
    expect(rows("poli-major", [])[RESEARCH].options).toContain("POLI 464");
    expect(rows("anth-major", [])[RESEARCH].options).toContain("ARCL 306");
  });

  it("leaves the breadth to check when only off-site areas are missing", () => {
    // An ECON major with 9 credits of PHIL and 6 of CPSC: only Language as Meaning is left.
    const r = rows("econ-major", ["PHIL 120", "PHIL 125", "PHIL 220", "CPSC 110", "CPSC 121"])[BREADTH];
    expect(r.status).toBe("check");
    expect(r.progress).toBe("15 of 18 cr");
    expect(r.check).toBe("Language as Meaning subjects aren't on this site yet: check those 3 credits yourself.");
  });

  it("counts credits outside the field", () => {
    const done = ["ANTH 100", "ARCL 103", "ECON 101", "PSYC 101"];
    expect(rows("anth-major", done)["Credits outside ANTH and ARCL"].progress).toBe("6 of 60 cr");
    expect(rows("econ-major", done)["Credits outside ECON"].progress).toBe("9 of 60 cr");
  });

  it("counts upper-level and Arts credits", () => {
    const r = rows("econ-major", ["ECON 101", "ECON 301", "ECON 490", "CPSC 110", "MATH 100"]);
    expect(r["Credits numbered 300 or higher"]).toMatchObject({ status: "partial", progress: "6 of 48 cr" });
    expect(r["Arts credits"]).toMatchObject({ status: "partial", progress: "9 of 72 cr" });
  });

  it("works for every Arts Major", () => {
    for (const p of arts.programs) {
      const r = artsRows(p, degree, new Set(), creditsFor);
      expect(r).toHaveLength(7);
      expect(r[1].options.length).toBeGreaterThan(0);
      expect(r[2].areas).toHaveLength(3);
    }
  });
});
