import { describe, expect, it } from "vitest";
import { hashFor, pendingSubjectScript, SCIENCE, subjectFromHash, subjectOf } from "./subjects";

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
    const names = SCIENCE.subjects.map((s) => s.name);
    expect(names).toEqual([...names].sort());
    expect(SCIENCE.subjects.map((s) => s.code)).toContain(SCIENCE.home);
  });
});
