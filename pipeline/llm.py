import json
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

from prereq_tree import normalize_codes, parse_with_rules, tree_problems

# Free-tier models, best first. Each model has its own rate limits, so if the first one is
# out of quota or overloaded, the next one gets a turn. Google renames these often.
MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]

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
    # Added for MATH and STAT, after Gemini made STAT 321's note a requirement and
    # dropped the "MATH 550." at the start of MATH 551's prereq.
    (
        "One of PHYS 216, PHYS 218. PHYS 218 may be taken concurrently",
        {"one_of": ["PHYS 216", "PHYS 218", {"other": "PHYS 218 may be taken concurrently"}]},
    ),
    (
        "PHYS 301. Classical mechanics (PHYS 216 or equivalent)",
        {"all_of": ["PHYS 301", {"one_of": ["PHYS 216", {"other": "equivalent"}]}]},
    ),
    # Added for the 11 Science subjects, after Gemini made BIOL 201's and BIOL 234's
    # corequisites into prerequisites, put EOSC 440's "and MATH 200" inside the one_of before
    # it, and wrote PHYS 107's "85% or higher in PHYS 100" as text.
    (
        "MATH 220 and a corequisite of one of STAT 302, MATH 302",
        {"all_of": ["MATH 220", {"other": "a corequisite of one of STAT 302, MATH 302"}]},
    ),
    (
        "Second-year standing, and one of CPSC 103, CPSC 110, and MATH 101, and one of "
        "STAT 200, STAT 201",
        {"all_of": [
            {"other": "Second-year standing"},
            {"one_of": ["CPSC 103", "CPSC 110"]},
            "MATH 101",
            {"one_of": ["STAT 200", "STAT 201"]},
        ]},
    ),
    (
        "Either (a) a score of 80% or higher in all of CHEM 12, MATH 12 or (b) a score of 80% "
        "or higher in CHEM 100. CHEM 12 = Chemistry 12; MATH 12 = Principles of Mathematics 12",
        {"one_of": [
            {"all_of": [
                {"other": "80% or higher in Chemistry 12"},
                {"other": "80% or higher in Principles of Mathematics 12"},
            ]},
            {"course": "CHEM 100", "min_grade": 80},
        ]},
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
- A note that allows more, like "MATH 226 may be taken concurrently", is one more choice in a
  one_of. It is never an extra requirement.
- Every sentence counts. A course alone before a full stop, like "MATH 300." at the start,
  is needed too.
- A corequisite can be taken at the same time, so it is never a plain course code in the
  tree. Keep "a corequisite of one of CHEM 203, CHEM 223" whole, as one "other" text.
- ", and" can start a new requirement in the middle of a list: in "one of A, B, and C, and
  one of D, E", C is needed on its own.
- High school codes like "PHYS 12" are text. With a grade, write one text per course with the
  grade in it, using the names the text gives for the codes.
- "N% or higher in X" becomes {"course": "X", "min_grade": N}. "A minimum grade of N% in each of"
  applies to every course it covers.
- Reply with only the JSON tree.

Examples:
""" + "\n".join(f"Text: {text}\nJSON: {json.dumps(tree)}" for text, tree in EXAMPLES)


def ask_gemini(text: str, client=None, model: str = MODELS[0], instructions: str = INSTRUCTIONS):
    # `client` lets tests pass in a fake, so they never call the real API.
    # `instructions` defaults to the prereq prompt; program requirements pass their own.
    client = client or genai.Client()
    response = client.models.generate_content(
        model=model,
        contents=text,
        config=types.GenerateContentConfig(
            system_instruction=instructions,
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


def parse_prereq(text: str, cache: dict, ask) -> dict:
    # Rules first (free and instant), then a saved answer, then Gemini as a last resort.
    # `ask(text)` must return (tree, name of the model that answered).
    text = normalize_codes(text)
    tree = parse_with_rules(text)
    if tree is not None:
        return {"tree": tree, "source": "rules", "problems": []}
    if text not in cache:
        tree, model = ask(text)
        cache[text] = {"tree": tree, "problems": tree_problems(tree, text), "model": model}
    return {"source": "llm", **cache[text]}


if __name__ == "__main__":
    # Lets you try one prereq from the terminal:
    #   python pipeline/llm.py 'One of CPSC 107, CPSC 110'
    load_dotenv()
    text = normalize_codes(sys.argv[1])
    tree = ask_gemini(text)
    print(json.dumps(tree, indent=2))
    print("problems:", tree_problems(tree, text))
