from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from parse_programs import is_footnote, parse_programs, read_cell, same_as

HTML_PATH = Path(__file__).parents[2] / "data" / "raw" / "programs" / "computer-science.html"


@pytest.fixture(scope="module")
def programs():
    return {p["id"]: p for p in parse_programs(HTML_PATH.read_text(encoding="utf-8"))}


def cell(html: str):
    return BeautifulSoup(f"<table><tr><td>{html}</td></tr></table>", "html.parser").td


def test_read_cell_drops_footnote_marks():
    assert read_cell(cell("CPSC_V or AI_V courses numbered 400 or higher<sup>4,5</sup>")) == (
        "CPSC or AI courses numbered 400 or higher", [4, 5],
    )
    # The mark between "210" and ", 213" used to leave "210 , 213" behind.
    assert read_cell(cell("CPSC_V 210<sup>1</sup>, 213, 221")) == ("CPSC 210, 213, 221", [1])


def test_footnote_rows_start_with_their_number():
    assert is_footnote(cell("<sup>2</sup> May be replaced by STAT_V 200"))
    assert is_footnote(cell('<p class="text-sm"><sup>1</sup>If a lower-credit course…</p>'))
    assert not is_footnote(cell("STAT_V 251<sup>2</sup>"))


def test_unknown_same_as_sentence_stops_the_build():
    year = {"title": "First Year", "requirements": [{"text": "Same as something new"}]}
    with pytest.raises(ValueError):
        same_as(year)


def test_six_programs(programs):
    assert list(programs) == [
        "cpsc-major", "cpsc-honours", "cpsc-ai-major", "cpsc-ai-honours",
        "cpsc-se-major", "cpsc-se-honours",
    ]


def test_credits_add_up(programs):
    # The calendar gives a total for each year and for the degree, so every requirement's
    # credits can be checked against them.
    for program in programs.values():
        assert [y["title"] for y in program["years"]] == [
            "First Year", "Second Year", "Third and Fourth Years",
        ]
        for year in program["years"]:
            assert sum(r["credits"] for r in year["requirements"]) == year["credits"]
        assert sum(y["credits"] for y in program["years"]) == program["total_credits"]
    assert programs["cpsc-major"]["total_credits"] == 120
    assert programs["cpsc-honours"]["total_credits"] == 132


def test_major_requirements(programs):
    first, second, upper = programs["cpsc-major"]["years"]
    assert [r["text"] for r in first["requirements"]][:3] == [
        "SCIE 113", "Additional Communication Requirement", "CPSC 110 (or 103 and 107)",
    ]
    assert [r["text"] for r in upper["requirements"]] == [
        "CPSC 310, 313, 320",
        "CPSC or AI courses numbered 300 or higher",
        "CPSC or AI courses numbered 400 or higher",
        "Electives",
    ]
    stat = next(r for r in second["requirements"] if r["text"] == "STAT 251")
    assert stat["notes"][0].startswith("May be replaced by STAT 200 or STAT 201")


def test_same_as_years_are_copied(programs):
    major, honours = programs["cpsc-major"], programs["cpsc-honours"]
    assert programs["cpsc-ai-major"]["years"][:2] == major["years"][:2]
    assert programs["cpsc-ai-honours"]["years"][:2] == honours["years"][:2]
    assert programs["cpsc-se-honours"]["years"][:2] == honours["years"][:2]
    # The Software Engineering Major only shares first year; its second year is its own.
    assert programs["cpsc-se-major"]["years"][0] == major["years"][0]
    assert programs["cpsc-se-major"]["years"][1] != major["years"][1]
