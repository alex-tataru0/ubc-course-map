import { shortName } from "@/lib/program";
import type { Program } from "@/lib/types";
import { StripeSample } from "./ProgramStripe";

interface ProgramButtonProps {
  program: Program | null;
  rowsDone: number; // requirement rows done, out of `rows`
  rows: number;
  open: boolean; // the program panel is showing
  large: boolean; // next to the big "Mark courses I've taken" button, so the same size
  onClick: () => void;
}

// The button next to the "What can I take next?" bar that opens the program panel.
// Once a program is picked, it shows the program and how many requirements are done,
// with a sample of the stripe its courses get on the map.
export default function ProgramButton({ program, rowsDone, rows, open, large, onClick }: ProgramButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={open ? "program-panel" : undefined}
      className={`rounded-md border border-line bg-surface px-2.5 py-1 font-medium text-ink shadow-sm hover:bg-canvas ${
        large ? "" : "text-sm"
      }`}
    >
      {program ? (
        <>
          <StripeSample kind="required" />
          {shortName(program)} · {rowsDone} of {rows}
          <span className="sr-only"> requirements done</span>
        </>
      ) : (
        "Pick a program"
      )}
    </button>
  );
}
