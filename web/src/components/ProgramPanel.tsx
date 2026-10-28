import { useEffect, useId, useMemo, useRef, useState } from "react";
import { programMajors, programSummary, treeCourses } from "@/lib/program";
import type { CreditsFor, Major, RowProgress, RowStatus } from "@/lib/program";
import { facultyOf, SCIENCE } from "@/lib/subjects";
import type { Elsewhere } from "@/lib/subjects";
import type { ArtsDegree, Program, ProgramRequirement } from "@/lib/types";
import { scienceRows } from "@/lib/science";
import type { ScienceRow } from "@/lib/science";
import { useSavedFacts } from "@/lib/savedFacts";
import { QuickFacts } from "./FactsChecklist";
import { StripeSample } from "./ProgramStripe";
import { TickChip } from "./Status";
import { usePanelFocus } from "./usePanelFocus";

// What the course chips in the panel need: on-map courses open their details, the others
// (MATH 100, SCIE 113, …) have a tick box.
interface CodeLinks {
  onMap: ReadonlySet<string>;
  onOpen: (code: string) => void;
  elsewhere: Elsewhere; // courses on another faculty's page also link there
  done: ReadonlySet<string>;
  onToggle: (code: string) => void;
}

interface ProgramPanelProps extends CodeLinks {
  subject: string; // the map's subject: its programs start open in the list
  programs: Program[];
  program: Program | null; // null until one is picked
  progress: RowProgress[][] | null; // progress through each requirement row of `program`
  creditsFor: CreditsFor;
  artsDegree: ArtsDegree; // the Faculty of Arts requirements, and which subjects are Arts
  calendarUrl: string; // the calendar page the programs come from
  note: string; // under the list of programs: what's there and what isn't yet
  byMajor: boolean; // one entry per major, opening to its paths, or every program on its own
  onPick: (id: string | null) => void; // null forgets the program
  onClose: () => void;
  focusOnClose: () => HTMLElement | null; // where keyboard focus goes when the panel closes
}

// The panel for "Pick a program": first a choice of the faculty's programs, then the program's
// requirements by year, with how far along you are. It sits where the course details go:
// beside the graph on wide screens, covering it on phones.
export default function ProgramPanel({
  subject,
  programs,
  program,
  progress,
  creditsFor,
  artsDegree,
  calendarUrl,
  note,
  byMajor,
  onPick,
  onClose,
  focusOnClose,
  ...links
}: ProgramPanelProps) {
  // "Change program" shows the choices again without forgetting the current one.
  const [choosing, setChoosing] = useState(false);
  const picking = program === null || progress === null || choosing;

  // The panel scrolls on its own. A new program starts at the top.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [program?.id]);
  // Picking a program swaps the list of choices for its requirements, so focus moves to the
  // new heading then too.
  const headingRef = usePanelFocus(picking ? null : program.id, focusOnClose);

  const pick = (id: string | null) => {
    setChoosing(false);
    onPick(id);
  };

  return (
    <aside
      ref={panelRef}
      id="program-panel"
      aria-label="Program requirements"
      className="absolute inset-0 z-10 overflow-y-auto bg-surface p-5 text-sm md:static md:w-96 md:shrink-0 md:border-l md:border-line"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
            {picking ? "Pick your program" : program.name}
          </h2>
          <p className="text-ink-muted">
            {picking
              ? "See what it requires and how far along you are."
              : // "Major (0376): Computer Science (CPSC)" → "Major (0376)"; engineering has no heading.
                `${program.heading?.replace(/:.*/, "") ?? program.degree} · ${program.total_credits} credits`}
          </p>
          {!picking &&
            program.notes?.map((text) => (
              <p key={text} className="mt-1 text-xs text-ink-muted">
                {text}
              </p>
            ))}
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

      {picking ? (
        <Choices
          subject={subject}
          programs={programs}
          current={program}
          note={note}
          byMajor={byMajor}
          onPick={pick}
          onKeep={() => setChoosing(false)}
        />
      ) : (
        <Requirements
          program={program}
          progress={progress}
          creditsFor={creditsFor}
          artsDegree={artsDegree}
          onChange={() => setChoosing(true)}
          {...links}
        />
      )}

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink-muted">
        <CalendarLinks urls={!picking && program.sources ? program.sources : [calendarUrl]} />. A guide to
        help you plan, not an official degree audit.
      </p>
    </aside>
  );
}

