import pytest

from build_prereqs import SUBJECTS, html_path
from llm import load_cache
from parse_courses import parse_course_list
from prereq_tree import expand_shorthand, normalize_codes, parse_with_rules, tree_problems
from requisites import extract_requisites


def subject_courses(subject):
    # Every course on a subject's saved calendar page, by code.
    html = html_path(subject).read_text(encoding="utf-8")
    return {c["code"]: c for c in parse_course_list(html)}


def test_strips_vancouver_suffix():
    assert normalize_codes("CPSC_V 221") == "CPSC 221"


def test_keeps_okanagan_suffix():
    assert normalize_codes("MATH_O 220") == "MATH_O 220"


def test_unwraps_brackets():
    assert normalize_codes("[CPSC320]") == "CPSC 320"


def test_adds_a_missing_space():
    # MICB 407's prerequisite and BIOL 351's equivalency
    assert normalize_codes("MICB306") == "MICB 306"
    assert normalize_codes("APBI351, FRST311") == "APBI 351, FRST 311"


def test_fills_in_bare_numbers():
    # ENVR 240 and MICB 322
    assert expand_shorthand("One of STAT 200, 201, BIOL 300") == (
        "One of STAT 200, STAT 201, BIOL 300"
    )
    assert expand_shorthand("MICB 211 (or 201)") == "MICB 211 (or MICB 201)"


def test_fills_in_a_long_list():
    # From MATH 190's description
    assert expand_shorthand("MATH 100, 102, 104, 120, 180, or 184") == (
        "MATH 100, MATH 102, MATH 104, MATH 120, MATH 180, or MATH 184"
    )


def test_leaves_levels_and_high_school_courses_alone():
    for text in ["MATH 100, 200-level", "PHYS 12, 100", "Biology 12 or BIOL 100-level"]:
        assert expand_shorthand(text) == text


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


def test_text_next_to_courses():
    # CPSC 491
    text = "All of CPSC 221, CPSC 310, CPSC 344 and Third-year standing"
    assert parse_with_rules(text) == {"all_of": [
        "CPSC 221", "CPSC 310", "CPSC 344", {"other": "Third-year standing"},
    ]}


def test_high_school_course_is_text():
    # PHYS 101. "PHYS 12" is Physics 12 in high school, not a UBC course.
    assert parse_with_rules("One of PHYS 12, PHYS 100") == {
        "one_of": [{"other": "PHYS 12"}, "PHYS 100"]
    }


def test_text_choice_in_a_list():
    # BIOL 501
    assert parse_with_rules("BIOL 300 or equivalent and graduate student standing") == {
        "all_of": [
            {"one_of": ["BIOL 300", {"other": "equivalent"}]},
            {"other": "graduate student standing"},
        ]
    }


def test_last_sentence_without_a_course():
    # ATSC 405
    text = "MATH 215. Familiarity with a programming language is required"
    assert parse_with_rules(text) == {"all_of": [
        "MATH 215", {"other": "Familiarity with a programming language is required"},
    ]}


def test_last_sentence_starting_with_and():
    # MICB 498
    text = "Either (a) MICB 399 or (b) BIOT 380. And completion of two co-op work terms"
    assert parse_with_rules(text) == {"all_of": [
        {"one_of": ["MICB 399", "BIOT 380"]},
        {"other": "completion of two co-op work terms"},
    ]}


def test_last_sentence_starting_with_or():
    # BIOL 203
    text = "One of BIOL 121, SCIE 001. Or 8 transfer credits of first-year biology"
    assert parse_with_rules(text) == {"one_of": [
        {"one_of": ["BIOL 121", "SCIE 001"]},
        {"other": "8 transfer credits of first-year biology"},
    ]}


def test_full_stop_inside_a_degree_name():
    # ENVR 449: the full stops in "B.Sc." don't end a sentence.
    text = "ENVR 300 and fourth-year standing in the B.Sc. Environmental Sciences honours program"
    assert parse_with_rules(text) == {"all_of": [
        "ENVR 300",
        {"other": "fourth-year standing in the B.Sc. Environmental Sciences honours program"},
    ]}


def test_lettered_option_after_a_full_stop():
    # BIOL 260
    text = ("Either (a) all of BIOL 112, BIOL 121 or (b) SCIE 001. or (c) 8 transfer credits "
            "of 1st year BIOL and 6 credits of 1st year chemistry")
    assert parse_with_rules(text) == {"one_of": [
        {"all_of": ["BIOL 112", "BIOL 121"]},
        "SCIE 001",
        {"other": "8 transfer credits of 1st year BIOL and 6 credits of 1st year chemistry"},
    ]}


def test_capitalized_and():
    # BIOL 431
    assert parse_with_rules("BIOL 200 And fourth-year standing") == {"all_of": [
        "BIOL 200", {"other": "fourth-year standing"},
    ]}


def test_all_of_inside_all_of_is_flattened():
    # STAT 460
    text = "All of MATH 320, STAT 305 and one of MATH 152, MATH 221, MATH 223"
    assert parse_with_rules(text) == {"all_of": [
        "MATH 320", "STAT 305", {"one_of": ["MATH 152", "MATH 221", "MATH 223"]},
    ]}


