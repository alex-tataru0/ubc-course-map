import { factQuestions, HIGH_SCHOOL_COURSES } from "@/lib/facts";
import { useSavedFacts } from "@/lib/savedFacts";
import { TickBox } from "./Status";

const YEARS: { value: number | null; label: string }[] = [
  { value: null, label: "Not set" },
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th or higher" },
];

const nameOf = (key: string) => HIGH_SCHOOL_COURSES.find((course) => course.key === key)!.name;

// What someone can tell the site besides courses: their year standing and the high school
// courses they have. Prerequisites like "Third-year standing" or "PHYS 12" then count as met
// (or not yet, for a year that's too low) instead of "check yourself". It's saved in the
// browser like the ticked courses (see savedFacts.ts).
export default function FactsChecklist() {
  const { facts, setStanding, toggleHighSchool } = useSavedFacts();
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 font-semibold">Your year standing</legend>
        <YearButtons standing={facts.standing} onPick={setStanding} withNotSet />
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">High school courses you have</legend>
        <div className="flex flex-wrap gap-2">
          {HIGH_SCHOOL_COURSES.map(({ key, name }) => (
            <HighSchoolTick
              key={key}
              name={name}
              checked={facts.highSchool.includes(key)}
              onToggle={() => toggleHighSchool(key)}
            />
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-ink-muted">
        Prerequisites like &quot;Third-year standing&quot; or &quot;PHYS 12&quot; then count without checking. Anything
        you leave out stays &quot;check yourself&quot;.
      </p>
    </div>
  );
}

// Under a "check yourself" item in a course's panel that the checklist can answer, the same
// questions, so it can be answered right there: "Your year standing: 1st 2nd 3rd 4th or
// higher" for "Third-year standing", "I have Physics 12" for "PHYS 12".
export function QuickFacts({ text }: { text: string }) {
  const { facts, setStanding, toggleHighSchool } = useSavedFacts();
  const { standing, highSchool } = factQuestions(text);
  if (!standing && highSchool.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
      {standing && (
        <>
          <span>Your year standing:</span>
          <YearButtons standing={facts.standing} onPick={setStanding} />
        </>
      )}
      {highSchool.map((key) => (
        <HighSchoolTick
          key={key}
          name={`I have ${nameOf(key)}`}
          checked={facts.highSchool.includes(key)}
          onToggle={() => toggleHighSchool(key)}
        />
      ))}
    </span>
  );
}

function YearButtons({
  standing,
  onPick,
  withNotSet = false,
}: {
  standing: number | null;
  onPick: (standing: number | null) => void;
  withNotSet?: boolean;
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {YEARS.filter(({ value }) => withNotSet || value !== null).map(({ value, label }) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(value)}
          aria-pressed={standing === value}
          className={`rounded-md border px-2 py-0.5 text-xs ${
            standing === value ? "border-ink bg-ink text-canvas" : "border-line text-ink hover:bg-canvas"
          }`}
        >
          {label}
          {/* Screen readers hear "3rd year" rather than just "3rd". */}
          {value !== null && value < 4 && <span className="sr-only"> year</span>}
        </button>
      ))}
    </span>
  );
}

function HighSchoolTick({ name, checked, onToggle }: { name: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="inline-flex items-center gap-1.5 rounded border border-line py-0.5 pl-1 pr-1.5 text-xs text-ink hover:bg-canvas"
    >
      <TickBox checked={checked} />
      {name}
    </button>
  );
}
