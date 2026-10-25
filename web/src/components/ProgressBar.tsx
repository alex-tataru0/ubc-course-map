import { useEffect, useRef, useState } from "react";
import type { CourseStatus } from "@/lib/progress";
import { StatusSample } from "./Status";

interface ProgressBarProps {
  counts: Record<CourseStatus, number>; // statuses of the courses on the map
  marked: number; // every course ticked, on the map or not
  outsideTicked: number; // ticked courses that aren't on the map (MATH, STAT, …)
  marking: boolean; // in quick mode, where a click ticks a course
  outsideOpen: boolean; // the "Not on the map" list (checklist and other subjects' courses) is open
  onStart: () => void;
  onFinish: () => void;
  onClear: () => void;
  onToggleOutside: () => void;
}

// The bar over the top-left of the graph for "What can I take next?".
// - Nothing marked yet: one button to start marking.
// - While marking: how to do it, a count, the list of other subjects, and Finish (plus Clear all).
// - After: a summary that doubles as the key for the course boxes.
export default function ProgressBar({
  counts,
  marked,
  outsideTicked,
  marking,
  outsideOpen,
  onStart,
  onFinish,
  onClear,
  onToggleOutside,
}: ProgressBarProps) {
  const button = "rounded-md border border-line bg-surface px-2.5 py-1 font-medium hover:bg-canvas";
  const primary = "rounded-md border border-ink bg-ink px-2.5 py-1 font-medium text-canvas hover:opacity-90";
  const bar =
    "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface/95 px-3 py-2 text-sm text-ink shadow-sm";

  if (marking) {
    // Finish takes focus after Clear all, which goes away once nothing is marked.
    const afterClear = () => document.getElementById("finish-marking")?.focus();
    return (
      <div className={bar}>
        <span>
          Click each course you&apos;ve finished. <strong>{marked} marked</strong>
        </span>
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={onToggleOutside} aria-expanded={outsideOpen} className={button}>
            Not on the map{outsideTicked > 0 && ` (${outsideTicked})`}
          </button>
          {marked > 0 && (
            <ClearAll
              marked={marked}
              onClear={() => {
                onClear();
                afterClear();
              }}
              className={button}
            />
          )}
          <button type="button" id="finish-marking" onClick={onFinish} className={primary}>
            Finish
          </button>
        </span>
      </div>
    );
  }

  if (marked === 0) {
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

// "Clear all" asks first, in the bar itself, since it can't be undone:
// "Clear all 12 marked courses? [Yes, clear] [Cancel]". Cancel is the one with focus.
function ClearAll({ marked, onClear, className }: { marked: number; onClear: () => void; className: string }) {
  const [asking, setAsking] = useState(false);
  const clearRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  // Focus follows the buttons as they swap: to Cancel when asking, back to Clear all after.
  useEffect(() => {
    if (asking) cancelRef.current?.focus();
    else if (asked.current) clearRef.current?.focus();
    asked.current = asking;
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" ref={clearRef} onClick={() => setAsking(true)} className={className}>
        Clear all
      </button>
    );
  }
  return (
    <span role="group" aria-label="Clear all marked courses?" className="flex flex-wrap items-center gap-2">
      <span className="font-medium">
        Clear all {marked} marked {marked === 1 ? "course" : "courses"}?
      </span>
      <button type="button" onClick={onClear} className={className}>
        Yes, clear
      </button>
      <button type="button" ref={cancelRef} onClick={() => setAsking(false)} className={className}>
        Cancel
      </button>
    </span>
  );
}
