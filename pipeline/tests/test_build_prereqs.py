import pytest
from google.genai import errors

from build_prereqs import (
    RETRY_WAITS, SECONDS_BETWEEN_CALLS, ask_slowly, build_requisites, print_summary,
)
from llm import MODELS


def test_only_the_hard_prereqs_go_to_gemini(courses):
    asked = []

    def fake_ask(text):
        asked.append(text)
        return {"other": text}, "fake-model"

    results = build_requisites(list(courses.values()), {}, fake_ask, save=lambda cache: None)
    found = [r for reqs in results.values() for r in reqs.values()]
    assert len(found) == 51
    assert sum(r["source"] == "rules" for r in found) == 38
    assert len(asked) == 13


def test_summary_lists_answers_that_need_review(capsys):
    # capsys is a pytest fixture that captures what the code prints.
    results = {
        "CPSC 110": {},
        "CPSC 210": {"prereq": {"tree": "CPSC 110", "source": "rules", "problems": []}},
        "CPSC 999": {"prereq": {"tree": None, "source": "llm", "problems": ["unknown node: None"]}},
    }
    print_summary(results)
    out = capsys.readouterr().out
    assert "2 requisites: 1 by rules, 1 by Gemini" in out
    assert "NEEDS REVIEW  CPSC 999 prereq" in out
    assert "CPSC 210" not in out


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
