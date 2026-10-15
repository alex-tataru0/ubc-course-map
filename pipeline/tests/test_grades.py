import json
from pathlib import Path
from urllib.error import HTTPError

import pytest

from grades import (
    API, BUCKETS, build_summary, combine, download_grades, instructors, load_rows, session_key,
    summarize, to_json,
)

RAW_DIR = Path(__file__).parents[2] / "data" / "raw" / "grades"


def section(course="221", section="101", session="2024W", reported=100, average=80.0,
            educators="Ada Lovelace", detail="", counts=None, title="Basic Algorithms"):
    # A row shaped like the ones UBCGrades returns. `counts` maps grade ranges to counts;
    # every other range is 0.
    grades = {bucket: 0 for bucket in BUCKETS}
    grades |= counts or {}
    return {
        "subject": "CPSC", "course": course, "detail": detail, "section": section,
        "year": session[:4], "session": session[4:], "reported": reported, "average": average,
        "educators": educators, "grades": grades, "course_title": title,
    }


def test_terms_sort_in_time_order():
    # Summer 2024 (May to August) comes before Winter 2024 (September 2024 to April 2025).
    assert sorted(["2025S", "2024W", "2024S", "2023W"], key=session_key) == [
        "2023W", "2024S", "2024W", "2025S",
    ]


def test_average_is_weighted_by_students():
    total = combine([section(reported=100, average=80), section(reported=300, average=60)])
    assert total["reported"] == 400
    assert total["average"] == 65.0


def test_grade_counts_add_up_and_missing_counts_are_left_out():
    total = combine([
        section(reported=10, counts={"90-100%": 6, "<50%": 4}),
        section(reported=5, counts={"90-100%": 3, "<50%": None}),
    ])
    assert total["grades"][BUCKETS.index("90-100%")] == 9
    assert total["grades"][BUCKETS.index("<50%")] == 4
    # 2 students in the second section are in a range whose count isn't given.
    assert total["reported"] - sum(total["grades"]) == 2


def test_instructors_in_section_order_each_once():
    sections = [
        section(section="201", educators="Grace Hopper"),
        section(section="101", educators="Ada Lovelace;Grace Hopper"),
        section(section="102", educators=""),
        section(section="103", educators=None),
    ]
    assert instructors(sections) == ["Ada Lovelace", "Grace Hopper"]


def test_summary_per_course_and_term():
    rows = [
        section(session="2023W", section="101", reported=100, average=70, educators="A"),
        section(session="2024W", section="101", reported=100, average=80, educators="B"),
        section(session="2024W", section="201", reported=100, average=90, educators="C"),
        section(session="2024S", section="921", reported=50, average=85, educators="D"),
        # UBCGrades' own total for the term. It's skipped and the sections are added up.
        section(session="2024W", section="OVERALL", reported=200, average=85, educators=None),
        section(course="210", reported=40, average=75),
    ]
    courses = summarize(rows)
    assert list(courses) == ["CPSC 210", "CPSC 221"]

    cpsc221 = courses["CPSC 221"]
    assert cpsc221["reported"] == 350
    assert [t["session"] for t in cpsc221["terms"]] == ["2024W", "2024S", "2023W"]
    assert cpsc221["terms"][0] == {
        "session": "2024W", "reported": 200, "average": 85.0, "grades": [0] * len(BUCKETS),
        "instructors": ["B", "C"],
    }


def test_topics_courses_get_a_row_each():
    rows = [
        section(course="436", detail="N", title="NLP", educators="X"),
        section(course="436", detail="C", title="CLOUD COMPUTING", educators="Y"),
    ]
    terms = summarize(rows)["CPSC 436"]["terms"]
    assert [(t["topic"], t["title"], t["instructors"]) for t in terms] == [
        ("C", "CLOUD COMPUTING", ["Y"]),
        ("N", "NLP", ["X"]),
    ]


def test_downloads_only_terms_not_saved_yet(tmp_path):
    (tmp_path / "UBCV-2024S-CPSC.json").write_text("[]")
    asked, waits = [], []

    def fake_fetch(url):
        asked.append(url)
        if url.endswith("/yearsessions/UBCV"):
            return '["2024S", "2024W"]'
        return '[{"from": "' + url + '"}]'

    new = download_grades("CPSC", tmp_path, fetch=fake_fetch, sleep=waits.append)
    assert new == ["2024W"]
    assert asked == [f"{API}/yearsessions/UBCV", f"{API}/grades/UBCV/2024W/CPSC"]
    assert len(waits) == 1
    # Saved exactly as received.
    saved = (tmp_path / "UBCV-2024W-CPSC.json").read_text()
    assert saved == f'[{{"from": "{API}/grades/UBCV/2024W/CPSC"}}]'

    assert download_grades("CPSC", tmp_path, fetch=fake_fetch, sleep=waits.append,
                           refresh=True) == ["2024S", "2024W"]


