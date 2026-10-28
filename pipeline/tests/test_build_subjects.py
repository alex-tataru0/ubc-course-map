import json

import pytest

from build_prereqs import FACULTIES
from build_subjects import (
    INDEX_URL, OUTPUT_PATH, build, download_titles, faculty_of, load_index, load_titles, page_title,
    parse_index,
)

# Most tests below use the saved index (data/raw/subjects.html), the saved titles
# (data/raw/subject-titles.json) and data/subjects.json.


@pytest.fixture(scope="module")
def subjects():
    return parse_index(load_index())


@pytest.fixture(scope="module")
def faculties():
    data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    return {s["code"]: s["faculty"] for s in data["subjects"]}


def test_index_lists_every_subject_once(subjects):
    codes = [s["code"] for s in subjects]
    assert len(codes) == 264
    assert len(set(codes)) == len(codes)
    econ = next(s for s in subjects if s["code"] == "ECON")
    assert econ == {"code": "ECON", "name": "Economics",
                    "url": "https://vancouver.calendar.ubc.ca/course-descriptions/subject/econv"}


def test_every_subject_has_a_saved_title(subjects):
    assert set(load_titles()) == {s["code"] for s in subjects}


def test_subjects_file_is_up_to_date(subjects):
    data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    assert data == build(subjects, load_titles())
    assert data["source"] == INDEX_URL


@pytest.mark.parametrize("name, title, faculty", [
    ("Economics", "Economics, Faculty of Arts", "Faculty of Arts"),
    ("Cognitive Systems Program", "Cognitive Systems Program, Faculty of Science", "Faculty of Science"),
    ("Law", "Law, Peter A. Allard School of Law", "Peter A. Allard School of Law"),
    # A name with a comma in it.
    ("Writing, Research, and Discourse Studies", "Writing, Research, and Discourse Studies, Faculty of Arts",
     "Faculty of Arts"),
    ("Exchange Programs", "Exchange Programs", None),
])
def test_faculty_comes_after_the_name(name, title, faculty):
    assert faculty_of(name, title) == faculty


def test_faculty_counts(faculties):
    counts = {}
    for faculty in faculties.values():
        counts[faculty] = counts.get(faculty, 0) + 1
    assert counts["Faculty of Arts"] == 104
    assert counts["Faculty of Science"] == 28
    assert counts["Faculty of Applied Science"] == 28
    # Exchange Programs, Exchange Graduate Research and University Writing Centre Courses.
    assert counts[None] == 3


def test_site_subjects_are_offered_by_their_pages_faculty(faculties):
    assert {faculties[s] for s in FACULTIES["science"]} == {"Faculty of Science"}
    assert {faculties[s] for s in FACULTIES["arts"]} == {"Faculty of Arts"}
    # ENPH (Engineering Physics) is a Faculty of Science subject in the calendar, though its
    # program is in engineering, so it's on the engineering page.
    assert {s for s in FACULTIES["engineering"] if faculties[s] != "Faculty of Applied Science"} == {"ENPH"}


def test_geography_subjects():
    # GEOG and GEOS are both Faculty of Arts subjects (GEOS courses have Science credit too).
    data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    geos = next(s for s in data["subjects"] if s["code"] == "GEOS")
    assert geos == {"code": "GEOS", "name": "Geographical Sciences", "faculty": "Faculty of Arts"}


def test_page_title():
    page = '<div><h1 class="page-title">\n  Anthropology, Faculty of Arts </h1></div>'
    assert page_title(page) == "Anthropology, Faculty of Arts"
    with pytest.raises(ValueError):
        page_title("<h1>Page not found</h1>")


def test_index_without_subjects_stops_the_build():
    with pytest.raises(ValueError):
        parse_index("<html>Something else</html>")


def test_only_missing_titles_are_downloaded():
    subjects = [{"code": c, "name": c.title(), "url": f"https://example.com/{c}"} for c in ["ANTH", "ECON", "HIST"]]
    titles = {"ECON": "Econ, Faculty of Arts"}
    fetched, sleeps, saves = [], [], []

    def fetch(url):
        fetched.append(url)
        return f'<h1 class="page-title">{url[-4:].title()}, Faculty of Arts</h1>'

    new = download_titles(subjects, titles, fetch=fetch, sleep=sleeps.append, save=lambda t: saves.append(dict(t)))
    assert new == ["ANTH", "HIST"]
    assert fetched == ["https://example.com/ANTH", "https://example.com/HIST"]
    # A pause between requests, not before the first one.
    assert sleeps == [1]
    # Saved after each one, so a run that stops halfway carries on later.
    assert [set(s) for s in saves] == [{"ANTH", "ECON"}, {"ANTH", "ECON", "HIST"}]
    assert titles["HIST"] == "Hist, Faculty of Arts"
