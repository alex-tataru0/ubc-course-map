import json

import pytest
from google.genai import errors

from build_prereqs import (
    RETRY_WAITS, SECONDS_BETWEEN_CALLS, SUBJECTS, ask_slowly, build_courses, html_path,
    load_page, pick_subjects, print_summary, source_url, write_courses,
)
from llm import MODELS, load_cache
from parse_courses import parse_course_list
from prereq_tree import normalize_codes


def no_save(cache):
    pass


def fake_ask(text):
    return {"other": text}, "fake-model"


def requisites(records):
    return [r[key] for r in records for key in ("prereq", "coreq") if r[key]]


def saved_courses(subject):
    # Every course on the subject's saved calendar page.
    return parse_course_list(html_path(subject).read_text(encoding="utf-8"))


# For each subject: courses, prereqs + coreqs, how many the rules read, and how many
# different texts go to Gemini. If a re-downloaded calendar changes these, check why.
@pytest.mark.parametrize("subject, n_courses, n_requisites, n_rules, n_asked", [
    ("CPSC", 112, 51, 45, 6),
    ("MATH", 177, 110, 97, 13),
    ("STAT", 54, 30, 26, 4),
])
def test_only_the_hard_prereqs_go_to_gemini(subject, n_courses, n_requisites, n_rules, n_asked):
    asked = []

    def counting_ask(text):
        asked.append(text)
        return fake_ask(text)

    records = build_courses(saved_courses(subject), {}, counting_ask, no_save)
    assert len(records) == n_courses
    assert len(requisites(records)) == n_requisites
    assert sum(req["source"] == "rules" for req in requisites(records)) == n_rules
    assert len(asked) == n_asked


def test_course_record(courses):
    records = build_courses([courses["CPSC 213"]], {}, fake_ask, no_save)
    assert records == [{
        "code": "CPSC 213",
        "title": courses["CPSC 213"]["title"],
        "credits": "4",
        "description": normalize_codes(courses["CPSC 213"]["description"]),
        "prereq": {
            "text": "All of CPSC 121, CPSC 210",
            "tree": {"all_of": ["CPSC 121", "CPSC 210"]},
            "source": "rules",
            "problems": [],
        },
        "coreq": None,
        "equivalency": None,
        "recommended": None,
    }]


def test_equivalency_codes_are_normalized(courses):
    records = build_courses([courses["CPSC 322"]], {}, fake_ask, no_save)
    assert records[0]["equivalency"] == "AI 322"


def test_recommendation_is_kept_apart_with_normalized_codes():
    course = {
        "code": "MATH 317",
        "title": "Calculus IV",
        "credits": "3",
        "description": "Prerequisite: One of MATH_V 200, MATH_V 226. "
                       "One of MATH_V 152, MATH_V 221 is recommended.",
    }
    record = build_courses([course], {}, fake_ask, no_save)[0]
    assert record["prereq"]["tree"] == {"one_of": ["MATH 200", "MATH 226"]}
    assert record["prereq"]["source"] == "rules"
    assert record["recommended"] == "One of MATH 152, MATH 221 is recommended"


@pytest.mark.parametrize("subject", SUBJECTS)
def test_committed_cache_answers_every_hard_prereq(subject):
    # The saved Gemini answers are enough to build everything without an API key,
    # and none of them was flagged by the checker.
    def no_gemini(text):
        raise AssertionError(f"Not in the cache: {text}")

    records = build_courses(saved_courses(subject), load_cache(), no_gemini, no_save)
    assert all(req["problems"] == [] for req in requisites(records))


def test_recommendations_in_math_and_stat():
    recommended = {
        r["code"]: r["recommended"]
        for subject in ["MATH", "STAT"]
        for r in build_courses(saved_courses(subject), load_cache(), fake_ask, no_save)
        if r["recommended"]
    }
    assert recommended == {
        "MATH 100": "High school calculus is strongly recommended",
        "MATH 317": "One of MATH 152, MATH 221, MATH 223 is recommended",
        "STAT 305": "The Department recommends that students meet the prerequisite "
                    "through option (a) or (b)",
    }


