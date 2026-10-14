import type { SubjectGroup } from "@/lib/outside";
import { TickChip } from "./Status";

interface OutsideCoursesProps {
  subject: string; // the subject of the map shown, e.g. "CPSC"
  withPrograms: boolean; // the list includes what the programs need too
  groups: SubjectGroup[]; // the courses not on the map, by subject
  done: ReadonlySet<string>;
  onToggle: (code: string) => void;
  onClose: () => void;
}

// The list of courses that the prerequisites on this map or the programs mention but the map
// doesn't show (MATH, STAT, SCIE 113, … on the CPSC map), opened from quick mode, so they can
// be ticked without switching maps. It sits where the course details panel goes: beside the
// graph on wide screens, covering it on phones.
export default function OutsideCourses({
  subject,
  withPrograms,
  groups,
  done,
  onToggle,
  onClose,
}: OutsideCoursesProps) {
  const ticked = groups.flatMap((g) => g.codes).filter((code) => done.has(code)).length;
  return (
    <aside
      aria-label="Courses not on the map"
      className="absolute inset-0 z-10 overflow-y-auto bg-surface p-5 text-sm md:static md:w-96 md:shrink-0 md:border-l md:border-line"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">Courses not on the map</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded px-2 text-2xl leading-none text-ink-muted hover:bg-canvas"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-ink-muted">
        {subject} prerequisites{withPrograms && " and the programs"} also ask for these. Tick the ones
        you&apos;ve finished ({ticked} ticked).
      </p>
      {groups.map((group) => (
        <section key={group.title} className="mt-5">
          <h3 className="mb-2 font-semibold">{group.title}</h3>
          <div className="flex flex-wrap gap-2">
            {group.codes.map((code) => (
              <TickChip key={code} code={code} checked={done.has(code)} onToggle={() => onToggle(code)} />
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}
