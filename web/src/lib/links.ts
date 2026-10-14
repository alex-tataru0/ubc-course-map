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
