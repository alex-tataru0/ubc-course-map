import json

import pytest

from arts_degree import AREAS, PROGRAM_RULES, add_program_rules, courses_in, parse_degree, text_of
from build_programs import ARTS_DEGREE_PATH, ARTS_PATH, RAW_DIR, SUBJECTS_PATH, known_courses, load_arts_degree

# The tests below use the saved calendar page
# (data/raw/programs/degree-requirements-students-who-enter-program-202425-or-later.html),
# data/subjects.json, data/arts-degree.json and data/programs/arts.json.

PAGE_PATH = RAW_DIR / "degree-requirements-students-who-enter-program-202425-or-later.html"


@pytest.fixture(scope="module")
def degree():
    return load_arts_degree(known_courses())


@pytest.fixture(scope="module")
def subjects():
    return json.loads(SUBJECTS_PATH.read_text(encoding="utf-8"))["subjects"]


def research_row(degree, major):
    return next(row for row in degree["research"] if row["major"] == major)


def test_file_is_up_to_date(degree):
    assert json.loads(ARTS_DEGREE_PATH.read_text(encoding="utf-8")) == degree


def test_writing_courses(degree):
    # Arts One isn't a course code, so it's only in the text.
    assert degree["writing"]["courses"] == [
        "ASTU 100", "ASTU 101", "CAP 100", "ENGL 100", "WRDS 150", "WRDS 151", "WRDS 350",
    ]
    assert degree["writing"]["text"].startswith("Arts One, ")


def test_research_table(degree):
    assert len(degree["research"]) == 46
    assert research_row(degree, "Economics")["courses"] == ["ECON 390", "ECON 490", "ECON 495", "ECON 499"]
    assert research_row(degree, "Psychology")["courses"] == ["PSYC 217"]
    # "LAST _V303" in the calendar.
    assert research_row(degree, "Latin American Studies")["courses"] == ["LAST 303"]
    # "...; also CPSC_V 448, 449 (with the approval of the Department of Computer Science)"
    assert research_row(degree, "Computer Science")["courses"][-2:] == ["CPSC 448", "CPSC 449"]
    # A row with no courses keeps its words.
    interdisciplinary = research_row(degree, "Interdisciplinary Studies")
    assert interdisciplinary["courses"] == [] and interdisciplinary["text"].startswith("Any research-intensive")


def test_all_400_level_poli_courses(degree):
    # "All POLI_V courses at the 400-level" → every 400-level POLI course on the site.
    poli = research_row(degree, "Political Science")["courses"]
    assert poli == sorted(c for c in known_courses() if c.startswith("POLI 4"))
    assert "POLI 464" in poli


def test_breadth(degree):
    assert degree["breadth_credits"] == [9, 6, 3]
    assert [area["name"] for area in degree["areas"]] == AREAS
    assert [len(area["subjects"]) for area in degree["areas"]] == [34, 34, 23, 15]
    codes = [code for area in degree["areas"] for code in area["subjects"]]
    assert len(set(codes)) == len(codes)
    areas = {code: area["name"] for area in degree["areas"] for code in area["subjects"]}
    assert areas["ENGL"] == areas["WRDS"] == "Humanities and Creative Arts"
    assert areas["FREN"] == "Language as Meaning"
    # GEOS is a Faculty of Arts subject, but a Natural and Physical Sciences one here.
    assert areas["GEOS"] == "Natural and Physical Sciences"
    assert areas["ECON"] == "Social and Behavioural Systems"


def test_breadth_codes_are_calendar_subjects(degree, subjects):
    # Except two the calendar still lists that its course index doesn't have any more.
    codes = {s["code"] for s in subjects}
    assert {c for area in degree["areas"] for c in area["subjects"] if c not in codes} == {"ITST", "SCAN"}


def test_credit_numbers(degree):
    assert degree["outside"] == {"Major": 60, "Honours or Combined Major": 48,
                                 "Double Major, Double Honours or Adding a Minor": 24}
    assert degree["upper_level"]["Major, Combined Major or IDST"] == 48
    assert degree["upper_level"]["Honours"] == 54
    assert degree["arts_credits"] == 72


def test_place_and_power_links_to_the_arts_list(degree):
    assert degree["place_and_power"] == "https://www.arts.ubc.ca/degree-planning/degree-requirements/bachelor-of-arts/"


def test_arts_subjects(degree, subjects):
    assert len(degree["arts_subjects"]) == 104
    assert {"ECON", "PSYC", "GEOS", "WRDS", "ASTU", "CAP"} <= set(degree["arts_subjects"])
    assert not {"CPSC", "MATH", "COMM"} & set(degree["arts_subjects"])


def test_every_arts_program_has_its_rules(degree):
    programs = json.loads(ARTS_PATH.read_text(encoding="utf-8"))["programs"]
    assert {p["id"] for p in programs} == set(PROGRAM_RULES)
    areas = {code: area["name"] for area in degree["areas"] for code in area["subjects"]}
    for program in programs:
        assert research_row(degree, program["research"])["courses"], program["id"]
        assert set(program["field"]) <= set(degree["arts_subjects"])
        # The program's main subject is in a breadth area, so the site knows which one it skips.
        assert program["field"][0] in areas


def test_unknown_research_row_stops_the_build(degree):
    with pytest.raises(ValueError, match="anth-major"):
        add_program_rules([{"id": "anth-major"}], degree | {"research": []})


def test_changed_page_stops_the_build(subjects):
    page = PAGE_PATH.read_text(encoding="utf-8")
    with pytest.raises(ValueError, match="Outside"):
        parse_degree(page.replace("Outside credits required:", "Outside credits:"), subjects)
    with pytest.raises(ValueError, match="Language as Meaning"):
        parse_degree(page.replace("Language as Meaning Course Codes", "Language Course Codes"), subjects)


@pytest.mark.parametrize("text, courses", [
    ("ANTH 317, 407; ARCL 306", ["ANTH 317", "ANTH 407", "ARCL 306"]),
    ("HIST 403, ECON 457, POLI 464, or other Faculty Approved courses", ["HIST 403", "ECON 457", "POLI 464"]),
    ("All POLI courses at the 400-level", ["POLI 400-499"]),
    ("Any research-intensive approved course", []),
])
def test_courses_in(text, courses):
    assert courses_in(text) == courses


def test_text_of_writes_codes_like_the_site():
    assert text_of("<td>LAST _V303 and ENGL_V 100<sup>1</sup></td>") == "LAST 303 and ENGL 100"
