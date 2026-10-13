// The key for the two kinds of lines. It has no state, so the server can render it
// straight into the header.

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

export default function EdgeLegend() {
  return (
    <p className="flex flex-wrap gap-x-4 text-sm sm:justify-end">
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
