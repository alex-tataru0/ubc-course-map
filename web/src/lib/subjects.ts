// The subjects on the site, by faculty. Each faculty gets its own page, and its subjects are
// picked from a menu on that page. For now there's one faculty, on the home page.

export interface Subject {
  code: string; // e.g. "CPSC"
  name: string; // e.g. "Computer Science"
}

export interface Faculty {
  name: string; // e.g. "Faculty of Science"
  subjects: Subject[]; // in the menu's order
  home: string; // the subject shown when the address has no "#", e.g. "CPSC"
}

// Names as the UBC Calendar writes them, in A–Z order. Computer Science opens first because
// it's the only subject with programs, and links to the site from before there was a menu
// should still show it.
export const SCIENCE: Faculty = {
  name: "Faculty of Science",
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
