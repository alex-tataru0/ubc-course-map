import json

import pytest

from program_rules import (
    EXAMPLES, INSTRUCTIONS, course_codes, parse_requirement, parse_requirement_with_rules,
    requirement_problems,
)


def test_course_codes_fill_in_the_subject():
    assert course_codes("MATH 100 or 102 or 104 (or 180)") == [
        "MATH 100", "MATH 102", "MATH 104", "MATH 180",
    ]
    assert course_codes("One of CPSC 415, 416, CPEN 421, 432") == [
        "CPSC 415", "CPSC 416", "CPEN 421", "CPEN 432",
    ]


def test_course_codes_stop_at_other_words():
    # "400" here is a level, not a course.
    text = "Three of CPSC 304, AI 422 at least 6 credits of which must be 400 or above"
    assert course_codes(text) == ["CPSC 304", "AI 422"]
    assert course_codes("CPSC or AI courses numbered 300 or higher") == []


@pytest.mark.parametrize("text, tree", [
    ("CPSC 121", "CPSC 121"),
    ("CPSC 310, 313, 320", {"all_of": ["CPSC 310", "CPSC 313", "CPSC 320"]}),
    ("MATH 111 or 221", {"one_of": ["MATH 111", "MATH 221"]}),
    ("AI 240 or CPSC 340", {"one_of": ["AI 240", "CPSC 340"]}),
    (
        "MATH 101 or 103 or 105 (or 121)",
        {"one_of": ["MATH 101", "MATH 103", "MATH 105", "MATH 121"]},
    ),
    (
        "CPSC 110 (or 103 and 107)",
        {"one_of": ["CPSC 110", {"all_of": ["CPSC 103", "CPSC 107"]}]},
    ),
    ("One of CPSC 304, 317, 344", {"one_of": ["CPSC 304", "CPSC 317", "CPSC 344"]}),
    # Electrical Engineering's third year, with a colon.
    ("One of: MATH 318, MATH 302, STAT 302", {"one_of": ["MATH 318", "MATH 302", "STAT 302"]}),
    # Mining Engineering, with "or" before the last one.
    (
        "One of MINE 350, MINE 406, MINE 444 or MINE 465",
        {"one_of": ["MINE 350", "MINE 406", "MINE 444", "MINE 465"]},
    ),
    ("MECH 280, CIVL 215, or CHBE 251", {"one_of": ["MECH 280", "CIVL 215", "CHBE 251"]}),
    # "One more of" is a one_of too: the website never counts one course for two rows.
    ("One more of CPSC 304, CPEN 421, 432", {"one_of": ["CPSC 304", "CPEN 421", "CPEN 432"]}),
    (
        "Three of CPSC 304, 330, 344, AI 422 at least 6 credits of which must be 400 or above",
        {"pick": 3, "of": ["CPSC 304", "CPSC 330", "CPSC 344", "AI 422"],
         "note": "at least 6 credits of which must be 400 or above"},
    ),
    (
        "CPSC or AI courses numbered 300 or higher",
        {"credits_of": {"subjects": ["CPSC", "AI"], "min_level": 300}},
    ),
    ("Electives", {"electives": True}),
    ("Additional Communication Requirement", {"other": "Additional Communication Requirement"}),
    # Science pages (Phase 11).
    ("Elective", {"electives": True}),
    (
        "MATH 221 (or 223), 215",
        {"all_of": [{"one_of": ["MATH 221", "MATH 223"]}, "MATH 215"]},
    ),
    (
        "MICB 205, 211 (or 201), 212 (or 202)",
        {"all_of": ["MICB 205", {"one_of": ["MICB 211", "MICB 201"]}, {"one_of": ["MICB 212", "MICB 202"]}]},
    ),
    ("CHEM 121 (or 111, 141)", {"one_of": ["CHEM 121", "CHEM 111", "CHEM 141"]}),
    ("MATH 111 (or one of 131, 221, 223)", {"one_of": ["MATH 111", "MATH 131", "MATH 221", "MATH 223"]}),
    (
        "MATH 111 (or 131 or 221 or 223) or STAT 200",
        {"one_of": ["MATH 111", "MATH 131", "MATH 221", "MATH 223", "STAT 200"]},
    ),
    ("EOSC 110, 112, 114 or 116", {"one_of": ["EOSC 110", "EOSC 112", "EOSC 114", "EOSC 116"]}),
    ("BIOL 204 and 205", {"all_of": ["BIOL 204", "BIOL 205"]}),
    (
        "In third year: STAT 301, 305, 306 and MATH 307",
        {"all_of": ["STAT 301", "STAT 305", "STAT 306", "MATH 307"]},
    ),
    ("At least one of MICB 325, BIOL 335", {"one_of": ["MICB 325", "BIOL 335"]}),
    ("Two of BIOL 331, 340 and 341", {"pick": 2, "of": ["BIOL 331", "BIOL 340", "BIOL 341"]}),
    ("3 of ATSC 404, 405, 413, EOSC 440", {"pick": 3, "of": ["ATSC 404", "ATSC 405", "ATSC 413", "EOSC 440"]}),
    (
        "Three courses from MATH 215, 303, 307, 340",
        {"pick": 3, "of": ["MATH 215", "MATH 303", "MATH 307", "MATH 340"]},
    ),
    # GEOB is GEOS's old code; cross-listed courses are a choice.
    ("ATSC 301, GEOS (or GEOB) 300", {"all_of": ["ATSC 301", "GEOS 300"]}),
    ("MATH/STAT 302", {"one_of": ["MATH 302", "STAT 302"]}),
    ("PHYS 100-level", {"credits_of": {"subjects": ["PHYS"], "min_level": 100, "max_level": 199}}),
    (
        "EOSC courses numbered 420-439",
        {"credits_of": {"subjects": ["EOSC"], "min_level": 420, "max_level": 439}},
    ),
    (
        "EOSC / ATSC / ENVR 300-level or higher",
        {"credits_of": {"subjects": ["EOSC", "ATSC", "ENVR"], "min_level": 300}},
    ),
    (
        "MATH, STAT, CPSC, or AI courses numbered 300 or higher",
        {"credits_of": {"subjects": ["MATH", "STAT", "CPSC", "AI"], "min_level": 300}},
    ),
    (
        "One 200-level BIOL OR CHEM",
        {"credits_of": {"subjects": ["BIOL", "CHEM"], "min_level": 200, "max_level": 299}},
    ),
    (
        "Any Upper level MATH, STAT, CPSC or DSCI",
        {"credits_of": {"subjects": ["MATH", "STAT", "CPSC", "DSCI"], "min_level": 300}},
    ),
    (
        "15 credits from MATH 400-406, 412",
        {"credits_from": ["MATH 400-406", "MATH 412"]},
    ),
    ("3 credits from PHYS 348, 409, and 420", {"credits_from": ["PHYS 348", "PHYS 409", "PHYS 420"]}),
    (
        "Thematic concentration courses numbered 300 or above",
        {"other": "Thematic concentration courses numbered 300 or above"},
    ),
])
def test_rules(text, tree):
    assert parse_requirement_with_rules(text) == tree
    assert requirement_problems(tree, text) == []


