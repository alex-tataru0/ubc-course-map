from prereq_tree import normalize_codes
from requisites import extract_requisites


def test_strips_vancouver_suffix():
    assert normalize_codes("CPSC_V 221") == "CPSC 221"


def test_keeps_okanagan_suffix():
    assert normalize_codes("MATH_O 220") == "MATH_O 220"


def test_unwraps_brackets():
    assert normalize_codes("[CPSC320]") == "CPSC 320"


def test_leaves_non_courses_alone():
    text = "Principles of Mathematics 12 or Pre-calculus 12"
    assert normalize_codes(text) == text


def test_full_prereq_sentence(courses):
    prereq = extract_requisites(courses["CPSC 221"]["description"])["prereq"]
    assert normalize_codes(prereq) == (
        "One of CPSC 210, CPEN 221 and either (a) one of CPSC 121, "
        "MATH 220, MATH_O 220 or (b) a score of 68% or higher in MATH 226"
    )


def test_no_vancouver_suffix_or_brackets_left(courses):
    for c in courses.values():
        for text in extract_requisites(c["description"]).values():
            if text is None:
                continue
            cleaned = normalize_codes(text)
            assert "_V" not in cleaned, c["code"]
            assert "[" not in cleaned, c["code"]
