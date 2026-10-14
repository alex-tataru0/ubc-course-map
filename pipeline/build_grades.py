import sys
from pathlib import Path

from grades import build_summary, download_grades, to_json

# Downloads any new terms from UBCGrades, then writes the per-course summary.
# Run from the repo root:   python pipeline/build_grades.py
# Add --refresh to download every term again, not just the new ones.

ROOT = Path(__file__).parents[1]
RAW_DIR = ROOT / "data" / "raw" / "grades"
OUTPUT_PATH = ROOT / "data" / "grades" / "cpsc.json"
SUBJECT = "CPSC"


def print_summary(data: dict) -> None:
    courses = data["courses"]
    students = sum(c["reported"] for c in courses.values())
    terms = sum(len(c["terms"]) for c in courses.values())
    sessions = data["sessions"]
    print(f"{len(courses)} courses, {terms} course-terms, {students:,} grades, "
          f"{sessions[0]} to {sessions[-1]} ({len(sessions)} terms)")


if __name__ == "__main__":
    new = download_grades(SUBJECT, RAW_DIR, refresh="--refresh" in sys.argv)
    print("Downloaded:", ", ".join(new) if new else "nothing new")
    data = build_summary(SUBJECT, RAW_DIR)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(to_json(data), encoding="utf-8")
    print_summary(data)
    print("Wrote", OUTPUT_PATH.relative_to(ROOT))
