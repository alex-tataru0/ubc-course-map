# UBC Course Map

A website for UBC students to plan courses using the prerequisite graph.

> Work in progress.

## Planned features

- Pick a major and see its required courses and how they connect.
- Prerequisite graph: click a course to see what it needs and what it unlocks.
- "What can I take next?" based on the courses you've already done.
- Teaching history and grade distributions per course (from UBCGrades).
- Links to r/ubc discussions and RateMyProf for each course and instructor.

## How the course data is built

All of this runs once, ahead of time. The website only loads the finished JSON file.

1. **Parse the calendar.** `parse_courses.py` reads the UBC Academic Calendar page for a subject and gets each course's code, title, credits and description.
2. **Cut out the requirements.** `requisites.py` finds the "Prerequisite:", "Corequisite:" and "Equivalency:" text in each description.
3. **Turn the text into a tree.** "One of CPSC 210, CPEN 221 and …" becomes nested `one_of` / `all_of` groups, with optional minimum grades and free-text requirements like "Third-year standing".
   - **Rules first.** `prereq_tree.py` handles the common patterns (single courses, "One of", "All of", "Either … or", chains joined by "and"). It refuses anything it isn't sure about instead of guessing.
   - **Gemini for the rest.** `llm.py` sends the leftover sentences to Gemini (free tier) with a short prompt and a few examples. Every answer is cached in `data/llm_cache/prereqs.json`, so each sentence is only ever sent once, and the data can be rebuilt without an API key.
   - **Every tree is checked.** A checker makes sure the tree has a valid shape and mentions exactly the courses in the sentence, with none dropped and none made up. Anything it flags is marked for review.
4. **Write the output.** `build_prereqs.py` writes `data/courses/cpsc.json`.

### Accuracy (CPSC, October 2026)

Every parsed prerequisite was checked by hand against the calendar text.

| | Prerequisites | Correct |
|---|---|---|
| Parsed by rules | 37 | 37 |
| Parsed by Gemini | 13 | 12 on the first try, 13 after one prompt fix |
| **Total** | **50** | **49 / 50 (98%) first try, 50 / 50 final** |

The one first-try miss (CPSC 121) treated high school courses as UBC course codes. The checker flagged it automatically, and the prompt was updated.

Known gaps:
- CPSC 448's requirement isn't labelled "Prerequisite:" in the calendar, so it isn't captured.
- "Not for students with credit for …" exclusions aren't extracted yet.
- Requirements that aren't courses (year standing, credit counts, department permission) are kept as text, so "what can I take next" can't check them automatically.

### Running it

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt
pytest
python pipeline/build_prereqs.py
```

A Gemini API key is only needed when there are prerequisites the cache doesn't have yet. Put it in a `.env` file (see `.env.example`).

## Data credits

Course and prerequisite data: [UBC Vancouver Academic Calendar](https://vancouver.calendar.ubc.ca).

Grade and instructor data: [UBCGrades.com](https://ubcgrades.com) / UBC PAIR. Not affiliated with UBC.
