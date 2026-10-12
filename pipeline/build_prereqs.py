import json
import time
from pathlib import Path

from dotenv import load_dotenv
from google.genai import errors

from llm import MODELS, ask_gemini, load_cache, parse_prereq, save_cache
from parse_courses import parse_course_list
from prereq_tree import normalize_codes
from requisites import extract_requisites

ROOT = Path(__file__).parents[1]
HTML_PATH = ROOT / "data" / "raw" / "cpsc.html"
OUTPUT_PATH = ROOT / "data" / "courses" / "cpsc.json"
SOURCE_URL = "https://vancouver.calendar.ubc.ca/course-descriptions/subject/cpscv"

# The free tier only allows a few requests a minute, so space the calls out.
SECONDS_BETWEEN_CALLS = 15

# How long to wait before each retry when a model is overloaded (503).
RETRY_WAITS = [30, 60, 120]

# 503 = the model is overloaded right now. 429 = we've used up our quota for that model.
BUSY = 503
OUT_OF_QUOTA = 429


def ask_with_retries(text: str, model: str, ask, sleep):
    # Waits and retries when the model is overloaded. Any other error, including running out
    # of quota (waiting won't fix that until the daily reset), goes straight to the caller.
    for wait in RETRY_WAITS:
        try:
            return ask(text, model=model)
        except errors.APIError as e:
            if e.code != BUSY:
                raise
            print(f"  {model} is busy. Trying again in {wait} seconds...")
            sleep(wait)
    return ask(text, model=model)


def ask_slowly(text: str, ask=ask_gemini, sleep=time.sleep):
    # Returns (tree, model that answered). Tries each model in MODELS in order: if one is out
    # of quota or stays busy, the next one gets a turn. If the last one fails, the error stops
    # the script (answers saved so far are kept).
    # `ask` and `sleep` can be swapped for fakes in tests, so tests don't really wait.
    sleep(SECONDS_BETWEEN_CALLS)
    for i, model in enumerate(MODELS):
        print(f"Asking {model}:", text)
        try:
            return ask_with_retries(text, model, ask, sleep), model
        except errors.APIError as e:
            is_last = i == len(MODELS) - 1
            if e.code not in (BUSY, OUT_OF_QUOTA) or is_last:
                raise
            print(f"  {model} can't answer right now ({e.code}). Switching to {MODELS[i + 1]}.")


def requisite(text, cache: dict, ask):
    # One prereq or coreq as it goes in the output file, or None if the course has none.
    if text is None:
        return None
    result = parse_prereq(text, cache, ask)
    return {
        "text": normalize_codes(text),
        "tree": result["tree"],
        "source": result["source"],
        "problems": result["problems"],
    }


def build_courses(courses: list[dict], cache: dict, ask=ask_slowly, save=save_cache) -> list[dict]:
    # Turns parsed courses into the records the website will load.
    records = []
    for course in courses:
        reqs = extract_requisites(course["description"])
        equivalency = reqs["equivalency"]
        records.append({
            "code": course["code"],
            "title": course["title"],
            "credits": course["credits"],
            "description": normalize_codes(course["description"]),
            "prereq": requisite(reqs["prereq"], cache, ask),
            "coreq": requisite(reqs["coreq"], cache, ask),
            "equivalency": normalize_codes(equivalency) if equivalency else None,
        })
        # Save after every course, so a crash (like a rate limit) never loses answers.
        save(cache)
    return records


def write_courses(records: list[dict], path: Path = OUTPUT_PATH) -> None:
    data = {"subject": "CPSC", "source": SOURCE_URL, "courses": records}
    path.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False keeps characters like "–" readable instead of "\u2013".
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def print_summary(records: list[dict]) -> None:
    found = [(r["code"], key, r[key]) for r in records for key in ("prereq", "coreq") if r[key]]
    by_rules = sum(req["source"] == "rules" for _, _, req in found)
    print(f"{len(records)} courses, {len(found)} requisites: "
          f"{by_rules} by rules, {len(found) - by_rules} by Gemini")
    for code, key, req in found:
        if req["problems"]:
            print(f"NEEDS REVIEW  {code} {key}: {req['problems']}")


if __name__ == "__main__":
    load_dotenv()
    courses = parse_course_list(HTML_PATH.read_text(encoding="utf-8"))
    records = build_courses(courses, load_cache())
    write_courses(records)
    print_summary(records)
    print("Wrote", OUTPUT_PATH.relative_to(ROOT))
