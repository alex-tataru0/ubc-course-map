import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { displayCode, simplifyTree, splitDescription } from "@/lib/details";
import { recentInstructors, sessionRange } from "@/lib/grades";
import type { Highlight } from "@/lib/highlight";
import { rateMyProfUrl, redditSearchUrl, ubcGradesUrl } from "@/lib/links";
import type { AlsoNeeded, CoursePath } from "@/lib/path";
import { requirementStatus, WONT_TAKE } from "@/lib/progress";
import type { CourseProgress } from "@/lib/progress";
import type { Course, CourseGrades, ReqNode, Requisite } from "@/lib/types";
import { GradeSummary, TeachingHistory } from "./Grades";
import { Swatch } from "./Legend";
import { StatusSample, TickChip } from "./Status";
import { usePanelFocus } from "./usePanelFocus";
import WithLinks from "./WithLinks";

interface CourseDetailsProps {
  course: Course;
  highlight: Highlight; // what the course needs and unlocks on the map
  progress: CourseProgress | undefined; // undefined until some course is marked done
  path: CoursePath | null; // the shortest path here from the courses done
  showPath: boolean; // the map shows just that path
  onShowPath: (on: boolean) => void;
  done: ReadonlySet<string>; // the courses marked done
  onToggle: (code: string) => void; // mark a course done, or unmark it
  subject: string; // the subject of the map shown, e.g. "CPSC"
  onMap: Set<string>; // courses on any subject's map, which can be clicked to open them
  outside: ReadonlySet<string>; // courses on no map that can be ticked (SCIE 113, …)
  grades: CourseGrades | undefined; // from UBCGrades; undefined if it has none for this course
  gradeSessions: string[]; // the terms the grade data covers, oldest first
  calendarUrl: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  focusOnClose: () => HTMLElement | null; // where keyboard focus goes when the panel closes
  backTo?: { label: string; onBack: () => void }; // a link back to the panel underneath
}

