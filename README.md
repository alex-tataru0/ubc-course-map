# UBC Course Map

![CI](https://github.com/alex-tataru0/ubc-course-map/actions/workflows/ci.yml/badge.svg)

A website for UBC students to plan courses using the prerequisite graph.

**Try it: [ubc-course-map.vercel.app](https://ubc-course-map.vercel.app)**

> Work in progress. Unofficial, not affiliated with UBC. Something wrong or missing? Use the **Feedback** link on the site (see [Feedback](#feedback)).

![Starting on the home page, opening the Computer Engineering map and picking the Computer Engineering program, so its courses get a stripe on the map. Then opening CPEN 331 and showing only its path, APSC 160, CPEN 211 and 221, then CPEN 212, and following MATH 253 from the program's second year to the Mathematics map on the Science page, where the program is still picked, and hovering its grade chart](docs/demo.gif)

## Features

- [x] Prerequisite maps for 39 subjects on three faculty pages, one map per subject, laid out from first year to fourth: 15 Faculty of Science subjects, from Astronomy and Biology to Cognitive Systems, Computer Science, Mathematics, Physics and Statistics; 13 engineering subjects, from Applied Science to Computer, Electrical, Mechanical and Mining Engineering; and 11 Arts subjects, from Anthropology and Economics to Psychology, Sociology and Writing, Research, and Discourse Studies. A home page links to every subject.
- [x] Click a course to highlight everything it needs and everything it unlocks.
- [x] Course details: description, credits, and the exact prerequisite rule, including courses from other departments. A course from another subject opens on that subject's map.
- [x] "What can I take next?": mark the courses you've done (in any subject) and every course shows whether you can take it.
- [x] A short checklist for what isn't a course: your year standing and your high school courses, so prerequisites like "Third-year standing" or "PHYS 12", and sentences like "Restricted to students with second-year standing or higher", count without checking.
- [x] The shortest path to any course from the courses you've done, term by term and across subjects, in the side panel and on the map.
- [x] Grades for each course since 2021: the average, a chart of how grades spread, and who taught it each term (from UBCGrades).
- [x] Links to r/ubc posts and UBCGrades for each course, and a Rate My Professors search for each instructor.
- [x] Pick your program to see its requirements year by year, which ones you've finished, and its courses marked on the map: on the Science page, any of 67 Bachelor of Science programs (the Majors and Honours of 12 subjects, from Astronomy to Statistics, and 29 Combined Majors and Honours like Computer Science and Mathematics), with the Faculty of Science's own requirements (a lab course, breadth, Science, Arts and upper-level credits); on the engineering page, any of the 14 Vancouver engineering majors; on the Arts page, a Major in each of 10 subjects, from Anthropology to Sociology, and 5 Combined Majors (Economics with Political Science, Philosophy, Mathematics or Statistics, and Philosophy and Political Science), with the Faculty of Arts' own requirements (a writing course, a research course, Ways of Knowing breadth, and credits outside the Major, upper-level and in Arts). Electives fill up with the courses no other requirement used.
- [x] A Feedback link that opens a short form on GitHub.
- [ ] More faculties and Arts subjects (languages would fill the Language as Meaning breadth area), Arts Honours and the other Arts Majors.

## How the course data is built

All of this runs once, ahead of time. The website only loads the finished JSON files.

1. **Parse the calendar.** `parse_courses.py` reads the UBC Academic Calendar page for a subject and gets each course's code, title, credits and description. The calendar shortens long links to "…/faculties-colleges-and-schools/facult…", so the link's full address is put back in their place.
2. **Cut out the requirements.** `requisites.py` finds the "Prerequisite:", "Corequisite:" and "Equivalency:" text in each description. Advice like "One of MATH 152, MATH 221, MATH 223 is recommended", "Recommended: LING 313" or "Recommended pre-requisite: MECH 380" is kept apart, since you don't need it to take the course. A prerequisite that is only advice ("A background in … is highly recommended") isn't a requirement at all. Weekly hours written after a prerequisite ("MECH 224 or MECH 260. [2-2-0]") and sentences like "Credit will be granted for only one of MECH 468 or MECH 509" are left out of the requirement too; the website reads those from the description.
3. **Turn the text into a tree.** "One of CPSC 210, CPEN 221 and …" becomes nested `one_of` / `all_of` groups, with optional minimum grades and free-text requirements like "Third-year standing".
   - **Rules first.** `prereq_tree.py` handles the common patterns: single courses, "One of" (also with ", or" before the last course), "All of", "Either … or", chains joined by "and", lettered options like "Either (a) … or (b) …", and minimum grades like "a score of 68% or higher in MATH 226". Text with no course codes (like "Permission of the Department Head", "and Third-year standing", a last sentence like "Familiarity with a programming language is required", or a high school course like "PHYS 12") is kept as one thing to check, next to the courses. Codes written without a space ("MICB306") get one, and a bare number after a code is read as the same subject ("STAT 200, 201" means STAT 201). The Arts subjects added a few: "ECON 304. Permission of the School is also acceptable" (another way in, not a second requirement), "3 credits from one of WRDS 150, WRDS 151, …" (any one of them) and "Two of POLI 100, POLI 101, POLI 110, POLI 240", kept as text to check. The rules refuse anything they aren't sure about instead of guessing.
   - **Gemini for the rest.** `llm.py` sends the leftover sentences to Gemini (free tier) with a short prompt and a few examples. Every answer is cached in `data/llm_cache/prereqs.json`, so each sentence is only ever sent once, and the data can be rebuilt without an API key.
   - **Every tree is checked.** A checker makes sure the tree has a valid shape and mentions exactly the courses in the sentence, with none dropped and none made up. Anything it flags is marked for review.
4. **Write the output.** `build_prereqs.py` writes one file per subject, like `data/courses/cpsc.json`. It downloads each subject's calendar page once and keeps it in `data/raw/`. The subjects are grouped by faculty page: 15 for Science, 13 for engineering and 11 for Arts. ENPH (Engineering Physics) is listed under Science in the calendar but goes with engineering; COGS (Cognitive Systems) has a B.A. and a B.Sc., and goes with Science, where the calendar lists it. Two typos in the calendar are fixed before reading, each with a note quoting it (`TEXT_FIXES`): ECON 541 repeats the end of its prerequisite after a full stop, and PSYC 348 writes "PSYO_ 271" for the Okanagan course PSYO_O 271.

### Accuracy (October 2026)

Every prerequisite and corequisite was checked by hand against the calendar text.

**Faculty of Science**

| Subject | Courses | Prereqs and coreqs | Read by rules | Read by Gemini | Correct |
|---|---|---|---|---|---|
| ASTR | 28 | 13 | 13 | 0 | 13 / 13 |
| ATSC | 26 | 15 | 15 | 0 | 15 / 15 |
| BIOL | 136 | 119 | 112 | 7 | 119 / 119 |
| CHEM | 115 | 75 | 73 | 2 | 75 / 75 |
| COGS | 5 | 5 | 4 | 1 | 5 / 5 |
| CPSC | 112 | 51 | 46 | 5 | 51 / 51 |
| DSCI | 32 | 25 | 23 | 2 | 25 / 25 |
| ENVR | 21 | 19 | 18 | 1 | 19 / 19 |
| EOSC | 144 | 74 | 71 | 3 | 74 / 74 |
| ISCI | 24 | 21 | 21 | 0 | 21 / 21 |
| MATH | 177 | 110 | 103 | 7 | 110 / 110 |
| MICB | 47 | 36 | 34 | 2 | 36 / 36 |
| PHYS | 116 | 96 | 93 | 3 | 96 / 96 |
| SCIE | 15 | 9 | 9 | 0 | 9 / 9 |
| STAT | 54 | 30 | 27 | 3 | 30 / 30 |
| **Total** | **1,052** | **698** | **662 (95%)** | **36** | **698 / 698** |

**Engineering (Faculty of Applied Science)**

| Subject | Courses | Prereqs and coreqs | Read by rules | Read by Gemini | Correct |
|---|---|---|---|---|---|
| APSC | 62 | 17 | 17 | 0 | 17 / 17 |
| BMEG | 62 | 38 | 36 | 2 | 38 / 38 |
| CHBE | 108 | 70 | 62 | 8 | 70 / 70 |
| CIVL | 117 | 56 | 56 | 0 | 56 / 56 |
| CPEN | 45 | 29 | 29 | 0 | 29 / 29 |
| ELEC | 89 | 55 | 48 | 7 | 55 / 55 |
| ENPH | 10 | 10 | 8 | 2 | 10 / 10 |
| ENVE | 6 | 8 | 6 | 2 | 8 / 8 |
| IGEN | 8 | 1 | 1 | 0 | 1 / 1 |
| MANU | 26 | 24 | 24 | 0 | 24 / 24 |
| MECH | 131 | 78 | 74 | 4 | 78 / 78 |
| MINE | 85 | 41 | 41 | 0 | 41 / 41 |
| MTRL | 61 | 5 | 5 | 0 | 5 / 5 |
| **Total** | **810** | **432** | **407 (94%)** | **25** | **432 / 432** |

**Faculty of Arts**

| Subject | Courses | Prereqs and coreqs | Read by rules | Read by Gemini | Correct |
|---|---|---|---|---|---|
| ANTH | 113 | 4 | 4 | 0 | 4 / 4 |
| ECON | 140 | 112 | 110 | 2 | 112 / 112 |
| ENGL | 152 | 0 | 0 | 0 | – |
| GEOG | 103 | 11 | 11 | 0 | 11 / 11 |
| HIST | 216 | 0 | 0 | 0 | – |
| LING | 67 | 29 | 29 | 0 | 29 / 29 |
| PHIL | 113 | 11 | 9 | 2 | 11 / 11 |
| POLI | 145 | 72 | 72 | 0 | 72 / 72 |
| PSYC | 145 | 42 | 40 | 2 | 42 / 42 |
| SOCI | 104 | 22 | 21 | 1 | 22 / 22 |
| WRDS | 15 | 12 | 12 | 0 | 12 / 12 |
| **Total** | **1,313** | **315** | **308 (98%)** | **7** | **315 / 315** |

No ENGL or HIST course lists a prerequisite, so those maps have no lines. Many Arts courses say who can take them in the description instead ("Restricted to students with second-year standing or higher"), which the website reads.

Course counts include graduate courses (500 and up), which have their requirements read too but aren't drawn on the maps.

Gemini wasn't always right on the first try, and the checker can't catch every kind of mistake, so every answer is checked by hand:
- **CPSC:** the first version of the rules sent 13 prerequisites to Gemini, and it got 12 right on the first try. CPSC 121 treated high school courses as UBC course codes, which the checker flagged.
- **MATH and STAT:** 17 sent, 15 right on the first try. MATH 551 dropped the "MATH 550." at the start, which the checker flagged. STAT 321 turned "STAT 305 may be taken concurrently" into an extra requirement instead of another choice. The checker can't see that kind of mistake; the hand check did.
- **The other 11 Science subjects:** 20 sent, 16 right on the first try. BIOL 201 and BIOL 234 turned "a corequisite of …" into prerequisites, though a corequisite can be taken at the same time. EOSC 440 put the "…, and MATH 200, and …" in its list into the one_of before it, so MATH 200 became optional. PHYS 107 wrote "85% or higher in PHYS 100" as text instead of a course with a minimum grade. The checker flagged none of them, since every course was still in the tree.
- **Engineering:** the rules' answers were checked by hand as well (408 of them), and 9 were wrong. The worst was CHBE 220's "One of CHEM 121 and CHEM 123 or CHEM 154", read as always needing CHEM 121. Others split text on "or" ("third-year standing", "higher in IGEN" for CIVL 305's "third-year standing or higher in IGEN") or read a leftover "either" as a requirement (ELEC 371). The rules now send those to Gemini or keep the text whole, and every Science tree came out the same. Then 27 went to Gemini, and 21 were right. CHBE 352 wrote "all_Of" instead of "all_of", which the checker flagged. CHBE 241 wrote CHEM 121 and CHEM 123 as text instead of course codes, and CHBE 411's "All of CHBE 241, CHBE 345 or equivalents" allowed an equivalent for CHBE 345 only. The other 3 (ELEC 442, MECH 468, CPEN 355), plus APSC 367, had "Credit will be granted for only one of …" as a requirement: that was the pipeline's mistake, so those sentences are now left out of the requirement text, which also let the rules read CPEN 355 and APSC 367.
- **Arts (and COGS):** 9 sent, 7 right on the first try. The 2 wrong ones were typos in the calendar (ECON 541's repeated ending, read as an extra requirement, and PSYC 348's "PSYO_ 271", which the checker flagged), now fixed before reading; PSYC 348's fixed text was asked again and came back right. The rules' 312 answers were checked by hand too.
- Each time, the prompt got a new rule and an example, only the wrong answers were asked again, and they came back right.

The rules written for MATH and STAT also read 7 of the 13 CPSC prerequisites Gemini had answered: 4 come out exactly like Gemini's checked answers, and the other 3 have no course codes, so their text is kept whole. The rules for text next to course codes then read 7 more that Gemini had answered (CPSC 491 and MATH 121, 312, 440, 442, 443, 444), all exactly like Gemini's checked answers. The rules written for Arts read two more ("two of …" in ELEC 391 and MECH 368), again exactly like Gemini's answers.

Known gaps:
- CPSC 448's requirement isn't labelled "Prerequisite:" in the calendar, so it isn't captured.
- EOSC 355 says "Either (a) SCIE 001 or (b) one of MATH 101, …; and one of CHEM 110, … and one of PHYS 101, …". Read word for word, as the data does, Science One students also need a CHEM and a PHYS course. EOSC 340 and 372 list the same courses with all three inside (b), so the semicolon is probably a typo.
- Exclusions ("Not for students with credit for …", "Credit will be granted for only one of …", "Credit cannot be obtained for both …") and sentences about who can take a course ("Restricted to …", "Permission of the supervisor required") aren't extracted by the pipeline yet. The website reads them from the description for now.
- "Two of ELEC 301, ELEC 341, …" (ELEC 391, MECH 368, LING 415 and 12 POLI courses) is kept as text to check, since the tree has no "two of" group.
- Prerequisites also name courses from subjects that aren't on the site yet (BIOC, WOOD, COMR, ARCL, URST and a few others), so those show as courses with no data.
- Requirements that aren't courses (year standing, credit counts, department permission) are kept as text, so the website shows them as "check first" instead of deciding. The website's checklist then answers the ones about year standing and high school courses.

### Running it

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt
pytest
python pipeline/build_prereqs.py
```

With no arguments, `build_prereqs.py` builds all 39 subjects in the tables. To build only some, name subjects or a faculty: `python pipeline/build_prereqs.py MATH STAT`, `python pipeline/build_prereqs.py engineering` or `python pipeline/build_prereqs.py arts`.

A Gemini API key is only needed when there are prerequisites the cache doesn't have yet. Put it in a `.env` file (see `.env.example`). There are 438 `pytest` tests for the whole pipeline.

## How the grade data is built

`build_grades.py` pulls grade distributions from the [UBCGrades](https://ubcgrades.com) API, which republishes UBC PAIR's data. Like the course data, it runs ahead of time, about once a term.

1. **Download each term once.** One request per term and subject gets every section: 10 terms, 2021 Summer to 2025 Winter, for each of the 39 subjects. The responses are saved as they are in `data/raw/grades/`. A term that's already saved isn't downloaded again, so a new term means one new request per subject. When a subject had no sections in a term (ENVR in most summers, ENVE and MANU in every summer), UBCGrades answers "404 Not Found", and that term is saved as an empty list.
2. **Add up the sections.** For each course and term: the number of students, the average weighted by students, the count in each grade range, and every instructor. Topics courses like CPSC 436N (NLP) and 436C (Cloud Computing) get a row each.
3. **Check against UBCGrades' own totals.** UBCGrades sends its own total for most course-terms, but not for 2021, so every term is added up from its sections instead. The 7,644 totals it does send (2,581 for Science, 2,018 for engineering, 3,045 for Arts) match ours exactly, and a test checks this for every subject.
4. **Write the output.** One file per subject, like `data/grades/cpsc.json`:

**Faculty of Science**

| Subject | Courses | Course-terms | Grades |
|---|---|---|---|
| ASTR | 17 | 76 | 3,920 |
| ATSC | 11 | 35 | 6,166 |
| BIOL | 108 | 528 | 74,367 |
| CHEM | 87 | 365 | 59,069 |
| COGS | 5 | 30 | 3,609 |
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
| **Total** | **746** | **3,232** | **484,190** |

**Engineering**

| Subject | Courses | Course-terms | Grades |
|---|---|---|---|
| APSC | 29 | 143 | 27,901 |
| BMEG | 53 | 261 | 12,860 |
| CHBE | 70 | 280 | 19,561 |
| CIVL | 95 | 386 | 29,862 |
| CPEN | 40 | 164 | 13,699 |
| ELEC | 69 | 316 | 20,357 |
| ENPH | 8 | 38 | 2,323 |
| ENVE | 6 | 28 | 1,046 |
| IGEN | 7 | 36 | 1,425 |
| MANU | 19 | 83 | 3,266 |
| MECH | 111 | 426 | 23,589 |
| MINE | 55 | 189 | 4,448 |
| MTRL | 47 | 178 | 8,132 |
| **Total** | **609** | **2,528** | **168,469** |

**Faculty of Arts**

| Subject | Courses | Course-terms | Grades |
|---|---|---|---|
| ANTH | 67 | 231 | 15,499 |
| ECON | 108 | 449 | 61,193 |
| ENGL | 117 | 473 | 31,102 |
| GEOG | 67 | 253 | 18,104 |
| HIST | 156 | 510 | 22,814 |
| LING | 47 | 202 | 16,344 |
| PHIL | 88 | 395 | 37,189 |
| POLI | 98 | 471 | 39,499 |
| PSYC | 89 | 417 | 107,983 |
| SOCI | 74 | 359 | 36,727 |
| WRDS | 7 | 38 | 23,857 |
| **Total** | **918** | **3,798** | **410,311** |

About 1–8% of students, depending on the subject (9% in ASTR, 11% in WRDS, 13% in MINE), are in a grade range whose count UBC PAIR doesn't give. They're still counted in each course's total, and the chart says how many it leaves out.

```
python pipeline/build_grades.py
```

With no arguments it does every subject; `python pipeline/build_grades.py MATH` does just one, and `python pipeline/build_grades.py engineering` or `arts` does one faculty. Add `--refresh` to download every term again. No API key is needed.

## How the program data is built

`build_programs.py` reads the six programs on the calendar's [Computer Science page](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/bachelor-science/computer-science): the Major and Honours in Computer Science, the same two with the Artificial Intelligence option, and the Major and Honours in Computer Science and Software Engineering. It reads 61 more Science programs from the subjects' pages in the calendar's [Bachelor of Science](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/bachelor-science) section: the Majors and Honours of the other 11 subjects with fixed course lists (Biology's seven named Honours, like Marine Biology, and the Earth and Ocean Sciences department's Geology, Geophysics and Fisheries Oceanography among them), and the 29 Combined Majors and Honours with their own table, like Computer Science and Mathematics or Chemical Biology. Integrated Sciences (students design their own), combined honours with "another Science subject" (no fixed courses) and the B.Sc./B.Ed. dual degrees are left out. It also reads the 14 Vancouver engineering majors on the faculty's [list of degree programs](https://apsc.ubc.ca/students/degree-programs), from Biomedical to Mining Engineering. That list has majors only, so options like Mechatronics, or Electrical Engineering's Biomedical option, are left out, and so are footnotes about them. And it writes out 10 Arts Majors, one for each Arts subject with a map but WRDS (which only has a Minor), and the 5 Combined Majors of two subjects on the site, from the subjects' pages in the calendar's [Bachelor of Arts](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-arts/bachelor-arts) section and the [Vancouver School of Economics](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/vancouver-school-economics/bachelor-arts-economics) page (step 5), and reads the [Faculty of Arts requirements](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-arts/bachelor-arts/degree-requirements-students-who-enter-program-202425-or-later) every B.A. shares (step 6). Like the rest of the data, it runs ahead of time.

1. **Save the pages once.** Each calendar page is downloaded once to `data/raw/programs/` and read from there. Deleting a file downloads it again, e.g. for a new calendar year.
2. **Read the tables.** `parse_programs.py` finds each program's heading and table, splits it into years (First Year, Second Year, Third and Fourth Years), and keeps each requirement's credits and footnotes. The Major and Honours share a first-year table, and a year the calendar only describes as "Same as …" another program is copied from that program. A test checks that the credits add up for every year and every degree (120 for a Major, 132 for an Honours).
   An engineering program is put together from tables on different pages: the [first year](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-applied-science/bachelor-applied-science/curriculum-and-first-year) every program shares (Biomedical Engineering has its own), then the later years on the department's page (e.g. [Electrical and Computer](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-applied-science/bachelor-applied-science/electrical-and-computer-engineering), [Mechanical](https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-applied-science/bachelor-applied-science/mechanical-engineering)). `program_tables.py` reads every table on a page with the heading above it, and `engineering_programs.py` says which tables make up each program. Where a year has versions by when students started, the current one is used (Mechanical third and fourth years for students who started third year in 2026W or later; Computer Engineering second year for 2023W or later; Biomedical and Manufacturing second to fourth years for 2022W and 2026W or later). Chemical Engineering and Chemical and Biological Engineering share one table, where each year ends with a short list for each, and Engineering Physics takes five years. Tables that aren't requirements, like Engineering Physics' co-op schedule, are skipped.
   The other Science programs are read by `science_programs.py`, one table per program. Some years say "Same as for Biology Major (3095)" and are copied from it. Some programs split the upper years into "Third Year", "Third or Fourth Years" and "Fourth Year" with one total for all of them: those are put together as one year, and each row from a single-year part gets a note ("In third year"). The table's total for the degree is checked too, which found two mistakes in the calendar, both fixed with a note quoting it: Computer Science and Chemistry's third and fourth years say 47 credits where the rows add up to 46 (and the degree to 120), and a row in the Combined Honours in Computer Science and Mathematics has its bracket after the wrong course ("MATH 131, 215, (or one of 111, 221, 223), …", a 9-credit row of three courses). A "Minimum total credits for second year" line is kept as a note, not a total.
3. **Turn each requirement into a tree.** `program_rules.py` reads rows like "MATH 100 or 102 or 104 (or 180 or 184 or 120 or 110)", "Three of CPSC 304, 330, …, AI 422 at least 6 credits of which must be 400 or above" and "CPSC or AI courses numbered 300 or higher" into `one_of`, `all_of`, `pick`, `credits_of`, electives and free text. The Science pages added more: "MATH 221 (or 223), 215" (a list with choices inside), "15 credits from MATH 400-406, 412, 418-428, …" (`credits_from`; the build swaps each range for the MATH courses that exist), "EOSC, ENVR, or ATSC 400-level" (a level band), "Economics courses numbered 300 or above", "MATH/STAT 302" (cross-listed) and "Either (a) ECON 326 and STAT 301 or (b) ECON 398 and STAT 306". GEOB is the old code of GEOS, so "GEOS (or GEOB) 300" keeps only GEOS. Shorthand like "CPSC 310, 313, 320" is written out in full, and a checker makes sure each tree has exactly the courses in its row, like the one for prerequisites.
4. **Gemini for the rest.** A row the rules can't read goes to Gemini, with the answer cached in `data/llm_cache/programs.json`, like the prerequisites. The rules read every Computer Science and engineering row; 10 Science wordings went to Gemini, like "Four of EOSC 353, 429, … or (three of EOSC 353, 429, … and one of EOSC 329, 350, PHYS 301, MATH 345)", which becomes a choice of two groups.
5. **The Arts Majors, by hand.** Arts program pages have no requirement tables: they say "12 credits of 100- and 200-level SOCI, including: at least 3 credits from SOCI 100, 101, or 102; SOCI 217" in sentences and lists. So `arts_programs.py` writes each Major out row by row. A row that quotes the calendar is checked against the saved page on every build, so a new calendar year that changes it stops the build. The rest of an "including" sentence becomes its own row ("6 more credits of 100- and 200-level SOCI"), with the calendar's sentence in its note, since a course counts once. Each Major ends with the rest of the B.A.'s 120 credits as electives. English's Major comes in three emphases; Literature is the one here.
   The Combined Majors are written the same way (`combined()`, with both subjects): Economics with Political Science, Philosophy, Mathematics and Statistics (the B.A. versions) from the Economics page's tables, and Philosophy and Political Science from the Philosophy page. Economics and Political Science is the version for students entering after 2025, with Political Science's standard requirements (not the Politics, Policy and Administration focus). The Philosophy page describes Economics and Philosophy differently from the Economics page (30 ECON and 30 PHIL credits instead of 33 and 24); the site follows the Economics page, where students apply, and says so in a note. A few rows are approximations, each with a note: Economics and Mathematics' "100-level PHYS, or any of ECON, STAT, PHIL, DSCI, or MATH" counts 100-level courses only, and Economics and Philosophy's joint courses (ECON 318/PHIL 362, ECON 319/PHIL 363) count once, though the calendar lets them count toward electives too.
6. **The Faculty of Arts requirements.** `arts_degree.py` reads the B.A.'s shared requirements off the calendar page into `data/arts-degree.json`, and stops the build if a part has moved: the 7 Writing courses (ENGL 100, WRDS 150, …; Arts One isn't a course code), the 46-row table of research-intensive courses by major ("All POLI courses at the 400-level" becomes the POLI 400-level courses that exist), the Ways of Knowing breadth (9, 6 and 3 credits, each in one subject, in the three areas outside the Major's) and its four areas' course codes, the link to the Place and Power course list (on the Faculty of Arts' site, not in the calendar), and the credits outside the Major (60, or 48 for a Combined Major), numbered 300 or higher (48) and in Arts (72). Each Arts program gets its row of the research table and its field of study (its subjects; Anthropology also ARCL, Human Geography also GEOS).
   "Arts credit" means a course from a subject the Faculty of Arts offers, so `build_subjects.py` records which faculty offers each of the calendar's 264 subjects, from the title of each subject's page ("Economics, Faculty of Arts"), in `data/subjects.json`: 104 are Arts, GEOS among them (ENPH, on the engineering page, is a Faculty of Science subject). It downloads the pages once (about 5 minutes) and keeps their titles in `data/raw/subject-titles.json`.
7. **Write the output.** `data/programs/cpsc.json`: 6 programs, 120 requirements. `data/programs/science.json`: 61 programs, 1,559 requirements, every one 120 or 132 credits. `data/programs/engineering.json`: 14 programs, 617 requirements. An engineering "Electives" row comes from a department's list, so it's something to check, like "Technical electives" and "Complementary Studies electives", not any course. Science rows that point to a list the site doesn't have ("Biology Laboratory Selections", "Area of Concentration", "CHEM Electives") are things to check too, with the calendar's footnote. `data/programs/arts.json`: 15 programs, 170 requirements, every one 120 credits.

### Accuracy (October 2026)

The 120 Computer Science requirements use 36 different wordings, since most rows repeat across programs (the first year is the same for all six). The 617 engineering requirements use 293 (most programs share the first year), and the 1,559 other Science requirements use 520. Every wording was checked by hand against the calendar. For engineering, the rules needed three new ones: "One of: MATH 318, …" with a colon, "One of MINE 350, …, MINE 455 or MINE 465" with "or" before the last course, and "MECH 280, CIVL 215, or CHBE 251", a choice written as a list.

| | Computer Science | Other Science | Engineering | Arts | Correct |
|---|---|---|---|---|---|
| Parsed by rules | 36 | 510 | 293 | – | 839 |
| Parsed by Gemini | 0 | 10 | 0 | – | 10 |
| Written by hand | – | – | – | 120 | 120 |
| **Total** | **36** | **520** | **293** | **120** | **969 / 969** |

For the Science programs, the hand check caught three mistakes in the new rules before anything was saved: a lone "Elective" was read as text instead of electives, "MATH 111 (or one of 131, 221, 223)" lost the courses after "one of", and "ECON 200- or 300-level" counted ECON 200 as a course. Gemini got 5 of its 10 right on the first try. It put "any MICB course" inside a choice three times (credits from a subject only work as a whole row), split the STAT Honours' "6 credits chosen from MATH 418, 419, 420, 421 and statistics courses numbered 400 or above" into two requirements, and read "Another MICB selection or a selection from BIOC 402, 410, …" as needing all eight courses. Each time the prompt got a new rule and an example, only those were asked again, and they came back right.

Known gaps:
- Only programs with fixed course lists: Integrated Sciences, combined honours with "another Science subject", the B.Sc./B.Ed. dual degrees, engineering options and Environmental Sciences' Areas of Concentration aren't in.
- Lists the site doesn't have (Biology's Laboratory and Life Science Selections, Tools Electives, Complementary Studies) are things to check, not tracked.
- Only the current version of an engineering year. A student who started Mechanical third year in 2025W or earlier has slightly different requirements.
- A row with a choice of credits ("MECH 226 or MECH 227", 3 or 5 credits) counts as the smaller number in a year's total, with the calendar's wording kept next to it.
- Footnotes that aren't about which courses count are shown, not checked, e.g. "At least 3 credits must come from lecture-based course(s)" or when CPSC 449 can be waived.
- Electives take any finished course no other requirement used, without checking a program's rules for them. The Faculty of Science's own requirements are tracked, except the limits on credits outside Science and Arts and numbered 500 or higher (and Music courses for the Arts credits: MUSC isn't on the site).
- The Faculty of Arts' requirements are tracked, but only courses on the site can be ticked: no language subject is on it yet, so the Language as Meaning breadth area is to check yourself, and so is Place and Power. The field of study goes by subject, not by cross-listing.
- Arts: one Major per subject and five Combined Majors; no Honours or other Majors (English's Language emphases, Urban Studies, Speech Sciences, Political Science's Politics, Policy and Administration focus, …). A few rows are approximations, each explained in its note: English's first 6 credits count any 6 from 100-level ENGL, CAP, WRDS and ASTU (the calendar allows only 3 of WRDS); Philosophy assumes the area courses are taken at the 200 level; Psychology's "6 credits from each of two of four lists" and History's "6 credits of substantially pre-modern history" are to check yourself.
- "PHYS 100-level" counts PHYS 100 too, although its footnote leaves it out.

```
python pipeline/build_subjects.py
python pipeline/build_programs.py
```

`build_subjects.py` only needs running again for a new calendar year (delete `data/raw/subject-titles.json` first). No API key is needed unless the calendar adds a wording the rules don't know.

## The website

The site is in `web/`: Next.js, TypeScript and React Flow, exported as a plain static site. It never calls an API for its data: everything is worked out when the site is built. The only thing it sends is an anonymous page view to [Vercel Web Analytics](https://vercel.com/docs/analytics), which uses no cookies.

- **Built ahead of time.** A server component reads every subject's course and grade files (`data/courses/cpsc.json`, `math.json`, …) and the program files during `npm run build`, turns each subject's courses into a graph and lays it out. The browser only gets the finished positions, so the layout library never ships to it.
- **Laid out in course order.** Rows go by year (all 100-level courses above all 200-level ones, and so on), and a course sits below any prerequisite from its own year (CPSC 103 → 107). [dagre](https://github.com/dagrejs/dagre) only picks the left-to-right order inside each row, through a custom ranker, to keep lines from crossing. The rows are then packed tightly: dagre's own spacing made the graph about 4,000px wide, packed it's about 1,800px.
- **What a course needs and unlocks** is a breadth-first search over the prerequisite edges, in each direction. Solid lines are required, dashed lines are one of several options.
- **Colours** for "needs" and "unlocks" were checked with a colour-blindness validator, and always come with text labels. There's a dark mode, and it works with the keyboard (Tab, Enter, Esc) and screen readers.
- **Keyboard focus follows the panels.** When a side panel opens, focus moves to its heading, so Tab carries on inside it and screen readers say what opened. Closing it (× or Esc) puts focus back on the course or button that opened it.
- **The picked course stays in view.** If the side panel or the bars over the map would cover it, the map moves it to the middle of the space that's left.
- **Links in the calendar's text,** like the Faculty of Science Credit Exclusion Lists, are shown as short links ("vancouver.calendar.ubc.ca/…/credit-exclusion-lists").
- **A preview card.** Sharing a link shows a picture of a map with the site's title and description: the CPSC map with CPSC 340 picked for the home page and Science (`web/public/og.png`), the CPEN map with CPEN 331 picked for engineering (`og-engineering.png`), and the ECON map with ECON 326 picked for Arts (`og-arts.png`).

### One map per subject

- **A page per faculty.** `/science`, `/engineering` and `/arts` each have their subjects in a menu next to the title, A to Z, and tabs above it to switch faculty. The subject is kept in the address (`/science#math`), and so is the course whose panel is open (`/science#math-221`), so links, refreshing and the back button work, and the address can be copied to share a course. Opening courses replaces the address instead of adding to the history, so the back button doesn't step through every course clicked. With no `#`, a faculty's first subject opens (Computer Science for Science, Applied Science for engineering, Economics for Arts). A page is built with that subject showing, so a link to `#biol` would flash the CPSC map first; a tiny script in the page hides the map until the right subject is showing.
- **A home page.** `/` has a card per faculty, three in a row on wide screens, with a link to each subject's map. Links from before there were faculty pages, like `/#math`, still work: the "#" part never reaches the server, so a tiny script on the home page sends them on to `/science#math`.
- **What each page carries.** A page has its own faculty's maps and grades, plus the course data of every faculty, so statuses and paths can cross faculties. Other faculties' courses keep only the sentences of their descriptions the site reads (who can take a course and what rules it out), since a page never shows them; a test checks that every course reads the same either way. That took the Science page from 287 to 247 KB gzipped before Arts came. Every faculty's programs come too, since they're small. The Science page is 2.35 MB (284 KB gzipped), the engineering page 2.13 MB (245 KB), the Arts page 2.53 MB (313 KB), and the home page 41 KB. Links between pages don't prefetch, so the home page doesn't download both.
- **Why not one big map?** Three layouts were tried with the real data: one map per subject; each map plus the courses it needs from other subjects as extra boxes; and all three subjects on one map. The extra boxes added 24 courses to the CPSC map and pushed CPSC 221 down a row, and the combined map (175 courses) was unreadable without zooming in. One map per subject stays readable and works for any number of subjects.
- **Across subjects.** Ticks, statuses, paths and the picked program cover every subject. A MATH course in CPSC 340's panel opens on the MATH map, and the Computer Science Major marks its MATH courses there too.
- **Across faculties.** Ticks are saved once for the whole site, so MATH 100 ticked on the engineering page counts on the Science page too. A course from the other faculty in a panel (CPEN 221 in CPSC 221's prerequisites, MATH 101 in ELEC 201's path) has a tick box and a ↗ link that opens it on its own page (`/engineering#cpen-221`). ELEC 201's path plans MATH 100, PHYS 157 and the rest from the Science data, and CPSC 221 knows what CPEN 221 needs.
- **A prerequisite that points up.** MATH 131 (first year) accepts 68% in MATH 221 (second year) as one option. dagre needs every line to go down a row, so a line like that is drawn but left out of the layout.
- **Courses numbered below 100.** SCIE 001 (Science One) is a first-year course, so it sits with the 100-level courses.

### What can I take next?

- **Your courses stay in your browser.** Ticks and checklist answers are saved in localStorage. There are no accounts, and nothing you tick is ever sent anywhere.
- **Three answers, not two.** Each requirement is met, not met, or "check yourself", because the site can't know your grades or a department's permission, and only knows your year standing or whether you took Pre-calculus 12 if you say so (see the checklist below). A "one of" group is met if any option is, an "all of" group fails if any part fails, and anything uncertain stays uncertain (three-valued logic).
- **Six statuses.** Done, can take, check first, not yet, no credit and not needed. A corequisite can be taken at the same time.
  - **Check first:** a sentence saying who can take the course, in any of the calendar's wordings: "Restricted to …", "Not open to …", "Only open to students in a Chemistry specialization", "Permission of the supervisor required", "Enrolment limited to students in the B.Sc. program", or the Student Directed Seminars handbook (CPSC 490). Only the description is read, not the prerequisites, where "or permission of the instructor" is just one way in. A year standing is the exception: "Restricted to students with second-year standing or higher" (on about 130 Arts courses) is answered by the checklist, so it's "can take" or "not yet" once you've said your year, and paths don't avoid those courses.
  - **No credit:** "Not for students with credit for CPSC 110" makes CPSC 100 "no credit" once 110 is done, and "Credit will be granted for only one of BIOL 121 or BIOL 344" does the same for each of the pair. A high school course ticked on the checklist does it too: with Chemistry 12, CHEM 100, 110 and 111 ("Not open to students with credit for Chemistry 12") are "no credit", and so are PHYS 100 with Physics 12 and BIOL 111 with Biology 12.
  - **Not needed:** a course whose every way in goes through a "no credit" course. CPSC 107 needs CPSC 103, which isn't for students with CPSC 110, so after 110 it's greyed out instead of "not yet", with no path to it.
- **Clear all asks first.** It can't be undone, so the bar asks "Clear all 12 marked courses?", with Cancel ready to press.
- **Year standing and high school courses.** "Not on the map", the list that opens with "Edit my courses", starts with a short checklist: your year standing (1st to 4th or higher) and the high school courses you have (Biology 11 and 12, Chemistry 12, Physics 11 and 12, Pre-calculus 12). It reads 98 of the 193 non-course wordings in the prerequisites, like "Third-year standing", "3rd-year class standing or higher", "Completion of third year", "Fourth-year standing or permission of the instructor", "Restricted to second- or higher-year standing" or "PHYS 12", and the same kind of sentence in a description ("Restricted to students in fourth-year standing or higher").
  - A year that's high enough makes the requirement met, and a lower one makes the course "not yet", with the reason: "It needs Third-year standing, and you said you're in first year."
  - An unticked high school course stays "check first": leaving it out isn't the same as saying you don't have it.
  - A place in the wording ("Third-year standing in Mining Engineering", "in the Faculty of Science") is met only when the picked program is in it. Anything else stays something to check.
  - A course's panel asks right there: under "PHYS 12" or "Third-year standing" are "I have Physics 12" ticks or year buttons, saved to the same checklist. Paths count the answers too, so a ticked high school course isn't listed to check.
- **Not on the map.** Each map also lists the courses its prerequisites mention but it doesn't show, so they can be ticked without switching maps: 75 on the CPSC map, including the MATH courses and others (SCIE 113, AI 240, WRDS 150, …) the CS programs need. A combined program's courses join both its subjects' lists once it's picked (Computer Science and Biology adds 35 to the CPSC map); listing all twelve combined with CS would add about 140. Courses from subjects that aren't in the data yet can also be ticked right inside a course's prerequisites or in the program panel.
- **Shortest path.** For any course, the side panel lists the courses still needed, term by term, plus anything else it asks for (e.g. "Third-year standing"). In each "one of" it picks the option with the fewest *last resorts*, then the fewest new courses (counting the ones already picked for other parts of the path), then the fewest things to check. A last resort is something most students can't count on:
  - a course from a subject that isn't in the data yet, since its own prerequisites are unknown (without this rule, CPSC 340 was routed through DSCI 221);
  - a choice that's only things to check, like "advanced credit for MATH 100", "a score of 5 in AP Calculus AB" or BIOL 200's "8 transfer credits of first-year BIOL and 6 credits of first-year CHEM" (without this rule, the path to MATH 221 skipped MATH 100);
  - a course only some students can take, like co-op work terms, MATH 190 (forestry and nursing), Science One (SCIE 001, by application), CHEM 111 ("Not open to students with credit for CHEM 12") or CHEM 203 (Chemistry specializations only, so paths take CHEM 233);
  - on the Science page, an engineering course: most are only for engineering students in practice, even when the calendar doesn't say so. Without this rule, MICB 322 was routed through BMEG 245 and PHYS 309 through ENPH 259. A path still uses one when there's no other way, like MINE 200 for EOSC 210. On the engineering page, Science courses are as usual, since engineering students take MATH, PHYS and CHEM anyway.

  High school courses are the exception: "CHEM 12" or "Pre-calculus 12" isn't a last resort, since most students start UBC with them. They're listed to check instead (or left out once ticked on the checklist), so the path to CHEM 123 is CHEM 121 plus "Check: CHEM 12", not CHEM 100 first. A grade in one ("85% or higher in Physics 12") isn't counted on. A last resort inside a "one of" also counts against the choice above it, so Enriched Physics (PHYS 107) doesn't win just because all its options are things to check. Adding the other Science subjects is what showed all this: once Science One had data, 356 paths went through SCIE 001, including CPSC 340's.

  "Fewest things to check" picks MATH 101 and 200 over the honours MATH 121 and 226, which need minimum grades. A tie goes against a course that's "not for students with credit for" the other option (CPSC 103 loses to CPSC 110), then to the course that unlocks more of the page's own courses. Counting every faculty's courses there would pick the engineering versions on the Science page (PHYS 157 over PHYS 117, MATH 253 over MATH 200), and on the engineering page it's what picks them. With the engineering courses loaded, every Science path was compared with the old ones from five starting points: the only changes are courses whose only way in is through engineering courses (MATH 254, EOSC 433, …), which used to stop at "no data". For CPSC, it was checked against an exhaustive search over every combination of choices, for all 60 courses from six different starting points, and it never needs more courses. A switch shows just that path on the map, with term numbers.

### Pick a program

- **Programs by faculty.** Every program has its own button with its own name. The Science page lists them by subject, A to Z like the menu: a subject with several programs is one button that opens to them, its own first (Mathematics: the Major, Mathematical Sciences and Honours), then "Combined with another subject" (Computer Science and Mathematics, Mathematics and Statistics, …). A combined program shows under both its subjects, and the map's own subject starts open. Data Science, with one program, is a plain button. The Arts page lists its programs the same way: Economics opens to its Major and four Combined Majors, Philosophy and Political Science to three programs each, and the other seven are plain buttons. A combined program shows only under its subjects from the same faculty, so the B.A. in Economics and Mathematics is under Economics, and the B.Sc. in Mathematics and Economics under Mathematics. The engineering page lists its 14 majors one by one, from Biomedical to Mining Engineering. One program is saved for the whole site, so one picked on the engineering page still shows on the Science page, with its MATH and PHYS courses marked on those maps. An engineering program's panel says which entry years its tables are for, and links to each calendar page it comes from.
- **Requirements by year.** Pick a program and a panel lists its requirements year by year, in the calendar's words, each marked done, partly done, to do or "check yourself". It shows which of your courses fill each one, and the courses you could still take for it.
- **A course counts once.** Each finished course fills one requirement only, so nothing is counted twice. Requirements that name exact courses pick first, then "one of" lists (shortest first), then "three of", then credit counts like "9 credits of CPSC 300 or higher" (the 400-level one first, so a 400-level course isn't used up too early). With CPSC 304 and 317 done, the Software Engineering Major's "One of CPSC 304, 317, 344" gets 304 and "One more of …" gets 317. Electives come last and take any finished course no other requirement used, earlier years first (the calendar lets elective credits move between years), so ECON 101 shows up as an elective in the Computer Science Major. The CS Major's "CPSC 300 or higher" and "CPSC 400 or higher" rows never share a course: its third and fourth years only add up to 60 credits that way.
- **Choices inside choices.** "EOSC 212 (or EOSC 111 and one of EOSC 110, 112, …)" is partly done with EOSC 111 alone, and "Two of BIOL 415, 417, 434 or two of BIOL 417, 418, 434" doesn't take BIOL 415 and 418 together. Credit rows count credits: "15 credits from MATH 400-406, …" shows "6 of 15 cr", and "PHYS 100-level" only takes 100-level courses.
- **Conditions in the wording.** "At least 6 credits of which must be 400 or above" is checked, and the footnote saying CPSC 490 "cannot be used" keeps it out of the credit count, like "ECON 457 will not count towards 400-level electives" or "PSYC 340, 388, 440, or 488 may not be included". Any other condition is shown for you to check.
- **The Faculty of Science's requirements.** Every B.Sc. program ends with the rules the whole faculty shares: a lab course (one of 15), 3 credits in 6 of the 7 Science Breadth categories (5 for combined programs; MATH 302 counts as Statistics, Science One as four), 72 Science credits, 48 credits numbered 300 or higher, 30 of them in Science (42 for honours), the foundational Biology, Chemistry and Physics (each covered by a high school course ticked on the checklist, like Chemistry 12, or by 3 credits of 100-level courses in it; one that's neither stays to check, with an "I have Chemistry 12" tick in the row), and 12 Arts credits (Faculty of Arts courses, but not GEOS or Psychology courses with Science credit, nor the course used for the Communication Requirement). A course can count there and for the program, and they have their own count, so the program's "N of M" stays about the program. The programs' "Additional Communication Requirement" row is tracked too: one of WRDS 150, ENGL 110 or 111, SCIE 300, CHEM 300 or ENVR 200.
- **The Faculty of Arts' requirements.** Every B.A. program ends with the faculty's own: a writing course (one of 7, or Arts One), a research-intensive course from the Major's list (ECON 390, 490, 495 or 499 for Economics; any 400-level POLI course for Political Science), Ways of Knowing breadth, Place and Power (to check yourself, with a link to its course list), 60 credits outside the Major's subjects (48 outside both, for a Combined Major), 48 numbered 300 or higher, and 72 Arts credits. For breadth, the panel lists the three areas outside the Major's, each with the subject counting the most credits so far; the 9, 6 and 3 go to the areas in the order that counts the most, and the writing course doesn't count. An area with no subjects on the site (Language as Meaning) is left to check yourself. Long lists of choices show 12 courses first, then "Show all".
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

`npm run build` writes the static site to `web/out/`. There are 257 tests (Vitest) for the graph, layout, highlighting, course details, statuses, the checklist, saving, path logic, grades, links, programs, subjects and moving the view, including checks against the real course data for all 39 subjects. GitHub Actions runs `pytest` and the website's tests, lint and build on every push, and [Vercel](https://vercel.com) builds and publishes the site from `main`.

## Feedback

The **Feedback** link in the site's header opens a new [GitHub issue](https://github.com/alex-tataru0/ubc-course-map/issues/new?template=feedback.yml) with a short form (`.github/ISSUE_TEMPLATE/feedback.yml`): what kind of feedback, which subject or course (filled in with the map you were on), what happened and what you expected, and your browser if something didn't work. It needs a GitHub account. The UBC Academic Calendar always has the final word on requirements.

## Data credits

Course and prerequisite data: [UBC Vancouver Academic Calendar](https://vancouver.calendar.ubc.ca).

Grade and instructor data: [UBCGrades.com](https://ubcgrades.com) / UBC PAIR, through the UBCGrades v3 API. Not affiliated with UBC.
