import json
from pathlib import Path
from urllib.error import HTTPError

import pytest

from build_prereqs import SUBJECTS
from grades import (
    API, BUCKETS, build_summary, combine, download_grades, instructors, load_rows, new_terms,
    saved_terms, session_key, summarize, to_json,
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


def test_saved_terms_in_time_order(tmp_path):
    for name in ["UBCV-2024W-CPSC.json", "UBCV-2024S-CPSC.json", "UBCV-2024S-MATH.json"]:
        (tmp_path / name).write_text("[]")
    assert saved_terms(tmp_path) == ["2024S", "2024W"]


def test_new_terms_asks_once_and_lists_terms_not_saved(tmp_path):
    (tmp_path / "UBCV-2024S-CPSC.json").write_text("[]")
    asked = []

    def fake_fetch(url):
        asked.append(url)
        return '["2024S", "2024W", "2025S"]'

    assert new_terms(tmp_path, fetch=fake_fetch) == ["2024W", "2025S"]
    assert asked == [f"{API}/yearsessions/UBCV"]
    (tmp_path / "UBCV-2024W-CPSC.json").write_text("[]")
    (tmp_path / "UBCV-2025S-CPSC.json").write_text("[]")
    assert new_terms(tmp_path, fetch=fake_fetch) == []


def test_lists_of_plain_values_go_on_one_line():
    text = to_json({"grades": [1, 2, 3], "terms": [{"names": ["A", "B"]}]})
    assert '"grades": [1, 2, 3]' in text
    assert '"names": ["A", "B"]' in text
    assert json.loads(text) == {"grades": [1, 2, 3], "terms": [{"names": ["A", "B"]}]}


# The tests below use the real data saved in data/raw/grades.

# The ten terms the numbers below were checked against. The tests read only these, so a new
# term from UBCGrades (downloaded by hand or by .github/workflows/grades.yml) doesn't change
# them.
CHECKED_TERMS = ["2021S", "2021W", "2022S", "2022W", "2023S", "2023W", "2024S", "2024W",
                 "2025S", "2025W"]


@pytest.fixture(scope="module")
def raw_dir(tmp_path_factory):
    # A folder of links to the saved files for CHECKED_TERMS only.
    folder = tmp_path_factory.mktemp("grades")
    for path in RAW_DIR.glob("UBCV-*-*.json"):
        if path.name.split("-")[1] in CHECKED_TERMS:
            (folder / path.name).symlink_to(path)
    return folder


def test_every_saved_term_has_every_subject():
    # A download that stopped halfway would leave some subjects without the new term.
    terms = saved_terms(RAW_DIR)
    assert terms[:len(CHECKED_TERMS)] == CHECKED_TERMS
    missing = [f"{term} {subject}" for term in terms for subject in SUBJECTS
               if not (RAW_DIR / f"UBCV-{term}-{subject}.json").exists()]
    assert missing == []


# How many "OVERALL" rows UBCGrades sends for each subject.
@pytest.mark.parametrize("subject, overall_rows", [
    ("ASTR", 57), ("ATSC", 30), ("BIOL", 431), ("CHEM", 282), ("CPSC", 333), ("DSCI", 96),
    ("ENVR", 38), ("EOSC", 314), ("ISCI", 52), ("MATH", 407), ("MICB", 135), ("PHYS", 236),
    ("SCIE", 14), ("STAT", 132),
    ("APSC", 114), ("BMEG", 213), ("CHBE", 223), ("CIVL", 302), ("CPEN", 132), ("ELEC", 248),
    ("ENPH", 31), ("ENVE", 23), ("IGEN", 30), ("MANU", 71), ("MECH", 339), ("MINE", 151),
    ("MTRL", 141),
    ("ANTH", 190), ("COGS", 24), ("ECON", 354), ("ENGL", 393), ("GEOG", 213), ("HIST", 402),
    ("LING", 156), ("PHIL", 320), ("POLI", 368), ("PSYC", 330), ("SOCI", 288), ("WRDS", 31),
])
def test_terms_match_ubcgrades_own_totals(subject, overall_rows, raw_dir):
    # Wherever UBCGrades gives an "OVERALL" row, adding up the sections must give the same
    # student count, average and grade counts.
    rows = load_rows(subject, raw_dir)
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


def test_real_summary(raw_dir):
    data = build_summary("CPSC", raw_dir)
    assert data["sessions"][0] == "2021S"
    assert data["sessions"][-1] == "2025W"
    assert len(data["courses"]) == 79

    cpsc221 = data["courses"]["CPSC 221"]
    term = next(t for t in cpsc221["terms"] if t["session"] == "2024W")
    assert term["reported"] == 926
    assert term["average"] == 82.4
    assert term["instructors"] == ["Cinda Heeren", "Geoffrey Tien"]


def test_real_math_and_stat_summaries(raw_dir):
    math = build_summary("MATH", raw_dir)
    assert len(math["courses"]) == 136
    term = next(t for t in math["courses"]["MATH 100"]["terms"] if t["session"] == "2025W")
    assert term["reported"] == 3641
    assert term["average"] == 66.3

    stat = build_summary("STAT", raw_dir)
    assert len(stat["courses"]) == 33
    assert stat["sessions"] == math["sessions"]


def test_real_summary_leaves_out_terms_without_sections(raw_dir):
    # ENVR had no sections in four of the five summers, so those files are empty lists.
    envr = build_summary("ENVR", raw_dir)
    assert envr["sessions"] == ["2021W", "2022S", "2022W", "2023W", "2024W", "2025W"]
    assert len(envr["courses"]) == 14


def test_real_engineering_summaries(raw_dir):
    elec = build_summary("ELEC", raw_dir)
    assert len(elec["courses"]) == 69
    assert elec["sessions"] == build_summary("CPSC", raw_dir)["sessions"]
    # ENVE and MANU only run in winter terms, so every summer file is an empty list.
    for subject in ["ENVE", "MANU"]:
        assert build_summary(subject, raw_dir)["sessions"] == [
            "2021W", "2022W", "2023W", "2024W", "2025W",
        ]
