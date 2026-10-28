// The subjects on the site, by faculty. Each faculty has its own page (/science,
// /engineering, /arts), and its subjects are picked from a menu on that page.

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
  degree: string; // e.g. "Bachelor of Science", shown with its programs
  programFiles: string[]; // its programs, from data/programs/<name>.json
  programsNote: string; // under the list of its programs: what's there and what isn't yet
  // How its programs are listed: by major, where a major with several paths opens to show
  // them (Computer Science), or every program as its own button (engineering).
  programsByMajor: boolean;
  subjects: Subject[]; // in the menu's order
  home: string; // the subject shown when the address has no "#", e.g. "CPSC"
  // The picture shown when a link to the page is pasted in a chat or post: one of its maps
  // with a course picked, 1200×630, in web/public.
  preview: { image: string; alt: string };
}

// Names as the UBC Calendar writes them, in A–Z order. Computer Science opens first because
// links to the site from before there was a menu should still show it. Cognitive Systems is
// interdisciplinary (it has a B.A. and a B.Sc.), but the calendar lists it under Science.
// The calendar calls it "Cognitive Systems Program"; the menu leaves out "Program".
export const SCIENCE: Faculty = {
  slug: "science",
  name: "Faculty of Science",
  tab: "Science",
  about: "Faculty of Science",
  openToAll: true,
  degree: "Bachelor of Science",
  // The first file's calendar page (the Bachelor of Science section) is the one the picker links to.
  programFiles: ["science", "cpsc"],
  programsByMajor: true,
  programsNote:
    "The Majors, Honours and Combined Majors and Honours with their own course lists in the " +
    "calendar's Bachelor of Science section, for students starting now. Not here: Integrated " +
    "Sciences, combined honours with \"another Science subject\", and dual degrees.",
  subjects: [
    { code: "ASTR", name: "Astronomy" },
    { code: "ATSC", name: "Atmospheric Science" },
    { code: "BIOL", name: "Biology" },
    { code: "CHEM", name: "Chemistry" },
    { code: "COGS", name: "Cognitive Systems" },
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
  preview: {
    image: "/og.png",
    alt: "The CPSC map with CPSC 340 picked and the courses it needs highlighted in orange",
  },
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
  degree: "Bachelor of Applied Science",
  programFiles: ["engineering"],
  programsByMajor: false,
  programsNote:
    "The 14 engineering majors at UBC Vancouver, for students starting now.",
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
  preview: {
    image: "/og-engineering.png",
    alt:
      "The CPEN map with CPEN 331 picked, the courses it needs highlighted in orange and the " +
      "ones it unlocks in green",
  },
};

// The first Arts subjects, with one Major for each (WRDS only has a Minor). Economics opens
// first: its map has the most prerequisites (ECON 101 and 102 lead to most of it).
export const ARTS: Faculty = {
  slug: "arts",
  name: "Faculty of Arts",
  tab: "Arts",
  about: "Faculty of Arts",
  openToAll: true,
  degree: "Bachelor of Arts",
  programFiles: ["arts"],
  programsByMajor: false,
  programsNote:
    "One Major for each subject, for students starting now, written out from the calendar. Not " +
    "here yet: Honours, Combined Majors, the other Majors (such as English's Language emphases), " +
    "and the Faculty of Arts requirements (writing, breadth and Arts credits).",
  subjects: [
    { code: "ANTH", name: "Anthropology" },
    { code: "ECON", name: "Economics" },
    { code: "ENGL", name: "English" },
    { code: "GEOG", name: "Geography" },
    { code: "HIST", name: "History" },
    { code: "LING", name: "Linguistics" },
    { code: "PHIL", name: "Philosophy" },
    { code: "POLI", name: "Political Science" },
    { code: "PSYC", name: "Psychology" },
    { code: "SOCI", name: "Sociology" },
    { code: "WRDS", name: "Writing, Research, and Discourse Studies" },
  ],
  home: "ECON",
  preview: {
    image: "/og-arts.png",
    alt:
      "The ECON map with ECON 326 picked, the courses it needs highlighted in orange and the " +
      "ones it unlocks in green",
  },
};

// Every faculty, in the order of the tabs and the home page.
export const FACULTIES: Faculty[] = [SCIENCE, ENGINEERING, ARTS];

// The faculty a subject is in, e.g. "CPEN" -> ENGINEERING. Undefined for a subject that
// isn't on the site (BIOC, COMR, …).
export function facultyOf(subject: string): Faculty | undefined {
  return FACULTIES.find((f) => f.subjects.some((s) => s.code === subject));
}

// "MATH 221" -> "MATH".
export function subjectOf(code: string): string {
  return code.split(" ")[0];
}

// What the address names: a subject, and maybe one of its courses, open in the side panel.
export interface Address {
  subject: string; // e.g. "MATH"
  course: string | null; // e.g. "MATH 221"
}

// "#math" or "#math-221", in any case. Groups: the subject, then the course number, if any.
const HASH = /^#?([a-z]{2,4})(?:-(\d{3}[a-z]?))?$/i;

// The subject and course in the address: "#math" is the MATH map, "#math-221" the MATH map
// with MATH 221 open. Anything else, including no "#" at all or another faculty's subject,
// gives the faculty's home subject and no course, so old links to a page still show its map.
export function readHash(hash: string, faculty: Faculty): Address {
  const match = hash.match(HASH);
  const subject = match?.[1].toUpperCase() ?? "";
  if (!faculty.subjects.some((s) => s.code === subject)) return { subject: faculty.home, course: null };
  return { subject, course: match?.[2] ? `${subject} ${match[2].toUpperCase()}` : null };
}

// Just the subject, e.g. "#math-221" -> "MATH".
export function subjectFromHash(hash: string, faculty: Faculty): string {
  return readHash(hash, faculty).subject;
}

// The other way round: "MATH" -> "#math", or with a course open, "#math-221". The home
// subject with nothing open needs no "#".
export function hashFor(subject: string, faculty: Faculty, course: string | null = null): string {
  if (course) return `#${course.replace(" ", "-").toLowerCase()}`;
  return subject === faculty.home ? "" : `#${subject.toLowerCase()}`;
}

// Where a course on another faculty's page can be opened: its address there, and the page's
// short name for the link's label. Null for courses on this page, or with no data.
export type Elsewhere = (code: string) => { url: string; page: string } | null;

// The address of a course on its faculty's page, e.g. "CPEN 221" -> "/engineering#cpen-221".
// Null for a subject that isn't on the site.
export function courseUrl(code: string): string | null {
  const faculty = facultyOf(subjectOf(code));
  return faculty ? `/${faculty.slug}${hashFor(subjectOf(code), faculty, code)}` : null;
}

// A small script for the top of the page, run before anything is drawn. The page is built
// with the home subject's map, so a link like /#biol would show the CPSC map until React
// takes over and switches. The script marks the page as waiting for that subject
// (<html data-pending-subject="BIOL">), and globals.css hides the menu and the map until
// FacultyView shows it. After 4 seconds it gives up waiting, in case the page's code fails.
export function pendingSubjectScript(faculty: Faculty): string {
  const others = faculty.subjects.map((s) => s.code).filter((code) => code !== faculty.home);
  return (
    // "#biol" or "#biol-200": the subject is the part before the "-".
    '(function(){var c=location.hash.slice(1).split("-")[0].toUpperCase();' +
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
    '[h.slice(1).split("-")[0].toUpperCase()];' +
    'if(p&&location.pathname==="/")location.replace("/"+p+h)};f();addEventListener("hashchange",f)})();'
  );
}
