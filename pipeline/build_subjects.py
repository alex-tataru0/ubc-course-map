import html
import json
import re
import time
from collections import Counter
from pathlib import Path

from grades import SECONDS_BETWEEN_REQUESTS, fetch_text, to_json

# Which faculty offers each subject in the UBC Calendar. The B.A. counts "Arts credit" by
# subject: a course is Arts credit when the calendar lists its subject as offered by the
# Faculty of Arts (and a B.Sc. needs 12 credits of it). The calendar's subject index lists
# every subject, and each subject's own page names its faculty in its title, e.g.
# "Economics, Faculty of Arts". Writes data/subjects.json. Run from the repo root:
#   python pipeline/build_subjects.py
# The index is saved in data/raw/subjects.html and the page titles in
# data/raw/subject-titles.json. Only subjects without a saved title are downloaded, one a
# second (about 5 minutes the first time). Delete the files to download them again.

ROOT = Path(__file__).parents[1]
INDEX_URL = "https://vancouver.calendar.ubc.ca/course-descriptions/courses-subject"
INDEX_PATH = ROOT / "data" / "raw" / "subjects.html"
TITLES_PATH = ROOT / "data" / "raw" / "subject-titles.json"
OUTPUT_PATH = ROOT / "data" / "subjects.json"

# One subject in the index, e.g.
# <a href="https://vancouver.calendar.ubc.ca/course-descriptions/subject/afstv">AFST_V - African Studies</a>
LINK = re.compile(
    r'<a href="(https://vancouver\.calendar\.ubc\.ca/course-descriptions/subject/[a-z]+)">'
    r"([A-Z]{2,4})_V - ([^<]+)</a>"
)
# A subject page's title, e.g. <h1 class="page-title">Economics, Faculty of Arts</h1>
TITLE = re.compile(r"<h1[^>]*page-title[^>]*>(.*?)</h1>", re.S)


def clean(text: str) -> str:
    # Without tags, "&amp;"-style entities and extra spaces.
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text))).strip()


def parse_index(page: str) -> list[dict]:
    # Every subject in the index: its code, name and page.
    subjects = [{"code": code, "name": clean(name), "url": url} for url, code, name in LINK.findall(page)]
    if not subjects:
        raise ValueError("No subjects in the index. Has the page changed?")
    return subjects


def page_title(page: str) -> str:
    match = TITLE.search(page)
    if match is None:
        raise ValueError("No title on the subject page. Has the page changed?")
    return clean(match.group(1))


def download_titles(subjects: list[dict], titles: dict[str, str], fetch=fetch_text, sleep=time.sleep,
                    save=lambda titles: None) -> list[str]:
    # Adds the title of each subject that doesn't have one yet to `titles`, saving after each
    # one, so a run that stops halfway carries on where it left off. Returns the subjects it
    # downloaded. `fetch`, `sleep` and `save` can be swapped for fakes in tests.
    downloaded = []
    for subject in subjects:
        if subject["code"] in titles:
            continue
        if downloaded:
            sleep(SECONDS_BETWEEN_REQUESTS)
        titles[subject["code"]] = page_title(fetch(subject["url"]))
        save(titles)
        downloaded.append(subject["code"])
    return downloaded


def faculty_of(name: str, title: str) -> str | None:
    # "Economics" + "Economics, Faculty of Arts" → "Faculty of Arts". A few titles name no
    # faculty (e.g. "Exchange Programs"): None.
    prefix = f"{name}, "
    return title[len(prefix):] if title.startswith(prefix) else None


def build(subjects: list[dict], titles: dict[str, str]) -> dict:
    return {
        "source": INDEX_URL,
        "subjects": [
            {"code": s["code"], "name": s["name"], "faculty": faculty_of(s["name"], titles[s["code"]])}
            for s in sorted(subjects, key=lambda s: s["code"])
        ],
    }


def load_index(path: Path = INDEX_PATH, fetch=fetch_text) -> str:
    # The saved index, or a fresh download if there isn't one yet.
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(fetch(INDEX_URL), encoding="utf-8")
    return path.read_text(encoding="utf-8")


def load_titles(path: Path = TITLES_PATH) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def save_titles(titles: dict[str, str], path: Path = TITLES_PATH) -> None:
    path.write_text(json.dumps(dict(sorted(titles.items())), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    subjects = parse_index(load_index())
    titles = load_titles()
    new = download_titles(subjects, titles, save=save_titles)
    print(f"{len(subjects)} subjects, downloaded {len(new)} titles")
    data = build(subjects, titles)
    OUTPUT_PATH.write_text(to_json(data), encoding="utf-8")
    for faculty, count in Counter(s["faculty"] for s in data["subjects"]).most_common():
        print(f"  {count:3} {faculty or '(no faculty)'}")
    print("Wrote", OUTPUT_PATH.relative_to(ROOT))
