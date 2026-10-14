import re

# "[CPSC320]" → groups ("CPSC", "320"). Only CPSC 420 and 449 write codes this way.
BRACKETED = re.compile(r"\[([A-Z]{2,4})(\d{3})\]")

# "CPSC_V" → group "CPSC". Okanagan codes like "MATH_O" don't match, so they're kept.
VANCOUVER = re.compile(r"\b([A-Z]{2,4})_V\b")


def normalize_codes(text: str) -> str:
    text = BRACKETED.sub(r"\1 \2", text)
    return VANCOUVER.sub(r"\1", text)


# One whole course code, e.g. "CPSC 221", "MATH_O 220", "SCIE 001".
COURSE = re.compile(r"[A-Z]{2,4}(?:_O)? \d{3}[A-Z]?")

# "a score of 68% or higher in MATH 226", "A grade of 65% or higher in one of MATH 100, MATH 102".
# Groups: the grade, then the course list.
SCORE = re.compile(r"a (?:score|grade) of (\d+)% or higher in (?:one of )?(.+)", re.IGNORECASE)

# "MATH 226. Prerequisite grade requirement: 68% in MATH226" (MATH 227, 418 and 426).
# Groups: the requirement, the grade, then the courses the grade is for.
GRADE_NOTE = re.compile(r"(.+)\. Prerequisite grade requirement: (\d+)% in ([A-Z0-9, ]+)")

# A course code that may be missing its space, like "MATH226" in a grade note.
SQUASHED = re.compile(r"([A-Z]{2,4}) ?(\d{3})")

# "(a) " or "a) ": the start of a lettered option, as in "Either (a) MATH 360 or (b) MATH 361".
# The \b stops it from matching the end of a word, like the "d)" in "(waived)".
LETTER = re.compile(r"\(?\b([a-d])\)\s+")

# How a lettered list can start, and what it means.
LEADS = {"either": "one_of", "one of": "one_of", "all of": "all_of", "both": "all_of"}

# What can come between two lettered options. Longer ones first, so ", or" wins over " or".
# A bare comma just separates options, as in "(a) X, (b) Y, or (c) Z". So does nothing at all,
# as in CPSC 340's "All of (a) one of CPSC 221, DSCI 221 (b) one of MATH 152, …".
JOINERS = [(", or", "one_of"), ("; or", "one_of"), (", and", "all_of"),
           (" or", "one_of"), (" and", "all_of"), (",", None)]


def parse_clause(clause: str):
    clause = clause.strip(" .,;")
    score = SCORE.fullmatch(clause)
    if score:
        # Each listed course with the minimum grade. Several courses means any one of them.
        grade, items = int(score.group(1)), re.split(r", | or ", score.group(2))
        if not all(COURSE.fullmatch(item) for item in items):
            return None
        return _combine("one_of", [{"course": item, "min_grade": grade} for item in items])
    # Pick the tree key and how the courses are separated, based on how the clause starts.
    lower = clause.lower()
    if lower.startswith("one of "):
        kind, items = "one_of", re.split(r", | or ", clause[len("one of "):])
    elif lower.startswith("all of "):
        kind, items = "all_of", clause[len("all of "):].split(", ")
    elif lower.startswith("either "):
        kind, items = "one_of", clause[len("either "):].split(" or ")
    else:
        kind, items = "one_of", clause.split(" or ")
    # Every piece must be exactly one course code, or we give up on this clause.
    if not all(COURSE.fullmatch(item) for item in items):
        return None
    return items[0] if len(items) == 1 else {kind: items}


def parse_with_rules(text: str):
    # Returns the tree, or None if the rules aren't sure (then Gemini gets the text).
    text = text.strip(" .,;")
    if not COURSE.search(text):
        # No course at all, e.g. "Permission of the Department Head". Only the student can
        # check that, so the whole text is kept as one "other" requirement.
        return {"other": text}
    return _parse(text)


