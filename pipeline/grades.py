import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

# Grade distributions and teaching history from UBCGrades (https://ubcgrades.com), which
# republishes UBC PAIR's data. Its v3 API returns every section of a subject in one request
# per term ("yearsession", e.g. 2024W). The responses are saved as they are in
# data/raw/grades/, then boiled down to one summary per course.

API = "https://ubcgrades.com/api/v3"
CAMPUS = "UBCV"

# Sent with every request, so UBCGrades can see who is calling.
USER_AGENT = "ubc-course-map (https://github.com/alex-tataru0/ubc-course-map)"
SECONDS_BETWEEN_REQUESTS = 1

# The grade ranges UBC PAIR reports, lowest first. Summaries list their counts in this order.
BUCKETS = [
    "<50%", "50-54%", "55-59%", "60-63%", "64-67%", "68-71%",
    "72-75%", "76-79%", "80-84%", "85-89%", "90-100%",
]


def fetch_text(url: str) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def raw_path(raw_dir: Path, session: str, subject: str) -> Path:
    return raw_dir / f"{CAMPUS}-{session}-{subject}.json"


def fetch_term(url: str, fetch=fetch_text) -> str:
    # One term's sections. UBCGrades answers 404 when a subject had no sections that term
    # (ENVR has none in most summers), which is saved as an empty list, so the term isn't
    # asked for again.
    try:
        return fetch(url)
    except HTTPError as e:
        if e.code != 404:
            raise
        return "[]"


def download_grades(subject: str, raw_dir: Path, fetch=fetch_text, sleep=time.sleep,
                    refresh: bool = False) -> list[str]:
    # Saves one file per term. Past terms don't change, so only terms that aren't saved yet
    # are downloaded, unless refresh=True. Returns the terms it downloaded.
    # `fetch` and `sleep` can be swapped for fakes in tests, so tests don't use the network.
    sessions = json.loads(fetch(f"{API}/yearsessions/{CAMPUS}"))
    raw_dir.mkdir(parents=True, exist_ok=True)
    downloaded = []
    for session in sessions:
        path = raw_path(raw_dir, session, subject)
        if path.exists() and not refresh:
            continue
        sleep(SECONDS_BETWEEN_REQUESTS)
        text = fetch_term(f"{API}/grades/{CAMPUS}/{session}/{subject}", fetch)
        path.write_text(text, encoding="utf-8")
        downloaded.append(session)
    return downloaded


def load_rows(subject: str, raw_dir: Path) -> list[dict]:
    rows = []
    for path in sorted(raw_dir.glob(f"{CAMPUS}-*-{subject}.json")):
        rows += json.loads(path.read_text(encoding="utf-8"))
    return rows


def session_key(session: str) -> tuple[int, int]:
    # Sorts terms in time order. Summer (S, May to August) comes before Winter
    # (W, September to April) of the same year.
    return int(session[:4]), 0 if session.endswith("S") else 1


def combine(sections: list[dict]) -> dict:
    # Adds up sections: total students, the average weighted by students, and the count in
    # each grade range. A count is null when UBC PAIR doesn't give it. Those students are
    # still in "reported", so reported - sum(grades) is how many can't be placed in a range.
    reported = sum(s["reported"] for s in sections)
    average = sum(s["average"] * s["reported"] for s in sections) / reported
    grades = [sum(s["grades"][bucket] or 0 for s in sections) for bucket in BUCKETS]
    return {"reported": reported, "average": round(average, 1), "grades": grades}


def instructors(sections: list[dict]) -> list[str]:
    # Everyone who taught any of the sections, in section order, each name once.
    # Team-taught sections list several names separated by ";".
    names = []
    for section in sorted(sections, key=lambda s: s["section"]):
        for name in (section["educators"] or "").split(";"):
            name = name.strip()
            if name and name not in names:
                names.append(name)
    return names


def summarize(rows: list[dict]) -> dict[str, dict]:
    # One entry per course ("CPSC 221"), with totals over all terms and one row per term,
    # newest first. UBCGrades also sends an "OVERALL" row per course and term, but the
    # oldest terms don't have one, so every term is added up from its sections instead.
    by_course: dict[str, list[dict]] = {}
    for row in rows:
        if row["section"] != "OVERALL":
            by_course.setdefault(f"{row['subject']} {row['course']}", []).append(row)

    courses = {}
    for code in sorted(by_course):
        sections = by_course[code]
        # Topics courses (CPSC 436A, 436N, ...) are different courses in the same term, so
        # each gets its own row.
        by_term: dict[tuple[str, str], list[dict]] = {}
        for s in sections:
            by_term.setdefault((f"{s['year']}{s['session']}", s["detail"]), []).append(s)

        terms = []
        for (session, topic), term_sections in by_term.items():
            term = {"session": session}
            if topic:
                term["topic"] = topic
                term["title"] = term_sections[0]["course_title"]
            term |= combine(term_sections)
            term["instructors"] = instructors(term_sections)
            terms.append(term)
        # Newest term first; topics in a term in letter order.
        terms.sort(key=lambda t: t.get("topic", ""))
        terms.sort(key=lambda t: session_key(t["session"]), reverse=True)

        courses[code] = combine(sections) | {"terms": terms}
    return courses


def build_summary(subject: str, raw_dir: Path) -> dict:
    rows = load_rows(subject, raw_dir)
    sessions = sorted({f"{r['year']}{r['session']}" for r in rows}, key=session_key)
    return {
        "subject": subject,
        "campus": CAMPUS,
        "source": "https://ubcgrades.com",
        "credit": "UBCGrades.com / UBC PAIR",
        "sessions": sessions,
        "buckets": BUCKETS,
        "courses": summarize(rows),
    }


def to_json(data) -> str:
    # json.dumps puts every list item on its own line. Short lists of plain values (grade
    # counts, instructor names, terms) are easier to read on one line.
    text = json.dumps(data, indent=2, ensure_ascii=False)

    def one_line(match: re.Match) -> str:
        return re.sub(r"\s*\n\s*", " ", match.group()).replace("[ ", "[").replace(" ]", "]")

    # A "[" ... "]" with no other brackets or braces inside is a list of plain values.
    return re.sub(r"\[[^\[\]{}]*\n[^\[\]{}]*\]", one_line, text) + "\n"
