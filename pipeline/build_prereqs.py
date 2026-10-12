import time
from pathlib import Path

from dotenv import load_dotenv
from google.genai import errors

from llm import MODELS, ask_gemini, load_cache, parse_prereq, save_cache
from parse_courses import parse_course_list
from requisites import extract_requisites

HTML_PATH = Path(__file__).parents[1] / "data" / "raw" / "cpsc.html"

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
