import { describe, expect, it } from "vitest";
import {
  ENGINEERING,
  FACULTIES,
  facultyOf,
  forwardScript,
  hashFor,
  pendingSubjectScript,
  SCIENCE,
  subjectFromHash,
  subjectOf,
} from "./subjects";

describe("subjects", () => {
  it("reads the subject from a course code", () => {
    expect(subjectOf("MATH 221")).toBe("MATH");
    expect(subjectOf("MATH_O 220")).toBe("MATH_O");
  });

  it("reads the subject from the address, in any case", () => {
    expect(subjectFromHash("#math", SCIENCE)).toBe("MATH");
    expect(subjectFromHash("#STAT", SCIENCE)).toBe("STAT");
    expect(subjectFromHash("#astr", SCIENCE)).toBe("ASTR");
  });

  it("falls back to the home subject for no hash or an unknown one", () => {
    expect(subjectFromHash("", SCIENCE)).toBe("CPSC");
    expect(subjectFromHash("#zool", SCIENCE)).toBe("CPSC");
  });

  it("writes the hash for a subject, and none for the home subject", () => {
    expect(hashFor("MATH", SCIENCE)).toBe("#math");
    expect(hashFor("CPSC", SCIENCE)).toBe("");
    expect(subjectFromHash(hashFor("STAT", SCIENCE), SCIENCE)).toBe("STAT");
  });

  it("marks the page as waiting for a subject that isn't the one built into it", () => {
    // Runs the script with a fake address and page instead of a browser's.
    const pending = (hash: string) => {
      const root = { dataset: {} as Record<string, string> };
      const run = new Function("location", "document", "setTimeout", pendingSubjectScript(SCIENCE));
      run({ hash }, { documentElement: root }, () => {});
      return root.dataset.pendingSubject;
    };
    expect(pending("#biol")).toBe("BIOL");
    expect(pending("#MATH")).toBe("MATH");
    expect(pending("")).toBeUndefined();
    expect(pending("#cpsc")).toBeUndefined(); // the map already built into the page
    expect(pending("#zool")).toBeUndefined(); // not a subject, so CPSC shows
  });

  it("lists the subjects A to Z by name, with the home subject among them", () => {
    for (const faculty of FACULTIES) {
      const names = faculty.subjects.map((s) => s.name);
      expect(names).toEqual([...names].sort());
      expect(faculty.subjects.map((s) => s.code)).toContain(faculty.home);
    }
  });

  it("puts every subject in one faculty, ENPH with engineering", () => {
    const codes = FACULTIES.flatMap((f) => f.subjects.map((s) => s.code));
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(27);
    expect(facultyOf("ENPH")).toBe(ENGINEERING);
    expect(facultyOf("MATH")).toBe(SCIENCE);
    expect(facultyOf("WRDS")).toBeUndefined();
    expect(new Set(FACULTIES.map((f) => f.slug)).size).toBe(FACULTIES.length);
  });

  it("forwards old links like /#math to the subject's faculty page", () => {
    // Runs the script with a fake address instead of a browser's.
    const forward = (hash: string, pathname = "/") => {
      let to: string | null = null;
      const location = { hash, pathname, replace: (url: string) => (to = url) };
      new Function("location", "addEventListener", forwardScript())(location, () => {});
      return to;
    };
    expect(forward("#math")).toBe("/science#math");
    expect(forward("#ELEC")).toBe("/engineering#ELEC");
    expect(forward("")).toBeNull();
    expect(forward("#zool")).toBeNull();
    // Only from the home page, not once a faculty's page has taken over.
    expect(forward("#math", "/science")).toBeNull();
  });
});
