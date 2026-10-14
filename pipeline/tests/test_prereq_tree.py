from llm import load_cache
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


def test_text_without_courses_is_kept_whole():
    # CPSC 121. Only the student can check this, so it stays as one "other" requirement.
    assert parse_with_rules("Principles of Mathematics 12 or Pre-calculus 12") == {
        "other": "Principles of Mathematics 12 or Pre-calculus 12"
    }


def test_drops_the_full_stop():
    assert parse_with_rules("Permission of the Department Head.") == {
        "other": "Permission of the Department Head"
    }


def test_gives_up_on_courses_mixed_with_text():
    # CPSC 491
    assert parse_with_rules("All of CPSC 221, CPSC 310, CPSC 344 and Third-year standing") is None


def test_which_courses_the_rules_cant_parse(courses):
    # These 6 are left for Gemini. If this list changes, check why.
    unparsed = set()
    for c in courses.values():
        prereq = extract_requisites(c["description"])["prereq"]
        if prereq is not None and parse_with_rules(normalize_codes(prereq)) is None:
            unparsed.add(c["code"])
    assert unparsed == {
        "CPSC 320", "CPSC 415", "CPSC 423", "CPSC 440", "CPSC 445", "CPSC 491",
    }


def test_rules_give_the_trees_gemini_gave(courses):
    # Gemini answered these before the rules could read them. Its hand-checked answers are
    # still in the cache, so the rules must come out exactly the same.
    cache = load_cache()
    for code in ["CPSC 221", "CPSC 330", "CPSC 340", "CPSC 410"]:
        text = normalize_codes(extract_requisites(courses[code]["description"])["prereq"])
        assert parse_with_rules(text) == cache[text]["tree"], code


def test_score_in_one_of():
    # MATH 345
    text = "A score of 68% or higher in one of MATH 215, MATH 255, MATH 256"
    assert parse_with_rules(text) == {"one_of": [
        {"course": "MATH 215", "min_grade": 68},
        {"course": "MATH 255", "min_grade": 68},
        {"course": "MATH 256", "min_grade": 68},
    ]}


def test_score_after_a_course():
    # MATH 404
    assert parse_with_rules("MATH 300 and a score of 68% or higher in MATH 321") == {
        "all_of": ["MATH 300", {"course": "MATH 321", "min_grade": 68}]
    }


def test_lettered_options():
    # MATH 319
    text = (
        "Either (a) a score of 68% or higher in MATH 220 or (b) a score of 55% or higher "
        "in one of MATH 223, MATH 226"
    )
    assert parse_with_rules(text) == {"one_of": [
        {"course": "MATH 220", "min_grade": 68},
        {"one_of": [
            {"course": "MATH 223", "min_grade": 55},
            {"course": "MATH 226", "min_grade": 55},
        ]},
    ]}


def test_option_with_and_inside():
    # MATH 308
    text = (
        "Either (a) one of MATH 152, MATH 221 and one of MATH 220, MATH 226, CPSC 121; "
        "or (b) MATH 223"
    )
    assert parse_with_rules(text) == {"one_of": [
        {"all_of": [
            {"one_of": ["MATH 152", "MATH 221"]},
            {"one_of": ["MATH 220", "MATH 226", "CPSC 121"]},
        ]},
        "MATH 223",
    ]}


def test_all_of_lettered_options():
    # STAT 303
    text = (
        "All of (a) one of MATH 101, MATH 103, (b) one of CPSC 103, CPSC 110, "
        "and (c) one of DSCI 100, STAT 200"
    )
    assert parse_with_rules(text) == {"all_of": [
        {"one_of": ["MATH 101", "MATH 103"]},
        {"one_of": ["CPSC 103", "CPSC 110"]},
        {"one_of": ["DSCI 100", "STAT 200"]},
    ]}


def test_letters_without_brackets_or_lead_in():
    # STAT 406: no "Either", so the "or" between the options decides.
    text = "a) One of STAT 306, CPSC 340, or b) STAT 301 and one of MATH 302, STAT 302"
    assert parse_with_rules(text) == {"one_of": [
        {"one_of": ["STAT 306", "CPSC 340"]},
        {"all_of": ["STAT 301", {"one_of": ["MATH 302", "STAT 302"]}]},
    ]}


def test_two_lettered_lists():
    # Shortened from MATH 424
    text = "Either (a) MATH 223 or (b) MATH 221; and either (a) MATH 227 or (b) MATH 317"
    assert parse_with_rules(text) == {"all_of": [
        {"one_of": ["MATH 223", "MATH 221"]},
        {"one_of": ["MATH 227", "MATH 317"]},
    ]}


def test_grade_note():
    # MATH 227 and MATH 426
    assert parse_with_rules("MATH 226. Prerequisite grade requirement: 68% in MATH226") == {
        "course": "MATH 226", "min_grade": 68
    }
    text = "All of MATH 321, MATH 322. Prerequisite grade requirement: 68% in MATH322,MATH321"
    assert parse_with_rules(text) == {"all_of": [
        {"course": "MATH 321", "min_grade": 68},
        {"course": "MATH 322", "min_grade": 68},
    ]}


def test_both():
    # STAT 416
    assert parse_with_rules("Both STAT 305 and STAT 306") == {"all_of": ["STAT 305", "STAT 306"]}


def test_gives_up_when_letters_skip():
    assert parse_with_rules("Either (a) MATH 100 or (c) MATH 102") is None


def test_gives_up_when_the_joining_words_disagree():
    # "Either" says one of them, "and" says both.
    assert parse_with_rules("Either (a) MATH 100 and (b) MATH 102") is None


def test_gives_up_on_an_unknown_lead_in():
    # CPSC 440
    text = "Either CPSC 340 or both (a) AI 240 and (b) one of STAT 251, MATH 302"
    assert parse_with_rules(text) is None


def test_gives_up_when_the_grade_note_names_another_course():
    assert parse_with_rules("MATH 226. Prerequisite grade requirement: 68% in MATH227") is None


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
