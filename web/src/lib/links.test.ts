import { describe, expect, it } from "vitest";
import { feedbackUrl, linkLabel, rateMyProfUrl, redditSearchUrl, splitLinks, ubcGradesUrl } from "./links";

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

  it("opens the feedback form with the subject filled in", () => {
    expect(feedbackUrl("MATH map")).toBe(
      "https://github.com/alex-tataru0/ubc-course-map/issues/new?template=feedback.yml&where=MATH%20map",
    );
  });
});

const EXCLUSION_LISTS =
  "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/bachelor-science/credit-exclusion-lists";

describe("splitLinks", () => {
  it("finds the web addresses in calendar text", () => {
    expect(splitLinks(`See the Credit Exclusion Lists: ${EXCLUSION_LISTS}. Not for credit.`)).toEqual([
      { text: "See the Credit Exclusion Lists: " },
      { url: EXCLUSION_LISTS, label: "vancouver.calendar.ubc.ca/…/credit-exclusion-lists" },
      { text: ". Not for credit." },
    ]);
  });

  it("leaves out brackets and commas around an address", () => {
    const parts = splitLinks(`the MATH 100 credit exclusion list [ ${EXCLUSION_LISTS} ], MATH 190`);
    expect(parts.map((part) => ("url" in part ? "LINK" : part.text))).toEqual([
      "the MATH 100 credit exclusion list [ ",
      "LINK",
      " ], MATH 190",
    ]);
    expect(splitLinks("(https://www.eoas.ubc.ca/undergrad/degrees).")[1]).toEqual({
      url: "https://www.eoas.ubc.ca/undergrad/degrees",
      label: "eoas.ubc.ca/undergrad/degrees",
    });
  });

  it("keeps text with no address as it is", () => {
    expect(splitLinks("Third-year standing")).toEqual([{ text: "Third-year standing" }]);
  });
});

describe("linkLabel", () => {
  it("keeps short addresses whole and shortens long ones to the site and the page", () => {
    expect(linkLabel("http://www.scienceone.ubc.ca")).toBe("scienceone.ubc.ca");
    expect(linkLabel("https://www.eoas.ubc.ca/undergrad/degrees")).toBe("eoas.ubc.ca/undergrad/degrees");
    expect(linkLabel(EXCLUSION_LISTS)).toBe("vancouver.calendar.ubc.ca/…/credit-exclusion-lists");
  });
});
