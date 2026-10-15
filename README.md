# UBC Course Map

![CI](https://github.com/alex-tataru0/ubc-course-map/actions/workflows/ci.yml/badge.svg)

A website for UBC students to plan courses using the prerequisite graph.

**Try it: [ubc-course-map.vercel.app](https://ubc-course-map.vercel.app)**

> Work in progress. Unofficial, not affiliated with UBC.

![Opening CPSC 340, whose path includes MATH 100, 101, 221, 200 and STAT 251, clicking MATH 221 to open it on the Mathematics map and show its grade distribution, then picking Biology from the menu, opening BIOL 200 and clicking CHEM 123 in its prerequisites to open it on the Chemistry map, where its path is CHEM 121 and Chemistry 12](docs/demo.gif)

## Features

- [x] Prerequisite maps for 14 Faculty of Science subjects, from Astronomy and Biology to Computer Science, Mathematics, Physics and Statistics, one per subject on a Faculty of Science page, laid out from first year to fourth.
- [x] Click a course to highlight everything it needs and everything it unlocks.
- [x] Course details: description, credits, and the exact prerequisite rule, including courses from other departments. A course from another subject opens on that subject's map.
- [x] "What can I take next?": mark the courses you've done (in any subject) and every course shows whether you can take it.
- [x] The shortest path to any course from the courses you've done, term by term and across subjects, in the side panel and on the map.
- [x] Grades for each course since 2021: the average, a chart of how grades spread, and who taught it each term (from UBCGrades).
- [x] Links to r/ubc posts and UBCGrades for each course, and a Rate My Professors search for each instructor.
- [x] Pick your program (the Computer Science Major or Honours, the AI option, or Software Engineering) to see its requirements year by year, which ones you've finished, and its courses marked on the map.
- [ ] More faculties, and combined majors.

## How the course data is built

All of this runs once, ahead of time. The website only loads the finished JSON files.

1. **Parse the calendar.** `parse_courses.py` reads the UBC Academic Calendar page for a subject and gets each course's code, title, credits and description.
2. **Cut out the requirements.** `requisites.py` finds the "Prerequisite:", "Corequisite:" and "Equivalency:" text in each description. Advice like "One of MATH 152, MATH 221, MATH 223 is recommended" is kept apart, since you don't need it to take the course. A prerequisite that is only advice ("A background in … is highly recommended") isn't a requirement at all.
3. **Turn the text into a tree.** "One of CPSC 210, CPEN 221 and …" becomes nested `one_of` / `all_of` groups, with optional minimum grades and free-text requirements like "Third-year standing".
   - **Rules first.** `prereq_tree.py` handles the common patterns: single courses, "One of", "All of", "Either … or", chains joined by "and", lettered options like "Either (a) … or (b) …", and minimum grades like "a score of 68% or higher in MATH 226". Text with no course codes (like "Permission of the Department Head", "and Third-year standing", a last sentence like "Familiarity with a programming language is required", or a high school course like "PHYS 12") is kept as one thing to check, next to the courses. Codes written without a space ("MICB306") get one, and a bare number after a code is read as the same subject ("STAT 200, 201" means STAT 201). The rules refuse anything they aren't sure about instead of guessing.
   - **Gemini for the rest.** `llm.py` sends the leftover sentences to Gemini (free tier) with a short prompt and a few examples. Every answer is cached in `data/llm_cache/prereqs.json`, so each sentence is only ever sent once, and the data can be rebuilt without an API key.
   - **Every tree is checked.** A checker makes sure the tree has a valid shape and mentions exactly the courses in the sentence, with none dropped and none made up. Anything it flags is marked for review.
4. **Write the output.** `build_prereqs.py` writes one file per subject, like `data/courses/cpsc.json`. It downloads each subject's calendar page once and keeps it in `data/raw/`.

### Accuracy (October 2026)

Every prerequisite and corequisite was checked by hand against the calendar text.

| Subject | Courses | Prereqs and coreqs | Read by rules | Read by Gemini | Correct |
|---|---|---|---|---|---|
| ASTR | 28 | 13 | 13 | 0 | 13 / 13 |
| ATSC | 26 | 15 | 15 | 0 | 15 / 15 |
| BIOL | 136 | 119 | 112 | 7 | 119 / 119 |
| CHEM | 115 | 75 | 73 | 2 | 75 / 75 |
| CPSC | 112 | 51 | 46 | 5 | 51 / 51 |
| DSCI | 32 | 25 | 23 | 2 | 25 / 25 |
| ENVR | 21 | 19 | 18 | 1 | 19 / 19 |
| EOSC | 144 | 74 | 71 | 3 | 74 / 74 |
| ISCI | 24 | 21 | 21 | 0 | 21 / 21 |
| MATH | 177 | 110 | 103 | 7 | 110 / 110 |
| MICB | 47 | 36 | 34 | 2 | 36 / 36 |
| PHYS | 116 | 96 | 93 | 3 | 96 / 96 |
| SCIE | 15 | 9 | 9 | 0 | 9 / 9 |
| STAT | 54 | 30 | 26 | 4 | 30 / 30 |
| **Total** | **1,047** | **693** | **657 (95%)** | **36** | **693 / 693** |

Gemini wasn't always right on the first try, and the checker can't catch every kind of mistake, so every answer is checked by hand:
- **CPSC:** the first version of the rules sent 13 prerequisites to Gemini, and it got 12 right on the first try. CPSC 121 treated high school courses as UBC course codes, which the checker flagged.
- **MATH and STAT:** 17 sent, 15 right on the first try. MATH 551 dropped the "MATH 550." at the start, which the checker flagged. STAT 321 turned "STAT 305 may be taken concurrently" into an extra requirement instead of another choice. The checker can't see that kind of mistake; the hand check did.
- **The other 11 Science subjects:** 20 sent, 16 right on the first try. BIOL 201 and BIOL 234 turned "a corequisite of …" into prerequisites, though a corequisite can be taken at the same time. EOSC 440 put the "…, and MATH 200, and …" in its list into the one_of before it, so MATH 200 became optional. PHYS 107 wrote "85% or higher in PHYS 100" as text instead of a course with a minimum grade. The checker flagged none of them, since every course was still in the tree.
- Each time, the prompt got a new rule and an example, only the wrong answers were asked again, and they came back right.

The rules written for MATH and STAT also read 7 of the 13 CPSC prerequisites Gemini had answered: 4 come out exactly like Gemini's checked answers, and the other 3 have no course codes, so their text is kept whole. The rules for text next to course codes then read 7 more that Gemini had answered (CPSC 491 and MATH 121, 312, 440, 442, 443, 444), all exactly like Gemini's checked answers.

Known gaps:
- CPSC 448's requirement isn't labelled "Prerequisite:" in the calendar, so it isn't captured.
- EOSC 355 says "Either (a) SCIE 001 or (b) one of MATH 101, …; and one of CHEM 110, … and one of PHYS 101, …". Read word for word, as the data does, Science One students also need a CHEM and a PHYS course. EOSC 340 and 372 list the same courses with all three inside (b), so the semicolon is probably a typo.
- Advice labelled "Recommended pre-requisite:" (ATSC 212, PHYS 170, PHYS 500 and a few MATH courses) isn't kept apart as a recommendation yet. It's still in the course description.
- "Not for students with credit for …" exclusions aren't extracted by the pipeline yet. The website reads them from the description for now.
- Requirements that aren't courses (year standing, credit counts, department permission) are kept as text, so the website shows them as "check first" instead of deciding.

### Running it

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt
pytest
python pipeline/build_prereqs.py
```

With no arguments, `build_prereqs.py` builds all 14 subjects in the table. To build only some, name them: `python pipeline/build_prereqs.py MATH STAT`.

A Gemini API key is only needed when there are prerequisites the cache doesn't have yet. Put it in a `.env` file (see `.env.example`). There are 200 `pytest` tests for the whole pipeline.

## How the grade data is built

`build_grades.py` pulls grade distributions from the [UBCGrades](https://ubcgrades.com) API, which republishes UBC PAIR's data. Like the course data, it runs ahead of time, about once a term.

1. **Download each term once.** One request per term and subject gets every section: 10 terms, 2021 Summer to 2025 Winter, for each of the 14 subjects. The responses are saved as they are in `data/raw/grades/`. A term that's already saved isn't downloaded again, so a new term means one new request per subject. When a subject had no sections in a term (ENVR in most summers), UBCGrades answers "404 Not Found", and that term is saved as an empty list.
2. **Add up the sections.** For each course and term: the number of students, the average weighted by students, the count in each grade range, and every instructor. Topics courses like CPSC 436N (NLP) and 436C (Cloud Computing) get a row each.
3. **Check against UBCGrades' own totals.** UBCGrades sends its own total for most course-terms, but not for 2021, so every term is added up from its sections instead. The 2,557 totals it does send match ours exactly, and a test checks this for every subject.
4. **Write the output.** One file per subject, like `data/grades/cpsc.json`:

| Subject | Courses | Course-terms | Grades |
|---|---|---|---|
| ASTR | 17 | 76 | 3,920 |
| ATSC | 11 | 35 | 6,166 |
| BIOL | 108 | 528 | 74,367 |
| CHEM | 87 | 365 | 59,069 |
| CPSC | 79 | 408 | 80,088 |
| DSCI | 32 | 124 | 21,089 |
| ENVR | 14 | 44 | 2,210 |
| EOSC | 98 | 393 | 34,091 |
| ISCI | 13 | 63 | 2,164 |
| MATH | 136 | 516 | 99,478 |
| MICB | 38 | 165 | 14,101 |
| PHYS | 71 | 302 | 50,621 |
| SCIE | 4 | 17 | 7,618 |
| STAT | 33 | 166 | 25,599 |
| **Total** | **741** | **3,202** | **480,581** |

About 1–5% of students, depending on the subject (9% in ASTR), are in a grade range whose count UBC PAIR doesn't give. They're still counted in each course's total, and the chart says how many it leaves out.

```
python pipeline/build_grades.py
```

With no arguments it does every subject; `python pipeline/build_grades.py MATH` does just one. Add `--refresh` to download every term again. No API key is needed.

## How the program data is built

`build_programs.py` reads the six programs on the calendar's [Computer Science page](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/bachelor-science/computer-science): the Major and Honours in Computer Science, the same two with the Artificial Intelligence option, and the Major and Honours in Computer Science and Software Engineering. Like the rest of the data, it runs ahead of time.

1. **Save the page once.** The calendar page is downloaded once to `data/raw/programs/` and read from there. Deleting the file downloads it again, e.g. for a new calendar year.
2. **Read the tables.** `parse_programs.py` finds each program's heading and table, splits it into years (First Year, Second Year, Third and Fourth Years), and keeps each requirement's credits and footnotes. The Major and Honours share a first-year table, and a year the calendar only describes as "Same as …" another program is copied from that program. A test checks that the credits add up for every year and every degree (120 for a Major, 132 for an Honours).
3. **Turn each requirement into a tree.** `program_rules.py` reads rows like "MATH 100 or 102 or 104 (or 180 or 184 or 120 or 110)", "Three of CPSC 304, 330, …, AI 422 at least 6 credits of which must be 400 or above" and "CPSC or AI courses numbered 300 or higher" into `one_of`, `all_of`, `pick`, `credits_of`, electives and free text. Shorthand like "CPSC 310, 313, 320" is written out in full, and a checker makes sure each tree has exactly the courses in its row, like the one for prerequisites.
4. **Gemini only if needed.** A row the rules can't read would go to Gemini, with the answer cached in `data/llm_cache/programs.json`, like the prerequisites. So far the rules read every row, so nothing has been sent.
5. **Write the output.** `data/programs/cpsc.json`: 6 programs, 120 requirements.

### Accuracy (October 2026)

The 120 requirements use 36 different wordings, since most rows repeat across programs (the first year is the same for all six). Every wording was checked by hand against the calendar.

| | Wordings | Correct |
|---|---|---|
| Parsed by rules | 36 | 36 |
| Parsed by Gemini | 0 | – |
| **Total** | **36** | **36 / 36** |

Known gaps:
- Only the six programs on the Computer Science page. Combined majors and honours (Computer Science with another subject) will come with more subjects.
- Footnotes that aren't about which courses count are shown, not checked, e.g. "At least 3 credits must come from lecture-based course(s)" or when CPSC 449 can be waived.
- Electives, the communication requirement and the Faculty of Science's own requirements (breadth, lab science, upper-level credits) aren't tracked. The site shows them as "any courses" or "check yourself".

```
python pipeline/build_programs.py
```

No API key is needed unless the calendar adds a wording the rules don't know.

## The website

The site is in `web/`: Next.js, TypeScript and React Flow, exported as a plain static site. It never calls an API for its data: everything is worked out when the site is built. The only thing it sends is an anonymous page view to [Vercel Web Analytics](https://vercel.com/docs/analytics), which uses no cookies.

- **Built ahead of time.** A server component reads every subject's course and grade files (`data/courses/cpsc.json`, `math.json`, …) and the program file during `npm run build`, turns each subject's courses into a graph and lays it out. The browser only gets the finished positions, so the layout library never ships to it.
- **Laid out in course order.** Rows go by year (all 100-level courses above all 200-level ones, and so on), and a course sits below any prerequisite from its own year (CPSC 103 → 107). [dagre](https://github.com/dagrejs/dagre) only picks the left-to-right order inside each row, through a custom ranker, to keep lines from crossing. The rows are then packed tightly: dagre's own spacing made the graph about 4,000px wide, packed it's about 1,800px.
- **What a course needs and unlocks** is a breadth-first search over the prerequisite edges, in each direction. Solid lines are required, dashed lines are one of several options.
- **Colours** for "needs" and "unlocks" were checked with a colour-blindness validator, and always come with text labels. There's a dark mode, and it works with the keyboard (Tab, Enter, Esc) and screen readers.

### One map per subject

- **A page per faculty.** The home page is the Faculty of Science, with its 14 subjects in a menu next to the title, A to Z. The subject is kept in the address (`#math`), so links, refreshing and the back button work. With no `#`, Computer Science opens, so old links to the home page still show it. Each faculty will get its own page as more are added, so a page only carries one faculty's data.
- **One page, for now.** Every subject's courses and grades are built into the page: 1.19 MB, or 184 KB gzipped (473 KB with three subjects). In Chromium with the CPU slowed 4×, it's ready in about 0.95 s instead of 0.89 s, so loading a subject's data only when it's picked can wait for more faculties.
- **Why not one big map?** Three layouts were tried with the real data: one map per subject; each map plus the courses it needs from other subjects as extra boxes; and all three subjects on one map. The extra boxes added 24 courses to the CPSC map and pushed CPSC 221 down a row, and the combined map (175 courses) was unreadable without zooming in. One map per subject stays readable and works for any number of subjects.
- **Across subjects.** Ticks, statuses, paths and the picked program cover every subject. A MATH course in CPSC 340's panel opens on the MATH map, and the Computer Science Major marks its MATH courses there too.
- **A prerequisite that points up.** MATH 131 (first year) accepts 68% in MATH 221 (second year) as one option. dagre needs every line to go down a row, so a line like that is drawn but left out of the layout.
- **Courses numbered below 100.** SCIE 001 (Science One) is a first-year course, so it sits with the 100-level courses.

### What can I take next?

- **Your courses stay in your browser.** Ticks are saved in localStorage. There are no accounts, and your courses are never sent anywhere.
- **Three answers, not two.** Each requirement is met, not met, or "check yourself", because the site can't know your grades, your year standing or whether you took Pre-calculus 12. A "one of" group is met if any option is, an "all of" group fails if any part fails, and anything uncertain stays uncertain (three-valued logic).
- **Five statuses.** Done, can take, check first, not yet and no credit. A corequisite can be taken at the same time, "Restricted to …" sentences make a course "check first", and "Not for students with credit for CPSC 110" makes CPSC 100 "no credit" once 110 is done.
- **Courses not on the map.** Each map lists the courses its prerequisites mention but it doesn't show, so they can be ticked without switching maps: 69 on the CPSC map, including the MATH courses and others (SCIE 113, AI 240, …) the programs need. Courses from subjects that aren't in the data yet can also be ticked right inside a course's prerequisites or in the program panel.
- **Shortest path.** For any course, the side panel lists the courses still needed, term by term, plus anything else it asks for (e.g. "Third-year standing"). In each "one of" it picks the option with the fewest *last resorts*, then the fewest new courses (counting the ones already picked for other parts of the path), then the fewest things to check. A last resort is something most students can't count on:
  - a course from a subject that isn't in the data yet, since its own prerequisites are unknown (without this rule, CPSC 340 was routed through DSCI 221);
  - a choice that's only things to check, like "advanced credit for MATH 100", "a score of 5 in AP Calculus AB" or BIOL 200's "8 transfer credits of first-year BIOL and 6 credits of first-year CHEM" (without this rule, the path to MATH 221 skipped MATH 100);
  - a course only some students can take, like co-op work terms, MATH 190 (forestry and nursing), Science One (SCIE 001, by application) or CHEM 111 ("Not open to students with credit for CHEM 12").

  High school courses are the exception: "CHEM 12" or "Pre-calculus 12" isn't a last resort, since most students start UBC with them. They're listed to check instead, so the path to CHEM 123 is CHEM 121 plus "Check: CHEM 12", not CHEM 100 first. A grade in one ("85% or higher in Physics 12") isn't counted on. A last resort inside a "one of" also counts against the choice above it, so Enriched Physics (PHYS 107) doesn't win just because all its options are things to check. Adding the other Science subjects is what showed all this: once Science One had data, 356 paths went through SCIE 001, including CPSC 340's.

  "Fewest things to check" picks MATH 101 and 200 over the honours MATH 121 and 226, which need minimum grades. A tie goes against a course that's "not for students with credit for" the other option (CPSC 103 loses to CPSC 110), then to the course that unlocks more. For CPSC, it was checked against an exhaustive search over every combination of choices, for all 60 courses from six different starting points, and it never needs more courses. A switch shows just that path on the map, with term numbers.

### Pick a program

- **Requirements by year.** Pick one of the six programs and a panel lists its requirements year by year, in the calendar's words, each marked done, partly done, to do or "check yourself". It shows which of your courses fill each one, and the courses you could still take for it.
- **A course counts once.** Each finished course fills one requirement only, so nothing is counted twice. Requirements that name exact courses pick first, then "one of" lists (shortest first), then "three of", then credit counts like "9 credits of CPSC 300 or higher" (the 400-level one first, so a 400-level course isn't used up too early). With CPSC 304 and 317 done, the Software Engineering Major's "One of CPSC 304, 317, 344" gets 304 and "One more of …" gets 317.
- **Conditions in the wording.** "At least 6 credits of which must be 400 or above" is checked, and the footnote saying CPSC 490 "cannot be used" keeps it out of the credit count. Any other condition is shown for you to check.
- **On the map.** The program's courses get a stripe down the left edge, on every subject's map: solid for required, striped for one of a few choices. Its colour passed the same colour-blindness check against the three highlight colours, and the pattern means it never relies on colour alone.
- **Remembered.** The picked program is saved in localStorage next to your courses.

### Grades and links

- **Grades in the side panel.** Each course shows its average, how many students took it, a chart of the share of students in each grade range, and a table of every term with its average, size and instructors.
- **A hand-drawn chart.** The chart is plain SVG, with no chart library. Hovering a column, tapping it or reaching it with Tab shows its count, and screen readers get the same numbers as text. Its blue passed a colour-contrast check in light and dark mode.
- **Links, not scraping.** Each course links to an r/ubc search, its UBCGrades page and the calendar, and each instructor to a Rate My Professors search at UBC. The site never fetches anything from Reddit or Rate My Professors.

### Running it

```
cd web
npm install
npm test
npm run dev
```

`npm run build` writes the static site to `web/out/`. There are 166 tests (Vitest) for the graph, layout, highlighting, course details, statuses, saving, path logic, grades, links, programs and subjects, including checks against the real course data for all 14 subjects. GitHub Actions runs `pytest` and the website's tests, lint and build on every push, and [Vercel](https://vercel.com) builds and publishes the site from `main`.

## Data credits

Course and prerequisite data: [UBC Vancouver Academic Calendar](https://vancouver.calendar.ubc.ca).

Grade and instructor data: [UBCGrades.com](https://ubcgrades.com) / UBC PAIR, through the UBCGrades v3 API. Not affiliated with UBC.
