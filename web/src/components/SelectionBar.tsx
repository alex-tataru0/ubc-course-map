import type { Highlight } from "@/lib/highlight";
import { Swatch } from "./Legend";

interface SelectionBarProps {
  highlight: Highlight;
  onDetails: () => void; // reopen the side panel
  onClear: () => void;
}

// Shown over the graph while a course is highlighted but its side panel is closed,
// e.g. on a phone after closing the panel to look at the lines. It keeps the key for
// the colours on screen, and gives touch screens a way to clear (they have no Esc key).
export default function SelectionBar({ highlight, onDetails, onClear }: SelectionBarProps) {
  const { selected, needs, unlocks } = highlight;
  const button = "rounded-md border border-line px-2.5 py-1 font-medium hover:bg-canvas";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface/95 px-3 py-2 text-sm text-ink shadow-sm">
      <span className="font-semibold">
        <Swatch className="border-role-selected" />
        {selected}
      </span>
      <span>
        <Swatch className="border-role-needs" />
        {needs.size === 0 ? "No CPSC prereqs" : `Needs ${needs.size}`}
      </span>
      <span>
        <Swatch className="border-role-unlocks" />
        {unlocks.size === 0 ? "Unlocks none" : `Unlocks ${unlocks.size}`}
      </span>
      <span className="flex gap-2">
        <button type="button" onClick={onDetails} className={button}>
          Details
        </button>
        <button type="button" onClick={onClear} className={button}>
          Clear
        </button>
      </span>
    </div>
  );
}
