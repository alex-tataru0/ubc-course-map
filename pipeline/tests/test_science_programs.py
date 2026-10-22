import copy
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from build_programs import CACHE_PATH, add_trees, expand_ranges, known_courses
from llm import load_cache
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


def test_a_minimum_for_part_of_a_block_is_a_note():
    read = read_table(table(
        "<tr><td>Second Year</td><td></td></tr>"
        "<tr><td>CPSC 210</td><td>4</td></tr>"
        "<tr><td>Minimum Total Credits for Second Year</td><td>30</td></tr>"
    ))
    assert read["minimums"] == ["At least 30 credits in second year."]
    assert read["blocks"] == [{"title": "Second Year", "credits": None,
                               "requirements": [{"text": "CPSC 210", "credits": 4, "notes": []}]}]


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


def test_the_61_programs(programs):
    # 32 Majors and Honours, 29 Combined Majors and Honours.
    assert len(programs) == 61
    assert sum("subjects" in p for p in programs.values()) == 29
    for program in programs.values():
        assert program["total_credits"] == sum(y["credits"] for y in program["years"])
        assert program["total_credits"] in (120, 132)
        for year in program["years"]:
            assert year["credits"] == sum(r["credits"] for r in year["requirements"]), (program["id"], year["title"])
    # Ids start with the subject whose map the program goes with.
    assert {id.split("-")[0] for id in programs} == {
        "astr", "atsc", "biol", "chem", "cpsc", "dsci", "eosc", "envr", "math", "micb", "phys", "stat"}


def test_combined_programs(programs):
    cpsc_math = programs["cpsc-math-honours"]
    assert cpsc_math["name"] == "Combined Honours in Computer Science and Mathematics"
    assert cpsc_math["subjects"] == ["CPSC", "MATH"]
    assert cpsc_math["sources"] == [PAGES["computer-science"]]
    # Biochemistry isn't on the site, so this one goes with Chemistry only.
    assert programs["chem-bioc-major"]["subjects"] == ["CHEM"]
    # The calendar says 47 for these years, but the rows (and the degree's 120) say 46.
    cpsc_chem = programs["cpsc-chem-major"]
    assert [y["credits"] for y in cpsc_chem["years"]] == [31, 29, 14, 46]
    assert cpsc_chem["notes"] == [
        "The calendar gives 47 credits for third and fourth years, but their rows add up to 46."]
    # Second to fourth years with only the degree's total, and a minimum for second year.
    cpsc_micb = programs["cpsc-micb-major"]
    assert [(y["title"], y["credits"]) for y in cpsc_micb["years"]] == [
        ("First Year", 31), ("Second to Fourth Years", 89)]
    assert cpsc_micb["notes"] == ["At least 30 credits in second year."]
    # A bracket in the wrong place, fixed, with the calendar's wording in a note.
    row = next(r for r in programs["cpsc-math-honours"]["years"][1]["requirements"] if r["text"].startswith("MATH 131"))
    assert row["text"] == "MATH 131 (or one of 111, 221, 223), 215, 227 (or 317)"
    assert row["notes"] == ['The calendar writes "MATH 131, 215, (or one of 111, 221, 223), 227 (or 317)".']


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


def no_ask(text):
    raise AssertionError(f"Gemini shouldn't be asked about {text!r}")


def no_save(cache, path):
    raise AssertionError("nothing new to save")


@pytest.fixture(scope="module")
def built(programs):
    # Every row read from the rules or the committed Gemini answers, as build_programs.py does.
    built = add_trees(copy.deepcopy(list(programs.values())), load_cache(CACHE_PATH), no_ask, no_save)
    return {p["id"]: p for p in expand_ranges(built, known_courses())}


def tree_of(program, text):
    return next(r["tree"] for y in program["years"] for r in y["requirements"] if r["text"] == text)


def test_every_row_has_a_tree_with_no_problems(built):
    rows = [r for p in built.values() for y in p["years"] for r in y["requirements"]]
    assert len(rows) == 1559
    assert all(r["problems"] == [] for r in rows)
    assert len({r["text"] for r in rows if r["source"] == "llm"}) == 10


def test_ranges_become_courses(built):
    tree = tree_of(built["math-honours"], "15 credits from MATH 400-406, 412, 418-428, 433-440, 443, 449, 450")
    assert tree["credits_from"][:8] == [
        "MATH 400", "MATH 401", "MATH 402", "MATH 403", "MATH 404", "MATH 405", "MATH 406", "MATH 412"]
    assert "MATH 407" not in tree["credits_from"]


def test_expand_ranges_keeps_only_real_courses():
    program = {"years": [{"requirements": [{"tree": {"credits_from": ["MATH 300", "MATH 400-402"]}}]}]}
    expand_ranges([program], {"MATH 300", "MATH 400", "MATH 402", "MATH 500"})
    assert program["years"][0]["requirements"][0]["tree"] == {"credits_from": ["MATH 300", "MATH 400", "MATH 402"]}
    with pytest.raises(ValueError):
        expand_ranges([program | {"years": [{"requirements": [{"tree": {"credits_from": ["XYZ 100-199"]}}]}]}], set())
