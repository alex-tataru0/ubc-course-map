// Small pieces of the key that explain the lines and colours. They have no state,
// so they work in server and client components alike.

// A little square outlined in a highlight colour, e.g. border-role-needs.
export function Swatch({ className }: { className: string }) {
  return <span className={`mr-2 inline-block h-3 w-3 rounded-sm border-2 ${className}`} aria-hidden />;
}

function LineSample({ dashed }: { dashed: boolean }) {
  return (
    <svg width="28" height="8" className="mr-1.5 inline-block align-middle" aria-hidden>
      <line
        x1="0"
        y1="4"
        x2="28"
        y2="4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={dashed ? "5 3" : undefined}
      />
    </svg>
  );
}

// The key for the two kinds of lines, shown in the header.
export default function EdgeLegend() {
  return (
    <p className="flex flex-wrap gap-x-4 text-xs sm:justify-end sm:text-sm">
      <span>
        <LineSample dashed={false} />
        Required prerequisite
      </span>
      <span>
        <LineSample dashed />
        One of several options
      </span>
    </p>
  );
}
