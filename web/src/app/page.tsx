import { readFileSync } from "node:fs";
import path from "node:path";
import CourseGraph from "@/components/CourseGraph";
import EdgeLegend from "@/components/Legend";
import type { PlacedCourse } from "@/components/CourseGraph";
import { buildGraph, toGraphNode, undergradOnly } from "@/lib/graph";
import { layoutGraph } from "@/lib/layout";
import { splitCourses } from "@/lib/sections";
import type { CourseFile } from "@/lib/types";

// This is a server component. With the static export it runs once, during `npm run build`,
// so the finished site is plain HTML and JSON and never calls an API.
function loadCourses(subject: string): CourseFile {
  // process.cwd() is web/ during the build, and the pipeline's output sits next to it.
  const file = path.join(process.cwd(), "..", "data", "courses", `${subject}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
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

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-1.5 border-b border-header-line bg-header px-4 py-2 text-header-ink sm:px-5 sm:py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">UBC Course Map</h1>
          <p className="text-sm text-header-muted">
            {/* The first sentence is hidden on phones to save space. */}
            <span className="hidden sm:inline">Computer Science (CPSC) prerequisites, first year to fourth. </span>
            Click a course to see what it needs and what it unlocks.
          </p>
        </div>
        <div className="space-y-0.5 sm:space-y-1 sm:text-right">
          <EdgeLegend />
          <p className="text-xs text-header-muted">
            Unofficial student project, not affiliated with UBC. Data from the{" "}
            <a href={data.source} target="_blank" rel="noreferrer" className="underline hover:text-header-ink">
              UBC Academic Calendar
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
      <div className="flex-1">
        <CourseGraph
          courses={courses}
          edges={graph.edges}
          labels={labels}
          bands={bands}
          width={width}
          details={[...main, ...coop, ...other]}
          calendarUrl={data.source}
        />
      </div>
    </main>
  );
}
