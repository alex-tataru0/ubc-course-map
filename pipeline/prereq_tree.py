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


def parse_clause(clause: str):
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
    # "A and one of B, C and one of D, E" = you need every clause.
    clauses = [parse_clause(c) for c in text.split(" and ")]
    if None in clauses:
        return None
    return clauses[0] if len(clauses) == 1 else {"all_of": clauses}
