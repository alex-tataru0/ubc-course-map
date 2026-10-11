import json
from types import SimpleNamespace

from llm import EXAMPLES, INSTRUCTIONS, MODEL, ask_gemini
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
