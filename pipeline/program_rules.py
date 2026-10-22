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
#   any courses in those subjects numbered that high or higher. "max_level": 399 is added for
#   a level band ("EOSC 300-level", "EOSC courses numbered 420-439").
# - {"credits_from": ["MATH 300", "MATH 400-406", ...]}: the row's credits from any courses
#   in the list. "MATH 400-406" is a range; build_programs.py swaps it for the real courses.
# - {"electives": true}: the row's credits from any courses
# - {"other": "..."}: anything else, e.g. "Additional Communication Requirement"
#
# A course only counts toward one row, so "One more of CPSC 304, 317, …" is just a one_of:
# the website won't count the course already used for the "One of" row above it.

SUBJECT = re.compile(r"[A-Z]{2,4}")
NUMBER = re.compile(r"\d{3}")
RANGE = re.compile(r"\d{3}-\d{3}")
COUNTS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5}

# Subjects joined up: "CPSC or AI", "EOSC, ENVR, or ATSC", "EOSC / ATSC / ENVR", "PHYS/ASTR",
# "CPSC, DSCI, and MATH" (any of them, whatever the joining word), "BIOL OR CHEM".
SUBJECTS = r"[A-Z]{2,4}(?:(?:, or |, and |, | or | OR | and | ?/ ?)[A-Z]{2,4})*"
SUBJECT_JOINER = re.compile(r", or |, and |, | or | OR | and | ?/ ?")

# Rows asking for credits from subjects by course level. Each gives the subjects, the lowest
# level, and the highest if there is one ("Additional" just means beyond the rows above).
# "Additional", "Other" and "Further" just mean beyond the rows above.
MORE = r"(?:Additional |Other |Further )?"
LEVELS = [
    # "CPSC or AI courses numbered 300 or higher", "STAT courses numbered 400 or above"
    (re.compile(rf"{MORE}({SUBJECTS}) courses? numbered (\d{{3}}) (?:or|and) (?:above|higher)"),
     lambda m: (m[2], None)),
    # "EOSC courses numbered 420-439"
    (re.compile(rf"({SUBJECTS}) courses numbered (\d{{3}})-(\d{{3}})"), lambda m: (m[2], m[3])),
    # "PHYS/ASTR 300-level and above", "EOSC / ATSC / ENVR 300-level or higher",
    # "Additional CPSC or AI at 300-level or higher"
    (re.compile(rf"{MORE}({SUBJECTS}) (?:at )?(\d{{3}})-level (?:or higher|and above)"),
     lambda m: (m[2], None)),
    # "ECON 200- or 300-level"
    (re.compile(rf"({SUBJECTS}) (\d)00- or (\d)00-level"), lambda m: (m[2] + "00", m[3] + "99")),
    # "Any Upper level MATH, STAT, CPSC or DSCI": upper level is 300 and up.
    (re.compile(rf"Any [Uu]pper level ({SUBJECTS})"), lambda m: ("300", None)),
    # "PHYS 100-level", "Additional EOSC 400-level", "Additional CPSC at 400-level": that level only.
    (re.compile(rf"{MORE}({SUBJECTS}) (?:at )?(\d)00-level"), lambda m: (m[2] + "00", m[2] + "99")),
]
# "One 200-level BIOL OR CHEM": the level comes first.
LEVEL_FIRST = re.compile(rf"One (\d)00-level ({SUBJECTS})")

# "Three of CPSC 304, 330, …, AI 422 at least 6 credits of which must be 400 or above".
# Electrical Engineering writes "One of: MATH 318, MATH 302, STAT 302"; Mathematical Sciences
# "Three courses from …" and "Two additional courses from …"; Atmospheric Science "3 of …".
PICK = re.compile(
    r"(One|Two|Three|Four|Five|[1-5]) (?:more |additional )?(?:courses )?(?:of|from):? (.+?)"
    r"(?: (at least .+))?"
)

# "9 credits from MATH 300, 301, 316", "15 credits from MATH 400-406, 412, …",
# "3 credits from PHYS 348, 409, and 420".
CREDITS_FROM = re.compile(r"\d+ credits (?:chosen )?from:? (.+)")

# "CPSC 304, 330, AI 422": a comma list where a subject can change partway through.
CODE_LIST = re.compile(r"[A-Z]{2,4} \d{3}(?:, (?:[A-Z]{2,4} )?\d{3})*")
# The same with ranges allowed: "MATH 322, 400-406, 412".
RANGE_LIST = re.compile(r"[A-Z]{2,4} \d{3}(?:-\d{3})?(?:, (?:[A-Z]{2,4} )?\d{3}(?:-\d{3})?)*")


# Subjects some rows write out: "Economics courses numbered 300 or above".
SUBJECT_NAMES = {"Economics": "ECON", "Statistics": "STAT", "statistics": "STAT"}


