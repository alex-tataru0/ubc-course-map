import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FacultyView from "@/components/FacultyView";
import { loadCourses, loadGrades, loadPrograms } from "@/lib/data";
import { gradesFor } from "@/lib/grades";
import { undergradOnly } from "@/lib/graph";
import { readSentences } from "@/lib/progress";
import { withCommunicationCourses } from "@/lib/science";
import { subjectMap } from "@/lib/subjectMap";
import { FACULTIES, pendingSubjectScript, SCIENCE } from "@/lib/subjects";
import type { Faculty } from "@/lib/subjects";
import type { Program } from "@/lib/types";

// One page per faculty: /science and /engineering. With the static export, each is built
// once during `npm run build`, and any other address is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return FACULTIES.map((f) => ({ faculty: f.slug }));
}

type Props = { params: Promise<{ faculty: string }> };

function facultyFor(slug: string): Faculty {
  return FACULTIES.find((f) => f.slug === slug) ?? notFound();
}

// The subject list for the description, e.g. "from Astronomy to Statistics".
function span(faculty: Faculty): string {
  const names = faculty.subjects.map((s) => s.name);
  return `from ${names[0]} to ${names[names.length - 1]}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const faculty = facultyFor((await params).faculty);
  const count = `${faculty.subjects.length} ${faculty.name} subjects`;
  return {
    title: `${faculty.name} · UBC Course Map`,
    description: `Plan UBC ${faculty.name} courses, ${span(faculty)}, with the prerequisite graph.`,
    // What Reddit, Discord, iMessage and others show when the link is pasted. The image is one
    // of the faculty's maps with a course picked (`preview`); they print the title and
    // description next to it, so the image has no text of its own.
    openGraph: {
      type: "website",
      url: `/${faculty.slug}`,
      siteName: "UBC Course Map",
      title: `${faculty.name} · UBC Course Map`,
      description:
        "See what every course needs and unlocks, plan your path and check past grades. " +
        `${count}. Free, unofficial student project.`,
      images: [{ url: faculty.preview.image, width: 1200, height: 630, alt: faculty.preview.alt }],
    },
    twitter: { card: "summary_large_image" },
  };
}

// A faculty's page: one map per subject, picked from a menu.
export default async function FacultyPage({ params }: Props) {
  const faculty = facultyFor((await params).faculty);
  const files = faculty.subjects.map((s) => loadCourses(s.code));
  // Every undergraduate course on the site, for the side panel, statuses and paths, which
  // cross subjects (CPSC 340 needs MATH 221) and faculties (ELEC 201 needs MATH 101, CPSC 221
  // can follow CPEN 221). Only this faculty's subjects get maps.
  const others = FACULTIES.filter((f) => f.slug !== faculty.slug);
  // Their descriptions are never shown on this page (their courses link to their own page), so
  // they keep only the sentences the site reads, which makes the page much smaller.
  const otherCourses = others
    .flatMap((f) => f.subjects.flatMap((s) => undergradOnly(loadCourses(s.code).courses)))
    .map((c) => ({ ...c, description: readSentences(c.description) }));
  const details = [...files.flatMap((file) => undergradOnly(file.courses)), ...otherCourses];
  // Other faculties' courses that this faculty's students usually can't take, which paths
  // only use when there's no other way (engineering courses, on the Science page).
  const closed = others
    .filter((f) => !f.openToAll)
    .flatMap((f) => f.subjects.flatMap((s) => undergradOnly(loadCourses(s.code).courses)))
    .map((c) => c.code);
  // Grades are only shown for courses on this page's maps.
  const codes = files.flatMap((file) => undergradOnly(file.courses)).map((c) => c.code);
  const gradeFiles = faculty.subjects.map((s) => loadGrades(s.code));
  // Every term any subject has grades for. A subject can skip a term (ENVR has no summer
  // courses most years). "2021S" sorts before "2021W", so plain sorting is time order.
  const gradeSessions = [...new Set(gradeFiles.flatMap((file) => file.sessions))].sort();
  // The page lists its own faculty's programs. The others come too (they're small), so a
  // program picked on another page still shows here: an engineering program's MATH courses
  // are marked on the MATH map.
  // Each program links to its calendar page: its own (engineering, the Science subjects') or
  // its file's (the CS programs all come from the Computer Science page). Science programs'
  // "Additional Communication Requirement" rows become a choice of the courses that meet it.
  const programsOf = (f: Faculty) =>
    f.programFiles.flatMap((name) => {
      const file = loadPrograms(name);
      return file.programs.map((p) => {
        const program: Program = { ...p, sources: p.sources ?? [file.source], degree: f.degree };
        return f === SCIENCE ? withCommunicationCourses(program) : program;
      });
    });
  const programs = programsOf(faculty);
  // Arts has no programs yet, so nothing to link to.
  const programUrl = faculty.programFiles.length > 0 ? loadPrograms(faculty.programFiles[0]).source : "";

  return (
    <>
      {/* Runs before the page is drawn, so a link like /science#biol doesn't flash the CPSC map. */}
      <script dangerouslySetInnerHTML={{ __html: pendingSubjectScript(faculty) }} />
      <FacultyView
        faculty={faculty}
        maps={files.map(subjectMap)}
        details={details}
        grades={Object.assign({}, ...gradeFiles.map((file) => gradesFor(file, codes)))}
        gradeSessions={gradeSessions}
        programs={programs}
        otherPrograms={others.flatMap(programsOf)}
        programUrl={programUrl}
        programsNote={faculty.programsNote}
        programsByMajor={faculty.programsByMajor}
        closed={closed}
      />
    </>
  );
}