def test_gives_up_on_a_bare_number():
    # MICB 322 and ENVR 240 as the calendar writes them: "201" is short for a course code.
    # build_prereqs fills these in with expand_shorthand before the rules see them.
    assert parse_with_rules("MICB 211 (or 201)") is None
    assert parse_with_rules("One of STAT 200, 201, BIOL 300") is None


def test_gives_up_on_a_list_of_what_codes_mean():
    # Shortened from PHYS 107. The last sentence explains a code; it isn't a requirement.
    text = "Either (a) PHYS 12 or (b) a score of 85% or higher in PHYS 100. PHYS 12 = Physics 12"
    assert parse_with_rules(text) is None


def test_which_courses_the_rules_cant_parse(courses):
    # These 5 are left for Gemini. If this list changes, check why.
    unparsed = set()
    for c in courses.values():
        prereq = extract_requisites(c["description"])["prereq"]
        if prereq is not None and parse_with_rules(normalize_codes(prereq)) is None:
            unparsed.add(c["code"])
    assert unparsed == {
        "CPSC 320", "CPSC 415", "CPSC 423", "CPSC 440", "CPSC 445",
    }


# Gemini answered these before the rules could read them. Its hand-checked answers are
# still in the cache, so the rules must come out exactly the same.
@pytest.mark.parametrize("subject, codes", [
    ("CPSC", ["CPSC 221", "CPSC 330", "CPSC 340", "CPSC 410", "CPSC 491"]),
    ("MATH", ["MATH 121", "MATH 312", "MATH 440", "MATH 442", "MATH 443", "MATH 444"]),
    ("STAT", ["STAT 405"]),
])
def test_rules_give_the_trees_gemini_gave(subject, codes):
    cache = load_cache()
    courses = subject_courses(subject)
    for code in codes:
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


@pytest.mark.parametrize("subject", SUBJECTS)
def test_every_rule_tree_passes_the_checker(subject):
    for c in subject_courses(subject).values():
        reqs = extract_requisites(c["description"])
        for key in ("prereq", "coreq"):
            if reqs[key] is None:
                continue
            text = expand_shorthand(normalize_codes(reqs[key]))
            tree = parse_with_rules(text)
            if tree is not None:
                assert tree_problems(tree, text) == [], (c["code"], key)


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


def test_one_of_a_single_course_goes_to_gemini():
    # CHBE 220: "one of" covers "CHEM 121 and CHEM 123" together, which the rules can't see.
    assert parse_with_rules("One of CHEM 121 and CHEM 123 or CHEM 154, and MATH 101") is None


def test_or_inside_an_all_of_list_goes_to_gemini():
    # CHBE 370: the "or" makes it a choice between the two courses and the standing.
    text = "All of CHBE 241, CHBE 244, or third-year or higher standing in ENVE"
    assert parse_with_rules(text) is None


def test_leftover_lead_word_goes_to_gemini():
    # ELEC 371: the "(a)" option runs into the "either" of the next list.
    text = ("(a) MATH 255 or MATH 256, and either (b) all of ELEC 202, ELEC 292 or "
            "(c) all of BMEG 220, BMEG 257")
    assert parse_with_rules(text) is None


def test_or_and_and_inside_text_stay_in_the_text():
    # CIVL 305, CHBE 482, CHBE 373 and MECH 459.
    assert parse_with_rules("CIVL 204 or third-year standing or higher in IGEN") == {
        "one_of": ["CIVL 204", {"other": "third-year standing or higher in IGEN"}],
    }
    assert parse_with_rules("CHBE 376 or fourth-year standing in B.A.Sc. or B.Sc") == {
        "one_of": ["CHBE 376", {"other": "fourth-year standing in B.A.Sc. or B.Sc"}],
    }
    text = "One of CHBE 251, MTRL 263, or third-year or higher standing in ENVE"
    assert parse_with_rules(text) == {
        "one_of": ["CHBE 251", "MTRL 263", {"other": "third-year or higher standing in ENVE"}],
    }
    text = ("All of MECH 325, MECH 360 and fourth-year standing in the Biomechanics and "
            "Medical Devices Option")
    assert parse_with_rules(text) == {"all_of": [
        "MECH 325", "MECH 360",
        {"other": "fourth-year standing in the Biomechanics and Medical Devices Option"},
    ]}


def test_high_school_courses_stay_apart():
    # BIOL 121
    assert parse_with_rules("One of BIOL 11, BIOL 12, BIOL 111") == {
        "one_of": [{"other": "BIOL 11"}, {"other": "BIOL 12"}, "BIOL 111"],
    }


def test_comma_or_before_the_last_option():
    # MECH 488
    assert parse_with_rules("One of MECH 225, MECH 280, or CIVL 215") == {
        "one_of": ["MECH 225", "MECH 280", "CIVL 215"],
    }


def test_okanagan_courses_in_an_option():
    # MECH 260
    text = ("Either (a) all of MATH 101, PHYS 170 or (b) all of APSC_O 172, APSC_O 173, "
            "APSC_O 180")
    assert parse_with_rules(text) == {"one_of": [
        {"all_of": ["MATH 101", "PHYS 170"]},
        {"all_of": ["APSC_O 172", "APSC_O 173", "APSC_O 180"]},
    ]}
