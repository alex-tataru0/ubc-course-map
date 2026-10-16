import re

# Finds the label that starts each requisite section, e.g. "Prerequisite: ".
# "s?" makes the trailing s optional, so "Prerequisites:" matches too, and "-?" lets in
# BIOL 307's "Pre-requisites:". It's case-sensitive, so "Recommended pre-requisite:" (advice,
# as in PHYS 500) doesn't count.
LABEL = re.compile(
    r"\b(Recommended [Pp]re-?requisites?|Pre-?requisites?|Co-?requisites?|Equivalency):\s*"
)

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
# It can also be the whole section: PHYS 502's "Prerequisite: A background in … is highly
# recommended". Group 1 is the advice, without the full stop before it.
RECOMMENDED = re.compile(r"(?:^|\.\s+)([^.]*\brecommend[^.]*)$")

# Some engineering courses put their hours after the prereq instead of before it, e.g.
# MECH 224's "Prerequisite: MECH 224 or MECH 260. [2-2-0]", or MECH 490's
# "[1-0- 1]; [1-0-1]". They stay in the description but aren't part of the requirement.
# "Credit will be granted for only one of MECH 468 or MECH 509" (MECH 468) says which courses
# rule each other out, not what you need first. The website reads it from the description,
# so it's left out of the requirement. CPEN 355 says "Credit cannot be obtained for both".
CREDIT_NOTE = re.compile(
    r"(?:^|\.?\s+)Credit (?:will (?:only )?be granted for only one of|cannot be obtained for both)"
    r"\b[^.]*\.?"
)

TRAILING_HOURS = re.compile(r"(?:[.;]?\s*\[[\d.*\s\-–]+\])+[.\s]*$")


def extract_requisites(description: str) -> dict:
    text = description.replace(CDF_NOTE, "")
    result = {"prereq": None, "coreq": None, "equivalency": None, "recommended": None}
    matches = list(LABEL.finditer(text))
    for i, match in enumerate(matches):
        # A section runs until the next label, or to the end of the text.
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        label = match.group(1)
        # "Recommended pre-requisite: MECH 380" (MECH 4xx) is advice, like the sentences above.
        key = "recommended" if label.startswith("Recommended") else KEYS[label.replace("-", "")]
        if result[key] is not None:
            raise ValueError(f"Two {key} sections in: {description}")
        section = TRAILING_HOURS.sub("", text[match.end():end].strip())
        section = CREDIT_NOTE.sub("", section)
        # CHBE 4xx's "Prerequisite:?Either a) …" has a stray "?" from the calendar.
        section = section.strip().lstrip("?").rstrip(".")
        advice = RECOMMENDED.search(section)
        # PHYS 100's last sentence also says what's required, so it stays in the requirement.
        if advice and "required" not in advice.group(1):
            # Advice isn't something you need, so it's kept apart from the requirement.
            if result["recommended"] is not None:
                raise ValueError(f"Two recommendations in: {description}")
            result["recommended"] = advice.group(1)
            section = section[:advice.start()]
        # A section that was only advice (PHYS 502) leaves no requirement.
        result[key] = section or None
    return result
