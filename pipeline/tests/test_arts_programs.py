import re

import pytest

from arts_programs import PROGRAMS, page_text, parse_arts
from build_programs import expand_ranges, known_courses, load_arts_pages
from build_prereqs import FACULTIES

COURSE = re.compile(r"[A-Z]{2,4} \d{3}")

# The tests below use the calendar pages saved in data/raw/programs.


@pytest.fixture(scope="module")
def programs():
    return expand_ranges(parse_arts(load_arts_pages()), known_courses())


def test_one_major_per_arts_subject_with_programs(programs):
    subjects = {p["id"].split("-")[0].upper() for p in programs}
    # WRDS only has a Minor.
    assert subjects == set(FACULTIES["arts"]) - {"WRDS"}
    assert all(p["id"].endswith("-major") for p in programs)


@pytest.mark.parametrize("id, major_credits", [
    ("anth-major", 42), ("econ-major", 42), ("engl-literature-major", 42), ("geog-human-major", 45),
    ("hist-major", 42), ("ling-major", 48), ("phil-major", 42), ("poli-major", 42),
    ("psyc-major", 42), ("soci-major", 42),
])
def test_credits_add_up(programs, id, major_credits):
    # Each year's rows add up to the year, and the electives fill the B.A.'s 120 credits.
    program = next(p for p in programs if p["id"] == id)
    for year in program["years"]:
        assert sum(r["credits"] for r in year["requirements"]) == year["credits"]
    assert sum(y["credits"] for y in program["years"]) == program["total_credits"] == 120
    assert sum(y["credits"] for y in program["years"][:-1]) == major_credits


def test_quoted_rows_are_still_on_the_calendar_page():
    pages = load_arts_pages()
    for program in PROGRAMS:
        text = page_text(pages[program["page"]])
        for year in program["years"]:
            for row in year["requirements"]:
                if row["quoted"]:
                    assert re.sub(r"\s+", " ", row["text"]) in text, (program["id"], row["text"])


def test_a_changed_calendar_stops_the_build():
    pages = load_arts_pages()
    pages["sociology"] = pages["sociology"].replace("SOCI_V 217 Research Methods", "SOCI_V 218 Research")
    with pytest.raises(ValueError, match="soci-major"):
        parse_arts(pages)


def test_trees_use_known_node_kinds_and_full_codes(programs):
    def check(node):
        if isinstance(node, str):
            assert COURSE.fullmatch(node), node
        elif "one_of" in node or "all_of" in node:
            children = node.get("one_of", node.get("all_of"))
            assert len(children) >= 2
            for child in children:
                check(child)
        elif "credits_from" in node:
            assert node["credits_from"] and all(COURSE.fullmatch(c) for c in node["credits_from"])
        elif "credits_of" in node:
            spec = node["credits_of"]
            assert spec["subjects"] and spec.get("max_level", 999) >= spec["min_level"]
        else:
            assert node in ({"electives": True},) or set(node) == {"other"}, node

    for program in programs:
        for year in program["years"]:
            for row in year["requirements"]:
                check(row["tree"])
                assert row["source"] == "hand" and row["problems"] == []


def test_ranges_become_the_courses_that_exist(programs):
    english = next(p for p in programs if p["id"] == "engl-literature-major")
    group_a = english["years"][1]["requirements"][0]
    assert group_a["text"].startswith("3 credits from Group A")
    assert group_a["tree"]["credits_from"][0] == "ENGL 343"
    assert all(343 <= int(c.split()[1]) <= 350 for c in group_a["tree"]["credits_from"])
