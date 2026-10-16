import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  courseUrl,
  ENGINEERING,
  FACULTIES,
  facultyOf,
  forwardScript,
  hashFor,
  pendingSubjectScript,
  readHash,
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

  it("reads a course from the address too", () => {
    expect(readHash("#math-221", SCIENCE)).toEqual({ subject: "MATH", course: "MATH 221" });
    expect(readHash("#CPSC-110", SCIENCE)).toEqual({ subject: "CPSC", course: "CPSC 110" });
    expect(readHash("#scie-001", SCIENCE)).toEqual({ subject: "SCIE", course: "SCIE 001" });
    expect(readHash("#math", SCIENCE)).toEqual({ subject: "MATH", course: null });
    // Another faculty's course, or something that isn't a code, is the home map.
    expect(readHash("#cpen-221", SCIENCE)).toEqual({ subject: "CPSC", course: null });
    expect(readHash("#math-22", SCIENCE)).toEqual({ subject: "CPSC", course: null });
    expect(subjectFromHash("#stat-251", SCIENCE)).toBe("STAT");
  });

  it("writes the hash for a course, and links to a course on its faculty's page", () => {
    expect(hashFor("MATH", SCIENCE, "MATH 221")).toBe("#math-221");
    expect(hashFor("CPSC", SCIENCE, "CPSC 110")).toBe("#cpsc-110"); // even on the home map
    expect(readHash(hashFor("MATH", SCIENCE, "MATH 221"), SCIENCE).course).toBe("MATH 221");
    expect(courseUrl("CPEN 221")).toBe("/engineering#cpen-221");
    expect(courseUrl("MATH 100")).toBe("/science#math-100");
    expect(courseUrl("WRDS 150")).toBeNull();
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
    expect(pending("#biol-200")).toBe("BIOL"); // a course link waits for its subject's map
    expect(pending("#cpsc-221")).toBeUndefined();
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
    expect(forward("#math-221")).toBe("/science#math-221");
    expect(forward("")).toBeNull();
    expect(forward("#zool")).toBeNull();
    // Only from the home page, not once a faculty's page has taken over.
    expect(forward("#math", "/science")).toBeNull();
  });
});

describe("link previews", () => {
  it("gives each faculty page its own picture, in web/public", () => {
    expect(FACULTIES.map((f) => f.preview.image)).toEqual(["/og.png", "/og-engineering.png"]);
    for (const faculty of FACULTIES) {
      expect(existsSync(new URL(`../../public${faculty.preview.image}`, import.meta.url))).toBe(true);
    }
  });
});