@pytest.mark.parametrize("text", [
    "6 credits of MATH beyond MATH 200",
    "CPSC 210 and either STAT 200 or STAT 251",
    "100 or 102",
    "Two of BIOL 415, 417, 434 or two of BIOL 417, 418, 434",
    "EOSC 212 (or EOSC 111 and one of EOSC 110, 112, 114, 116, 118)",
])
def test_rules_refuse_what_they_dont_know(text):
    assert parse_requirement_with_rules(text) is None


def test_problems_catch_dropped_and_made_up_courses():
    assert requirement_problems({"one_of": ["MATH 100", "MATH 999"]}, "MATH 100 or 102") != []
    assert requirement_problems({"pick": 5, "of": ["CPSC 304", "CPSC 330"]}, "Five of CPSC 304, 330") != []
    assert requirement_problems({"something": 1}, "Electives") != []


def test_examples_in_the_prompt_are_valid():
    for text, tree in EXAMPLES:
        assert requirement_problems(tree, text) == [], text
        assert json.dumps(tree) in INSTRUCTIONS


class FakeAsk:
    def __init__(self, tree):
        self.tree = tree
        self.calls = 0

    def __call__(self, text):
        self.calls += 1
        return self.tree, "fake-model"


def test_rules_never_ask_gemini():
    ask = FakeAsk("unused")
    result = parse_requirement("CPSC 121", {}, ask)
    assert result == {"tree": "CPSC 121", "source": "rules", "problems": []}
    assert ask.calls == 0


def test_gemini_answers_are_cached():
    text = "6 credits of MATH beyond MATH 200"
    tree = {"other": text}
    ask, cache = FakeAsk(tree), {}
    first = parse_requirement(text, cache, ask)
    second = parse_requirement(text, cache, ask)
    assert first == second == {"source": "llm", "tree": tree, "problems": [], "model": "fake-model"}
    assert ask.calls == 1
