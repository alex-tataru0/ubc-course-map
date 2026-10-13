import type { ReactNode } from "react";
import { displayCode, simplifyTree, splitDescription } from "@/lib/details";
import type { Course, ReqNode, Requisite } from "@/lib/types";

interface CourseDetailsProps {
  course: Course;
  onMap: Set<string>; // courses drawn on the page, which can be clicked
  calendarUrl: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

// The panel on the right that opens when a course is clicked.
export default function CourseDetails({ course, onMap, calendarUrl, onSelect, onClose }: CourseDetailsProps) {
  const { summary, hours } = splitDescription(course.description);
  const links = { onMap, onSelect };

  return (
    <aside className="absolute inset-y-0 right-0 z-10 w-full overflow-y-auto border-l border-zinc-200 bg-white p-5 text-sm shadow-xl sm:w-96 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{course.code}</h2>
          <p className="text-zinc-700 dark:text-zinc-300">{course.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded px-2 text-2xl leading-none text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {course.credits} credits
        {hours && ` · Hours per week (lecture-lab-tutorial): ${hours}`}
      </p>
      <p className="mt-3 leading-relaxed">{summary}</p>

      <Section title="Prerequisites">
        {course.prereq ? <RequisiteView requisite={course.prereq} {...links} /> : <p>None</p>}
      </Section>
      {course.coreq && (
        <Section title="Corequisites (before or at the same time)">
          <RequisiteView requisite={course.coreq} {...links} />
        </Section>
      )}
      {course.equivalency && (
        <Section title="Equivalent courses">
          <p>{course.equivalency}. Credit is given for only one of them.</p>
        </Section>
      )}

      <a
        href={calendarUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-block text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        All CPSC courses in the UBC Academic Calendar ↗
      </a>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

interface Links {
  onMap: Set<string>;
  onSelect: (code: string) => void;
}

// The requirement as a tree, then the calendar's own wording, so nothing is hidden
// if the tree reads it wrong.
function RequisiteView({ requisite, ...links }: { requisite: Requisite } & Links) {
  return (
    <>
      <Requirement node={simplifyTree(requisite.tree)} {...links} />
      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        Calendar wording: “{requisite.text}”
        {requisite.source === "llm" && " (turned into the list above by AI, then checked automatically)"}
      </p>
    </>
  );
}

// One node of a requirement tree. Groups become "All of" / "One of" lists.
function Requirement({ node, ...links }: { node: ReqNode } & Links) {
  if (typeof node === "string") return <CourseCode code={node} {...links} />;
  if ("course" in node) {
    return (
      <span>
        <CourseCode code={node.course} {...links} /> with {node.min_grade}% or higher
      </span>
    );
  }
  if ("other" in node) return <span>{node.other}</span>;

  const [label, items] = "one_of" in node ? ["One of:", node.one_of] : ["All of:", node.all_of];
  return (
    <div>
      <span className="font-medium">{label}</span>
      <ul className="mt-1 ml-5 list-disc space-y-1">
        {items.map((child, i) => (
          <li key={i}>
            <Requirement node={child} {...links} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// A course code. Courses on the map are buttons that select them; others are plain text.
function CourseCode({ code, onMap, onSelect }: { code: string } & Links) {
  if (!onMap.has(code)) return <span className="font-mono text-xs">{displayCode(code)}</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect(code)}
      className="rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-xs hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
    >
      {code}
    </button>
  );
}