// The panel that opens when a course is clicked: beside the graph on wide screens,
// covering it on phones.
export default function CourseDetails({
  course,
  highlight,
  progress,
  path,
  showPath,
  onShowPath,
  done,
  onToggle,
  subject,
  onMap,
  outside,
  grades,
  gradeSessions,
  calendarUrl,
  onSelect,
  onClose,
  focusOnClose,
  backTo,
}: CourseDetailsProps) {
  const { summary, hours } = splitDescription(course.description);
  const count = (n: number) => `${n} ${n === 1 ? "course" : "courses"}`;
  const { needs, unlocks } = highlight;
  const links = { onMap, onSelect, done, outside, onToggle };
  const isDone = done.has(course.code);
  // No path once the course is done, or for a course you wouldn't take (CPSC 103 or 107 after 110).
  const hasPath = path !== null && path.terms.length > 0 && !(progress && WONT_TAKE.has(progress.status));

  // The panel scrolls on its own. A newly picked course starts at the top, not wherever the
  // last one was scrolled to.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [course.code]);
  const headingRef = usePanelFocus(course.code, focusOnClose);

  return (
    <aside
      ref={panelRef}
      className="absolute inset-0 z-10 overflow-y-auto bg-surface p-5 text-sm md:static md:w-96 md:shrink-0 md:border-l md:border-line"
    >
      {backTo && (
        <button
          type="button"
          onClick={backTo.onBack}
          className="mb-3 text-xs font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          <span aria-hidden>← </span>
          Back to {backTo.label}
        </button>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
            <Swatch className="border-role-selected" />
            {course.code}
          </h2>
          <p className="text-ink-muted">{course.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded px-2 text-2xl leading-none text-ink-muted hover:bg-canvas"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {course.credits} credits
        {hours && ` · Hours per week (lecture-lab-tutorial): ${hours}`}
      </p>

      <button
        type="button"
        onClick={() => onToggle(course.code)}
        aria-pressed={isDone}
        className={`mt-3 rounded-md border px-3 py-1.5 font-medium ${
          isDone ? "border-ink bg-ink text-canvas hover:opacity-90" : "border-line hover:bg-canvas"
        }`}
      >
        {isDone ? "✓ Done · click to unmark" : "Mark as done"}
      </button>
      {progress && <StatusNote course={course} progress={progress} done={done} />}

      {/* The key for the colours on the map, so they never carry meaning on their own,
          and the switch between every course it could need and just your path. */}
      <div className="mt-3 space-y-1 rounded-lg border border-line p-3">
        <p>
          <Swatch className="border-role-needs" />
          {highlight.kind === "path"
            ? needs.size === 0
              ? "Your path: nothing to take first"
              : `Your path: ${count(needs.size)} to take first`
            : needs.size === 0
              ? `No prerequisites in ${subject}`
              : `Needs ${count(needs.size)} in ${subject}`}
        </p>
        <p>
          <Swatch className="border-role-unlocks" />
          {unlocks.size === 0 ? `Doesn't lead to other ${subject} courses` : `Unlocks ${count(unlocks.size)}`}
        </p>
        {hasPath && (
          <label className="flex cursor-pointer items-center gap-2 pt-1">
            <input
              type="checkbox"
              role="switch"
              checked={showPath}
              onChange={(event) => onShowPath(event.target.checked)}
              className="h-4 w-4 accent-role-needs"
            />
            Show only my path on the map
          </label>
        )}
      </div>

      <p className="mt-4 leading-relaxed">
        <WithLinks text={summary} />
      </p>

      {hasPath && <PathView course={course} path={path} {...links} />}

      <Section title="Prerequisites">
        {course.prereq ? <RequisiteView requisite={course.prereq} {...links} /> : <p>None</p>}
        {course.recommended && (
          // Advice, not a requirement, so it doesn't change the course's status.
          <p className="mt-3">
            <span className="font-medium">Recommended, not required:</span> {course.recommended}.
          </p>
        )}
      </Section>
      {course.coreq && (
        <Section title="Corequisites (before or at the same time)">
          <RequisiteView requisite={course.coreq} {...links} />
        </Section>
      )}
      {course.equivalency && (
        <Section title="Equivalent courses">
          <p>{course.equivalency}. Credit is given for only one of them.</p>
        </Section>
      )}

      <Section title="Grades" note={`${sessionRange(gradeSessions)}, from UBCGrades`}>
        {grades ? (
          <GradeSummary grades={grades} />
        ) : (
          <p className="text-ink-muted">UBCGrades has no grades for this course in these terms.</p>
        )}
      </Section>
      {grades && (
        <Section title="Teaching history">
          <TeachingHistory course={course} terms={grades.terms} />
        </Section>
      )}

      <Links course={course} subject={subject} grades={grades} calendarUrl={calendarUrl} />
    </aside>
  );
}

// The last section: searches and pages on other sites about this course, then a Rate My
// Professors search for everyone who has taught it. These are only links; the site never
// fetches anything from Reddit or Rate My Professors.
function Links({
  course,
  subject,
  grades,
  calendarUrl,
}: {
  course: Course;
  subject: string;
  grades: CourseGrades | undefined;
  calendarUrl: string;
}) {
  const instructors = grades ? recentInstructors(grades.terms) : [];
  return (
    <Section title="Links">
      <ul className="space-y-1.5">
        <li>
          <ExternalLink href={redditSearchUrl(course.code)}>Search r/ubc for {course.code}</ExternalLink>
        </li>
        {grades && (
          <li>
            <ExternalLink href={ubcGradesUrl(course.code)}>{course.code} on UBCGrades</ExternalLink>
          </li>
        )}
        <li>
          <ExternalLink href={calendarUrl}>All {subject} courses in the UBC Academic Calendar</ExternalLink>
        </li>
      </ul>
      {instructors.length > 0 && (
        <>
          <p id="rmp-label" className="mt-4 mb-1.5 text-xs text-ink-muted">
            Instructors on Rate My Professors:
          </p>
          <ul aria-labelledby="rmp-label" className="flex flex-wrap gap-1.5">
            {instructors.map((name) => (
              <li key={name}>
                <a
                  href={rateMyProfUrl(name)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-full border border-line px-2.5 py-0.5 text-[13px] hover:bg-canvas"
                >
                  {name}
                  <span aria-hidden> ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

// Opens in a new tab. The arrow is only a visual hint, so screen readers skip it.
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink-muted">
      {children}
      <span aria-hidden> ↗</span>
    </a>
  );
}

// What the course's status means for you, in a sentence, with what to check if anything.
function StatusNote({
  course,
  progress,
  done,
}: {
  course: Course;
  progress: CourseProgress;
  done: ReadonlySet<string>;
}) {
  // A coreq that isn't done yet doesn't stop you: you can take it at the same time.
  const { coreq } = course;
  const coreqPending = coreq !== null && requirementStatus(coreq.tree, done) !== "met";
  const { status } = progress;
  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <p>
        <StatusSample status={status} />
        {status === "done" && <strong>You&apos;ve finished this course.</strong>}
        {status === "can-take" && (
          <>
            <strong>You can take this.</strong> Its prerequisites are done.
          </>
        )}
        {status === "check" && (
          <>
            <strong>Check first.</strong> Your courses can&apos;t tell us if you meet:
          </>
        )}
        {status === "locked" && (
          <>
            <strong>Not yet.</strong> Some prerequisites below aren&apos;t done.
          </>
        )}
        {status === "no-credit" && (
          <>
            <strong>No credit.</strong> You&apos;ve done {progress.excludedBy.join(" and ")}, which
            covers this course.
          </>
        )}
        {status === "not-needed" && (
          <>
            <strong>Not needed.</strong> It needs {progress.blockedBy.join(" or ")}, which{" "}
            {progress.blockedBy.length === 1 ? "isn't" : "aren't"} for students with{" "}
            {progress.excludedBy.join(" or ")}.
          </>
        )}
      </p>
      {status === "check" && (
        <ul className="mt-1 ml-5 list-disc space-y-1">
          {progress.toCheck.map((item) => (
            <li key={item}>
              <WithLinks text={item} />
            </li>
          ))}
        </ul>
      )}
      {coreqPending && (status === "can-take" || status === "check") && (
        <p className="mt-2 text-ink-muted">
          Take {coreq.text.replace(/^One of/, "one of")} before or at the same time.
        </p>
      )}
    </div>
  );
}

// The shortest path here from the courses done (see lib/path.ts): the courses term by term,
// in any subject, then anything else it needs. Courses are links or tick boxes, like in the
// requirement lists.
function PathView({ course, path, ...links }: { course: Course; path: CoursePath } & Links) {
  const before = path.terms.flat().length - 1; // courses to take before this one
  return (
    <Section title="Your path here">
      <p className="text-ink-muted">
        {before === 0
          ? "No other courses needed first."
          : `${before} ${before === 1 ? "course" : "courses"} first. Courses in the same term can be taken together.`}
      </p>
      <ol className="mt-2 space-y-1.5">
        {path.terms.map((codes, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-14 shrink-0 text-xs font-medium text-ink-muted">Term {i + 1}</span>
            {codes.map((code) =>
              code === course.code ? (
                <span key={code} className="font-mono text-xs font-semibold">
                  {code} (this course)
                </span>
              ) : (
                <CourseCode key={code} code={code} {...links} />
              ),
            )}
          </li>
        ))}
      </ol>
      {path.also.length > 0 && (
        <>
          <p className="mt-3 font-medium">Also needed</p>
          <ul className="mt-1 ml-5 list-disc space-y-1.5">
            {path.also.map((item, i) => (
              <li key={i}>
                <AlsoItem item={item} {...links} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function AlsoItem({ item, ...links }: { item: AlsoNeeded } & Links) {
  if (item.kind === "course") return <CourseCode code={item.code} {...links} />;
  if (item.kind === "check") {
    return (
      <span>
        Check: <WithLinks text={item.text} />
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      One of:
      {item.codes.map((code) => (
        <CourseCode key={code} code={code} {...links} />
      ))}
    </span>
  );
}

// A titled part of the panel. The note is a short aside after the title, in grey.
function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-line pt-4">
      <h3 className="mb-2 font-semibold">
        {title}
        {note && <span className="font-normal text-ink-muted"> · {note}</span>}
      </h3>
      {children}
    </section>
  );
}

interface Links {
  onMap: Set<string>; // courses on any subject's map
  onSelect: (code: string) => void; // opens a course, on its own subject's map
  done: ReadonlySet<string>; // finished courses get a tick in the requirement list
  outside: ReadonlySet<string>; // courses on no map, shown with a tick box
  onToggle: (code: string) => void;
}

// The requirement as a tree, then the calendar's own wording, so nothing is hidden
// if the tree reads it wrong.
function RequisiteView({ requisite, ...links }: { requisite: Requisite } & Links) {
  return (
    <>
      <Requirement node={simplifyTree(requisite.tree)} {...links} />
      <p className="mt-3 text-xs text-ink-muted">
        Calendar wording: “<WithLinks text={requisite.text} />”
        {requisite.source === "llm" && " (turned into the list above by AI, then checked automatically)"}
      </p>
    </>
  );
}

// One node of a requirement tree. Groups become "All of" / "One of" lists.
function Requirement({ node, ...links }: { node: ReqNode } & Links) {
  if (typeof node === "string") return <CourseCode code={node} {...links} />;
  if ("course" in node) {
    return (
      <span>
        <CourseCode code={node.course} {...links} /> with {node.min_grade}% or higher
      </span>
    );
  }
  if ("other" in node) {
    return (
      <span>
        <WithLinks text={node.other} />
      </span>
    );
  }

  const [label, items] = "one_of" in node ? ["One of:", node.one_of] : ["All of:", node.all_of];
  return (
    <div>
      <span className="font-medium">{label}</span>
      <ul className="mt-1 ml-5 list-disc space-y-1">
        {items.map((child, i) => (
          <li key={i}>
            <Requirement node={child} {...links} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// A course code. Courses on a map are buttons that open them, switching to their subject's
// map if needed (MATH 221 from CPSC 340). Courses on no map (SCIE 113, …) have a tick box to
// mark them done. Okanagan codes are plain text.
function CourseCode({ code, onMap, onSelect, done, outside, onToggle }: { code: string } & Links) {
  const tick = done.has(code) ? "✓ " : "";
  if (!onMap.has(code) && outside.has(code)) {
    return <TickChip code={code} checked={done.has(code)} onToggle={() => onToggle(code)} />;
  }
  if (!onMap.has(code)) {
    return <span className="font-mono text-xs">{displayCode(code)}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(code)}
      aria-label={done.has(code) ? `${code} (done)` : undefined}
      className="rounded border border-line px-1.5 py-0.5 font-mono text-xs hover:bg-canvas"
    >
      {tick}
      {code}
    </button>
  );
}