def simplify(text: str) -> str:
    # Rewrites the ways some rows say something that a rule below already reads:
    # - "GEOS (or GEOB) 300": GEOB is GEOS's old code, so only GEOS is kept.
    # - "MATH/STAT 302", "STAT / MATH 302" (cross-listed) → "MATH 302 or STAT 302". The (?!-)
    #   leaves "PHYS/ASTR 300-level" alone.
    # - "(or one of 131, 221, 223)" → "(or 131, 221, 223)"; "MATH 227 (317)" → "MATH 227 (or 317)".
    # - "PHYS (106 or 107), 108" → "PHYS 106 (or 107), 108".
    # - "One of (BIOL 203, … or MICB 201, 211)" → without the brackets.
    # - "BIOL 112,121" → "BIOL 112, 121"; "Economics courses" → "ECON courses".
    text = text.replace("GEOS (or GEOB) ", "GEOS ").replace("(or one of ", "(or ")
    text = re.sub(r"\b([A-Z]{2,4}) ?/ ?([A-Z]{2,4}) (\d{3})\b(?!-)", r"\1 \3 or \2 \3", text)
    text = re.sub(r" \((\d{3}(?:, \d{3})*)\)", r" (or \1)", text)
    text = re.sub(r"\b([A-Z]{2,4}) \((\d{3}) or (\d{3})\)", r"\1 \2 (or \3)", text)
    text = re.sub(r"^One of \((.+)\)$", r"One of \1", text)
    text = re.sub(r"(\d{3}),(\d{3})", r"\1, \2", text)
    return re.sub(r"\b(Economics|Statistics|statistics) courses",
                  lambda m: f"{SUBJECT_NAMES[m[1]]} courses", text)


def course_codes(text: str) -> list[str]:
    # Every course a row mentions, written in full. Rows leave the subject out when it
    # repeats ("MATH 100 or 102 or 104" is MATH 100, MATH 102 and MATH 104), so a number
    # gets the last subject before it, as long as only commas, brackets, "or" and "and" come
    # in between. Any other word ends the list, so the "400" in "…must be 400 or above"
    # isn't read as a course.
    # A range like "400-406" is kept as one ("MATH 400-406"); a level like "300-level" (or the
    # "200-" in "ECON 200- or 300-level") is a word.
    codes, subject = [], None
    for token in re.findall(r"\d{3}-level|\d{3}-\d{3}|\d{3}-|[A-Za-z]+|\d{3}", simplify(text)):
        if SUBJECT.fullmatch(token):
            subject = token
        elif NUMBER.fullmatch(token) or RANGE.fullmatch(token):
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


def level_tree(subjects: str, low: str, high: str | None) -> dict:
    spec = {"subjects": SUBJECT_JOINER.split(subjects), "min_level": int(low)}
    return {"credits_of": spec | {"max_level": int(high)} if high else spec}


def split_top(text: str) -> list[str]:
    # "MATH 221 (or 223), 215" → ["MATH 221 (or 223)", "215"]: commas outside brackets only.
    pieces, depth, start = [], 0, 0
    for i, char in enumerate(text):
        depth += {"(": 1, ")": -1}.get(char, 0)
        if char == "," and depth == 0:
            pieces.append(text[start:i].strip())
            start = i + 1
    return pieces + [text[start:].strip()]


def parse_requirement_with_rules(text: str):
    # Returns a tree, or None if no rule fits (then Gemini gets a turn).
    text = simplify(text)
    if text in ("Electives", "Elective"):
        return {"electives": True}

    # "In third year: STAT 301, 305, 306 and MATH 307": the row says when; the rest is the tree.
    match = re.fullmatch(r"In (?:first|second|third|fourth) year: (.+)", text)
    if match:
        return parse_requirement_with_rules(match[1])
    # "At least one of MICB 325, BIOL 335": taking both is fine, but one is enough.
    text = re.sub(r"^At least one of ", "One of ", text)

    for pattern, levels in LEVELS:
        match = pattern.fullmatch(text)
        if match:
            return level_tree(match[1], *levels(match))
    match = LEVEL_FIRST.fullmatch(text)
    if match:
        return level_tree(match[2], match[1] + "00", match[1] + "99")

    match = CREDITS_FROM.fullmatch(text)
    if match:
        listed = re.sub(r",? (?:or|and) ", ", ", match[1])
        return {"credits_from": course_codes(listed)} if RANGE_LIST.fullmatch(listed) else None

    # "Either (a) ECON 326 and STAT 301 or (b) ECON 398 and STAT 306"
    match = re.fullmatch(r"Either \(a\) (.+) or \(b\) (.+)", text)
    if match:
        options = [parse_requirement_with_rules(option) for option in match.groups()]
        return {"one_of": options} if all(isinstance(o, (str, dict)) for o in options) else None

    match = PICK.fullmatch(text)
    if match:
        count, listed, note = match.groups()
        # "One of MINE 350, …, MINE 455 or MINE 465", "Two of BIOL 331, 340 and 341": the last
        # one can come after "or" or "and". "One of MATH 101, 103, 105 (121)": the bracket is
        # more choices.
        listed = re.sub(r" \(or (.+)\)$", r", \1", listed)
        listed = re.sub(r",? (?:or|and) ", ", ", listed)
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

    # "BIOL 204 and 205", "STAT 301, 305, 306 and MATH 307": all of them.
    listed = re.sub(r",? and ", ", ", text)
    if " and " in text and CODE_LIST.fullmatch(listed):
        return {"all_of": course_codes(listed)}

    # "MECH 280, CIVL 215, or CHBE 251", "EOSC 110, 112, 114 or 116": a list with "or" before
    # the last one is a choice.
    listed = re.sub(r",? or ", ", ", text)
    if ", " in text and " or " in text and CODE_LIST.fullmatch(listed):
        return {"one_of": course_codes(listed)}

    # Plain words with no numbers at all, e.g. "Additional Communication Requirement", or
    # words with no subject codes, e.g. "Thematic concentration courses numbered 300 or above"
    # (but not a bare "100 or 102", which is a list missing its subject).
    no_subject = not re.search(r"\b[A-Z]{2,4}\b", text) and re.search(r"[a-z]{4}", text)
    if not re.search(r"\d", text) or no_subject:
        return {"other": text}

    # "MATH 221 (or 223), 215", "MICB 205, 211 (or 201), 212 (or 202)": a list where you need
    # all of them, some with choices in brackets. A piece without a subject has the last one's.
    pieces = split_top(text)
    if len(pieces) > 1 and "(" in text:
        trees, subject = [], None
        for piece in pieces:
            if subject and piece[0].isdigit():
                piece = f"{subject} {piece}"
            tree = choices_with_brackets(piece) if "(" in piece else parse_requirement_with_rules(piece)
            if tree is None or not (isinstance(tree, str) or "one_of" in tree):
                return None
            trees.append(tree)
            subject = piece.split()[0]
        return {"all_of": trees}

    return choices_with_brackets(text)


