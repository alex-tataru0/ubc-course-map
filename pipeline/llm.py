import json
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

from prereq_tree import normalize_codes, parse_with_rules, tree_problems

# Free-tier Flash model. Google renames these often, so it lives in one place.
MODEL = "gemini-3.8-flash"

# Every Gemini answer is saved here and committed, so each prereq is only sent once.
CACHE_PATH = Path(__file__).parents[1] / "data" / "llm_cache" / "prereqs.json"

# Examples that show the patterns. The first is CPSC 313's (the rules already handle it);
# the others are made up. None is a prereq Gemini will actually be asked about,
# so they don't leak answers into the accuracy check later.
EXAMPLES = [
    (
        "CPSC 213 and either CPSC 221 or DSCI 221",
        {"all_of": ["CPSC 213", {"one_of": ["CPSC 221", "DSCI 221"]}]},
    ),
    (
        "Either (a) CPSC 110 or (b) all of CPSC 103, CPSC 107",
        {"one_of": ["CPSC 110", {"all_of": ["CPSC 103", "CPSC 107"]}]},
    ),
    (
        "A score of 72% or higher in MATH 200 and Second-year standing",
        {"all_of": [
            {"course": "MATH 200", "min_grade": 72},
            {"other": "Second-year standing"},
        ]},
    ),
    (
        "Chemistry 12 and one of PHYS 101, PHYS 117",
        {"all_of": [{"other": "Chemistry 12"}, {"one_of": ["PHYS 101", "PHYS 117"]}]},
    ),
]

INSTRUCTIONS = """You turn UBC course prerequisite text into a JSON tree.

A node is one of:
- a course code string, written exactly as in the text, e.g. "CPSC 221" or "MATH_O 220".
  A course code is a 2-4 capital-letter subject and a 3-digit number. Anything else,
  including high school courses like "Chemistry 12", is not a course code.
- {"one_of": [node, ...]}: any one of these is enough
- {"all_of": [node, ...]}: every one of these is needed
- {"course": "MATH 226", "min_grade": 68}: a course with a minimum percentage grade
- {"other": "..."}: anything that isn't a course, copied from the text, e.g. "Third-year standing"

Rules:
- Every course code in the text must appear in the tree, as a node or inside an "other" text.
- Never add a course that isn't in the text.
- "and" means all_of. "or", "one of" and "either" mean one_of.
- (a), (b), (c) mark groups. Keep that grouping.
- "N% or higher in X" becomes {"course": "X", "min_grade": N}. "A minimum grade of N% in each of"
  applies to every course it covers.
- Reply with only the JSON tree.

Examples:
""" + "\n".join(f"Text: {text}\nJSON: {json.dumps(tree)}" for text, tree in EXAMPLES)


def ask_gemini(text: str, client=None):
    # `client` lets tests pass in a fake, so they never call the real API.
    client = client or genai.Client()
    response = client.models.generate_content(
        model=MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            system_instruction=INSTRUCTIONS,
            response_mime_type="application/json",
        ),
    )
    return json.loads(response.text)


def load_cache(path: Path = CACHE_PATH) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_cache(cache: dict, path: Path = CACHE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # sort_keys keeps the file in a stable order, so git diffs only show real changes.
    path.write_text(json.dumps(cache, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_prereq(text: str, cache: dict, ask=ask_gemini) -> dict:
    # Rules first (free and instant), then a saved answer, then Gemini as a last resort.
    # `ask` lets tests swap in a fake instead of calling Gemini.
    text = normalize_codes(text)
    tree = parse_with_rules(text)
    if tree is not None:
        return {"tree": tree, "source": "rules", "problems": []}
    if text not in cache:
        tree = ask(text)
        cache[text] = {"tree": tree, "problems": tree_problems(tree, text), "model": MODEL}
    return {"source": "llm", **cache[text]}


if __name__ == "__main__":
    # Lets you try one prereq from the terminal:
    #   python pipeline/llm.py 'One of CPSC 107, CPSC 110'
    load_dotenv()
    text = normalize_codes(sys.argv[1])
    tree = ask_gemini(text)
    print(json.dumps(tree, indent=2))
    print("problems:", tree_problems(tree, text))
