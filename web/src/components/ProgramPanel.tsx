import { useEffect, useId, useRef, useState } from "react";
import { programGroups, programSummary, treeCourses } from "@/lib/program";
import type { CreditsFor, RowProgress, RowStatus } from "@/lib/program";
import type { Elsewhere } from "@/lib/subjects";
import type { Program, ProgramRequirement } from "@/lib/types";
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
  programs: Program[];
  program: Program | null; // null until one is picked
  progress: RowProgress[][] | null; // progress through each requirement row of `program`
  creditsFor: CreditsFor;
  calendarUrl: string; // the calendar page the programs come from
  onPick: (id: string | null) => void; // null forgets the program
  onClose: () => void;
  focusOnClose: () => HTMLElement | null; // where keyboard focus goes when the panel closes
}

// The panel for "Pick a program": first a choice of the six programs, then the program's
// requirements by year, with how far along you are. It sits where the course details go:
// beside the graph on wide screens, covering it on phones.
export default function ProgramPanel({
  programs,
  program,
  progress,
  creditsFor,
  calendarUrl,
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
              : // "Major (0376): Computer Science (CPSC)" → "Major (0376)"
                `${program.heading.replace(/:.*/, "")} · ${program.total_credits} credits`}
          </p>
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
          programs={programs}
          current={program}
          onPick={pick}
          onKeep={() => setChoosing(false)}
        />
      ) : (
        <Requirements
          program={program}
          progress={progress}
          creditsFor={creditsFor}
          onChange={() => setChoosing(true)}
          {...links}
        />
      )}

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink-muted">
        From the{" "}
        <a
          href={calendarUrl}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          UBC Academic Calendar
          <span aria-hidden> ↗</span>
        </a>
        . A guide to help you plan, not an official degree audit.
      </p>
    </aside>
  );
}

// The six programs: a heading per stream, with its Major and Honours side by side.
function Choices({
  programs,
  current,
  onPick,
  onKeep,
}: {
  programs: Program[];
  current: Program | null;
  onPick: (id: string | null) => void;
  onKeep: () => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      {programGroups(programs).map((group) => (
        <section key={group.title}>
          <h3 className="mb-1.5 font-medium">{group.title}</h3>
          <div className="grid grid-cols-2 gap-2">
            {group.options.map((option) => {
              const on = option.id === current?.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPick(option.id)}
                  aria-pressed={on}
                  className={`rounded-lg border px-3 py-2 text-left ${
                    on ? "border-ink bg-ink text-canvas hover:opacity-90" : "border-line hover:bg-canvas"
                  }`}
                >
                  <span className="sr-only">{group.title} </span>
                  <span className="block font-semibold">{option.kind}</span>
                  <span className={`block text-xs ${on ? "opacity-75" : "text-ink-muted"}`}>
                    {option.plan && `Plan ${option.plan} · `}
                    {option.credits} credits
                  </span>
                </button>
              );
            })}
          </div>
        </section>
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
      <p className="text-xs text-ink-muted">
        The Bachelor of Science programs on the calendar&apos;s Computer Science page. Combined majors and
        honours (Computer Science with another subject) aren&apos;t here yet.
      </p>
    </div>
  );
}

// The summary, the keys, then each year's requirements.
function Requirements({
  program,
  progress,
  creditsFor,
  onChange,
  ...links
}: {
  program: Program;
  progress: RowProgress[][];
  creditsFor: CreditsFor;
  onChange: () => void;
} & CodeLinks) {
  const { rowsDone, rows, spareCredits } = programSummary(progress, links.done, creditsFor);
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
            Your other finished courses add up to {spareCredits} credits, which can count as electives.
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
                {year.title} <span className="font-normal text-ink-muted">· {year.credits} credits</span>
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
    </>
  );
}

const STATUS_WORDS: Record<RowStatus, string> = {
  done: "Done",
  partial: "Partly done",
  todo: "To do",
  check: "Check yourself",
  electives: "Electives",
};

// A small square per row: filled with a tick when done, half filled when partly done,
// empty to do, dashed with a "?" to check yourself, and a dash for electives.
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
  if (status === "check") {
    return (
      <span className={`${base} border-2 border-dashed border-ink-muted text-ink-muted`} aria-hidden>
        ?
      </span>
    );
  }
  return <span className={`${base} text-ink-muted`} aria-hidden>–</span>;
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
  const isCredits = typeof tree === "object" && "credits_of" in tree;
  const options = treeCourses(tree);

  const meta: string[] = [];
  // Which courses filled it, when there was a choice ("CPSC 213, 221" needs no reminder).
  const hadChoice = typeof tree === "object" && !("all_of" in tree);
  if (status === "done" && hadChoice && counted.length > 0) meta.push(`With ${counted.join(", ")}`);
  if (status === "check") meta.push("Check this yourself");
  if (status === "electives") meta.push("Any courses");
  // "Additional Communication Requirement" would only repeat itself.
  if (progress.check && progress.check !== requirement.text) meta.push(`Check: ${progress.check}`);

  // Courses to show as chips: the choices until it's done, or for a credit row, the
  // courses counted so far.
  const chips = isCredits ? (status === "done" ? [] : counted) : status === "done" ? [] : options;

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex">
          <RowIcon status={status} />
        </span>
        <span className={`min-w-0 flex-1 ${status === "electives" ? "text-ink-muted" : ""}`}>
          <span className="sr-only">{STATUS_WORDS[status]}: </span>
          {requirement.text}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
          {isCredits && status !== "done" ? `${credits} of ${requirement.credits}` : requirement.credits}
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
