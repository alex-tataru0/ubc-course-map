import type { CourseStatus } from "@/lib/progress";
import { StatusSample } from "./Status";

interface ProgressBarProps {
  counts: Record<CourseStatus, number>;
  marking: boolean; // in quick mode, where a click ticks a course
  onStart: () => void;
  onFinish: () => void;
  onClear: () => void;
}

// The bar over the top-left of the graph for "What can I take next?".
// - Nothing marked yet: one button to start marking.
// - While marking: how to do it, a count, and Finish (plus Clear all).
// - After: a summary that doubles as the key for the course boxes.
export default function ProgressBar({ counts, marking, onStart, onFinish, onClear }: ProgressBarProps) {
  const button = "rounded-md border border-line bg-surface px-2.5 py-1 font-medium hover:bg-canvas";
  const primary = "rounded-md border border-ink bg-ink px-2.5 py-1 font-medium text-canvas hover:opacity-90";
  const bar =
    "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface/95 px-3 py-2 text-sm text-ink shadow-sm";

  if (marking) {
    return (
      <div className={bar}>
        <span>
          Click each course you&apos;ve finished. <strong>{counts.done} marked</strong>
        </span>
        <span className="flex gap-2">
          {counts.done > 0 && (
            <button type="button" onClick={onClear} className={button}>
              Clear all
            </button>
          )}
          <button type="button" onClick={onFinish} className={primary}>
            Finish
          </button>
        </span>
      </div>
    );
  }

  if (counts.done === 0) {
    return (
      <button type="button" onClick={onStart} className={`${primary} shadow-sm`}>
        Mark courses I&apos;ve taken
      </button>
    );
  }

  return (
    <div className={bar}>
      <span>
        <StatusSample status="done" />
        {counts.done} done
      </span>
      <span>
        <StatusSample status="can-take" />
        {counts["can-take"]} you can take
      </span>
      <span>
        <StatusSample status="check" />
        {counts.check} to check
      </span>
      <span>
        <StatusSample status="locked" />
        {counts.locked} not yet
      </span>
      <button type="button" onClick={onStart} className={button}>
        Edit my courses
      </button>
    </div>
  );
}