def test_write_courses(tmp_path):
    path = tmp_path / "cpsc.json"
    write_courses("CPSC", [{"code": "CPSC 427", "description": "[1.5–1.5-1]"}], path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["subject"] == "CPSC"
    assert data["source"] == "https://vancouver.calendar.ubc.ca/course-descriptions/subject/cpscv"
    assert data["courses"][0]["code"] == "CPSC 427"
    assert "1.5–1.5-1" in path.read_text(encoding="utf-8")


def test_summary_lists_answers_that_need_review(capsys):
    # capsys is a pytest fixture that captures what the code prints.
    ok = {"text": "CPSC 110", "tree": "CPSC 110", "source": "rules", "problems": []}
    bad = {"text": "???", "tree": None, "source": "llm", "problems": ["unknown node: None"]}
    records = [
        {"code": "CPSC 110", "prereq": None, "coreq": None},
        {"code": "CPSC 210", "prereq": ok, "coreq": None},
        {"code": "CPSC 999", "prereq": bad, "coreq": None},
    ]
    print_summary("CPSC", records)
    out = capsys.readouterr().out
    assert "CPSC: 3 courses, 2 requisites: 1 by rules, 1 by Gemini" in out
    assert "NEEDS REVIEW  CPSC 999 prereq" in out
    assert "CPSC 210" not in out


def test_source_url():
    assert source_url("MATH") == (
        "https://vancouver.calendar.ubc.ca/course-descriptions/subject/mathv"
    )


def test_load_page_downloads_only_once(tmp_path):
    path = tmp_path / "math.html"
    urls = []

    def fake_fetch(url):
        urls.append(url)
        return "<html>page</html>"

    assert load_page("MATH", path, fake_fetch) == "<html>page</html>"
    assert load_page("MATH", path, fake_fetch) == "<html>page</html>"
    assert urls == [source_url("MATH")]


def test_pick_subjects():
    assert pick_subjects([]) == SUBJECTS
    assert pick_subjects(["math", "STAT"]) == ["MATH", "STAT"]
    with pytest.raises(SystemExit):
        pick_subjects(["MAHT"])


class FakeGemini:
    # Raises the given errors in order, then returns "CPSC 110".
    # Records which model each call asked for.
    def __init__(self, *failures):
        self.failures = list(failures)
        self.models = []

    def __call__(self, text, model):
        self.models.append(model)
        if self.failures:
            raise self.failures.pop(0)
        return "CPSC 110"


def busy():
    return errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}})


def out_of_quota():
    return errors.ClientError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED"}})


def test_retries_when_the_model_is_busy():
    waits = []
    ask = FakeGemini(busy())
    assert ask_slowly("CPSC 110", ask, waits.append) == ("CPSC 110", MODELS[0])
    assert waits == [SECONDS_BETWEEN_CALLS, RETRY_WAITS[0]]


def test_switches_model_right_away_when_out_of_quota():
    waits = []
    ask = FakeGemini(out_of_quota())
    assert ask_slowly("CPSC 110", ask, waits.append) == ("CPSC 110", MODELS[1])
    assert ask.models == [MODELS[0], MODELS[1]]
    assert waits == [SECONDS_BETWEEN_CALLS]


def test_switches_model_when_busy_retries_run_out():
    waits = []
    ask = FakeGemini(*[busy() for _ in range(len(RETRY_WAITS) + 1)])
    assert ask_slowly("CPSC 110", ask, waits.append) == ("CPSC 110", MODELS[1])
    assert waits == [SECONDS_BETWEEN_CALLS, *RETRY_WAITS]


def test_gives_up_when_every_model_is_out_of_quota():
    ask = FakeGemini(*[out_of_quota() for _ in MODELS])
    with pytest.raises(errors.ClientError):
        ask_slowly("CPSC 110", ask, lambda seconds: None)
    assert ask.models == MODELS


def test_other_errors_stop_right_away():
    bad_request = errors.ClientError(400, {"error": {"code": 400, "status": "INVALID_ARGUMENT"}})
    ask = FakeGemini(bad_request)
    with pytest.raises(errors.ClientError):
        ask_slowly("CPSC 110", ask, lambda seconds: None)
    assert ask.models == [MODELS[0]]
