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

- `src/app/page.tsx` runs at build time: it reads `../data/courses/cpsc.json` and `../data/grades/cpsc.json`, builds and lays out the graph, and renders the header.
- `src/components/` holds the React pieces: `CourseGraph` (the graph, with React Flow), `CourseDetails` (the side panel, including "Your path here"), `ProgressBar` (marking courses and the summary), `OutsideCourses` (the list of MATH, STAT and other courses), `Grades` (the grade chart and teaching history in the side panel), `Status` (how each status looks, tick boxes), `SelectionBar` and `Legend`.
- `src/lib/` holds the logic, with no React in it, and a test file next to each module:
  - `graph.ts`: course data to nodes and edges; what a course needs and unlocks.
  - `sections.ts`: which courses go in the co-op and "other" sections.
  - `layout.ts`: rows in year order, positions (with dagre) and the year bands.
  - `highlight.ts`: how each course and line is drawn when one is selected.
  - `details.ts`: tidies descriptions and prerequisite trees for the side panel.
  - `progress.ts`: whether a requirement is met for the courses done, and each course's status.
  - `doneCourses.ts`: saves the courses you've done in the browser (`useDoneCourses`).
  - `outside.ts`: the courses prerequisites mention that aren't on the map, grouped by subject.
  - `path.ts`: the shortest path to a course, term by term.
  - `grades.ts`: helpers for the grade data from UBCGrades (shares, chart scale, terms offered, instructors).
  - `links.ts`: the r/ubc, Rate My Professors and UBCGrades links (plain search URLs; nothing is fetched).
