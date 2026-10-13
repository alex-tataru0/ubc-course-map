import { readFileSync } from "node:fs";
import path from "node:path";
import CourseGraph from "@/components/CourseGraph";
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
  const { positions, labels } = layoutGraph(graph, sections);

  const nodes = [...graph.nodes, ...sections.flatMap((s) => s.nodes)];
  const courses: PlacedCourse[] = nodes.map((n) => ({ ...n, ...positions.get(n.id)! }));

  return (
    <main className="flex h-screen flex-col">
      <header className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <h1 className="font-semibold">UBC Course Map: CPSC</h1>
      </header>
      <div className="flex-1">
        <CourseGraph
          courses={courses}
          edges={graph.edges}
          labels={labels}
          details={[...main, ...coop, ...other]}
          calendarUrl={data.source}
        />
      </div>
    </main>
  );
}
