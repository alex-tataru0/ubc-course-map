import { describe, expect, it } from "vitest";
import { rateMyProfUrl, redditSearchUrl, ubcGradesUrl } from "./links";

describe("links", () => {
  it("searches r/UBC for the course code", () => {
    expect(redditSearchUrl("CPSC 221")).toBe(
      "https://www.reddit.com/r/UBC/search/?q=CPSC%20221&restrict_sr=1",
    );
  });

  it("searches Rate My Professors at UBC for a name", () => {
    expect(rateMyProfUrl("Geoffrey Tien")).toBe(
      "https://www.ratemyprofessors.com/search/professors/1413?q=Geoffrey%20Tien",
    );
    // Names with accents or apostrophes stay safe in the URL.
    expect(rateMyProfUrl("Renée O'Brien")).toBe(
      "https://www.ratemyprofessors.com/search/professors/1413?q=Ren%C3%A9e%20O'Brien",
    );
  });

  it("opens the course on UBCGrades", () => {
    expect(ubcGradesUrl("CPSC 221")).toBe("https://ubcgrades.com/statistics-by-course#UBCV-CPSC-221");
  });
});