// Where a program comes from: "From the UBC Academic Calendar ↗", or with several pages
// (an engineering program), "… Calendar: Curriculum and First Year ↗, Mechanical Engineering ↗".
function CalendarLinks({ urls }: { urls: string[] }) {
  const link = (url: string, text: string) => (
    <a key={url} href={url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
      {text}
      <span aria-hidden> ↗</span>
    </a>
  );
  if (urls.length === 1) return <>From the {link(urls[0], "UBC Academic Calendar")}</>;
  // ".../curriculum-and-first-year" → "Curriculum and First Year"
  const title = (url: string) =>
    url
      .split("/")
      .pop()!
      .split("-")
      .map((word, i) => (i > 0 && word === "and" ? word : word[0].toUpperCase() + word.slice(1)))
      .join(" ");
  return (
    <>
      From the UBC Academic Calendar:{" "}
      {urls.map((url, i) => (
        <span key={url}>
          {i > 0 && ", "}
          {link(url, title(url))}
        </span>
      ))}
    </>
  );
}

// The programs, each a button with its own name. On the Science page they're listed by subject
// (see programMajors): a subject with several programs is one button that opens to list them,
// and a subject with one program is a button for that program. Engineering lists every program
// on its own.
function Choices({
  subject,
  programs,
  current,
  note,
  byMajor,
  onPick,
  onKeep,
}: {
  subject: string;
  programs: Program[];
  current: Program | null;
  note: string;
  byMajor: boolean;
  onPick: (id: string | null) => void;
  onKeep: () => void;
}) {
  return (
    <div className="mt-4 space-y-2">
      {byMajor
        ? programMajors(programs).map((major) =>
            major.programs.length + major.combined.length === 1 ? (
              [...major.programs, ...major.combined].map((program) => (
                <ProgramChoice key={program.id} program={program} on={program.id === current?.id} onPick={onPick} />
              ))
            ) : (
              <MajorChoices
                key={major.subject}
                major={major}
                startOpen={major.subject === subject}
                current={current}
                onPick={onPick}
              />
            ),
          )
        : programs.map((program) => (
            <ProgramChoice key={program.id} program={program} on={program.id === current?.id} onPick={onPick} />
          ))}
      {current && (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" onClick={onKeep} className="underline underline-offset-2 hover:text-ink-muted">
            Keep {current.name}
          </button>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="underline underline-offset-2 hover:text-ink-muted"
          >
            Don&apos;t use a program
          </button>
        </p>
      )}
      <p className="text-xs text-ink-muted">{note}</p>
    </div>
  );
}

// One program to pick: its name, then its plan code (if the calendar gives one) and credits.
function ProgramChoice({
  program,
  on,
  onPick,
}: {
  program: Program;
  on: boolean;
  onPick: (id: string | null) => void;
}) {
  const plan = program.heading?.match(/\((\d{4})\)/)?.[1];
  return (
    <button
      type="button"
      onClick={() => onPick(program.id)}
      aria-pressed={on}
      className={`block w-full rounded-lg border px-3 py-2 text-left ${
        on ? "border-ink bg-ink text-canvas hover:opacity-90" : "border-line hover:bg-canvas"
      }`}
    >
      <span className="block font-semibold">{program.name}</span>
      <span className={`block text-xs ${on ? "opacity-75" : "text-ink-muted"}`}>
        {plan && `Plan ${plan} · `}
        {program.total_credits} credits
      </span>
    </button>
  );
}

// A subject with several programs, e.g. Computer Science: a button with the subject's name
// that opens to list its own programs, then the combined ones it's part of. It starts open on
// its own map, and when the picked program is one of them.
function MajorChoices({
  major,
  startOpen,
  current,
  onPick,
}: {
  major: Major;
  startOpen: boolean;
  current: Program | null;
  onPick: (id: string | null) => void;
}) {
  const { subject, programs, combined } = major;
  const [open, setOpen] = useState(startOpen || [...programs, ...combined].some((p) => p.id === current?.id));
  const listId = useId();
  const name = facultyOf(subject)?.subjects.find((s) => s.code === subject)?.name ?? subject;
  return (
    <div className="rounded-lg border border-line">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-canvas"
      >
        <span>
          <span className="block font-semibold">{name}</span>
          <span className="block text-xs text-ink-muted">{programs.length + combined.length} programs</span>
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <ul id={listId} className="space-y-1.5 border-t border-line p-1.5">
          {programs.map((program) => (
            <li key={program.id}>
              <ProgramChoice program={program} on={program.id === current?.id} onPick={onPick} />
            </li>
          ))}
          {combined.length > 0 && (
            <li className="px-1.5 pt-1.5 text-xs font-semibold text-ink-muted">Combined with another subject</li>
          )}
          {combined.map((program) => (
            <li key={program.id}>
              <ProgramChoice program={program} on={program.id === current?.id} onPick={onPick} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The summary, the keys, then each year's requirements.
function Requirements({
  program,
  progress,
  creditsFor,
  artsDegree,
  onChange,
  ...links
}: {
  program: Program;
  progress: RowProgress[][];
  creditsFor: CreditsFor;
  artsDegree: ArtsDegree;
  onChange: () => void;
} & CodeLinks) {
  const { rowsDone, rows, spareCredits } = programSummary(progress, links.done, creditsFor);
  const { facts } = useSavedFacts();
  const highSchool = useMemo(() => new Set(facts.highSchool), [facts.highSchool]);
  const artsSubjects = useMemo(() => new Set(artsDegree.arts_subjects), [artsDegree]);
  return (
    <>
      <button
        type="button"
        onClick={onChange}
        className="mt-1 text-xs underline underline-offset-2 hover:text-ink-muted"
      >
        Change program
      </button>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-band-a" aria-hidden>
          <div className="h-full rounded-full bg-ink" style={{ width: `${(rowsDone / rows) * 100}%` }} />
        </div>
        <p className="mt-1.5">
          <strong>
            {rowsDone} of {rows}
          </strong>{" "}
          requirements done
        </p>
        {spareCredits > 0 && (
          <p className="text-xs text-ink-muted">
            Your other finished courses add up to {spareCredits} more credits than the program needs.
          </p>
        )}
      </div>

      {/* Keys for the row icons and the stripes on the map. */}
      <div className="mt-3 space-y-1 text-xs text-ink-muted">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {(["done", "partial", "todo", "check"] as const).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <RowIcon status={status} />
              {STATUS_WORDS[status].toLowerCase()}
            </span>
          ))}
        </p>
        <p>
          On the map: <StripeSample kind="required" />
          required <span className="ml-2" />
          <StripeSample kind="choice" />
          one of a few choices
        </p>
      </div>

      {program.years.map((year, y) => {
        const yearSummary = programSummary([progress[y]], links.done, creditsFor);
        return (
          <section key={year.title} className="mt-5">
            <h3 className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 font-semibold">
              <span>
                {year.title}{" "}
                <span className="font-normal text-ink-muted">· {year.credits_text ?? year.credits} credits</span>
              </span>
              <span className="shrink-0 text-xs font-normal text-ink-muted">
                {yearSummary.rowsDone} of {yearSummary.rows} done
              </span>
            </h3>
            <ul className="divide-y divide-line">
              {year.requirements.map((requirement, r) => (
                <Row key={r} requirement={requirement} progress={progress[y][r]} {...links} />
              ))}
            </ul>
          </section>
        );
      })}

      {program.degree === SCIENCE.degree && (
        <ScienceRules rows={scienceRows(program, links.done, creditsFor, artsSubjects, highSchool)} {...links} />
      )}
    </>
  );
}

// The Faculty of Science's rules for every B.Sc. program, after the program's own years. They
// have their own count: the program's "N of M requirements done" is about the program only.
function ScienceRules({ rows, ...links }: { rows: ScienceRow[] } & CodeLinks) {
  const tracked = rows.filter((row) => row.status !== "check");
  return (
    <section className="mt-5">
      <h3 className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 font-semibold">
        <span>Faculty of Science requirements</span>
        <span className="shrink-0 text-xs font-normal text-ink-muted">
          {tracked.filter((row) => row.status === "done").length} of {tracked.length} done
        </span>
      </h3>
      <p className="mt-1.5 text-xs text-ink-muted">
        Every B.Sc. program needs these too. A course can count here and in the program above.
      </p>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.title} className="py-2.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex">
                <RowIcon status={row.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="sr-only">{STATUS_WORDS[row.status]}: </span>
                {row.title}
              </span>
              {row.progress && <span className="shrink-0 text-xs tabular-nums text-ink-muted">{row.progress}</span>}
            </div>
            <div className="ml-[26px]">
              {row.categories && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Science Breadth categories">
                  {row.categories.map((category) => (
                    <li
                      key={category.name}
                      className={`rounded border px-1.5 py-0.5 text-xs ${
                        category.done ? "border-ink" : "border-line text-ink-muted"
                      }`}
                    >
                      {category.done && (
                        <>
                          <span aria-hidden>✓ </span>
                          <span className="sr-only">Done: </span>
                        </>
                      )}
                      {category.name}
                    </li>
                  ))}
                </ul>
              )}
              {row.options.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {row.options.map((code) => (
                    <Chip key={code} code={code} counted={false} {...links} />
                  ))}
                </div>
              )}
              {row.counted.length > 0 && (
                <p className="mt-1 text-xs text-ink-muted">With {row.counted.join(", ")}</p>
              )}
              {row.check && <p className="mt-1 text-xs text-ink-muted">Check this yourself · {row.check}</p>}
              {row.ask && <QuickFacts text={row.ask} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STATUS_WORDS: Record<RowStatus, string> = {
  done: "Done",
  partial: "Partly done",
  todo: "To do",
  check: "Check yourself",
};

// A small square per row: filled with a tick when done, half filled when partly done,
// empty to do, and dashed with a "?" to check yourself.
function RowIcon({ status }: { status: RowStatus }) {
  const base =
    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold leading-none";
  if (status === "done") return <span className={`${base} bg-ink text-canvas`} aria-hidden>✓</span>;
  if (status === "partial") {
    return (
      <span
        className={`${base} border-2 border-ink`}
        style={{ background: "linear-gradient(90deg, var(--ink) 50%, transparent 50%)" }}
        aria-hidden
      />
    );
  }
  if (status === "todo") return <span className={`${base} border-2 border-ink-muted/50`} aria-hidden />;
  return (
    <span className={`${base} border-2 border-dashed border-ink-muted text-ink-muted`} aria-hidden>
      ?
    </span>
  );
}

// One requirement: its status, the calendar's wording and credits, then what's useful next:
// the courses that can fill it while it isn't done, which courses did fill it, anything to
// check yourself, and the calendar's footnote behind a "Note" button.
function Row({
  requirement,
  progress,
  ...links
}: { requirement: ProgramRequirement; progress: RowProgress } & CodeLinks) {
  const { status, counted, credits } = progress;
  const [noteOpen, setNoteOpen] = useState(false);
  const noteId = useId();
  const { tree, notes } = requirement;
  // Credit rows show credits so far ("3 of 9 cr"). "CPSC or AI courses numbered 300 or higher"
  // and electives have no list of courses; "9 credits from MATH 300, 301, …" does.
  const isElectives = typeof tree === "object" && "electives" in tree;
  const isCredits = typeof tree === "object" && ("credits_of" in tree || "credits_from" in tree || isElectives);
  const options = [...new Set(treeCourses(tree))];

  const meta: string[] = [];
  // Which courses filled it, when there was a choice ("CPSC 213, 221" needs no reminder).
  const hadChoice = isCredits || counted.length < options.length;
  if (status === "done" && hadChoice && counted.length > 0) meta.push(`With ${counted.join(", ")}`);
  if (status === "check") meta.push("Check this yourself");
  if (isElectives && status !== "done") meta.push("Any courses");
  // "Additional Communication Requirement" would only repeat itself.
  if (progress.check && progress.check !== requirement.text) meta.push(`Check: ${progress.check}`);

  // Courses to show as chips: the choices until it's done, or for a credit row without a list,
  // the courses counted so far.
  const chips = status === "done" ? [] : options.length > 0 ? options : counted;

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex">
          <RowIcon status={status} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="sr-only">{STATUS_WORDS[status]}: </span>
          {requirement.text}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
          {isCredits && status !== "done"
            ? `${credits} of ${requirement.credits}`
            : (requirement.credits_text ?? requirement.credits)}
          <span aria-hidden> cr</span>
          <span className="sr-only"> credits</span>
        </span>
      </div>
      <div className="ml-[26px]">
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map((code) => (
              <Chip key={code} code={code} counted={counted.includes(code)} {...links} />
            ))}
          </div>
        )}
        {(meta.length > 0 || notes.length > 0) && (
          <p className="mt-1 text-xs text-ink-muted">
            {meta.join(" · ")}
            {meta.length > 0 && notes.length > 0 && " · "}
            {notes.length > 0 && (
              <button
                type="button"
                onClick={() => setNoteOpen(!noteOpen)}
                aria-expanded={noteOpen}
                aria-controls={noteId}
                className="underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {noteOpen ? "Hide note" : "Note"}
              </button>
            )}
          </p>
        )}
        {noteOpen && (
          <div
            id={noteId}
            className="mt-1.5 space-y-1.5 rounded-md bg-canvas px-2.5 py-2 text-xs leading-relaxed text-ink-muted"
          >
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// A course in a requirement. Courses on the map are buttons that open them (a tick shows
// they're done, and a darker border that they count toward this row). Courses that aren't
// on the map have a tick box, so they can be marked done right here.
function Chip({
  code,
  counted,
  onMap,
  onOpen,
  elsewhere,
  done,
  onToggle,
}: { code: string; counted: boolean } & CodeLinks) {
  if (!onMap.has(code)) {
    return (
      <TickChip code={code} checked={done.has(code)} onToggle={() => onToggle(code)} elsewhere={elsewhere(code)} />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(code)}
      aria-label={done.has(code) ? `${code} (done)` : undefined}
      className={`rounded border px-1.5 py-0.5 font-mono text-xs hover:bg-canvas ${
        counted ? "border-ink" : "border-line"
      }`}
    >
      {done.has(code) && "✓ "}
      {code}
    </button>
  );
}
