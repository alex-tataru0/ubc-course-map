import html
import re

from arts_programs import BASE

# The Faculty of Arts requirements that every B.A. program shares, on top of the program's own
# rows, from the calendar page "Degree Requirements for students who enter the program in
# 2024/25 or later": Writing and Research, Ways of Knowing (Place and Power and the four
# breadth areas), Outside, Upper-level and Arts Credit Minimum. parse_degree reads them off
# the saved page into data/arts-degree.json, and raises if a part isn't where it was, so a new
# calendar year that changes them stops the build. The website works out each student's
# progress from that file (web/src/lib/arts.ts).

URL = BASE + "degree-requirements-students-who-enter-program-202425-or-later"

AREAS = [
    "Humanities and Creative Arts", "Language as Meaning", "Natural and Physical Sciences",
    "Social and Behavioural Systems",
]

# Each Arts program's row in the Research Component table, and its field of study: the
# subjects whose courses aren't outside credits. The calendar counts every course "normally
# accepted ... towards a specialization in a field of study, including cross-listed courses"
# as in the field; the site goes by subject. Anthropology's department teaches ANTH and ARCL,
# and Human Geography's rows take GEOG and GEOS courses.
PROGRAM_RULES = {
    "anth-major": ("Anthropology", ["ANTH", "ARCL"]),
    "econ-major": ("Economics", ["ECON"]),
    "engl-literature-major": ("English, Emphasis Literature", ["ENGL"]),
    "geog-human-major": ("Geography, Human", ["GEOG", "GEOS"]),
    "hist-major": ("History", ["HIST"]),
    "ling-major": ("Linguistics", ["LING"]),
    "phil-major": ("Philosophy", ["PHIL"]),
    "poli-major": ("Political Science", ["POLI"]),
    "psyc-major": ("Psychology", ["PSYC"]),
    "soci-major": ("Sociology", ["SOCI"]),
}


def text_of(fragment: str) -> str:
    # The words of some HTML, the way the site writes codes: no footnote marks, "ECON_V 101"
    # → "ECON 101" (also the calendar's "LAST _V303").
    fragment = re.sub(r"<sup>.*?</sup>", "", fragment, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", fragment)).replace("\xa0", " ")
    text = re.sub(r"\b([A-Z]{2,4}) ?_V ?", r"\1 ", text)
    return re.sub(r"\s+", " ", text).strip()


def courses_in(text: str) -> list[str]:
    # "ANTH 317, 407; ARCL 306" → ["ANTH 317", "ANTH 407", "ARCL 306"]. A bare number belongs to
    # the subject before it. "All POLI courses at the 400-level" → "POLI 400-499", which
    # build_programs turns into the POLI courses that exist.
    courses, subject = [], None
    for m in re.finditer(r"\b([A-Z]{2,4}) courses at the (\d)00-level|\b([A-Z]{2,4}) (\d{3})\b|\b(\d{3})\b", text):
        if m[1]:
            courses.append(f"{m[1]} {m[2]}00-{m[2]}99")
        elif m[3]:
            subject = m[3]
            courses.append(f"{subject} {m[4]}")
        elif subject:
            courses.append(f"{subject} {m[5]}")
    return list(dict.fromkeys(courses))


def find(pattern: str, page: str, what: str) -> re.Match:
    match = re.search(pattern, page, re.S)
    if match is None:
        raise ValueError(f"Arts degree requirements: can't find {what}. Has the page changed?")
    return match


def table_after(heading: str, page: str) -> list[list[str]]:
    # The rows of the first table whose header has `heading` in it, as lists of cell texts,
    # header first. Footnote rows (one cell) are left out.
    for table in re.findall(r"<table>.*?</table>", page, re.S):
        rows = [[text_of(cell) for cell in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)]
                for row in re.findall(r"<tr>(.*?)</tr>", table, re.S)]
        if heading in " ".join(rows[0]):
            return [row for row in rows if len(row) > 1]
    raise ValueError(f"Arts degree requirements: no table with {heading!r}. Has the page changed?")


def credits_table(heading: str, page: str, first_cell: str) -> dict[str, int]:
    # A one-row table of credits by kind of program, e.g. {"Major": 60, ...}.
    header, values = table_after(heading, page)[:2]
    if values[0] != first_cell:
        raise ValueError(f"Arts degree requirements: expected {first_cell!r}, found {values[0]!r}")
    return {kind: int(credits) for kind, credits in zip(header[1:], values[1:])}


def parse_degree(page: str, subjects: list[dict]) -> dict:
    # `subjects` is data/subjects.json's list, for which subjects the Faculty of Arts offers.
    writing = text_of(find(r"through one of the following courses: (.*?)\.\s", page, "the Writing courses")[1])

    research = [{"major": major, "text": text, "courses": courses_in(text)}
                for major, text in table_after("Research-Intensive Approved Course", page)[1:]]

    breadth = text_of(find(r"To fulfill the remaining requirements, students must complete:(.*?)</ul>",
                           page, "the Ways of Knowing breadth credits")[1])
    breadth_credits = [int(n) for n in re.findall(r"(\d+) credits (?:\(in one course code\) from|in the remaining)", breadth)]
    if len(breadth_credits) != 3:
        raise ValueError(f"Arts degree requirements: expected 9, 6 and 3 breadth credits in {breadth!r}")

    areas = []
    for name in AREAS:
        codes = find(rf"{name} Course Codes.*?<ul>(.*?)</ul>", page, f"the {name} course codes")[1]
        areas.append({"name": name, "subjects": re.findall(r"\(([A-Z]{2,4})_V\*?\)", codes)})

    place_and_power = find(r"Students must complete 3 credits from the <a href=\"([^\"]+)\"[^>]*>approved course list</a>",
                           page, "the Place and Power course list")[1]
    arts_credits = find(r"A minimum of (\d+) of the 120 credits required for the Bachelor of Arts degree program "
                        r"must be Arts credit", page, "the Arts Credit Minimum")[1]

    return {
        "source": URL,
        "writing": {"text": writing, "courses": courses_in(writing)},
        "research": research,
        "place_and_power": place_and_power,
        "breadth_credits": breadth_credits,
        "areas": areas,
        "outside": credits_table("Honours or Combined Major", page, "Outside credits required:"),
        "upper_level": credits_table("Major, Combined Major or IDST", page, "Upper-level credits required:"),
        "arts_credits": int(arts_credits),
        "arts_subjects": [s["code"] for s in subjects if s["faculty"] == "Faculty of Arts"],
    }


def add_program_rules(programs: list[dict], degree: dict) -> list[dict]:
    # Gives each Arts program its research row (the table's name for it) and its field of study.
    majors = {row["major"] for row in degree["research"]}
    for program in programs:
        research, field = PROGRAM_RULES[program["id"]]
        if research not in majors:
            raise ValueError(f"{program['id']}: no {research!r} row in the Research Component table")
        program["research"] = research
        program["field"] = field
    return programs
