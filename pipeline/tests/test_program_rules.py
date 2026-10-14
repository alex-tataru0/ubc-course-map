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
])
def test_rules(text, tree):
    assert parse_requirement_with_rules(text) == tree
    assert requirement_problems(tree, text) == []


@pytest.mark.parametrize("text", [
    "6 credits of MATH beyond MATH 200",
    "CPSC 210 and either STAT 200 or STAT 251",
    "100 or 102",
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
