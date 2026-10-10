import pytest
from requisites import extract_requisites


def reqs(courses, code):
    return extract_requisites(courses[code]["description"])


def test_simple_prereq(courses):
    assert reqs(courses, "CPSC 210") == {
        "prereq": "One of CPSC 107, CPSC 110",
        "coreq": None,
        "equivalency": None,
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
    }


def test_counts_across_all_courses(courses):
    # If a re-downloaded calendar changes these, we want to know.
    all_reqs = [extract_requisites(c["description"]) for c in courses.values()]
    assert sum(r["prereq"] is not None for r in all_reqs) == 50
    assert sum(r["coreq"] is not None for r in all_reqs) == 1
    assert sum(r["equivalency"] is not None for r in all_reqs) == 1


def test_two_prereq_sections_raises():
    with pytest.raises(ValueError):
        extract_requisites("Prerequisite: CPSC 110. Prerequisite: CPSC 210.")
