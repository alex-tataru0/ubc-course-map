import { buildGraph, descendants, prereqCourses } from "./graph";
import { exclusionsOf, requirementStatus, restrictionOf } from "./progress";
import type { Course, ReqNode } from "./types";

// Something a path needs besides the CPSC courses on the map.
export type AlsoNeeded =
  | { kind: "course"; code: string } // a course not on the map, e.g. MATH 200
  | { kind: "one-of"; codes: string[] } // pick one, e.g. MATH 152, MATH 221 or MATH 223
  | { kind: "check"; text: string }; // can't be checked from courses, e.g. "Third-year standing"

export interface CoursePath {
  // The courses still to take, by term: terms[0] can all be taken now, terms[1] once those
  // are done, and so on. The target is in the last term. Empty if the target is done.
  terms: string[][];
  also: AlsoNeeded[];
}

// A plan for part of a requirement tree: the courses on the map to take, what else it needs,
// and how many courses not on the map it asks for (we don't know what those need, so a
// plan that uses them is a last resort).
interface Plan {
  courses: Set<string>;
  also: AlsoNeeded[];
  outside: number;
}

const EMPTY: Plan = { courses: new Set(), also: [], outside: 0 };

// The shortest path from the courses done to `target`, using the courses on the map.
// In each "one of", it picks the option that needs the fewest new courses, counting courses
// already picked for other parts of the path. Options that need courses not on the map come
// last. In a tie, a course that's "not for students with credit for" another option loses
// to it (CPSC 103 to CPSC 110), and then the course that unlocks more wins.
// Courses not on the map that the path can't avoid go in `also`, as do non-course
// requirements, minimum grades and "Restricted to …" sentences.
export function planPath(target: string, courses: Course[], done: ReadonlySet<string>): CoursePath {
  const byCode = new Map(courses.map((c) => [c.code, c]));
  if (!byCode.has(target) || done.has(target)) return { terms: [], also: [] };

  const { edges } = buildGraph(courses);
  const unlocks = (code: string) => descendants(code, edges).size;

  // Plans `code` and everything it needs, given the courses in `have` (done or already planned).
  function planCourse(code: string, have: ReadonlySet<string>): Plan {
    const course = byCode.get(code)!;
    let plan: Plan = { courses: new Set([code]), also: [], outside: 0 };
    const restriction = restrictionOf(course.description);
    if (restriction) plan.also.push({ kind: "check", text: restriction });
    for (const requisite of [course.prereq, course.coreq]) {
      if (requisite) plan = merge(plan, planNode(requisite.tree, union(have, plan.courses)));
    }
    return plan;
  }

  function planNode(node: ReqNode, have: ReadonlySet<string>): Plan {
    if (typeof node === "string") return planCode(node, have);
    if ("course" in node) {
      const grade: AlsoNeeded = { kind: "check", text: `${node.min_grade}% or higher in ${node.course}` };
      const plan = planCode(node.course, have);
      return { ...plan, also: [...plan.also, grade] };
    }
    if ("other" in node) return { ...EMPTY, also: [{ kind: "check", text: node.other }] };
    if ("all_of" in node) {
      let plan = EMPTY;
      for (const child of node.all_of) plan = merge(plan, planNode(child, union(have, plan.courses)));
      return plan;
    }
    return planOneOf(node.one_of, have);
  }

  function planCode(code: string, have: ReadonlySet<string>): Plan {
    if (have.has(code)) return EMPTY;
    if (byCode.has(code)) return planCourse(code, have);
    return { courses: new Set(), also: [{ kind: "course", code }], outside: 1 };
  }

  function planOneOf(choices: ReqNode[], have: ReadonlySet<string>): Plan {
    if (choices.some((choice) => requirementStatus(choice, have) === "met")) return EMPTY;
    // Okanagan courses are only an option when there's nothing else.
    const vancouver = choices.filter((choice) => !isOkanagan(choice));
    const options = (vancouver.length > 0 ? vancouver : choices).map((choice) => planNode(choice, have));
    const best = options.reduce((a, b) => (better(b, a) ? b : a));
    if (best.courses.size > 0) return best;

    // The best option needs no courses on the map: it's a course from another subject or
    // something to check. List every option that's just as good together, since we can't
    // choose between them for you (e.g. one of MATH 152, MATH 221 or MATH 223).
    const ties = options.filter((option) => option.courses.size === 0 && option.outside === best.outside);
    return { ...best, also: [combine(ties.flatMap((option) => option.also))] };
  }

  // Is plan `a` better than plan `b`? Fewer courses not on the map, then fewer courses,
  // then not the lesser alternative, then courses that unlock more.
  function better(a: Plan, b: Plan): boolean {
    if (a.outside !== b.outside) return a.outside < b.outside;
    if (a.courses.size !== b.courses.size) return a.courses.size < b.courses.size;
    const aLesser = isLesser(a, b);
    if (aLesser !== isLesser(b, a)) return !aLesser;
    return score(a) > score(b);
  }

  // Does a course in plan `a` say it's not for students with credit for a course in plan `b`?
  function isLesser(a: Plan, b: Plan): boolean {
    for (const code of a.courses) {
      const excluded = exclusionsOf(byCode.get(code)!.description);
      if (excluded.some((other) => b.courses.has(other))) return true;
    }
    return false;
  }

  function score(plan: Plan): number {
    let total = 0;
    for (const code of plan.courses) total += unlocks(code);
    return total;
  }

  const plan = planCourse(target, done);
  return { terms: inTerms(plan.courses, byCode), also: unique(plan.also) };
}

