import json
from types import SimpleNamespace

from llm import (
    EXAMPLES, INSTRUCTIONS, MODEL, ask_gemini, load_cache, parse_prereq, save_cache,
)
from prereq_tree import tree_problems


class FakeModels:
    # Pretends to be client.models: records each call and returns a fixed reply.
    def __init__(self, reply: str):
        self.reply = reply
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(text=self.reply)


class FakeClient:
    def __init__(self, reply: str):
        self.models = FakeModels(reply)


def test_returns_the_parsed_json():
    client = FakeClient('{"one_of": ["CPSC 107", "CPSC 110"]}')
    assert ask_gemini("One of CPSC 107, CPSC 110", client) == {
        "one_of": ["CPSC 107", "CPSC 110"]
    }


def test_sends_the_text_and_asks_for_json():
    client = FakeClient('"CPSC 110"')
    ask_gemini("CPSC 110", client)
    call = client.models.calls[0]
    assert call["model"] == MODEL
    assert call["contents"] == "CPSC 110"
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].system_instruction == INSTRUCTIONS


def test_examples_in_the_prompt_are_valid():
    # A typo in our own examples would teach Gemini the wrong thing.
    for text, tree in EXAMPLES:
        assert tree_problems(tree, text) == [], text
        assert json.dumps(tree) in INSTRUCTIONS


class FakeAsk:
    # Pretends to be ask_gemini: returns a fixed tree and counts how often it's called.
    def __init__(self, tree):
        self.tree = tree
        self.calls = 0

    def __call__(self, text):
        self.calls += 1
        return self.tree


CPSC_410_TEXT = "Either (a) CPSC 310 or (b) all of CPEN 321, CPEN 331"
CPSC_410_TREE = {"one_of": ["CPSC 310", {"all_of": ["CPEN 321", "CPEN 331"]}]}


def test_uses_rules_without_asking_gemini():
    ask = FakeAsk(None)
    result = parse_prereq("One of CPSC 107, CPSC 110", {}, ask)
    assert result == {
        "tree": {"one_of": ["CPSC 107", "CPSC 110"]},
        "source": "rules",
        "problems": [],
    }
    assert ask.calls == 0


def test_asks_gemini_when_rules_fail():
    ask = FakeAsk(CPSC_410_TREE)
    cache = {}
    result = parse_prereq(CPSC_410_TEXT, cache, ask)
    assert result["source"] == "llm"
    assert result["tree"] == CPSC_410_TREE
    assert result["problems"] == []
    assert cache[CPSC_410_TEXT]["model"] == MODEL


def test_only_asks_once_per_text():
    ask = FakeAsk(CPSC_410_TREE)
    cache = {}
    parse_prereq(CPSC_410_TEXT, cache, ask)
    parse_prereq(CPSC_410_TEXT, cache, ask)
    assert ask.calls == 1


def test_saves_problems_with_a_bad_answer():
    ask = FakeAsk({"one_of": ["CPSC 310", "CPEN 321"]})
    result = parse_prereq(CPSC_410_TEXT, {}, ask)
    assert len(result["problems"]) == 1


def test_cache_key_is_the_normalized_text():
    cache = {}
    raw = "Either (a) CPSC_V 310 or (b) all of CPEN_V 321, CPEN_V 331"
    parse_prereq(raw, cache, FakeAsk(CPSC_410_TREE))
    assert list(cache) == [CPSC_410_TEXT]


def test_cache_round_trip(tmp_path):
    # tmp_path is a pytest fixture: a fresh empty folder for this test only.
    path = tmp_path / "cache.json"
    assert load_cache(path) == {}
    save_cache({"some text": {"tree": "CPSC 110"}}, path)
    assert load_cache(path) == {"some text": {"tree": "CPSC 110"}}
