// The subjects on the site, by faculty. Each faculty gets its own page, and its subjects are
// picked from a menu on that page. For now there's one faculty, on the home page.

export interface Subject {
  code: string; // e.g. "CPSC"
  name: string; // e.g. "Computer Science"
}

export interface Faculty {
  name: string; // e.g. "Faculty of Science"
  subjects: Subject[]; // the first one is shown when the page opens
}

export const SCIENCE: Faculty = {
  name: "Faculty of Science",
  subjects: [
    { code: "CPSC", name: "Computer Science" },
    { code: "MATH", name: "Mathematics" },
    { code: "STAT", name: "Statistics" },
  ],
};

// "MATH 221" -> "MATH".
export function subjectOf(code: string): string {
  return code.split(" ")[0];
}

// The subject named in the address, e.g. "#math" -> "MATH". Anything else, including no
// "#" at all, gives the first subject, so old links to the home page still show CPSC.
export function subjectFromHash(hash: string, subjects: Subject[]): string {
  const code = hash.replace(/^#/, "").toUpperCase();
  return subjects.some((s) => s.code === code) ? code : subjects[0].code;
}

// The other way round: "MATH" -> "#math". The first subject needs nothing.
export function hashFor(code: string, subjects: Subject[]): string {
  return code === subjects[0].code ? "" : `#${code.toLowerCase()}`;
}
