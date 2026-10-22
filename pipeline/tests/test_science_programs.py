from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from program_tables import read_table
from science_programs import PAGES, merge_years, parse_science, year_numbers, year_title

RAW_DIR = Path(__file__).parents[2] / "data" / "raw" / "programs"


@pytest.fixture(scope="module")
def programs():
    pages = {name: (RAW_DIR / f"{name}.html").read_text(encoding="utf-8") for name in PAGES}
    return {p["id"]: p for p in parse_science(pages)}


def table(rows: str):
    return BeautifulSoup(f"<table>{rows}</table>", "html.parser").table


def test_year_numbers_and_titles():
    assert year_numbers("First year") == [1]
    assert year_numbers("Third or Fourth Years") == [3, 4]
    assert year_numbers("First Year and Second Year") == [1, 2]
    assert year_title([1]) == "First Year"
    assert year_title([3, 4]) == "Third and Fourth Years"
    assert year_title([2, 3, 4]) == "Second to Fourth Years"


def test_totals_for_the_degree_and_for_several_years():
    read = read_table(table(
        "<tr><td>Third Year</td><td></td></tr>"
        "<tr><td>BIOL 300</td><td>3</td></tr>"
        "<tr><td>Fourth Year</td><td></td></tr>"
        "<tr><td>BIOL 449</td><td>6</td></tr>"
        "<tr><td>Total Credits in Third and Fourth Years</td><td>9</td></tr>"
        "<tr><td>Total credits for the degree</td><td>120</td></tr>"
    ))
    assert read["degree_credits"] == 120
    assert [(b["title"], b["credits"]) for b in read["blocks"]] == [("Third Year", None), ("Fourth Year", 9)]
    assert read["blocks"][1]["total_for"] == "Third and Fourth Years"


def test_blocks_without_totals_are_merged():
    def block(title, credits, *rows):
        return {"title": title, "credits": credits,
                "requirements": [{"text": t, "credits": c, "notes": []} for t, c in rows]}

    years = merge_years([
        block("First Year", 30, ("Electives", 30)),
        block("Third Year", None, ("MICB 301", 3)),
        block("Third or Fourth Year", None, ("Electives", 54)),
        block("Fourth Year", None, ("MICB 471", 3)),
    ], degree_credits=90)
    assert [(y["title"], y["credits"]) for y in years] == [("First Year", 30), ("Third and Fourth Years", 60)]
    assert [r["notes"] for r in years[1]["requirements"]] == [["In third year"], [], ["In fourth year"]]


def test_the_32_programs(programs):
    assert len(programs) == 32
    for program in programs.values():
        assert program["total_credits"] == sum(y["credits"] for y in program["years"])
        assert program["total_credits"] in (120, 132)
        for year in program["years"]:
            assert year["credits"] == sum(r["credits"] for r in year["requirements"]), (program["id"], year["title"])
    # Ids start with the subject whose map the program goes with.
    assert {id.split("-")[0] for id in programs} == {
        "astr", "atsc", "biol", "chem", "dsci", "eosc", "envr", "math", "micb", "phys", "stat"}


def test_same_as_copies_the_biology_major(programs):
    major = programs["biol-major"]["years"]
    assert programs["biol-honours"]["years"][:2] == major[:2]
    assert programs["biol-evolution-honours"]["years"][:2] == major[:2]
    # Conservation Biology copies only first year and lists its own second year.
    conservation = programs["biol-conservation-honours"]["years"]
    assert conservation[0] == major[0]
    assert [(y["title"], y["credits"]) for y in conservation] == [
        ("First Year", 31), ("Second Year", 30), ("Third and Fourth Years", 71)]


def test_upper_years_with_one_total(programs):
    # Microbiology gives only the degree's total: third and fourth years get what's left.
    micb = programs["micb-major"]["years"][2]
    assert (micb["title"], micb["credits"]) == ("Third and Fourth Years", 60)
    notes = {r["text"]: r["notes"][:1] for r in micb["requirements"]}
    assert notes["MICB 301, 302, 322, 323"] == ["In third year"]
    assert notes["MICB 471 (or 421 or 447)"] == ["In fourth year"]
    assert notes["BIOC 302"] == ["BIOC 303 may be substituted for BIOC 302 by using 3 credits of elective space."]


def test_headings_and_sources(programs):
    dsci = programs["dsci-major"]
    assert dsci["heading"] == "Major: Data Science (DSCI)"
    assert dsci["sources"] == [PAGES["data-science"]]
    assert programs["eosc-geophysics-honours"]["heading"] == "Honours (0380): Geophysics (GEOP)"
