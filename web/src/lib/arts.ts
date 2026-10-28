import type { CreditsFor, RowStatus } from "./program";
import { FACULTIES } from "./subjects";
import type { ArtsDegree, Program } from "./types";

// The Faculty of Arts requirements that every B.A. program shares, on top of the program's own
// rows: Writing and Research, Ways of Knowing (Place and Power and the breadth areas), Outside,
// Upper-level and Arts Credit Minimum. The calendar's details come from data/arts-degree.json
// (pipeline/arts_degree.py). Like the Faculty of Science's rules, these don't claim courses:
// one course can count for the program and for several of these.

const level = (code: string) => Number(code.split(" ")[1].slice(0, 3));
const subject = (code: string) => code.split(" ")[0];

// Every subject with a map on the site. Only their courses can be ticked.
const ON_SITE = new Set(FACULTIES.flatMap((f) => f.subjects.map((s) => s.code)));

// The calendar's tables give these by kind of program. A Combined Major's outside credits must
// be outside both its subjects. (Honours aren't on the site yet.)
const outsideKind = (program: Program) => (program.subjects ? "Honours or Combined Major" : "Major");
const UPPER_LEVEL_KIND = "Major, Combined Major or IDST";

// One breadth area outside the Major's, with the subject that counts the most credits in it.
export interface AreaProgress {
  name: string;
  need: number; // 9, 6 or 3
  subject: string | null; // e.g. "PHIL", null while none of its courses is done
  credits: number; // in that subject, up to `need`
  onSite: boolean; // whether any of its subjects is on the site, so its courses can be ticked
}

// One of the rules, ready to show: how far along it is, and what fills it.
export interface ArtsRow {
  title: string;
  status: RowStatus;
  progress: string | null; // e.g. "21 of 60 cr"
  counted: string[]; // for a choice of courses, the one that counts
  options: string[]; // courses that would fill it, while it isn't done
  areas: AreaProgress[] | null; // for Ways of Knowing breadth
  check: string | null; // what to check yourself
  link: string | null; // where to check it
}

const statusOf = (have: number, need: number): RowStatus => (have >= need ? "done" : have > 0 ? "partial" : "todo");

// The breadth area a subject is in, e.g. "ECON" -> "Social and Behavioural Systems".
export function areaOf(code: string, degree: ArtsDegree): string | undefined {
  return degree.areas.find((area) => area.subjects.includes(code))?.name;
}

// Every order of the items, e.g. [9, 6, 3] -> [9, 6, 3], [9, 3, 6], [6, 9, 3], …
function orders(items: number[]): number[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

// Ways of Knowing breadth: the Major's own area is skipped, and the other three get 9, 6 and 3
// credits, each in one subject. `courses` are the finished courses that can count (not the
// Writing course). Each area's best subject is the one with the most credits; the 9, 6 and 3 go
// to the areas in the order that counts the most credits. On a tie, the smaller amounts go to
// areas with nothing on the site, since those are left to check yourself.
export function breadthAreas(
  majorArea: string | undefined,
  degree: ArtsDegree,
  courses: string[],
  creditsFor: CreditsFor,
): AreaProgress[] {
  const areas = degree.areas
    .filter((area) => area.name !== majorArea)
    .map((area) => {
      const bySubject = new Map<string, number>();
      for (const code of courses.filter((c) => area.subjects.includes(subject(c)))) {
        bySubject.set(subject(code), (bySubject.get(subject(code)) ?? 0) + creditsFor(code));
      }
      // The subject with the most credits; on a tie, the first in alphabetical order.
      const [best, credits] = [...bySubject].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [null, 0];
      return { name: area.name, subject: best, have: credits, onSite: area.subjects.some((s) => ON_SITE.has(s)) };
    });
  const score = (needs: number[]) => [
    areas.reduce((sum, area, i) => sum + Math.min(area.have, needs[i]), 0),
    -areas.reduce((sum, area, i) => sum + (area.onSite ? 0 : needs[i]), 0),
  ];
  let best = degree.breadth_credits;
  for (const needs of orders(degree.breadth_credits)) {
    const [a, b] = [score(needs), score(best)];
    if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) best = needs;
  }
  return areas.map((area, i) => ({
    name: area.name,
    need: best[i],
    subject: area.subject,
    credits: Math.min(area.have, best[i]),
    onSite: area.onSite,
  }));
}

export function artsRows(
  program: Program,
  degree: ArtsDegree,
  done: ReadonlySet<string>,
  creditsFor: CreditsFor,
): ArtsRow[] {
  const courses = [...done].sort();
  const credits = (codes: string[]) => codes.reduce((sum, code) => sum + creditsFor(code), 0);
  const row = (title: string, status: RowStatus, more: Partial<ArtsRow> = {}): ArtsRow => ({
    title, status, progress: null, counted: [], options: [], areas: null, check: null, link: null, ...more,
  });
  const creditRow = (title: string, codes: string[], need: number) => {
    const have = credits(codes);
    return row(title, statusOf(have, need), { progress: `${Math.min(have, need)} of ${need} cr` });
  };
  // A choice of courses: done with the first one finished, otherwise the courses to pick from.
  const choiceRow = (title: string, options: string[]) => {
    const taken = options.filter((code) => done.has(code));
    return row(title, taken.length > 0 ? "done" : "todo", {
      counted: taken.slice(0, 1),
      options: taken.length > 0 ? [] : options,
    });
  };

  // The calendar also lists Arts One, which isn't a course code here.
  const writing = choiceRow("Writing: one of these courses, or Arts One", degree.writing.courses);

  const research = degree.research.find((r) => r.major === program.research);

  const field = new Set(program.field ?? []);
  const majorArea = program.field ? areaOf(program.field[0], degree) : undefined;
  // The course used for Writing can't also count for breadth.
  const areas = breadthAreas(majorArea, degree, courses.filter((code) => !writing.counted.includes(code)), creditsFor);
  const breadthNeed = areas.reduce((sum, area) => sum + area.need, 0);
  const breadthHave = areas.reduce((sum, area) => sum + area.credits, 0);
  const unmet = areas.filter((area) => area.credits < area.need);
  const offSite = unmet.filter((area) => !area.onSite);

  const outsideNeed = degree.outside[outsideKind(program)];
  const fieldNames = [...field].join(" and ");

  return [
    writing,
    research && research.courses.length > 0
      ? choiceRow("A research-intensive course", research.courses)
      : row("A research-intensive course", "check", { check: research?.text ?? "Ask your department which courses count." }),
    row(`Ways of Knowing breadth: ${degree.breadth_credits.join(", ")} credits in one subject each`,
      breadthHave >= breadthNeed ? "done" : unmet.length === offSite.length ? "check" : statusOf(breadthHave, breadthNeed), {
      progress: `${breadthHave} of ${breadthNeed} cr`,
      areas,
      check:
        offSite.length === 0
          ? null
          : offSite.map((area) => `${area.name} subjects aren't on this site yet: check those ${area.need} credits yourself.`).join(" "),
    }),
    row("Place and Power: 3 credits", "check", {
      check: "Its course list is on the Faculty of Arts website. A course here can also count for the Major.",
      link: degree.place_and_power,
    }),
    creditRow(`Credits outside ${fieldNames}`, courses.filter((code) => !field.has(subject(code))), outsideNeed),
    creditRow("Credits numbered 300 or higher", courses.filter((code) => level(code) >= 300), degree.upper_level[UPPER_LEVEL_KIND]),
    creditRow("Arts credits", courses.filter((code) => degree.arts_subjects.includes(subject(code))), degree.arts_credits),
  ];
}
