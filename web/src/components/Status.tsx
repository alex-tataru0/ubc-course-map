import type { CourseStatus } from "@/lib/progress";

// How the statuses from "What can I take next?" look, shared by the course boxes,
// the bar above the graph and the side panel.

// Short words for each status, shown on the course box and read out by screen readers.
export const STATUS_TEXT: Record<CourseStatus, string> = {
  done: "Done",
  "can-take": "Can take",
  check: "Check first",
  locked: "Not yet",
  "no-credit": "No credit",
  "not-needed": "Not needed",
};

// A course box's fill (background and text) and border.
export interface BoxLook {
  fill: string;
  border: string;
}

// A box with no status: before any course is marked done.
export const PLAIN_BOX: BoxLook = { fill: "bg-surface text-ink", border: "border border-line" };

// Done courses are filled in (dark, or light in dark mode), courses you can take get a thick
// outline, and ones to check a dashed one. The rest keep the plain border and fade (FADED).
export const STATUS_BOX: Record<CourseStatus, BoxLook> = {
  done: { fill: "bg-ink text-canvas", border: "border border-ink" },
  "can-take": { fill: "bg-surface text-ink", border: "border-2 border-ink" },
  check: { fill: "bg-surface text-ink", border: "border-2 border-dashed border-ink-muted" },
  locked: PLAIN_BOX,
  "no-credit": PLAIN_BOX,
  "not-needed": PLAIN_BOX,
};

// Statuses with nothing to do right now, so their boxes fade into the background.
export const FADED: ReadonlySet<CourseStatus> = new Set(["locked", "no-credit", "not-needed"]);

// A tiny box in a status's look, used as the key in the bar and the side panel.
export function StatusSample({ status }: { status: CourseStatus }) {
  const { fill, border } = STATUS_BOX[status];
  return (
    <span
      className={`mr-1.5 inline-block h-3.5 w-3.5 rounded-[4px] align-[-2px] ${fill} ${border} ${
        FADED.has(status) ? "opacity-50" : ""
      }`}
      aria-hidden
    />
  );
}

// A round tick box: empty, or blue with a tick. It sits in the corner of every course while
// marking courses (className places it), and inside each TickChip.
export function TickBox({ checked, className = "" }: { checked: boolean; className?: string }) {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold leading-none ${
        checked ? "border-role-selected bg-role-selected text-white" : "border-ink-muted/60 bg-surface"
      } ${className}`}
      aria-hidden
    >
      {checked && "✓"}
    </span>
  );
}

// A course that isn't on the map (e.g. MATH 221), as a button that ticks it on or off.
// A course on another faculty's page (`elsewhere`) also gets a ↗ link that opens it there.
export function TickChip({
  code,
  checked,
  onToggle,
  elsewhere = null,
}: {
  code: string;
  checked: boolean;
  onToggle: () => void;
  elsewhere?: { url: string; page: string } | null;
}) {
  const tick = (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`inline-flex items-center gap-1.5 border border-line py-0.5 pl-1 pr-1.5 font-mono text-xs hover:bg-canvas ${
        elsewhere ? "rounded-l" : "rounded"
      }`}
    >
      <TickBox checked={checked} />
      {code}
    </button>
  );
  if (!elsewhere) return tick;
  return (
    <span className="inline-flex">
      {tick}
      <a
        href={elsewhere.url}
        aria-label={`Open ${code} on the ${elsewhere.page} page`}
        title={`Open on the ${elsewhere.page} page`}
        className="flex items-center rounded-r border border-l-0 border-line px-1.5 text-xs text-ink-muted hover:bg-canvas hover:text-ink"
      >
        ↗
      </a>
    </span>
  );
}
