from pathlib import Path

import pytest

from build_programs import add_trees, electives_to_check
from engineering_programs import PAGES, parse_engineering
from program_tables import read_credits

RAW_DIR = Path(__file__).parents[2] / "data" / "raw" / "programs"


def no_ask(text):
    raise AssertionError(f"Gemini shouldn't be asked about {text!r}")


def no_save(cache, path):
    raise AssertionError("nothing new to save")


@pytest.fixture(scope="module")
def programs():
    pages = {name: (RAW_DIR / f"{url.rsplit('/', 1)[1]}.html").read_text(encoding="utf-8")
             for name, url in PAGES.items()}
    built = electives_to_check(add_trees(parse_engineering(pages), {}, no_ask, no_save))
    return {p["id"]: p for p in built}


def rows(program, year):
    return {r["text"]: r for r in program["years"][year]["requirements"]}


def test_read_credits():
    assert read_credits("4") == (4, None)
    assert read_credits(" 3 or 5 ") == (3, "3 or 5")
    assert read_credits("") == (None, None)


def test_the_fourteen_vancouver_majors(programs):
    assert [p["name"] for p in programs.values()] == [
        "Biomedical Engineering", "Chemical and Biological Engineering", "Chemical Engineering",
        "Civil Engineering", "Computer Engineering", "Electrical Engineering", "Engineering Physics",
        "Environmental Engineering", "Geological Engineering", "Integrated Engineering",
        "Manufacturing Engineering", "Materials Engineering", "Mechanical Engineering",
        "Mining Engineering",
    ]
    four_years = ["First Year", "Second Year", "Third Year", "Fourth Year"]
    for id, program in programs.items():
        # Engineering Physics takes five years.
        assert [y["title"] for y in program["years"]] == four_years + (["Fifth Year"] if id == "enph" else [])
        assert program["total_credits"] == sum(y["credits"] for y in program["years"])
        for year in program["years"]:
            assert year["credits"] == sum(r["credits"] for r in year["requirements"])
    assert {p: program["total_credits"] for p, program in programs.items()} == {
        "bmeg": 149, "chbe": 155, "chbe-chemical": 155, "civl": 158, "cpen": 151, "elec": 151,
        "enph": 173, "enve": 151, "geol": 151, "igen": 152, "manu": 153, "mtrl": 147, "mech": 148,
        "mine": 151,
    }


def test_first_year_is_shared(programs):
    first = [p["years"][0] for id, p in programs.items() if id != "bmeg"]
    assert all(year == first[0] for year in first)
    assert first[0]["credits"] == 37
    assert list(rows(programs["elec"], 0))[:3] == ["APSC 100", "APSC 101", "APSC 160"]
    # Biomedical Engineering has its own first year, with BMEG 101 and 102 instead of APSC 101.
    bmeg = rows(programs["bmeg"], 0)
    assert programs["bmeg"]["years"][0]["credits"] == 40
    assert "BMEG 101" in bmeg and "APSC 101" not in bmeg


def test_every_row_is_read_by_the_rules(programs):
    all_rows = [r for p in programs.values() for y in p["years"] for r in y["requirements"]]
    assert len(all_rows) == 617
    assert all(r["source"] == "rules" and r["problems"] == [] for r in all_rows)
    # Department-list electives are something to check, not any course.
    assert not any(r["tree"] == {"electives": True} for r in all_rows)
    assert rows(programs["cpen"], 2)["Electives"]["tree"] == {"other": "Electives"}


def test_current_versions(programs):
    # Computer Engineering's second year for students who entered it in 2023W or later.
    second = rows(programs["cpen"], 1)
    assert second["CPEN 221"]["credits"] == 5
    assert "MATH 255" in second and "CPEN 291" not in second
    # The calendar marks this row with a footnote it never gives.
    assert second["Electives"]["notes"] == []
    # Mechanical's third and fourth years for students who started third year in 2026W or later.
    assert "MECH 466" in rows(programs["mech"], 2)
    assert "MECH 466" not in rows(programs["mech"], 3)
    assert programs["mech"]["notes"] == [
        "Third and fourth years for students who started third year in 2026W or later.",
    ]
    # Biomedical's second year for students who entered it in 2022W or later.
    assert "CHBE 251" not in rows(programs["bmeg"], 1)
    assert programs["bmeg"]["years"][1]["credits"] == 37
    # Manufacturing's second year for students who entered it in 2026W or later.
    second = rows(programs["manu"], 1)
    assert "MANU 280" in second and "MANU 230" not in second
    assert programs["manu"]["years"][1]["title"] == "Second Year"


def test_two_programs_from_one_table(programs):
    # Chemical Engineering and Chemical and Biological Engineering share their tables, and
    # each year ends with a short list for each.
    chemical, biological = rows(programs["chbe-chemical"], 2), rows(programs["chbe"], 2)
    assert "CHBE 366" in chemical and "CHBE 381" not in chemical
    assert "CHBE 381" in biological and "CHBE 366" not in biological
    assert "CHBE 345" in chemical and "CHBE 345" in biological
    assert "CHBE 454" in rows(programs["chbe-chemical"], 3)
    assert "CHBE 453" in rows(programs["chbe"], 3)
    assert [y["credits"] for y in programs["chbe"]["years"]] == [37, 39, 40, 39]


def test_no_options(programs):
    # The co-op schedule on the Engineering Physics page isn't a requirement table.
    assert len(programs["enph"]["years"]) == 5
    # Footnotes about options are left out.
    assert rows(programs["elec"], 1)["ELEC 291"]["notes"] == []
    assert not any("option" in str(p).lower() for p in programs.values())


def test_credits_with_a_choice(programs):
    second = programs["mech"]["years"][1]
    row = rows(programs["mech"], 1)["MECH 226 or MECH 227"]
    assert (row["credits"], row["credits_text"]) == (3, "3 or 5")
    assert row["tree"] == {"one_of": ["MECH 226", "MECH 227"]}
    assert (second["credits"], second["credits_text"]) == (40, "40 or 42")
