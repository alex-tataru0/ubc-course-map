import json
import sys
import time
from functools import partial
from pathlib import Path

import httpx
from dotenv import load_dotenv
from google.genai import errors

from grades import fetch_text
from llm import MODELS, ask_gemini, load_cache, parse_prereq, save_cache
from parse_courses import parse_course_list
from prereq_tree import expand_shorthand, normalize_codes
from requisites import extract_requisites

# Reads each subject's course list from the calendar and writes data/courses/<subject>.json.
# Run from the repo root. With no arguments it builds every subject, or name some subjects
# or faculties:
#   python pipeline/build_prereqs.py MATH STAT
#   python pipeline/build_prereqs.py engineering
#   python pipeline/build_prereqs.py arts
# Each calendar page is downloaded once and saved in data/raw/. Delete that file to download
# it again (e.g. when a new calendar year comes out).

ROOT = Path(__file__).parents[1]
# The subjects on the site, by faculty page. ENPH (Engineering Physics) is listed under the
# Faculty of Science in the calendar, but it's an engineering degree, so it goes with
# engineering.
FACULTIES = {
    "science": [
        "ASTR", "ATSC", "BIOL", "CHEM", "COGS", "CPSC", "DSCI", "ENVR",
        "EOSC", "ISCI", "MATH", "MICB", "PHYS", "SCIE", "STAT",
    ],
    "engineering": [
        "APSC", "BMEG", "CHBE", "CIVL", "CPEN", "ELEC", "ENPH",
        "ENVE", "IGEN", "MANU", "MECH", "MINE", "MTRL",
    ],
    # The first wave of Arts subjects. COGS (Cognitive Systems) has a B.A. and a B.Sc., but the
    # calendar lists it under Science, so it's with Science.
    "arts": [
        "ANTH", "ECON", "ENGL", "GEOG", "HIST", "LING",
        "PHIL", "POLI", "PSYC", "SOCI", "WRDS",
    ],
}
SUBJECTS = [subject for subjects in FACULTIES.values() for subject in subjects]

# The free tier only allows a few requests a minute, so space the calls out.
SECONDS_BETWEEN_CALLS = 15

# How long to wait before each retry when a model is overloaded (503).
RETRY_WAITS = [30, 60, 120]

# 503 = the model is overloaded right now. 429 = we've used up our quota for that model.
BUSY = 503
OUT_OF_QUOTA = 429

# What a call to Gemini can fail with: an error from the API, or the connection dropping.
GEMINI_ERRORS = (errors.APIError, httpx.TransportError)


def source_url(subject: str) -> str:
    # The calendar page with every course in a subject, e.g. ".../subject/mathv".
    return f"https://vancouver.calendar.ubc.ca/course-descriptions/subject/{subject.lower()}v"


def html_path(subject: str) -> Path:
    return ROOT / "data" / "raw" / f"{subject.lower()}.html"


def output_path(subject: str) -> Path:
    return ROOT / "data" / "courses" / f"{subject.lower()}.json"


def load_page(subject: str, path: Path | None = None, fetch=fetch_text) -> str:
    # The saved calendar page, or a fresh download if there isn't one yet.
    path = path or html_path(subject)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(fetch(source_url(subject)), encoding="utf-8")
    return path.read_text(encoding="utf-8")


def pick_subjects(args: list[str]) -> list[str]:
    # The subjects named on the command line, in any case, or all of them if none are named.
    # A faculty's name ("engineering") stands for all of its subjects.
    subjects = []
    for arg in args:
        subjects += FACULTIES.get(arg.lower(), [arg.upper()])
    subjects = subjects or SUBJECTS
    unknown = [subject for subject in subjects if subject not in SUBJECTS]
    if unknown:
        raise SystemExit(f"Unknown subject: {', '.join(unknown)}. "
                         f"Known: {', '.join(FACULTIES)}, {', '.join(SUBJECTS)}")
    return subjects


def is_busy(error: Exception) -> bool:
    # A 503, or the connection dropping mid-call, which an overloaded model also does.
    if isinstance(error, httpx.TransportError):
        return True
    return isinstance(error, errors.APIError) and error.code == BUSY


def ask_with_retries(text: str, model: str, ask, sleep):
    # Waits and retries when the model is overloaded. Any other error, including running out
    # of quota (waiting won't fix that until the daily reset), goes straight to the caller.
    for wait in RETRY_WAITS:
        try:
            return ask(text, model=model)
        except GEMINI_ERRORS as e:
            if not is_busy(e):
                raise
            print(f"  {model} is busy. Trying again in {wait} seconds...")
            sleep(wait)
    return ask(text, model=model)


