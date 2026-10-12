import pytest
from google.genai import errors

from build_prereqs import (
    RETRY_WAITS, SECONDS_BETWEEN_CALLS, ask_slowly, build_requisites, print_summary,
)


def test_only_the_hard_prereqs_go_to_gemini(courses):
    asked = []

    def fake_ask(text):
        asked.append(text)
        return {"other": text}

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
    def __init__(self, *failures):
        self.failures = list(failures)
        self.calls = 0

    def __call__(self, text):
        self.calls += 1
        if self.failures:
            raise self.failures.pop(0)
        return "CPSC 110"


def busy():
    return errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE"}})


def test_retries_when_gemini_is_busy():
    waits = []
    ask = FakeGemini(busy())
    assert ask_slowly("CPSC 110", ask, waits.append) == "CPSC 110"
    assert waits == [SECONDS_BETWEEN_CALLS, RETRY_WAITS[0]]


def test_gives_up_after_the_last_retry():
    waits = []
    ask = FakeGemini(*[busy() for _ in range(len(RETRY_WAITS) + 1)])
    with pytest.raises(errors.ServerError):
        ask_slowly("CPSC 110", ask, waits.append)
    assert waits == [SECONDS_BETWEEN_CALLS, *RETRY_WAITS]


def test_other_errors_are_not_retried():
    bad_request = errors.ClientError(400, {"error": {"code": 400, "status": "INVALID_ARGUMENT"}})
    ask = FakeGemini(bad_request)
    with pytest.raises(errors.ClientError):
        ask_slowly("CPSC 110", ask, lambda seconds: None)
    assert ask.calls == 1
