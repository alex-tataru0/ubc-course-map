from pathlib import Path

from build_programs import add_trees, load_page
from parse_programs import parse_programs

HTML_PATH = Path(__file__).parents[2] / "data" / "raw" / "programs" / "computer-science.html"


def test_load_page_downloads_only_once(tmp_path):
    path = tmp_path / "page.html"
    calls = []

    def fake_fetch(url):
        calls.append(url)
        return "<html>page</html>"

    assert load_page(path, fetch=fake_fetch) == "<html>page</html>"
    assert load_page(path, fetch=fake_fetch) == "<html>page</html>"
    assert len(calls) == 1


def no_ask(text):
    raise AssertionError(f"Gemini shouldn't be asked about {text!r}")


def no_save(cache, path):
    raise AssertionError("nothing new to save")


def test_every_real_row_is_read_by_the_rules():
    programs = add_trees(parse_programs(HTML_PATH.read_text(encoding="utf-8")), {}, no_ask, no_save)
    rows = [r for p in programs for y in p["years"] for r in y["requirements"]]
    assert len(rows) == 120
    assert all(r["source"] == "rules" and r["problems"] == [] for r in rows)
    assert list(rows[0]) == ["text", "credits", "tree", "source", "problems", "notes"]


def test_ai_option_trees():
    programs = add_trees(parse_programs(HTML_PATH.read_text(encoding="utf-8")), {}, no_ask, no_save)
    ai = next(p for p in programs if p["id"] == "cpsc-ai-major")
    upper = {r["text"]: r["tree"] for r in ai["years"][2]["requirements"]}
    assert upper["AI 240 or CPSC 340"] == {"one_of": ["AI 240", "CPSC 340"]}
    three = next(tree for text, tree in upper.items() if text.startswith("Three of"))
    assert three["pick"] == 3
    assert len(three["of"]) == 12 and three["of"][-1] == "AI 422"
    assert three["note"] == "at least 6 credits of which must be 400 or above"


def test_new_gemini_answers_are_saved(tmp_path):
    programs = [{"years": [{"requirements": [
        {"text": "CPSC 121", "credits": 4, "notes": []},
        {"text": "6 credits of MATH beyond MATH 200", "credits": 6, "notes": []},
    ]}]}]
    saved = []
    add_trees(programs, {}, lambda text: ({"other": text}, "fake-model"), lambda c, p: saved.append(dict(c)))
    rows = programs[0]["years"][0]["requirements"]
    assert [r["source"] for r in rows] == ["rules", "llm"]
    assert len(saved) == 1  # once, for the one new answer
