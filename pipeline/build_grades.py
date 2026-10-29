import sys
from pathlib import Path

from build_prereqs import pick_subjects
from grades import build_summary, download_grades, new_terms, to_json

# Downloads any new terms from UBCGrades, then writes one summary per subject to
# data/grades/<subject>.json. Run from the repo root. With no arguments it does every
# subject, or name some:
#   python pipeline/build_grades.py MATH STAT
# Add --refresh to download every term again, not just the new ones.
# --check only asks UBCGrades which terms are new and prints them, one per line (nothing
# if there are none). The monthly GitHub Action uses it before downloading anything.

ROOT = Path(__file__).parents[1]
RAW_DIR = ROOT / "data" / "raw" / "grades"


def output_path(subject: str) -> Path:
    return ROOT / "data" / "grades" / f"{subject.lower()}.json"


def print_summary(data: dict) -> None:
    courses = data["courses"]
    students = sum(c["reported"] for c in courses.values())
    terms = sum(len(c["terms"]) for c in courses.values())
    sessions = data["sessions"]
    print(f"{data['subject']}: {len(courses)} courses, {terms} course-terms, {students:,} grades, "
          f"{sessions[0]} to {sessions[-1]} ({len(sessions)} terms)")


if __name__ == "__main__":
    if "--check" in sys.argv:
        for term in new_terms(RAW_DIR):
            print(term)
        sys.exit()
    refresh = "--refresh" in sys.argv
    for subject in pick_subjects([arg for arg in sys.argv[1:] if arg != "--refresh"]):
        new = download_grades(subject, RAW_DIR, refresh=refresh)
        print(f"{subject}: downloaded", ", ".join(new) if new else "nothing new")
        data = build_summary(subject, RAW_DIR)
        path = output_path(subject)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(to_json(data), encoding="utf-8")
        print_summary(data)
        print("Wrote", path.relative_to(ROOT))
