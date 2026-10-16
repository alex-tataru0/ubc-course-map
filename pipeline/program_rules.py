import json
import re

from prereq_tree import COURSE

# Turns one row of a program's requirement table into a tree, like prereq_tree.py does for
# prerequisites. The website then works out which of your courses count toward each row.
#
# A node is one of:
# - a course code, e.g. "CPSC 121"
# - {"all_of": [node, ...]}: every one is needed
# - {"one_of": [node, ...]}: any one is enough
# - {"pick": 3, "of": ["CPSC 304", ...], "note": "..."}: that many different courses from
#   the list. "note" is an extra condition we keep as text, e.g. "at least 6 credits of which
#   must be 400 or above".
# - {"credits_of": {"subjects": ["CPSC", "AI"], "min_level": 300}}: the row's credits from
#   any courses in those subjects numbered that high or higher
# - {"electives": true}: the row's credits from any courses
# - {"other": "..."}: anything else, e.g. "Additional Communication Requirement"
#
# A course only counts toward one row, so "One more of CPSC 304, 317, …" is just a one_of:
# the website won't count the course already used for the "One of" row above it.

SUBJECT = re.compile(r"[A-Z]{2,4}")
NUMBER = re.compile(r"\d{3}")
COUNTS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5}

# "CPSC or AI courses numbered 300 or higher"
CREDITS_OF = re.compile(r"((?:[A-Z]{2,4} or )*[A-Z]{2,4}) courses numbered (\d{3}) or higher")

# "Three of CPSC 304, 330, …, AI 422 at least 6 credits of which must be 400 or above".
# Electrical Engineering writes "One of: MATH 318, MATH 302, STAT 302".
PICK = re.compile(r"(One|Two|Three|Four|Five) (?:more )?of:? (.+?)(?: (at least .+))?")

# "CPSC 304, 330, AI 422": a comma list where a subject can change partway through.
CODE_LIST = re.compile(r"[A-Z]{2,4} \d{3}(?:, (?:[A-Z]{2,4} )?\d{3})*")


def course_codes(text: str) -> list[str]:
    # Every course a row mentions, written in full. Rows leave the subject out when it
    # repeats ("MATH 100 or 102 or 104" is MATH 100, MATH 102 and MATH 104), so a number
    # gets the last subject before it, as long as only commas, brackets, "or" and "and" come
    # in between. Any other word ends the list, so the "400" in "…must be 400 or above"
    # isn't read as a course.
    codes, subject = [], None
    for token in re.findall(r"[A-Za-z]+|\d{3}", text):
        if SUBJECT.fullmatch(token):
            subject = token
        elif NUMBER.fullmatch(token):
            if subject:
                codes.append(f"{subject} {token}")
        elif token not in ("or", "and"):
            subject = None
    return codes


def _items(text: str, separator: str) -> list[str] | None:
    # "MATH 100 or 102 or 104" split on " or " → the full codes, or None if any piece
    # isn't a course number (with or without its subject).
    pieces = text.split(separator)
    if not re.fullmatch(r"[A-Z]{2,4} \d{3}", pieces[0]):
        return None  # the first one needs its subject
    if not all(re.fullmatch(r"(?:[A-Z]{2,4} )?\d{3}", piece) for piece in pieces):
        return None
    return course_codes(text)


def parse_requirement_with_rules(text: str):
    # Returns a tree, or None if no rule fits (then Gemini gets a turn).
    if text == "Electives":
        return {"electives": True}

    match = CREDITS_OF.fullmatch(text)
    if match:
        subjects, level = match.groups()
        return {"credits_of": {"subjects": subjects.split(" or "), "min_level": int(level)}}

    match = PICK.fullmatch(text)
    if match:
        count, listed, note = match.groups()
        if not CODE_LIST.fullmatch(listed):
            return None
        codes = course_codes(listed)
        n = COUNTS[count.lower()]
        if n == 1 and note is None:
            return {"one_of": codes}
        tree = {"pick": n, "of": codes}
        return tree | {"note": note} if note else tree

    if CODE_LIST.fullmatch(text):
        # "CPSC 121", or a list where you need all of them: "CPSC 310, 313, 320".
        codes = course_codes(text)
        return codes[0] if len(codes) == 1 else {"all_of": codes}

    # Plain words with no numbers at all, e.g. "Additional Communication Requirement".
    if not re.search(r"\d", text):
        return {"other": text}

    # "MATH 100 or 102 or 104 (or 180 or 184 or 120 or 110)", "CPSC 110 (or 103 and 107)":
    # choices, with more choices in brackets.
    match = re.fullmatch(r"(.+?)(?: \(or (.+)\))?", text)
    main, extra = match.groups()
    choices = _items(main, " or ")
    if choices is None:
        return None
    if extra:
        # The bracket has the main list's subject unless it names its own.
        subject = choices[-1].split()[0]
        bracket = extra if SUBJECT.match(extra) else f"{subject} {extra}"
        if " and " in bracket:
            both = _items(bracket, " and ")
            if both is None:
                return None
            choices.append({"all_of": both})
        else:
            more = _items(bracket, " or ")
            if more is None:
                return None
            choices += more
    return {"one_of": choices} if len(choices) > 1 else None


