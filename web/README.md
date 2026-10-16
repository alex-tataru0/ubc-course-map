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

- `src/app/page.tsx` runs at build time: it reads every subject's file in `../data/courses/` and `../data/grades/` plus `../data/programs/cpsc.json`, lays out one map per subject, and renders the Faculty of Science page. Its metadata includes the link-preview card (`public/og.png`). `layout.tsx` has the fonts, the site's address and Vercel Web Analytics.
- `src/components/` holds the React pieces:
  - `FacultyView` (the header, the subject menu and the subject in the address), `SubjectPicker` (the menu) and `Legend`.
  - `CourseGraph` (the map, with React Flow, and which side panel shows), `SelectionBar`, `ProgressBar` (marking courses, the summary and "Clear all"), `Status` (how each status looks, tick boxes).
  - Side panels: `CourseDetails` (a course, including "Your path here"), `Grades` (its grade chart and teaching history), `OutsideCourses` (courses not on the map), `ProgramPanel` with `ProgramButton` and `ProgramStripe` (the picked program). `usePanelFocus` moves keyboard focus into a panel and back.
  - `WithLinks`: calendar text with its web addresses as short links.
- `src/lib/` holds the logic, with no React in it, and a test file next to each module:
  - `subjects.ts`: the faculty and its subjects, and the subject in the address (`#math`).
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
