from prereq_tree import normalize_codes, parse_with_rules, tree_problems
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


def test_single_course():
    assert parse_with_rules("CPSC 103") == "CPSC 103"


def test_one_of():
    assert parse_with_rules("One of CPSC 107, CPSC 110") == {
        "one_of": ["CPSC 107", "CPSC 110"]
    }


def test_one_of_written_with_or():
    assert parse_with_rules("One of CPSC 320 or MATH 220 or MATH 226") == {
        "one_of": ["CPSC 320", "MATH 220", "MATH 226"]
    }


def test_all_of():
    assert parse_with_rules("All of CPSC 121, CPSC 210") == {
        "all_of": ["CPSC 121", "CPSC 210"]
    }


def test_either_or():
    assert parse_with_rules("Either CPSC 221 or DSCI 221") == {
        "one_of": ["CPSC 221", "DSCI 221"]
    }


def test_plain_or():
    assert parse_with_rules("CPSC 221 or DSCI 221") == {
        "one_of": ["CPSC 221", "DSCI 221"]
    }


def test_chain_joined_by_and():
    # CPSC 313
    assert parse_with_rules("CPSC 213 and either CPSC 221 or DSCI 221") == {
        "all_of": ["CPSC 213", {"one_of": ["CPSC 221", "DSCI 221"]}]
    }


def test_gives_up_on_non_course_text():
    assert parse_with_rules("Principles of Mathematics 12 or Pre-calculus 12") is None
    assert parse_with_rules("All of CPSC 221, CPSC 310, CPSC 344 and Third-year standing") is None


def test_gives_up_on_lettered_groups(courses):
    prereq = extract_requisites(courses["CPSC 221"]["description"])["prereq"]
    assert parse_with_rules(normalize_codes(prereq)) is None


def test_which_courses_the_rules_cant_parse(courses):
    # These 13 are left for the LLM step. If this list changes, check why.
    unparsed = set()
    for c in courses.values():
        prereq = extract_requisites(c["description"])["prereq"]
        if prereq is not None and parse_with_rules(normalize_codes(prereq)) is None:
            unparsed.add(c["code"])
    assert unparsed == {
        "CPSC 121", "CPSC 221", "CPSC 320", "CPSC 330", "CPSC 340",
        "CPSC 410", "CPSC 415", "CPSC 423", "CPSC 430", "CPSC 436",
        "CPSC 440", "CPSC 445", "CPSC 491",
    }


CPSC_221_TEXT = (
    "One of CPSC 210, CPEN 221 and either (a) one of CPSC 121, MATH 220, "
    "MATH_O 220 or (b) a score of 68% or higher in MATH 226"
)


def test_every_rule_tree_passes_the_checker(courses):
    for c in courses.values():
        prereq = extract_requisites(c["description"])["prereq"]
        if prereq is None:
            continue
        text = normalize_codes(prereq)
        tree = parse_with_rules(text)
        if tree is not None:
            assert tree_problems(tree, text) == [], c["code"]


def test_correct_hand_written_tree_passes():
    tree = {"all_of": [
        {"one_of": ["CPSC 210", "CPEN 221"]},
        {"one_of": [
            {"one_of": ["CPSC 121", "MATH 220", "MATH_O 220"]},
            {"course": "MATH 226", "min_grade": 68},
        ]},
    ]}
    assert tree_problems(tree, CPSC_221_TEXT) == []


def test_flags_dropped_courses():
    tree = {"all_of": [
        {"one_of": ["CPSC 210", "CPEN 221"]},
        {"one_of": ["CPSC 121", "MATH 220"]},
    ]}
    assert len(tree_problems(tree, CPSC_221_TEXT)) == 1


def test_flags_made_up_course():
    tree = {"one_of": ["CPSC 210", "CPSC 999"]}
    assert len(tree_problems(tree, "One of CPSC 210, CPSC 110")) == 1


def test_flags_unknown_node():
    problems = tree_problems({"any_of": ["CPSC 210"]}, "CPSC 210")
    assert "unknown node: {'any_of': ['CPSC 210']}" in problems


def test_flags_bad_grade():
    tree = {"course": "MATH 226", "min_grade": "68%"}
    assert tree_problems(tree, "MATH 226") == ["bad grade: '68%'"]


def test_flags_empty_list():
    assert tree_problems({"one_of": []}, "") == ["needs a non-empty list: {'one_of': []}"]


def test_counts_courses_inside_other_text():
    # CPSC 445
    text = "CPSC 320. and either BMEG 250 or six credits of BIOL beyond BIOL 111"
    tree = {"all_of": [
        "CPSC 320",
        {"one_of": ["BMEG 250", {"other": "six credits of BIOL beyond BIOL 111"}]},
    ]}
    assert tree_problems(tree, text) == []