def requirement_problems(tree, text: str) -> list[str]:
    # What's wrong with a tree (from the rules or Gemini). Empty = looks fine.
    problems, found = [], []
    _check(tree, problems, found)
    expected = course_codes(text)
    if sorted(found) != sorted(expected):
        problems.append(f"courses don't match the text: tree has {sorted(found)}, text has {sorted(expected)}")
    return problems


def _check(node, problems: list[str], found: list[str]) -> None:
    if isinstance(node, str):
        if COURSE.fullmatch(node):
            found.append(node)
        else:
            problems.append(f"not a course code: {node!r}")
    elif isinstance(node, dict) and list(node) in (["one_of"], ["all_of"]):
        items = next(iter(node.values()))
        if not isinstance(items, list) or len(items) < 2:
            problems.append(f"needs a list of at least two: {node!r}")
            return
        for item in items:
            _check(item, problems, found)
    elif isinstance(node, dict) and set(node) in ({"pick", "of"}, {"pick", "of", "note"}):
        if not isinstance(node["pick"], int) or not 1 < node["pick"] < len(node["of"]):
            problems.append(f"bad pick count: {node!r}")
        for item in node["of"]:
            _check(item, problems, found)
    elif isinstance(node, dict) and list(node) == ["credits_of"]:
        spec = node["credits_of"]
        if not (isinstance(spec, dict) and spec.get("subjects") and isinstance(spec.get("min_level"), int)):
            problems.append(f"bad credits_of: {node!r}")
    elif node == {"electives": True}:
        pass
    elif isinstance(node, dict) and list(node) == ["other"] and isinstance(node["other"], str):
        found += course_codes(node["other"])
    else:
        problems.append(f"unknown node: {node!r}")


# For rows the rules can't read. Same idea as llm.INSTRUCTIONS, with this file's node types.
EXAMPLES = [
    ("CPSC 310, 313, 320", {"all_of": ["CPSC 310", "CPSC 313", "CPSC 320"]}),
    ("MATH 200 or 226", {"one_of": ["MATH 200", "MATH 226"]}),
    (
        "Two of BIOL 300, 301, CHEM 205 at least 3 credits of which must be lab courses",
        {"pick": 2, "of": ["BIOL 300", "BIOL 301", "CHEM 205"],
         "note": "at least 3 credits of which must be lab courses"},
    ),
    (
        "PHYS or ASTR courses numbered 200 or higher",
        {"credits_of": {"subjects": ["PHYS", "ASTR"], "min_level": 200}},
    ),
    ("Arts electives", {"other": "Arts electives"}),
]

INSTRUCTIONS = """You turn one row of a UBC degree requirement table into a JSON tree.

A node is one of:
- a course code string with its subject, e.g. "CPSC 221". Rows often leave out a subject
  that repeats: "MATH 100 or 102" means "MATH 100" and "MATH 102".
- {"all_of": [node, ...]}: every one is needed
- {"one_of": [node, ...]}: any one is enough
- {"pick": N, "of": ["CODE", ...], "note": "..."}: N different courses from the list; "note"
  holds any extra condition as text (leave it out if there is none)
- {"credits_of": {"subjects": ["SUBJ", ...], "min_level": N}}: credits from any courses in
  those subjects numbered N or higher
- {"electives": true}: free electives
- {"other": "..."}: anything else, copied from the row

Rules:
- Every course in the row must appear in the tree, and no others.
- A comma list with nothing before it means all_of. "or" means one_of.
- Reply with only the JSON tree.

Examples:
""" + "\n".join(f"Row: {text}\nJSON: {json.dumps(tree)}" for text, tree in EXAMPLES)


def parse_requirement(text: str, cache: dict, ask) -> dict:
    # Rules first, then a saved answer, then Gemini. `ask(text)` returns (tree, model name).
    tree = parse_requirement_with_rules(text)
    if tree is not None:
        return {"tree": tree, "source": "rules", "problems": requirement_problems(tree, text)}
    if text not in cache:
        tree, model = ask(text)
        cache[text] = {"tree": tree, "problems": requirement_problems(tree, text), "model": model}
    return {"source": "llm", **cache[text]}
