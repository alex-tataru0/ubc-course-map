import { useState } from "react";
import { RANGES, chartScale, notShown, percentLabel, shares, termsOffered } from "@/lib/grades";
import type { Course, CourseGrades, GradeTerm } from "@/lib/types";

const number = (n: number) => n.toLocaleString("en-CA");

// The side panel's "Grades" section: three numbers, then how grades spread across the
// ranges, over every term in the data.
export function GradeSummary({ grades }: { grades: CourseGrades }) {
  const terms = termsOffered(grades);
  const hidden = notShown(grades);
  return (
    <>
      <dl className="flex gap-6">
        <Stat label="average" value={`${grades.average.toFixed(1)}%`} />
        <Stat label="students" value={number(grades.reported)} />
        <Stat label={terms === 1 ? "term offered" : "terms offered"} value={String(terms)} />
      </dl>
      <Distribution grades={grades.grades} reported={grades.reported} />
      {hidden > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          The chart leaves out {number(hidden)} {hidden === 1 ? "student" : "students"} whose grade
          range UBC didn&apos;t report.
        </p>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  // The label comes first for screen readers ("average: 80.7%"), the number first on screen.
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}

// The chart is drawn in its own units and stretched to the panel's width.
const WIDTH = 344;
const HEIGHT = 136;
const LEFT = 28; // room for the gridline labels
const TOP = 16; // room for the label on the tallest bar
const BASE = 106; // the baseline
const BAR = 22; // bar width (bars never fill their slot)
const RADIUS = 4; // rounded tops; the bottoms stay square on the baseline

// A column per grade range. Hovering a column, or reaching it with Tab, shows its count.
function Distribution({ grades, reported }: { grades: number[]; reported: number }) {
  const [active, setActive] = useState<number | null>(null);
  const percent = shares(grades, reported);
  const tallest = percent.indexOf(Math.max(...percent));
  const { top, lines } = chartScale(percent[tallest]);
  const slot = (WIDTH - LEFT) / grades.length;
  const y = (share: number) => BASE - (share / top) * (BASE - TOP);
  const barX = (i: number) => LEFT + i * slot + (slot - BAR) / 2;

  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="group"
        aria-label="Share of students in each grade range"
      >
        {lines.map((line) => (
          <g key={line}>
            <line x1={LEFT} x2={WIDTH} y1={y(line)} y2={y(line)} className="stroke-band-a" />
            <text x={LEFT - 6} y={y(line) + 3} textAnchor="end" className="fill-ink-muted text-[10px]">
              {line}%
            </text>
          </g>
        ))}
        {percent.map((share, i) => {
          // A range with any students gets at least a sliver, so it doesn't look empty.
          const height = grades[i] === 0 ? 0 : Math.max(BASE - y(share), 2);
          return (
            <g
              key={i}
              tabIndex={0}
              role="img"
              aria-label={`${RANGES[i].phrase}: ${number(grades[i])} students, ${percentLabel(share)}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="outline-none"
            >
              {/* The hover target is the whole slot, taller than the bar. */}
              <rect x={LEFT + i * slot} y={0} width={slot} height={BASE + 18} fill="transparent" />
              <path
                d={barPath(barX(i), height)}
                className={`fill-role-selected transition-opacity ${
                  active !== null && active !== i ? "opacity-40" : ""
                }`}
              />
              <text
                x={barX(i) + BAR / 2}
                y={BASE + 14}
                textAnchor="middle"
                className={`text-[10px] ${active === i ? "fill-ink font-semibold" : "fill-ink-muted"}`}
              >
                {RANGES[i].tick}
              </text>
            </g>
          );
        })}
        {active === null && (
          <text
            x={barX(tallest) + BAR / 2}
            y={y(percent[tallest]) - 4}
            textAnchor="middle"
            className="fill-ink text-[11px] font-semibold"
          >
            {percentLabel(percent[tallest])}
          </text>
        )}
        <line x1={LEFT} x2={WIDTH} y1={BASE} y2={BASE} className="stroke-line" />
        <text x={LEFT + (WIDTH - LEFT) / 2} y={HEIGHT - 2} textAnchor="middle" className="fill-ink-muted text-[10px]">
          Final grade (%)
        </text>
      </svg>
      {active !== null && <Tooltip index={active} count={grades[active]} share={percent[active]} />}
    </div>
  );
}

// A column with a rounded top: up the left side, round the corner, across, and back down.
function barPath(x: number, height: number): string {
  if (height === 0) return "";
  const r = Math.min(RADIUS, height);
  const top = BASE - height;
  return `M${x},${BASE} V${top + r} Q${x},${top} ${x + r},${top} H${x + BAR - r} Q${x + BAR},${top} ${x + BAR},${top + r} V${BASE} Z`;
}

// Sits above the chart, lined up with the column. Columns on the right get a tooltip that
// ends at the column instead of starting there, so it never runs off the panel.
function Tooltip({ index, count, share }: { index: number; count: number; share: number }) {
  const slot = (WIDTH - LEFT) / RANGES.length;
  const center = ((LEFT + (index + 0.5) * slot) / WIDTH) * 100;
  const side = index < RANGES.length / 2 ? { left: `${center}%` } : { right: `${100 - center}%` };
  return (
    <div
      aria-hidden // screen readers already get the same text from the column's label
      style={side}
      className={`pointer-events-none absolute -top-8 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-canvas shadow-sm ${
        index < RANGES.length / 2 ? "-translate-x-3" : "translate-x-3"
      }`}
    >
      <strong className="font-semibold">
        {number(count)} {count === 1 ? "student" : "students"}
      </strong>{" "}
      · {percentLabel(share)} got {RANGES[index].phrase}
    </div>
  );
}

// One row per term, newest first: the average, how many students, and who taught it.
export function TeachingHistory({ course, terms }: { course: Course; terms: GradeTerm[] }) {
  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th className="pr-2 pb-1 font-medium">Term</th>
            <th className="pr-2 pb-1 text-right font-medium">Avg</th>
            <th className="pr-2 pb-1 text-right font-medium">Students</th>
            <th className="pb-1 font-medium">Instructors</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((term) => (
            <tr key={`${term.session}${term.topic ?? ""}`} className="border-b border-band-a align-top">
              <td className="py-1.5 pr-2 font-mono text-xs leading-5 whitespace-nowrap">{term.session}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{term.average.toFixed(1)}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{number(term.reported)}</td>
              <td className="py-1.5">
                {term.topic && (
                  <span className="block text-xs text-ink-muted">{topicName(course, term)}</span>
                )}
                {term.instructors.length > 0 ? (
                  term.instructors.join(", ")
                ) : (
                  <span className="text-ink-muted">Not listed</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-muted">
        W is the Winter Session (September to April), S is the Summer Session. Averages are
        final grades out of 100.
      </p>
    </>
  );
}

// "CPSC 436C · CLOUD COMPUTING". The topic's own title is left out when it's just the
// course's title again ("Topics in Computer Science").
function topicName(course: Course, term: GradeTerm): string {
  const code = `${course.code}${term.topic}`;
  return term.title && term.title !== course.title ? `${code} · ${term.title}` : code;
}
