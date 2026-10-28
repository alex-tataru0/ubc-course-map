import type { Metadata } from "next";
import { loadCourses } from "@/lib/data";
import { undergradOnly } from "@/lib/graph";
import { feedbackUrl, REPO_URL } from "@/lib/links";
import { FACULTIES, forwardScript, hashFor } from "@/lib/subjects";
import type { Faculty } from "@/lib/subjects";

const subjectCount = FACULTIES.reduce((n, f) => n + f.subjects.length, 0);

export const metadata: Metadata = {
  title: "UBC Course Map",
  description: "Plan UBC Science, engineering and Arts courses with the prerequisite graph.",
  // What Reddit, Discord, iMessage and others show when the link is pasted. The image is the
  // CPSC map with CPSC 340 picked (public/og.png, 1200×630); they print the title and
  // description next to it, so the image has no text of its own.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "UBC Course Map",
    title: "UBC Course Map",
    description:
      "See what every course needs and unlocks, plan your path and check past grades. " +
      `${subjectCount} Science, engineering and Arts subjects. Free, unofficial student project.`,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "The CPSC map with CPSC 340 picked and the courses it needs highlighted in orange",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

// How many undergraduate courses a faculty's maps show, worked out during the build.
function courseCount(faculty: Faculty): number {
  return faculty.subjects.reduce((n, s) => n + undergradOnly(loadCourses(s.code).courses).length, 0);
}

// The home page: what the site does, and a card per faculty with a link to each subject's map.
// The links are plain <a> tags, so each page loads fresh: Next's <Link> would switch pages in
// the browser, and then the pages' small scripts (forwardScript, pendingSubjectScript) don't
// run. It would also fetch each faculty's page (a megabyte or more) ahead of time.
export default function Home() {
  return (
    <>
      {/* Old links like /#math go on to /science#math, before anything is drawn. */}
      <script dangerouslySetInnerHTML={{ __html: forwardScript() }} />
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-header-line bg-header px-4 py-3 text-header-ink sm:px-5">
        <p className="text-xs font-medium uppercase tracking-wide text-header-muted">UBC Course Map</p>
        <p className="text-xs text-header-muted">
          Unofficial student project, not affiliated with UBC ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline hover:text-header-ink">
            Source
          </a>
          {" · "}
          <a
            href={feedbackUrl("Home page")}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline hover:text-header-ink"
          >
            Feedback
          </a>
        </p>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plan your UBC courses</h1>
        <p className="mt-2 max-w-2xl text-ink-muted sm:text-lg">
          See what every course needs and unlocks, mark the ones you&apos;ve taken, find the shortest
          path to any course, and check past grades.
        </p>
        {/* One card per faculty: three in a row on wide screens, two on tablets, one on phones. */}
        <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FACULTIES.map((faculty) => (
            <section key={faculty.slug} className="flex flex-col rounded-xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-lg font-semibold">{faculty.tab}</h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                {faculty.subjects.length} subjects · {courseCount(faculty)} undergraduate courses · {faculty.about}
              </p>
              <ul className="mt-3.5 flex flex-wrap gap-1.5">
                {faculty.subjects.map((s) => (
                  <li key={s.code}>
                    <a
                      href={`/${faculty.slug}${hashFor(s.code, faculty)}`}
                      className="inline-block rounded-md border border-line bg-canvas px-2 py-0.5 text-sm hover:border-ink-muted"
                    >
                      <span className="font-mono text-xs font-semibold">{s.code}</span> {s.name}
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href={`/${faculty.slug}`}
                className="mt-4 self-start rounded-lg bg-role-selected px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Open the {faculty.tab} maps →
              </a>
            </section>
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-muted">
          The courses you mark and the program you pick are saved in this browser, and every faculty&apos;s
          page shares them.
        </p>
      </main>
    </>
  );
}
