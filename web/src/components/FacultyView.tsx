"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { SubjectMap } from "@/lib/subjectMap";
import { feedbackUrl, REPO_URL } from "@/lib/links";
import { hashFor, subjectFromHash } from "@/lib/subjects";
import type { Faculty } from "@/lib/subjects";
import type { Course, CourseGrades, Program } from "@/lib/types";
import CourseGraph from "./CourseGraph";
import EdgeLegend from "./Legend";
import SubjectPicker from "./SubjectPicker";

interface FacultyViewProps {
  faculty: Faculty;
  maps: SubjectMap[]; // one per subject, in the faculty's order
  details: Course[]; // every course in the faculty, for the side panel, statuses and paths
  grades: Record<string, CourseGrades>; // from UBCGrades, for the courses that have any
  gradeSessions: string[]; // the terms the grade data covers, oldest first
  programs: Program[];
  programUrl: string;
  programSubject: string; // the subject the programs belong to, e.g. "CPSC"
}

// The address changes when a subject is picked, and with the back and forward buttons.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

// A faculty's page: the header with the subject menu, and the map of the subject picked.
// The subject is kept in the address (#math), so a link or a refresh opens the same map.
export default function FacultyView({ faculty, maps, ...data }: FacultyViewProps) {
  // While the page is built there's no address, so the home subject is pre-rendered.
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const subject = subjectFromHash(hash, faculty);
  const map = maps.find((m) => m.subject === subject)!;

  // A link like /#biol hides the menu and the map until they show its subject (see
  // pendingSubjectScript). The first render matches the pre-rendered home subject; the
  // next one reads the address, and then they can be shown.
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.pendingSubject === subject) delete root.dataset.pendingSubject;
  }, [subject]);

  const pickSubject = (code: string) => {
    if (code === subject) return;
    const { pathname, search } = window.location;
    window.history.pushState(null, "", `${pathname}${search}${hashFor(code, faculty)}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-1.5 border-b border-header-line bg-header px-4 py-2 text-header-ink sm:px-5 sm:py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-header-muted">UBC Course Map</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{faculty.name}</h1>
            <span data-subject-view>
              <SubjectPicker subjects={faculty.subjects} value={subject} onChange={pickSubject} />
            </span>
          </div>
          <p className="mt-1 text-sm text-header-muted">
            Click a course to see what it needs and unlocks
            <span className="hidden sm:inline">, or mark the ones you&apos;ve taken</span>.
          </p>
        </div>
        <div className="space-y-0.5 sm:space-y-1 sm:text-right">
          <EdgeLegend />
          <p className="text-xs text-header-muted">
            {/* Short enough to keep the header on one row at 1440px. */}
            Unofficial student project, not affiliated with UBC. Data:{" "}
            <a href={map.calendarUrl} target="_blank" rel="noreferrer" className="underline hover:text-header-ink">
              UBC Calendar
            </a>{" "}
            and{" "}
            <a href="https://ubcgrades.com" target="_blank" rel="noreferrer" className="underline hover:text-header-ink">
              UBCGrades
            </a>
            {" · "}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline hover:text-header-ink">
              Source
            </a>
            {" · "}
            {/* A GitHub issue with a short form, starting from the subject on screen. */}
            <a
              href={feedbackUrl(`${subject} map`)}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline hover:text-header-ink"
            >
              Feedback
            </a>
          </p>
        </div>
      </header>
      {/* min-h-0 lets this area be shorter than what's in it, so a long side panel scrolls
          on its own instead of stretching the page. */}
      <div className="min-h-0 flex-1" data-subject-view>
        <CourseGraph map={map} maps={maps} onSubject={pickSubject} {...data} />
      </div>
    </main>
  );
}
