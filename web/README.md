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

## Where things are

- `src/app/page.tsx` runs at build time: it reads `../data/courses/cpsc.json`, builds and lays out the graph, and renders the header.
- `src/components/` holds the React pieces: `CourseGraph` (the graph, with React Flow), `CourseDetails` (the side panel), `SelectionBar` and `Legend`.
- `src/lib/` holds the logic, with no React in it, and a test file next to each module:
  - `graph.ts`: course data to nodes and edges; what a course needs and unlocks.
  - `sections.ts`: which courses go in the co-op and "other" sections.
  - `layout.ts`: rows in year order, positions (with dagre) and the year bands.
  - `highlight.ts`: how each course and line is drawn when one is selected.
  - `details.ts`: tidies descriptions and prerequisite trees for the side panel.
