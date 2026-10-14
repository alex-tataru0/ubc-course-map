import pytest
from requisites import extract_requisites


def reqs(courses, code):
    return extract_requisites(courses[code]["description"])


def test_simple_prereq(courses):
    assert reqs(courses, "CPSC 210") == {
        "prereq": "One of CPSC 107, CPSC 110",
        "coreq": None,
        "equivalency": None,
        "recommended": None,
    }


def test_prereq_and_coreq(courses):
    r = reqs(courses, "CPSC 121")
    assert r["prereq"] == "Principles of Mathematics 12 or Pre-calculus 12"
    assert r["coreq"] == "One of CPSC 107, CPSC 110"


def test_equivalency(courses):
    r = reqs(courses, "CPSC 322")
    assert r["prereq"] == "Either CPSC_V 221 or DSCI_V 221"
    assert r["equivalency"] == "AI_V 322"


def test_plural_label(courses):
    assert reqs(courses, "CPSC 337")["prereq"] == "CPSC_V 213"


def test_drops_credit_d_fail_note(courses):
    assert reqs(courses, "CPSC 299")["prereq"] == "CPSC_V 298"


def test_keeps_period_inside_prereq(courses):
    # The calendar has a stray "." mid-sentence here, so we can't split on periods.
    assert reqs(courses, "CPSC 445")["prereq"] == (
        "CPSC 320. and either BMEG 250 or six credits of BIOL beyond BIOL 111"
    )


def test_no_requisites(courses):
    assert reqs(courses, "CPSC 110") == {
        "prereq": None,
        "coreq": None,
        "equivalency": None,
        "recommended": None,
    }


def test_counts_across_all_courses(courses):
    # If a re-downloaded calendar changes these, we want to know.
    all_reqs = [extract_requisites(c["description"]) for c in courses.values()]
    assert sum(r["prereq"] is not None for r in all_reqs) == 50
    assert sum(r["coreq"] is not None for r in all_reqs) == 1
    assert sum(r["equivalency"] is not None for r in all_reqs) == 1
    assert sum(r["recommended"] is not None for r in all_reqs) == 0


def test_keeps_a_recommendation_apart():
    # MATH 317: the second sentence is advice, not something you need.
    r = extract_requisites(
        "Prerequisite: One of MATH_V 200, MATH_V 226, MATH_V 253. "
        "One of MATH_V 152, MATH_V 221, MATH_V 223 is recommended."
    )
    assert r["prereq"] == "One of MATH_V 200, MATH_V 226, MATH_V 253"
    assert r["recommended"] == "One of MATH_V 152, MATH_V 221, MATH_V 223 is recommended"


def test_department_recommendation():
    # Shortened from STAT 305
    r = extract_requisites(
        "Prerequisite: Either (a) STAT_V 200 or (b) STAT_V 251. "
        "The Department recommends that students meet the prerequisite through option (a)."
    )
    assert r["prereq"] == "Either (a) STAT_V 200 or (b) STAT_V 251"
    assert r["recommended"] == (
        "The Department recommends that students meet the prerequisite through option (a)"
    )


def test_two_prereq_sections_raises():
    with pytest.raises(ValueError):
        extract_requisites("Prerequisite: CPSC 110. Prerequisite: CPSC 210.")
