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
};

// Statuses with nothing to do right now, so their boxes fade into the background.
export const FADED: ReadonlySet<CourseStatus> = new Set(["locked", "no-credit"]);

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

// The round tick box in the corner of every course while marking courses:
// empty, or blue with a tick.
export function TickBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 text-[10px] font-bold leading-none ${
        checked ? "border-role-selected bg-role-selected text-white" : "border-ink-muted/60 bg-surface"
      }`}
      aria-hidden
    >
      {checked && "✓"}
    </span>
  );
}
