import time
from pathlib import Path

from dotenv import load_dotenv
from google.genai import errors

from llm import ask_gemini, load_cache, parse_prereq, save_cache
from parse_courses import parse_course_list
from requisites import extract_requisites

HTML_PATH = Path(__file__).parents[1] / "data" / "raw" / "cpsc.html"

# The free tier only allows a few requests a minute, so space the calls out.
SECONDS_BETWEEN_CALLS = 15

# How long to wait before each retry when Gemini is overloaded (503) or rate-limited (429).
RETRY_WAITS = [30, 60, 120]


def ask_slowly(text: str, ask=ask_gemini, sleep=time.sleep):
    # `ask` and `sleep` can be swapped for fakes in tests, so tests don't really wait.
    sleep(SECONDS_BETWEEN_CALLS)
    print("Asking Gemini:", text)
    for wait in RETRY_WAITS:
        try:
            return ask(text)
        except errors.APIError as e:
            if e.code not in (429, 503):
                raise
            print(f"  Gemini is busy ({e.code}). Trying again in {wait} seconds...")
            sleep(wait)
    # Last try. If this fails too, the error stops the script (saved answers are kept).
    return ask(text)


def build_requisites(courses: list[dict], cache: dict, ask=ask_slowly, save=save_cache) -> dict:
    # Returns {"CPSC 210": {"prereq": {tree, source, problems}}, ...}.
    # Courses with no prereq or coreq get an empty dict.
    results = {}
    for course in courses:
        reqs = extract_requisites(course["description"])
        results[course["code"]] = {
            key: parse_prereq(reqs[key], cache, ask)
            for key in ("prereq", "coreq")
            if reqs[key] is not None
        }
        # Save after every course, so a crash (like a rate limit) never loses answers.
        save(cache)
    return results


def print_summary(results: dict) -> None:
    found = [(code, key, r) for code, reqs in results.items() for key, r in reqs.items()]
    by_rules = sum(r["source"] == "rules" for _, _, r in found)
    print(f"{len(found)} requisites: {by_rules} by rules, {len(found) - by_rules} by Gemini")
    for code, key, r in found:
        if r["problems"]:
            print(f"NEEDS REVIEW  {code} {key}: {r['problems']}")


if __name__ == "__main__":
    load_dotenv()
    courses = parse_course_list(HTML_PATH.read_text(encoding="utf-8"))
    results = build_requisites(courses, load_cache())
    print_summary(results)
