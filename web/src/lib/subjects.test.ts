import { describe, expect, it } from "vitest";
import { hashFor, SCIENCE, subjectFromHash, subjectOf } from "./subjects";

const { subjects } = SCIENCE;

describe("subjects", () => {
  it("reads the subject from a course code", () => {
    expect(subjectOf("MATH 221")).toBe("MATH");
    expect(subjectOf("MATH_O 220")).toBe("MATH_O");
  });

  it("reads the subject from the address, in any case", () => {
    expect(subjectFromHash("#math", subjects)).toBe("MATH");
    expect(subjectFromHash("#STAT", subjects)).toBe("STAT");
  });

  it("falls back to the first subject for no hash or an unknown one", () => {
    expect(subjectFromHash("", subjects)).toBe("CPSC");
    expect(subjectFromHash("#phys", subjects)).toBe("CPSC");
  });

  it("writes the hash for a subject, and none for the first", () => {
    expect(hashFor("MATH", subjects)).toBe("#math");
    expect(hashFor("CPSC", subjects)).toBe("");
    expect(subjectFromHash(hashFor("STAT", subjects), subjects)).toBe("STAT");
  });
});
