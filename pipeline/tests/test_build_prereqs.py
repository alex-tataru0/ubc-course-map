from build_prereqs import build_requisites, print_summary


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