def _parse(text: str):
    text = text.strip(" .,;")
    note = GRADE_NOTE.fullmatch(text)
    if note:
        return _with_grade_note(note)
    if "; and " in text:
        # "Either (a) … or (b) …; and either (a) … or (b) …" (MATH 424): both halves are needed.
        return _combine("all_of", [_parse(part) for part in text.split("; and ")])
    first = LETTER.search(text)
    if first:
        # Before "(a)" there's a lead-in like "Either", sometimes after other clauses:
        # "MATH 300 and either (a) …". The lettered list runs to the end of the text.
        before, _, lead = text[:first.start()].rpartition(" and ")
        options = _parse_lettered(lead.strip().lower(), text[first.start():])
        return options if not before else _combine("all_of", [_parse(before), options])
    if text.lower().startswith("both "):
        # "Both STAT 305 and STAT 306" means the same as "STAT 305 and STAT 306".
        text = text[len("both "):]
    # "A and one of B, C and one of D, E" = you need every clause.
    return _combine("all_of", [parse_clause(c) for c in text.split(" and ")])


def _parse_lettered(lead: str, text: str):
    # "(a) X or (b) Y" → X and Y, each read on its own, in a one_of or all_of.
    # Gives up unless the letters go a, b, c, … and every word between options agrees.
    if lead and lead not in LEADS:
        return None
    starts = list(LETTER.finditer(text))
    if [start.group(1) for start in starts] != list("abcd"[:len(starts)]):
        return None
    kinds = {LEADS[lead]} if lead else set()
    options = []
    for i, start in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        option = text[start.end():end].rstrip()
        if i + 1 < len(starts):
            # Every option but the last can end with the word that joins it to the next one.
            for joiner, kind in JOINERS:
                if option.endswith(joiner):
                    option = option[:-len(joiner)]
                    if kind:
                        kinds.add(kind)
                    break
        options.append(_parse(option))
    # "Either (a) X and (b) Y" says two different things, so don't guess.
    if len(kinds) != 1:
        return None
    return _combine(kinds.pop(), options)


def _with_grade_note(note):
    # "All of MATH 321, MATH 322. Prerequisite grade requirement: 68% in MATH322,MATH321":
    # read the first part, then put the minimum grade on the courses the note names.
    tree = _parse(note.group(1))
    grade = int(note.group(2))
    graded = {f"{subject} {number}" for subject, number in SQUASHED.findall(note.group(3))}
    if tree is None or not graded or not graded <= set(COURSE.findall(note.group(1))):
        return None
    return _add_grade(tree, graded, grade)


def _add_grade(node, graded: set[str], grade: int):
    if isinstance(node, str):
        return {"course": node, "min_grade": grade} if node in graded else node
    if "one_of" in node or "all_of" in node:
        kind, items = next(iter(node.items()))
        return {kind: [_add_grade(item, graded, grade) for item in items]}
    return node


def _combine(kind: str, nodes: list):
    # One node stays as it is; several go in a one_of / all_of. None if any of them failed.
    if None in nodes:
        return None
    return nodes[0] if len(nodes) == 1 else {kind: nodes}


def tree_problems(tree, text: str) -> list[str]:
    # Returns a list of what's wrong with a tree (from the rules or Gemini). Empty = looks fine.
    problems = []
    found = set()
    _check_node(tree, problems, found)
    # The tree should mention exactly the courses the text mentions: none dropped, none made up.
    expected = set(COURSE.findall(text))
    if found != expected:
        problems.append(
            f"courses don't match the text: missing {sorted(expected - found)}, "
            f"extra {sorted(found - expected)}"
        )
    return problems


def _check_node(node, problems: list[str], found: set[str]) -> None:
    # Checks one node, then calls itself on any children (recursion).
    # Adds problems it sees to `problems` and every course code to `found`.
    if isinstance(node, str):
        if COURSE.fullmatch(node):
            found.add(node)
        else:
            problems.append(f"not a course code: {node!r}")
    elif isinstance(node, dict) and list(node) in (["one_of"], ["all_of"]):
        items = next(iter(node.values()))
        if not isinstance(items, list) or not items:
            problems.append(f"needs a non-empty list: {node!r}")
            return
        for item in items:
            _check_node(item, problems, found)
    elif isinstance(node, dict) and set(node) == {"course", "min_grade"}:
        _check_node(node["course"], problems, found)
        grade = node["min_grade"]
        if not isinstance(grade, int) or not 0 <= grade <= 100:
            problems.append(f"bad grade: {grade!r}")
    elif isinstance(node, dict) and list(node) == ["other"] and isinstance(node["other"], str):
        # Free text like "six credits of BIOL beyond BIOL 111" can still mention courses.
        found.update(COURSE.findall(node["other"]))
    else:
        problems.append(f"unknown node: {node!r}")
