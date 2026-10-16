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


def test_whole_section_can_be_advice():
    # PHYS 502: nothing is required, so there's no prerequisite.
    r = extract_requisites(
        "Prerequisite: A background in undergraduate solid state physics such as covered "
        "in PHYS_V 474 is highly recommended."
    )
    assert r["prereq"] is None
    assert r["recommended"] == (
        "A background in undergraduate solid state physics such as covered in PHYS_V 474 "
        "is highly recommended"
    )


def test_sentence_that_says_required_is_not_advice():
    # PHYS 100: "strongly recommended" is only for some students, the rest is required.
    text = (
        "Not open to students with credit for PHYS 12. Principles of Mathematics 12 or "
        "Pre-calculus 12 is required; Physics 11 is required for first-year students, "
        "strongly recommended for others"
    )
    r = extract_requisites(f"Prerequisite: {text}.")
    assert r["prereq"] == text
    assert r["recommended"] is None


def test_hyphenated_label():
    # BIOL 307
    r = extract_requisites(
        "[2-3-0] Pre-requisites: A minimum of 3rd-year class standing or higher."
    )
    assert r["prereq"] == "A minimum of 3rd-year class standing or higher"


def test_recommended_prerequisite_is_not_a_requirement():
    # PHYS 500: "Recommended pre-requisite:" is advice, so it isn't read as a prerequisite.
    r = extract_requisites("Scattering theory. Recommended pre-requisite: PHYS_V 402.")
    assert r["prereq"] is None
    assert r["recommended"] == "PHYS_V 402"


def test_recommended_prerequisite_before_the_prerequisite():
    # MECH 4xx: the advice has its own label and comes first, with the hours after it.
    r = extract_requisites(
        "Recommended pre-requisites: All of MECH_V 327, MECH_V 375. [3-0-1]. "
        "Prerequisite: MECH_V 225."
    )
    assert r["recommended"] == "All of MECH_V 327, MECH_V 375"
    assert r["prereq"] == "MECH_V 225"


def test_recommended_prerequisite_with_a_capital_p():
    # ELEC 4xx: "Recommended Prerequisite:" isn't a prerequisite either.
    r = extract_requisites("Recommended Prerequisite: ELEC_V 315. [2-3-0].")
    assert r["prereq"] is None
    assert r["recommended"] == "ELEC_V 315"


def test_hours_after_the_prereq_are_left_out():
    # MECH 224 and MECH 490 put their hours after the prereq.
    assert extract_requisites("Prerequisite: MECH_V 224 or MECH_V 260. [2-2-0]")["prereq"] == (
        "MECH_V 224 or MECH_V 260"
    )
    r = extract_requisites("Prerequisite: All of MECH_V 325, MECH_V 328. [1-0- 1]; [1-0-1]")
    assert r["prereq"] == "All of MECH_V 325, MECH_V 328"
    assert extract_requisites("Equivalency: MATH_V 103. [3-0-0].")["equivalency"] == "MATH_V 103"


def test_stray_question_mark_before_the_prereq():
    # A CHBE course: "Prerequisite:?Either a) …".
    r = extract_requisites("Prerequisite:?Either a) CHEM_V 154 or b) CHEM_V 121.")
    assert r["prereq"] == "Either a) CHEM_V 154 or b) CHEM_V 121"


def test_two_prereq_sections_raises():
    with pytest.raises(ValueError):
        extract_requisites("Prerequisite: CPSC 110. Prerequisite: CPSC 210.")


def test_credit_note_is_left_out_of_the_requirement():
    # MECH 468 and CPEN 355: these say which courses rule each other out. The website reads
    # them from the description.
    r = extract_requisites(
        "Prerequisite: MECH_V 466, ELEC_V 341, or CHBE_V 356. Credit will be granted for only "
        "one of MECH_V 468 or MECH_V 509. [3-0-0]"
    )
    assert r["prereq"] == "MECH_V 466, ELEC_V 341, or CHBE_V 356"
    r = extract_requisites(
        "Prerequisite: One of MATH_V 152, MATH_V 221. Credit cannot be obtained for both "
        "CPEN_V 355 and CPSC_V 340."
    )
    assert r["prereq"] == "One of MATH_V 152, MATH_V 221"
