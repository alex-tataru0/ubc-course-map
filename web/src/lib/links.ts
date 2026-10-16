// Links out of the site. They're plain search pages: the site never calls Reddit or
// Rate My Professors itself (no API, no scraping).

// r/UBC posts that mention the course, e.g. "CPSC 221".
export function redditSearchUrl(code: string): string {
  return `https://www.reddit.com/r/UBC/search/?q=${encodeURIComponent(code)}&restrict_sr=1`;
}

// UBC Vancouver's school number on Rate My Professors, so the search stays at UBC.
const RMP_SCHOOL_UBC = 1413;

// A Rate My Professors search for an instructor's name at UBC.
export function rateMyProfUrl(name: string): string {
  return `https://www.ratemyprofessors.com/search/professors/${RMP_SCHOOL_UBC}?q=${encodeURIComponent(name)}`;
}

// The course's page on UBCGrades, e.g. "CPSC 221" → …#UBCV-CPSC-221.
export function ubcGradesUrl(code: string): string {
  return `https://ubcgrades.com/statistics-by-course#UBCV-${code.replace(" ", "-")}`;
}

// Text with web addresses in it, split so the addresses can be links, e.g. a description's
// "Please consult the Faculty of Science Credit Exclusion Lists: https://vancouver.calendar…".
export type TextPart = { text: string } | { url: string; label: string };

// An address runs to the next space, and doesn't take a full stop, comma or bracket after it.
const URL_IN_TEXT = /https?:\/\/[^\s<>"\]]*[^\s<>"\].,;:)]/g;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const at = match.index;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ url: match[0], label: linkLabel(match[0]) });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// A short name for a long address, so it fits the side panel:
// "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/
// bachelor-science/credit-exclusion-lists" → "vancouver.calendar.ubc.ca/…/credit-exclusion-lists".
// Short ones stay whole, without "https://" and "www.": "eoas.ubc.ca/undergrad/degrees".
const LABEL_LENGTH = 40;

export function linkLabel(url: string): string {
  const { hostname, pathname } = new URL(url);
  const host = hostname.replace(/^www\./, "");
  const segments = pathname.split("/").filter(Boolean);
  const whole = [host, ...segments].join("/");
  if (whole.length <= LABEL_LENGTH || segments.length < 2) return whole;
  return `${host}/…/${segments[segments.length - 1]}`;
}

// The site's code on GitHub, and a new issue there with the feedback form
// (.github/ISSUE_TEMPLATE/feedback.yml), its "Which subject or course?" box filled in.
export const REPO_URL = "https://github.com/alex-tataru0/ubc-course-map";

export function feedbackUrl(where: string): string {
  return `${REPO_URL}/issues/new?template=feedback.yml&where=${encodeURIComponent(where)}`;
}
