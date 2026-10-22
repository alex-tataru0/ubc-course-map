import json
import re
from functools import partial
from pathlib import Path

from dotenv import load_dotenv

from build_prereqs import ask_slowly
from grades import fetch_text, to_json
from llm import ask_gemini, load_cache, save_cache
from engineering_programs import BASE, PAGES, parse_engineering
from science_programs import BASE as SCIENCE_BASE, PAGES as SCIENCE_PAGES, parse_science
from parse_programs import parse_programs
from program_rules import INSTRUCTIONS, parse_requirement

# Reads the requirement tables of the programs on the site, turns every row into a
# requirement tree, and writes data/programs/cpsc.json (the Computer Science programs),
# data/programs/engineering.json (the 14 Vancouver engineering majors) and
# data/programs/science.json (the other Science Majors and Honours). Run from the repo root:
#   python pipeline/build_programs.py
# Each calendar page is downloaded once and saved in data/raw/programs/. Delete a file to
# download it again (e.g. when a new calendar year comes out).

ROOT = Path(__file__).parents[1]
RAW_DIR = ROOT / "data" / "raw" / "programs"
SOURCE_URL = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/"
    "bachelor-science/computer-science"
)
HTML_PATH = RAW_DIR / "computer-science.html"
OUTPUT_PATH = ROOT / "data" / "programs" / "cpsc.json"
ENGINEERING_PATH = ROOT / "data" / "programs" / "engineering.json"
SCIENCE_PATH = ROOT / "data" / "programs" / "science.json"
COURSES_DIR = ROOT / "data" / "courses"

# Gemini's answers for rows the rules can't read, saved and committed like the prereq ones.
CACHE_PATH = ROOT / "data" / "llm_cache" / "programs.json"

# Asks Gemini with the program prompt, with the same pacing and model fallback as prereqs.
ask_program = partial(ask_slowly, ask=partial(ask_gemini, instructions=INSTRUCTIONS))


def load_page(path: Path = HTML_PATH, fetch=fetch_text, url: str = SOURCE_URL) -> str:
    # The saved page, or a fresh download if there isn't one yet.
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(fetch(url), encoding="utf-8")
    return path.read_text(encoding="utf-8")


def load_pages(pages: dict[str, str]) -> dict[str, str]:
    # Each page, saved as e.g. data/raw/programs/mechanical-engineering.html.
    return {name: load_page(RAW_DIR / f"{url.rsplit('/', 1)[1]}.html", url=url)
            for name, url in pages.items()}


def load_engineering_pages() -> dict[str, str]:
    return load_pages(PAGES)


def load_science_pages() -> dict[str, str]:
    # The other Science subjects' pages (data/raw/programs/mathematics.html, …).
    return load_pages(SCIENCE_PAGES)


def electives_to_check(programs: list[dict]) -> list[dict]:
    # Engineering "Electives" come from a department's list, which we don't have, so they're
    # something to check, like "Technical electives", not any course as on the CS page.
    for program in programs:
        for year in program["years"]:
            for row in year["requirements"]:
                if row["tree"] == {"electives": True}:
                    row["tree"] = {"other": row["text"]}
    return programs


def known_courses(courses_dir: Path = COURSES_DIR) -> set[str]:
    # Every course code on the site, from data/courses/*.json.
    return {course["code"] for path in courses_dir.glob("*.json")
            for course in json.loads(path.read_text(encoding="utf-8"))["courses"]}


def expand_ranges(programs: list[dict], known: set[str]) -> list[dict]:
    # "MATH 400-406" in a credits_from list → the MATH courses numbered 400 to 406 that exist
    # (MATH 400, 401, 402, …), so the website can treat every item as a course.
    def expand(item: str) -> list[str]:
        match = re.fullmatch(r"([A-Z]{2,4}) (\d{3})-(\d{3})", item)
        if not match:
            return [item]
        subject, low, high = match[1], int(match[2]), int(match[3])
        codes = sorted(c for c in known if c.split()[0] == subject and low <= int(c.split()[1][:3]) <= high)
        if not codes:
            raise ValueError(f"No courses for {item!r}: is {subject} on the site?")
        return codes

    def walk(node):
        if isinstance(node, dict):
            if "credits_from" in node:
                node["credits_from"] = list(dict.fromkeys(c for item in node["credits_from"] for c in expand(item)))
            for value in node.values():
                if isinstance(value, list):
                    for child in value:
                        walk(child)

    for program in programs:
        for year in program["years"]:
            for row in year["requirements"]:
                walk(row["tree"])
    return programs


def add_trees(programs: list[dict], cache: dict, ask=ask_program, save=save_cache) -> list[dict]:
    # Gives every requirement its tree, where the tree came from, and any problems found.
    for program in programs:
        for year in program["years"]:
            for i, requirement in enumerate(year["requirements"]):
                asked_before = len(cache)
                result = parse_requirement(requirement["text"], cache, ask)
                year["requirements"][i] = {
                    "text": requirement["text"],
                    "credits": requirement["credits"],
                    "tree": result["tree"],
                    "source": result["source"],
                    "problems": result["problems"],
                    "notes": requirement["notes"],
                }
                # "3 or 5" (MECH 226 or 227): credits holds the smaller number.
                if "credits_text" in requirement:
                    year["requirements"][i]["credits_text"] = requirement["credits_text"]
                # Save each new Gemini answer right away, so a crash never loses one.
                if len(cache) > asked_before:
                    save(cache, CACHE_PATH)
    return programs


def write_programs(programs: list[dict], path: Path = OUTPUT_PATH, source: str = SOURCE_URL) -> None:
    data = {"source": source, "programs": programs}
    path.parent.mkdir(parents=True, exist_ok=True)
    # to_json puts short lists (course codes, notes) on one line, like the grades file.
    path.write_text(to_json(data), encoding="utf-8")


def print_summary(programs: list[dict]) -> None:
    rows = [r for p in programs for y in p["years"] for r in y["requirements"]]
    by_rules = sum(r["source"] == "rules" for r in rows)
    for program in programs:
        print(f"{program['name']}: {sum(len(y['requirements']) for y in program['years'])} "
              f"requirements, {program['total_credits']} credits")
    print(f"{len(rows)} requirements: {by_rules} by rules, {len(rows) - by_rules} by Gemini")
    for row in rows:
        if row["problems"]:
            print(f"NEEDS REVIEW  {row['text']}: {row['problems']}")


if __name__ == "__main__":
    load_dotenv()  # the Gemini key, only needed if a row isn't in the rules or the cache
    cache = load_cache(CACHE_PATH)
    programs = add_trees(parse_programs(load_page()), cache)
    write_programs(programs)
    print_summary(programs)
    print("Wrote", OUTPUT_PATH.relative_to(ROOT))

    engineering = electives_to_check(add_trees(parse_engineering(load_engineering_pages()), cache))
    write_programs(engineering, ENGINEERING_PATH, BASE.rstrip("/"))
    print_summary(engineering)
    print("Wrote", ENGINEERING_PATH.relative_to(ROOT))

    science = expand_ranges(add_trees(parse_science(load_science_pages()), cache), known_courses())
    write_programs(science, SCIENCE_PATH, SCIENCE_BASE.rstrip("/"))
    print_summary(science)
    print("Wrote", SCIENCE_PATH.relative_to(ROOT))
