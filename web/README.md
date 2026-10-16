# UBC Course Map: website

The Next.js site that draws the prerequisite graph. The [main README](../README.md) explains what it does and how the data is built.

## Running it

From this folder:

```
npm install
npm test
npm run dev
```

Then open http://localhost:3000. `npm run build` writes the finished static site to `out/`.

## Deploying

The live site is on Vercel: every push to `main` is built and published. The Vercel project uses this folder as its Root Directory, with the Next.js preset and default settings. The build can read `../data` because Vercel includes files outside the Root Directory by default. No environment variables are needed.

## Where things are

- `src/app/` runs at build time. `[faculty]/page.tsx` builds `/science` and `/engineering`: it reads the faculty's files in `../data/courses/` and `../data/grades/`, every other faculty's course files, and every program file in `../data/programs/` (the page lists its own faculty's programs: `cpsc.json` for Science, `engineering.json` for engineering), lays out one map per subject, and renders the page. `page.tsx` is the home page at `/`, with a card per faculty and the script that forwards old `/#math` links. Their metadata includes the link-preview card: `public/og.png`, or the faculty's own picture (`preview` in `lib/subjects.ts`, e.g. `public/og-engineering.png`). `layout.tsx` has the fonts, the site's address and Vercel Web Analytics.
- `src/components/` holds the React pieces:
  - `FacultyView` (the header with the faculty tabs, the subject menu and the subject in the address), `SubjectPicker` (the menu) and `Legend`.
  - `CourseGraph` (the map, with React Flow, and which side panel shows), `SelectionBar`, `ProgressBar` (marking courses, the summary and "Clear all"), `Status` (how each status looks, tick boxes).
  - Side panels: `CourseDetails` (a course, including "Your path here"), `Grades` (its grade chart and teaching history), `OutsideCourses` (courses not on the map), `ProgramPanel` with `ProgramButton` and `ProgramStripe` (the picked program). `usePanelFocus` moves keyboard focus into a panel and back.
  - `WithLinks`: calendar text with its web addresses as short links.
- `src/lib/` holds the logic, with no React in it, and a test file next to each module:
  - `subjects.ts`: the faculties and their subjects, the subject and course in the address (`#math`, `#math-221`), links to courses on other faculties' pages, and forwarding old links.
  - `data.ts`: reads the pipeline's files during the build.
  - `subjectMap.ts`: everything one subject's map needs, worked out at build time.
  - `graph.ts`: course data to nodes and edges; what a course needs and unlocks.
  - `sections.ts`: which courses go in the co-op and "other" sections.
  - `layout.ts`: rows in year order, positions (with dagre) and the year bands.
  - `highlight.ts`: how each course and line is drawn when one is selected.
  - `view.ts`: whether a course is in sight, and where to move the view to show it.
  - `details.ts`: tidies descriptions and prerequisite trees for the side panel.
  - `progress.ts`: whether a requirement is met for the courses done, each course's status, and the description sentences about who can take a course and what rules it out.
  - `doneCourses.ts`: saves the courses you've done in the browser (`useDoneCourses`).
  - `outside.ts`: the courses prerequisites mention that aren't on the map, grouped by subject.
  - `path.ts`: the shortest path to a course, term by term.
  - `grades.ts`: helpers for the grade data from UBCGrades (shares, chart scale, terms offered, instructors).
  - `program.ts`: progress through a program's requirements (which of your courses count toward which row, each course once).
  - `programChoice.ts`: saves the picked program in the browser.
  - `links.ts`: links out of the site (r/ubc, Rate My Professors, UBCGrades, the feedback form) and the web addresses in calendar text. Nothing is fetched.
  - `types.ts`: the shapes of the data files the pipeline writes.
