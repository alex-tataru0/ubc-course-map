from pathlib import Path

import pytest

from build_programs import add_trees, electives_to_check
from engineering_programs import PAGES, PROGRAMS, parse_engineering
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


def test_nine_programs_of_four_years(programs):
    assert list(programs) == [p["id"] for p in PROGRAMS]
    assert len(programs) == 9
    for program in programs.values():
        assert [y["title"] for y in program["years"]] == [
            "First Year", "Second Year", "Third Year", "Fourth Year",
        ]
        assert program["total_credits"] == sum(y["credits"] for y in program["years"])
    assert {p: programs[p]["total_credits"] for p in ["cpen", "elec", "mech", "mech-aerospace"]} == {
        "cpen": 151, "elec": 151, "mech": 148, "mech-aerospace": 155,
    }


def test_first_year_is_shared(programs):
    first = [p["years"][0] for p in programs.values()]
    assert all(year == first[0] for year in first)
    assert first[0]["credits"] == 37
    assert list(rows(programs["elec"], 0))[:3] == ["APSC 100", "APSC 101", "APSC 160"]


def test_every_row_is_read_by_the_rules(programs):
    all_rows = [r for p in programs.values() for y in p["years"] for r in y["requirements"]]
    assert len(all_rows) == 358
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
    # Mechatronics has one version.
    assert len(programs["mech-mechatronics"]["notes"]) == 1


def test_biomedical_option_swaps_elec_291(programs):
    bmeg, elec = rows(programs["elec-bmeg"], 1), rows(programs["elec"], 1)
    assert bmeg["ELEC 271, ELEC 292"]["tree"] == {"all_of": ["ELEC 271", "ELEC 292"]}
    assert bmeg["ELEC 271, ELEC 292"]["credits"] == 7
    assert programs["elec-bmeg"]["years"][1]["credits"] == 40
    # The swap doesn't touch Electrical Engineering's own second year.
    assert elec["ELEC 291"]["credits"] == 6
    assert programs["elec"]["years"][1]["credits"] == 39


def test_credits_with_a_choice(programs):
    second = programs["mech"]["years"][1]
    row = rows(programs["mech"], 1)["MECH 226 or MECH 227"]
    assert (row["credits"], row["credits_text"]) == (3, "3 or 5")
    assert row["tree"] == {"one_of": ["MECH 226", "MECH 227"]}
    assert (second["credits"], second["credits_text"]) == (40, "40 or 42")


def test_pick_two(programs):
    fourth = rows(programs["mech-aerospace"], 3)
    assert fourth["Two of MECH 477, MECH 484, MECH 485"]["tree"] == {
        "pick": 2, "of": ["MECH 477", "MECH 484", "MECH 485"],
    }