def ask_slowly(text: str, ask=ask_gemini, sleep=time.sleep, models: list[str] | None = None):
    # Returns (tree, model that answered). Tries each model in `models` in order: if one is
    # out of quota or stays busy, it's taken out of `models` and the next one gets a turn.
    # The script passes the same list for the whole run, so a model that gave up isn't tried
    # again (each try costs minutes of waiting). If the last one fails, the error stops the
    # script (answers saved so far are kept).
    # `ask` and `sleep` can be swapped for fakes in tests, so tests don't really wait.
    models = list(MODELS) if models is None else models
    sleep(SECONDS_BETWEEN_CALLS)
    for model in list(models):
        print(f"Asking {model}:", text)
        try:
            return ask_with_retries(text, model, ask, sleep), model
        except GEMINI_ERRORS as e:
            out_of_quota = isinstance(e, errors.APIError) and e.code == OUT_OF_QUOTA
            if not (is_busy(e) or out_of_quota) or model == models[-1]:
                raise
            models.remove(model)
            reason = "out of quota" if out_of_quota else "busy"
            print(f"  {model} is {reason}. Using {models[0]} for the rest of this run.")


# Typos in the calendar's prereq texts, fixed before they're read:
# (course, prereq or coreq as the calendar writes it) → the fixed text.
TEXT_FIXES = {
    # The calendar repeats the end of option (b) after a full stop: "… ECON_V 627. of ECON_V
    # 600, ECON_V 601, ECON_V 602, ECON_V 603, ECON_V 626, ECON_V 627". ECON 514, 515, … have
    # the same prereq without the repeat.
    ("ECON 541", "Either (a) all of ECON_V 500, ECON_V 502, ECON_V 526, ECON_V 527 or (b) all "
                 "of ECON_V 600, ECON_V 601, ECON_V 602, ECON_V 603, ECON_V 626, ECON_V 627. of "
                 "ECON_V 600, ECON_V 601, ECON_V 602, ECON_V 603, ECON_V 626, ECON_V 627"):
        "Either (a) all of ECON_V 500, ECON_V 502, ECON_V 526, ECON_V 527 or (b) all of "
        "ECON_V 600, ECON_V 601, ECON_V 602, ECON_V 603, ECON_V 626, ECON_V 627",
    # "PSYO_ 271" is missing the O of the Okanagan code PSYO_O 271 (PSYO_O 270 is next to it).
    ("PSYC 348", "All of PSYC_V 217 or PSYO_O 270, PSYC_V 218 or PSYO_ 271"):
        "All of PSYC_V 217 or PSYO_O 270, PSYC_V 218 or PSYO_O 271",
}


def requisite(text, cache: dict, ask):
    # One prereq or coreq as it goes in the output file, or None if the course has none.
    if text is None:
        return None
    # Bare numbers are filled in here, not in normalize_codes, because program rows keep
    # their short form ("CPSC 110 (or 103 and 107)") and their own rules read it.
    text = expand_shorthand(normalize_codes(text))
    result = parse_prereq(text, cache, ask)
    return {
        "text": text,
        "tree": result["tree"],
        "source": result["source"],
        "problems": result["problems"],
    }


def build_courses(courses: list[dict], cache: dict, ask=ask_slowly, save=save_cache) -> list[dict]:
    # Turns parsed courses into the records the website will load.
    records = []
    for course in courses:
        reqs = extract_requisites(course["description"])
        for key in ("prereq", "coreq"):
            reqs[key] = TEXT_FIXES.get((course["code"], reqs[key]), reqs[key])
        equivalency = reqs["equivalency"]
        recommended = reqs["recommended"]
        records.append({
            "code": course["code"],
            "title": course["title"],
            "credits": course["credits"],
            "description": normalize_codes(course["description"]),
            "prereq": requisite(reqs["prereq"], cache, ask),
            "coreq": requisite(reqs["coreq"], cache, ask),
            "equivalency": normalize_codes(equivalency) if equivalency else None,
            "recommended": normalize_codes(recommended) if recommended else None,
        })
        # Save after every course, so a crash (like a rate limit) never loses answers.
        save(cache)
    return records


def write_courses(subject: str, records: list[dict], path: Path | None = None) -> None:
    path = path or output_path(subject)
    data = {"subject": subject, "source": source_url(subject), "courses": records}
    path.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False keeps characters like "–" readable instead of "\u2013".
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def print_summary(subject: str, records: list[dict]) -> None:
    found = [(r["code"], key, r[key]) for r in records for key in ("prereq", "coreq") if r[key]]
    by_rules = sum(req["source"] == "rules" for _, _, req in found)
    print(f"{subject}: {len(records)} courses, {len(found)} requisites: "
          f"{by_rules} by rules, {len(found) - by_rules} by Gemini")
    for code, key, req in found:
        if req["problems"]:
            print(f"NEEDS REVIEW  {code} {key}: {req['problems']}")


if __name__ == "__main__":
    load_dotenv()  # the Gemini key, only needed for prereqs that aren't in the rules or the cache
    cache = load_cache()
    # One list of models for the whole run, so a model that gave up stays skipped.
    ask = partial(ask_slowly, models=list(MODELS))
    for subject in pick_subjects(sys.argv[1:]):
        records = build_courses(parse_course_list(load_page(subject)), cache, ask)
        write_courses(subject, records)
        print_summary(subject, records)
        print("Wrote", output_path(subject).relative_to(ROOT))
