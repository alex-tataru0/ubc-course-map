import type { Subject } from "@/lib/subjects";

interface SubjectPickerProps {
  subjects: Subject[];
  value: string; // the subject shown, e.g. "MATH"
  onChange: (code: string) => void;
  className?: string;
}

// The menu that switches between a faculty's subjects. A plain <select>, so it works with the
// keyboard, screen readers and phones' own pickers. The arrow is drawn on top of it.
export default function SubjectPicker({ subjects, value, onChange, className = "" }: SubjectPickerProps) {
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">Subject</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="cursor-pointer appearance-none rounded-md border border-line bg-surface py-1 pl-2.5 pr-8 text-sm font-medium text-ink shadow-sm hover:bg-canvas"
      >
        {subjects.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name} ({s.code})
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-2.5 text-ink-muted"
        aria-hidden
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </label>
  );
}