function isOkanagan(node: ReqNode): boolean {
  const code = typeof node === "string" ? node : "course" in node ? node.course : null;
  return code !== null && code.includes("_O ");
}

function union(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  return new Set([...a, ...b]);
}

function merge(a: Plan, b: Plan): Plan {
  return {
    courses: union(a.courses, b.courses),
    also: [...a.also, ...b.also],
    outside: a.outside + b.outside,
  };
}

// Several "also needed" options that are alternatives, as one item:
// courses become a "one of" list; anything with a check becomes one sentence joined by "or".
function combine(items: AlsoNeeded[]): AlsoNeeded {
  if (items.length === 1) return items[0];
  if (items.every((item) => item.kind === "course")) {
    return { kind: "one-of", codes: items.map((item) => item.code) };
  }
  const words = items.map((item) =>
    item.kind === "course" ? item.code : item.kind === "check" ? item.text : item.codes.join(" or "),
  );
  return { kind: "check", text: words.join(" or ") };
}

// Drops repeats, and a check that's the start of a longer one (CPSC 299 and 298 both say
// "Restricted to students admitted to the Co-operative Education…", one more fully).
function unique(items: AlsoNeeded[]): AlsoNeeded[] {
  const seen = new Set<string>();
  const texts = items.flatMap((item) => (item.kind === "check" ? [item.text] : []));
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    if (item.kind !== "check") return true;
    return !texts.some((text) => text !== item.text && text.startsWith(item.text));
  });
}

// Splits the planned courses into terms. A course goes in the term after the latest of its
// planned prereqs, and no earlier than its planned coreqs (which can be taken alongside it).
function inTerms(planned: Set<string>, byCode: Map<string, Course>): string[][] {
  const term = new Map<string, number>();

  function termOf(code: string, visiting: Set<string>): number {
    const known = term.get(code);
    if (known !== undefined) return known;
    if (visiting.has(code)) return 0; // a loop in the data; shouldn't happen
    visiting.add(code);
    const course = byCode.get(code)!;
    let result = 0;
    for (const [requisite, gap] of [[course.prereq, 1], [course.coreq, 0]] as const) {
      if (!requisite) continue;
      for (const other of prereqCourses(requisite.tree).keys()) {
        if (planned.has(other) && other !== code) result = Math.max(result, termOf(other, visiting) + gap);
      }
    }
    term.set(code, result);
    return result;
  }

  const terms: string[][] = [];
  for (const code of [...planned].sort()) {
    const t = termOf(code, new Set());
    (terms[t] ??= []).push(code);
  }
  return terms.filter((t) => t !== undefined);
}
