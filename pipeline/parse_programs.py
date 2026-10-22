import copy
import re

from bs4 import BeautifulSoup

from prereq_tree import normalize_codes

# Reads the requirement tables on the calendar's Computer Science page
# (data/raw/programs/computer-science.html). Each program is a heading followed by a table:
# a bold row per year ("First Year"), one row per requirement with its credits, a "Total
# Credits" row per year, "Total Credits for Degree", and numbered footnotes at the bottom.

# First year is the same for the Major and Honours, so the page gives it its own heading.
SHARED_FIRST_YEAR = "Major (0376) and Honours (0154): Computer Science (CPSC)"

# The programs we read, in this order (later ones copy years from earlier ones).
PROGRAMS = [
    {
        "id": "cpsc-major",
        "name": "Computer Science Major",
        "heading": "Major (0376): Computer Science (CPSC)",
    },
    {
        "id": "cpsc-honours",
        "name": "Computer Science Honours",
        "heading": "Honours (0154): Computer Science (CPSC)",
    },
    {
        "id": "cpsc-ai-major",
        "name": "Computer Science Major, Artificial Intelligence option",
        "heading": "Major: Computer Science, Option in Artificial Intelligence",
    },
    {
        "id": "cpsc-ai-honours",
        "name": "Computer Science Honours, Artificial Intelligence option",
        "heading": "Honours: Computer Science, Option in Artificial Intelligence",
    },
    {
        "id": "cpsc-se-major",
        "name": "Computer Science and Software Engineering Major",
        "heading": "Major (1200): Computer Science and Software Engineering",
    },
    {
        "id": "cpsc-se-honours",
        "name": "Computer Science and Software Engineering Honours",
        "heading": "Honours (1201): Computer Science and Software Engineering",
    },
]

# Some programs say a year is "Same as" another program instead of listing it. These are
# the sentences the page uses, and where each one points.
SAME_AS = {
    "Same as Major and Honours Computer Science": "shared",
    "Same as Major Computer Science": "cpsc-major",
    "Same as in the regular Honours specialization.": "cpsc-honours",
}

UPPER_YEARS = "Third and Fourth Years"


def clean(text: str) -> str:
    # "CPSC_V 210 , 213" → "CPSC 210, 213": Vancouver codes without "_V", single spaces,
    # and no space before punctuation (cut-out footnote marks and links leave one behind).
    # A few Science rows write "EOSC_V110" or "EOSC _V212".
    text = re.sub(r"\b([A-Z]{2,4}) ?_V ?(?=\d{3})", r"\1 ", " ".join(text.split()))
    text = normalize_codes(text)
    return re.sub(r" ([,.;:)])", r"\1", text)


def is_footnote(cell) -> bool:
    # A footnote row starts with its number in superscript, e.g. "<sup>2</sup> May be…".
    first = next((s for s in cell.strings if s.strip()), None)
    return first is not None and first.parent.name == "sup"


def read_cell(cell) -> tuple[str, list[int]]:
    # The text of a cell without its footnote marks, and the footnote numbers it points to.
    # "CPSC_V 400 or higher<sup>4,5</sup>" → ("CPSC 400 or higher", [4, 5]).
    cell = copy.copy(cell)
    marks = []
    for sup in cell.find_all("sup"):
        marks += [int(n) for n in re.findall(r"\d+", sup.get_text())]
        sup.decompose()
    return clean(cell.get_text(" ")), marks


def number(text: str) -> int | None:
    text = text.strip()
    return int(text) if text.isdigit() else None


def read_section(soup: BeautifulSoup, heading: str) -> dict:
    # The years, requirements and credits under one program heading.
    h4 = next((h for h in soup.find_all("h4") if h.get_text(" ", strip=True) == heading), None)
    if h4 is None:
        raise ValueError(f"No heading {heading!r} on the page")
    tables = []
    for element in h4.find_all_next():
        if element.name in ("h3", "h4"):
            break
        if element.name == "table":
            tables.append(element)

    years, footnotes, total = [], {}, None
    for table in tables:
        for tr in table.find_all("tr"):
            cells = tr.find_all("td")
            if not cells:
                continue
            first = cells[0]
            credits = number(cells[1].get_text()) if len(cells) > 1 else None
            if is_footnote(first):
                n = int(first.find("sup").get_text().strip())
                footnotes[n] = clean(first.get_text(" ")).removeprefix(str(n)).strip()
                continue
            text, marks = read_cell(first)
            if not text:
                continue
            if text == "Total Credits for Degree":
                total = credits
            elif text == "Total Credits":
                years[-1]["credits"] = credits
            elif first.find("strong") and credits is None:
                years.append({"title": text, "credits": None, "requirements": []})
            else:
                years[-1]["requirements"].append({"text": text, "credits": credits, "notes": marks})

    # Swap each footnote number for the footnote's text.
    for year in years:
        for requirement in year["requirements"]:
            requirement["notes"] = [footnotes[n] for n in requirement["notes"]]
    return {"years": years, "total_credits": total}


def same_as(year: dict) -> str | None:
    # Where a year that only says "Same as …" points, or None for a normal year.
    texts = [r["text"] for r in year["requirements"]]
    if len(texts) == 1 and texts[0].startswith("Same as"):
        if texts[0] not in SAME_AS:
            raise ValueError(f"Unknown 'Same as' sentence: {texts[0]!r}")
        return SAME_AS[texts[0]]
    return None


def parse_programs(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    resolved = {"shared": read_section(soup, SHARED_FIRST_YEAR)["years"]}
    programs = []
    for program in PROGRAMS:
        section = read_section(soup, program["heading"])
        years = []
        # The Major and Honours start at second year; their first year is the shared one.
        if program["id"] in ("cpsc-major", "cpsc-honours"):
            years += copy.deepcopy(resolved["shared"])
        for year in section["years"]:
            source = same_as(year)
            if source is None:
                years.append(year)
            else:
                # Copy every year of that program except the upper years.
                years += [copy.deepcopy(y) for y in resolved[source] if y["title"] != UPPER_YEARS]
        resolved[program["id"]] = years
        programs.append({**program, "total_credits": section["total_credits"], "years": years})
    return programs