def choices_with_brackets(text: str):
    # "MATH 100 or 102 or 104 (or 180 or 184 or 120 or 110)", "CPSC 110 (or 103 and 107)",
    # "CHEM 121 (or 111, 141)", "MATH 111 (or one of 131, 221, 223)", "MATH 111 (or 131 or
    # 221 or 223) or STAT 200": choices, with more choices in brackets (and maybe after them).
    match = re.fullmatch(r"(.+?)(?: \(or ([^()]+)\))?(?: or ([^()]+))?", text) if "(" in text \
        else re.fullmatch(r"(.+?)(?: \(or (.+)\))?()", text)
    main, extra, after = match.groups()
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
            more = _items(re.sub(r",? or |, ", " or ", bracket), " or ")
            if more is None:
                return None
            choices += more
    if after:
        more = _items(after, " or ")
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
        if not (isinstance(spec, dict) and spec.get("subjects") and isinstance(spec.get("min_level"), int)
                and set(spec) <= {"subjects", "min_level", "max_level"}
                and spec.get("max_level", 999) >= spec["min_level"]):
            problems.append(f"bad credits_of: {node!r}")
    elif isinstance(node, dict) and list(node) == ["credits_from"]:
        items = node["credits_from"]
        if not isinstance(items, list) or len(items) < 2:
            problems.append(f"needs a list of at least two: {node!r}")
            return
        for item in items:
            if isinstance(item, str) and re.fullmatch(r"[A-Z]{2,4} \d{3}-\d{3}", item):
                found.append(item)
            else:
                _check(item, problems, found)
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
    ("EOSC 300-level", {"credits_of": {"subjects": ["EOSC"], "min_level": 300, "max_level": 399}}),
    (
        "9 credits from MATH 300, 301, 400-406",
        {"credits_from": ["MATH 300", "MATH 301", "MATH 400-406"]},
    ),
    ("Arts electives", {"other": "Arts electives"}),
    (
        "CHEM 401, 402 and 3 credits chosen from CHEM 410, 411 and chemistry courses numbered 300 or above",
        {"all_of": ["CHEM 401", "CHEM 402",
                    {"other": "3 credits chosen from CHEM 410, 411 and chemistry courses numbered 300 or above"}]},
    ),
    ("A BIOL selection or one of CHEM 301, 302", {"other": "A BIOL selection or one of CHEM 301, 302"}),
    ("CHEM 301 or CHEM at 300-level or higher", {"other": "CHEM 301 or CHEM at 300-level or higher"}),
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
  those subjects numbered N or higher. Add "max_level": M for a level band (300-level: 300
  to 399).
- {"credits_from": ["CODE", ...]}: credits from any courses in the list. A range like
  "MATH 400-406" stays as one item.
- {"electives": true}: free electives
- {"other": "..."}: anything else, copied from the row

Rules:
- Every course in the row must appear in the tree, and no others.
- credits_of and credits_from only stand for a whole row, never inside one_of or all_of.
  When only part of a row asks for credits (after some required courses), or the row is a
  choice between courses and a level ("CHEM 301 or CHEM at 300-level"), or the credits can
  come from a list and a level together, keep that part (or the whole choice) as
  {"other": "..."} with the row's words.
- A choice that includes a list we don't have, like "a BIOL selection", makes the whole row
  {"other": "..."}.
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
