import json
from pathlib import Path

from grades import fetch_text
from parse_programs import parse_programs

# Reads the requirement tables of the Computer Science programs and writes
# data/programs/cpsc.json. Run from the repo root:   python pipeline/build_programs.py
# The calendar page is downloaded once and saved in data/raw/programs/. Delete that file
# to download it again (e.g. when a new calendar year comes out).

ROOT = Path(__file__).parents[1]
SOURCE_URL = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/"
    "bachelor-science/computer-science"
)
HTML_PATH = ROOT / "data" / "raw" / "programs" / "computer-science.html"
OUTPUT_PATH = ROOT / "data" / "programs" / "cpsc.json"


def load_page(path: Path = HTML_PATH, fetch=fetch_text) -> str:
    # The saved page, or a fresh download if there isn't one yet.
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(fetch(SOURCE_URL), encoding="utf-8")
    return path.read_text(encoding="utf-8")


def write_programs(programs: list[dict], path: Path = OUTPUT_PATH) -> None:
    data = {"source": SOURCE_URL, "programs": programs}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def print_summary(programs: list[dict]) -> None:
    for program in programs:
        rows = sum(len(year["requirements"]) for year in program["years"])
        years = ", ".join(year["title"] for year in program["years"])
        print(f"{program['name']}: {rows} requirements ({years}), {program['total_credits']} credits")


if __name__ == "__main__":
    programs = parse_programs(load_page())
    write_programs(programs)
    print_summary(programs)
    print("Wrote", OUTPUT_PATH.relative_to(ROOT))
