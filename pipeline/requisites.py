import re

# Finds the label that starts each requisite section, e.g. "Prerequisite: ".
# "s?" makes the trailing s optional, so "Prerequisites:" matches too.
LABEL = re.compile(r"\b(Prerequisites?|Corequisites?|Equivalency):\s*")

# Maps each label (singular or plural) to the key we store it under.
KEYS = {
    "Prerequisite": "prereq",
    "Prerequisites": "prereq",
    "Corequisite": "coreq",
    "Corequisites": "coreq",
    "Equivalency": "equivalency",
}

# Some descriptions put this note right after the prereq text (e.g. CPSC 299).
CDF_NOTE = "This course is not eligible for Credit/D/Fail grading."


def extract_requisites(description: str) -> dict:
    text = description.replace(CDF_NOTE, "")
    result = {"prereq": None, "coreq": None, "equivalency": None}
    matches = list(LABEL.finditer(text))
    for i, match in enumerate(matches):
        # A section runs until the next label, or to the end of the text.
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        key = KEYS[match.group(1)]
        if result[key] is not None:
            raise ValueError(f"Two {key} sections in: {description}")
        result[key] = text[match.end():end].strip().rstrip(".")
    return result
