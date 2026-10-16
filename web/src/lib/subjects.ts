// The subjects on the site, by faculty. Each faculty has its own page (/science,
// /engineering), and its subjects are picked from a menu on that page.

export interface Subject {
  code: string; // e.g. "CPSC"
  name: string; // e.g. "Computer Science"
}

export interface Faculty {
  slug: string; // the page's address, e.g. "science" for /science
  name: string; // the page's title, e.g. "Faculty of Science"
  tab: string; // its short name in the faculty tabs, e.g. "Science"
  about: string; // its full name, under its short name on the home page
  // Whether students in other faculties can usually take its courses. Most engineering courses
  // are for engineering students in practice, even when the calendar doesn't say so, so on
  // other faculties' pages they're a last resort for paths.
  openToAll: boolean;
  subjects: Subject[]; // in the menu's order
  home: string; // the subject shown when the address has no "#", e.g. "CPSC"
}

// Names as the UBC Calendar writes them, in A–Z order. Computer Science opens first because
// it's the only subject with programs, and links to the site from before there was a menu
// should still show it.
export const SCIENCE: Faculty = {
  slug: "science",
  name: "Faculty of Science",
  tab: "Science",
  about: "Faculty of Science",
  openToAll: true,
  subjects: [
    { code: "ASTR", name: "Astronomy" },
    { code: "ATSC", name: "Atmospheric Science" },
    { code: "BIOL", name: "Biology" },
    { code: "CHEM", name: "Chemistry" },
    { code: "CPSC", name: "Computer Science" },
    { code: "DSCI", name: "Data Science" },
    { code: "EOSC", name: "Earth and Ocean Sciences" },
    { code: "ENVR", name: "Environmental Science" },
    { code: "ISCI", name: "Integrated Sciences" },
    { code: "MATH", name: "Mathematics" },
    { code: "MICB", name: "Microbiology" },
    { code: "PHYS", name: "Physics" },
    { code: "SCIE", name: "Science" },
    { code: "STAT", name: "Statistics" },
  ],
  home: "CPSC",
};

// The engineering subjects in the Faculty of Applied Science, plus Engineering Physics (ENPH),
// which the calendar lists under Science but is an engineering degree. Applied Science (APSC)
// opens first: it's first in the menu, and its courses are the first year every engineering
// program shares.
export const ENGINEERING: Faculty = {
  slug: "engineering",
  name: "Engineering",
  tab: "Engineering",
  about: "Faculty of Applied Science",
  openToAll: false,
  subjects: [
    { code: "APSC", name: "Applied Science" },
    { code: "BMEG", name: "Biomedical Engineering" },
    { code: "CHBE", name: "Chemical and Biological Engineering" },
    { code: "CIVL", name: "Civil Engineering" },
    { code: "CPEN", name: "Computer Engineering" },
    { code: "ELEC", name: "Electrical Engineering" },
    { code: "ENPH", name: "Engineering Physics" },
    { code: "ENVE", name: "Environmental Engineering" },
    { code: "IGEN", name: "Integrated Engineering" },
    { code: "MANU", name: "Manufacturing Engineering" },
    { code: "MTRL", name: "Materials Engineering" },
    { code: "MECH", name: "Mechanical Engineering" },
    { code: "MINE", name: "Mining Engineering" },
  ],
  home: "APSC",
};

// Every faculty, in the order of the tabs and the home page.
export const FACULTIES: Faculty[] = [SCIENCE, ENGINEERING];

// The faculty a subject is in, e.g. "CPEN" -> ENGINEERING. Undefined for a subject that
// isn't on the site (WRDS, BIOC, …).
export function facultyOf(subject: string): Faculty | undefined {
  return FACULTIES.find((f) => f.subjects.some((s) => s.code === subject));
}

// "MATH 221" -> "MATH".
export function subjectOf(code: string): string {
  return code.split(" ")[0];
}

// The subject named in the address, e.g. "#math" -> "MATH". Anything else, including no
// "#" at all, gives the faculty's home subject, so old links to the home page still show CPSC.
export function subjectFromHash(hash: string, faculty: Faculty): string {
  const code = hash.replace(/^#/, "").toUpperCase();
  return faculty.subjects.some((s) => s.code === code) ? code : faculty.home;
}

// The other way round: "MATH" -> "#math". The home subject needs nothing.
export function hashFor(code: string, faculty: Faculty): string {
  return code === faculty.home ? "" : `#${code.toLowerCase()}`;
}

// A small script for the top of the page, run before anything is drawn. The page is built
// with the home subject's map, so a link like /#biol would show the CPSC map until React
// takes over and switches. The script marks the page as waiting for that subject
// (<html data-pending-subject="BIOL">), and globals.css hides the menu and the map until
// FacultyView shows it. After 4 seconds it gives up waiting, in case the page's code fails.
export function pendingSubjectScript(faculty: Faculty): string {
  const others = faculty.subjects.map((s) => s.code).filter((code) => code !== faculty.home);
  return (
    "(function(){var c=location.hash.slice(1).toUpperCase();" +
    `if(${JSON.stringify(others)}.indexOf(c)<0)return;` +
    "var r=document.documentElement;r.dataset.pendingSubject=c;" +
    "setTimeout(function(){delete r.dataset.pendingSubject},4000)})();"
  );
}

// A small script for the top of the home page. Links from before there were faculty pages
// look like /#math, and the "#" part never reaches the server, so it's forwarded here, in the
// browser: /#math goes to /science#math. replace() keeps the old address out of the history,
// so the back button doesn't bounce between them. Any other address stays on the home page.
// It runs again if only the "#" changes while the home page is open (pasting /#math into the
// address bar there doesn't load a new page), but not once a faculty's page has taken over.
export function forwardScript(): string {
  const pages: Record<string, string> = {};
  for (const faculty of FACULTIES) {
    for (const s of faculty.subjects) pages[s.code] = faculty.slug;
  }
  return (
    "(function(){var f=function(){var h=location.hash,p=" +
    JSON.stringify(pages) +
    "[h.slice(1).toUpperCase()];" +
    'if(p&&location.pathname==="/")location.replace("/"+p+h)};f();addEventListener("hashchange",f)})();'
  );
}