def test_term_with_no_sections_is_saved_as_an_empty_list(tmp_path):
    # UBCGrades answers 404 when the subject had no sections that term.
    def fake_fetch(url):
        if url.endswith("/yearsessions/UBCV"):
            return '["2024S"]'
        raise HTTPError(url, 404, "Not Found", None, None)

    assert download_grades("ENVR", tmp_path, fetch=fake_fetch, sleep=lambda s: None) == ["2024S"]
    assert (tmp_path / "UBCV-2024S-ENVR.json").read_text() == "[]"


def test_other_http_errors_stop_the_download(tmp_path):
    def fake_fetch(url):
        if url.endswith("/yearsessions/UBCV"):
            return '["2024S"]'
        raise HTTPError(url, 500, "Internal Server Error", None, None)

    with pytest.raises(HTTPError):
        download_grades("ENVR", tmp_path, fetch=fake_fetch, sleep=lambda s: None)
    assert not (tmp_path / "UBCV-2024S-ENVR.json").exists()


def test_lists_of_plain_values_go_on_one_line():
    text = to_json({"grades": [1, 2, 3], "terms": [{"names": ["A", "B"]}]})
    assert '"grades": [1, 2, 3]' in text
    assert '"names": ["A", "B"]' in text
    assert json.loads(text) == {"grades": [1, 2, 3], "terms": [{"names": ["A", "B"]}]}


# The tests below use the real data saved in data/raw/grades.

# How many "OVERALL" rows UBCGrades sends for each subject.
@pytest.mark.parametrize("subject, overall_rows", [
    ("ASTR", 57), ("ATSC", 30), ("BIOL", 431), ("CHEM", 282), ("CPSC", 333), ("DSCI", 96),
    ("ENVR", 38), ("EOSC", 314), ("ISCI", 52), ("MATH", 407), ("MICB", 135), ("PHYS", 236),
    ("SCIE", 14), ("STAT", 132),
])
def test_terms_match_ubcgrades_own_totals(subject, overall_rows):
    # Wherever UBCGrades gives an "OVERALL" row, adding up the sections must give the same
    # student count, average and grade counts.
    rows = load_rows(subject, RAW_DIR)
    courses = summarize(rows)
    checked = 0
    for row in rows:
        if row["section"] != "OVERALL":
            continue
        terms = courses[f"{subject} {row['course']}"]["terms"]
        term = next(t for t in terms
                    if t["session"] == row["year"] + row["session"]
                    and t.get("topic", "") == row["detail"])
        assert term["reported"] == row["reported"]
        assert term["average"] == pytest.approx(row["average"], abs=0.05)
        assert term["grades"] == [row["grades"][bucket] or 0 for bucket in BUCKETS]
        checked += 1
    assert checked == overall_rows


def test_real_summary():
    data = build_summary("CPSC", RAW_DIR)
    assert data["sessions"][0] == "2021S"
    assert data["sessions"][-1] == "2025W"
    assert len(data["courses"]) == 79

    cpsc221 = data["courses"]["CPSC 221"]
    term = next(t for t in cpsc221["terms"] if t["session"] == "2024W")
    assert term["reported"] == 926
    assert term["average"] == 82.4
    assert term["instructors"] == ["Cinda Heeren", "Geoffrey Tien"]


def test_real_math_and_stat_summaries():
    math = build_summary("MATH", RAW_DIR)
    assert len(math["courses"]) == 136
    term = next(t for t in math["courses"]["MATH 100"]["terms"] if t["session"] == "2025W")
    assert term["reported"] == 3641
    assert term["average"] == 66.3

    stat = build_summary("STAT", RAW_DIR)
    assert len(stat["courses"]) == 33
    assert stat["sessions"] == math["sessions"]


def test_real_summary_leaves_out_terms_without_sections():
    # ENVR had no sections in four of the five summers, so those files are empty lists.
    envr = build_summary("ENVR", RAW_DIR)
    assert envr["sessions"] == ["2021W", "2022S", "2022W", "2023W", "2024W", "2025W"]
    assert len(envr["courses"]) == 14
