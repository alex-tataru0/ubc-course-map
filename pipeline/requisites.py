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

# A last sentence that only gives advice, like "One of MATH 152, MATH 221, MATH 223 is
# recommended" (MATH 317) or "The Department recommends that students …" (STAT 305).
# Group 1 is the advice, without the full stop before it.
RECOMMENDED = re.compile(r"\.\s+([^.]*\brecommend[^.]*)$")


def extract_requisites(description: str) -> dict:
    text = description.replace(CDF_NOTE, "")
    result = {"prereq": None, "coreq": None, "equivalency": None, "recommended": None}
    matches = list(LABEL.finditer(text))
    for i, match in enumerate(matches):
        # A section runs until the next label, or to the end of the text.
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        key = KEYS[match.group(1)]
        if result[key] is not None:
            raise ValueError(f"Two {key} sections in: {description}")
        section = text[match.end():end].strip().rstrip(".")
        advice = RECOMMENDED.search(section)
        if advice:
            # Advice isn't something you need, so it's kept apart from the requirement.
            if result["recommended"] is not None:
                raise ValueError(f"Two recommendations in: {description}")
            result["recommended"] = advice.group(1)
            section = section[:advice.start()]
        result[key] = section
    return result
