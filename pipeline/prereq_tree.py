import re

# "[CPSC320]" → groups ("CPSC", "320"). Only CPSC 420 and 449 write codes this way.
BRACKETED = re.compile(r"\[([A-Z]{2,4})(\d{3})\]")

# "CPSC_V" → group "CPSC". Okanagan codes like "MATH_O" don't match, so they're kept.
VANCOUVER = re.compile(r"\b([A-Z]{2,4})_V\b")


# "MICB306" → "MICB 306". A few courses leave out the space (MICB 407, EOSC 327, BIOL 431).
MISSING_SPACE = re.compile(r"\b([A-Z]{2,4})(\d{3}[A-Z]?)\b")


def normalize_codes(text: str) -> str:
    text = BRACKETED.sub(r"\1 \2", text)
    text = VANCOUVER.sub(r"\1", text)
    return MISSING_SPACE.sub(r"\1 \2", text)


# A bare number right after a course code, like the "201" in "STAT 200, 201". Groups: the
# subject, the number before, what joins them, the bare number. The (?!-) keeps out levels
# like "MATH 100, 200-level".
SHORTHAND = re.compile(
    r"\b([A-Z]{2,4}(?:_O)?) (\d{3}[A-Z]?)(, or |, | or | and | \(or |/)(\d{3}[A-Z]?)\b(?!-)"
)


def expand_shorthand(text: str) -> str:
    # "STAT 200, 201" → "STAT 200, STAT 201" (ENVR 240), "MICB 211 (or 201)" → "MICB 211
    # (or MICB 201)" (MICB 322): the bare number is a course in the same subject.
    # Each pass fills in one number per list, so "MATH 100, 102, 104" takes two passes.
    while SHORTHAND.search(text):
        text = SHORTHAND.sub(r"\1 \2\3\1 \4", text)
    return text


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

# "MATH 215. Familiarity with a programming language is required" (ATSC 405): a course code,
# a full stop, then one more sentence. Groups: the text before the full stop, then after it.
# The full stop must come right after a course code, so "fourth-year standing in the B.Sc.
# Environmental Sciences honours program" (ENVR 449) isn't cut in two.
LAST_SENTENCE = re.compile(r"(.+?\d{3}[A-Z]?)\.\s+(.+)")

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


def _is_text(piece: str) -> bool:
    # True for words with no course code in them, like "Third-year standing" or "PHYS 12"
    # (a high school course: UBC codes have 3 digits). The student checks these themselves.
    # A bare number like the "201" in ENVR's "One of STAT 200, 201, …" is short for a course,
    # not text, so it needs letters too. SQUASHED finds codes with or without the space.
    return not SQUASHED.search(piece) and re.search(r"[A-Za-z]{2}", piece) is not None


def _item(item: str):
    # One piece of a list: a course code, or text like "permission of the instructor".
    # None if it's something else, like "MICB 211 (" (then Gemini reads the whole text).
    if COURSE.fullmatch(item):
        return item
    if _is_text(item):
        return {"other": item}
    return None


def parse_clause(clause: str):
    clause = clause.strip(" .,;")
    if _is_text(clause):
        # "Third-year standing" in CPSC 491's "All of CPSC 221, … and Third-year standing".
        return {"other": clause}
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
    return _combine(kind, [_item(item) for item in items])


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
    if _is_text(text):
        # A part with no course code stays whole, like BIOL 260's option "(c) 8 transfer
        # credits of 1st year BIOL and 6 credits of 1st year chemistry".
        return {"other": text}
    note = GRADE_NOTE.fullmatch(text)
    if note:
        return _with_grade_note(note)
    last = LAST_SENTENCE.fullmatch(text)
    after = last.group(2) if last else ""
    if _is_text(after) and not LETTER.search(after) and "=" not in after:
        # The last sentence has no course code, so it's text the student checks. It's needed
        # as well, unless it starts with "Or", like BIOL 203's "One of BIOL 121, SCIE 001.
        # Or 8 transfer credits of first-year biology". Two kinds are left alone:
        # - a letter like "(c)" means one more lettered option (BIOL 260), read further down.
        # - "PHYS 12 = Physics 12; …" (PHYS 106, 107) only explains the codes. It isn't a
        #   requirement, so Gemini gets the whole text.
        before = last.group(1)
        word, _, rest = after.partition(" ")
        if word.lower() == "or":
            return _combine("one_of", [_parse(before), _parse(rest)])
        if word.lower() == "and":
            after = rest
        return _combine("all_of", [_parse(before), _parse(after)])
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
    # "A and one of B, C and one of D, E" = you need every clause. "And" can be capitalized,
    # as in BIOL 431's "BIOL 200 And fourth-year standing".
    clauses = re.split(" and ", text, flags=re.IGNORECASE)
    return _combine("all_of", [parse_clause(c) for c in clauses])


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
    if kind == "all_of":
        # An all_of inside an all_of adds nothing: "All of MATH 320, STAT 305 and one of …"
        # (STAT 460) is MATH 320, STAT 305 and the one_of, side by side.
        flat = []
        for node in nodes:
            flat += node["all_of"] if isinstance(node, dict) and "all_of" in node else [node]
        nodes = flat
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
