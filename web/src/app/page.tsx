import { readFileSync } from "node:fs";
import path from "node:path";
import CourseGraph from "@/components/CourseGraph";
import EdgeLegend from "@/components/Legend";
import type { PlacedCourse } from "@/components/CourseGraph";
import { gradesFor } from "@/lib/grades";
import { buildGraph, toGraphNode, undergradOnly } from "@/lib/graph";
import { layoutGraph } from "@/lib/layout";
import { splitCourses } from "@/lib/sections";
import type { CourseFile, GradesFile, ProgramFile } from "@/lib/types";

// This is a server component. With the static export it runs once, during `npm run build`,
// so the finished site is plain HTML and JSON and never calls an API.
// process.cwd() is web/ during the build, and the pipeline's output sits next to it.
function loadJson(...parts: string[]) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "..", "data", ...parts), "utf8"));
}

function loadCourses(subject: string): CourseFile {
  return loadJson("courses", `${subject}.json`);
}

function loadGrades(subject: string): GradesFile {
  return loadJson("grades", `${subject}.json`);
}

function loadPrograms(subject: string): ProgramFile {
  return loadJson("programs", `${subject}.json`);
}

export default function Home() {
  const data = loadCourses("cpsc");
  const { main, coop, other } = splitCourses(undergradOnly(data.courses));
  const graph = buildGraph(main);
  const sections = [
    { title: "Co-op work terms", nodes: coop.map(toGraphNode) },
    { title: "Other CPSC courses (for other programs, or by permission)", nodes: other.map(toGraphNode) },
  ];
  const { positions, labels, bands, width } = layoutGraph(graph, sections);

  const nodes = [...graph.nodes, ...sections.flatMap((s) => s.nodes)];
  const courses: PlacedCourse[] = nodes.map((n) => ({ ...n, ...positions.get(n.id)! }));
  const details = [...main, ...coop, ...other];
  const grades = loadGrades("cpsc");
  const programs = loadPrograms("cpsc");

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-1.5 border-b border-header-line bg-header px-4 py-2 text-header-ink sm:px-5 sm:py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">UBC Course Map</h1>
          <p className="text-sm text-header-muted">
            {/* Phones only get the middle part, to save space. */}
            <span className="hidden sm:inline">Computer Science (CPSC) prerequisites. </span>
            Click a course to see what it needs and unlocks
            <span className="hidden sm:inline">, or mark the ones you&apos;ve taken</span>.
          </p>
        </div>
        <div className="space-y-0.5 sm:space-y-1 sm:text-right">
          <EdgeLegend />
          <p className="text-xs text-header-muted">
            {/* Short enough to keep the header on one row at 1440px. */}
            Unofficial student project, not affiliated with UBC. Data:{" "}
            <a href={data.source} target="_blank" rel="noreferrer" className="underline hover:text-header-ink">
              UBC Calendar
            </a>{" "}
            and{" "}
            <a href="https://ubcgrades.com" target="_blank" rel="noreferrer" className="underline hover:text-header-ink">
              UBCGrades
            </a>
            {" · "}
            <a
              href="https://github.com/alex-tataru0/ubc-course-map"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-header-ink"
            >
              Source on GitHub
            </a>
          </p>
        </div>
      </header>
      {/* min-h-0 lets this area be shorter than what's in it, so a long side panel scrolls
          on its own instead of stretching the page. */}
      <div className="min-h-0 flex-1">
        <CourseGraph
          courses={courses}
          edges={graph.edges}
          labels={labels}
          bands={bands}
          width={width}
          details={details}
          grades={gradesFor(grades, details.map((c) => c.code))}
          gradeSessions={grades.sessions}
          calendarUrl={data.source}
          programs={programs.programs}
          programUrl={programs.source}
        />
      </div>
    </main>
  );
}
