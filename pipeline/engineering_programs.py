import copy

from program_tables import read_tables

# The engineering programs on the site: the 14 Vancouver majors on the faculty's list of degree
# programs (https://apsc.ubc.ca/students/degree-programs), without their options. Each is put
# together from calendar tables: the first year every engineering program shares, then the
# program's second to fourth (or fifth) years on its department's page. Where a year has
# versions by when students started, the one for students starting now is used.

BASE = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-applied-science/"
    "bachelor-applied-science/"
)
PAGES = {
    "first-year": BASE + "curriculum-and-first-year",
    "bmeg": BASE + "biomedical-engineering",
    "chbe": BASE + "chemical-and-biological-engineering",
    "civl": BASE + "civil-engineering",
    "ece": BASE + "electrical-and-computer-engineering",
    "enph": BASE + "engineering-physics",
    "enve": BASE + "environmental-engineering",
    "geol": BASE + "geological-engineering",
    "igen": BASE + "integrated-engineering",
    "manu": BASE + "manufacturing-engineering",
    "mtrl": BASE + "materials-engineering",
    "mech": BASE + "mechanical-engineering",
    "mine": BASE + "mining-engineering",
}

CURRENT_MECH = "For students who started third year in 2026W or later"
CURRENT_CPEN = "For Computer Engineering – For students who entered second year in 2023W or later"
CURRENT_MANU = "For students who entered second year in 2026W or later"


def part(page: str, heading: str, version: str | None = None, block: str | None = None,
         title: str | None = None, choice: str | None = None) -> dict:
    # Where some years come from: the tables under `heading` on `page` with that `version`
    # line before them (None: no such line), and only the block titled `block`, if given.
    # `title` renames the year. `choice` is for a table shared by two programs, where a year
    # ends with "Plus one of the programs listed below:" and a short list for each (Chemical
    # Engineering, Chemical and Biological Engineering): only that program's list is kept.
    return {"page": page, "heading": heading, "version": version, "block": block, "title": title,
            "choice": choice}


FIRST_YEAR = part("first-year", "First-Year Curriculum", title="First Year")


def chbe(choice: str) -> list[dict]:
    return [FIRST_YEAR, part("chbe", "Chemical Engineering or Chemical and Biological Engineering",
                             choice=choice)]


PROGRAMS = [
    {
        "id": "bmeg",
        "name": "Biomedical Engineering",
        "notes": ["Second to fourth years for students who entered second year in 2022W or later."],
        # Biomedical Engineering has its own first year, on its own page.
        "parts": [part("bmeg", "Undergraduate Program Overview", title="First Year"),
                  part("bmeg", "2022W Second Year Entry or Later Program Requirements")],
    },
    {
        "id": "chbe",
        "name": "Chemical and Biological Engineering",
        "notes": [],
        "parts": chbe("Chemical and Biological Engineering"),
    },
    {
        "id": "chbe-chemical",
        "name": "Chemical Engineering",
        "notes": [],
        "parts": chbe("Chemical Engineering"),
    },
    {
        "id": "civl",
        "name": "Civil Engineering",
        "notes": [],
        "parts": [FIRST_YEAR, part("civl", "Civil Engineering")],
    },
    {
        "id": "cpen",
        "name": "Computer Engineering",
        "notes": ["Second year for students who entered second year in 2023W or later."],
        "parts": [FIRST_YEAR, part("ece", "Second Year", block=CURRENT_CPEN, title="Second Year"),
                  part("ece", "Computer Engineering")],
    },
    {
        "id": "elec",
        "name": "Electrical Engineering",
        "notes": [],
        "parts": [FIRST_YEAR,
                  part("ece", "Second Year", block="For Electrical Engineering", title="Second Year"),
                  part("ece", "Electrical Engineering")],
    },
    {
        "id": "enph",
        "name": "Engineering Physics",
        "notes": [],
        "parts": [FIRST_YEAR, part("enph", "Engineering Physics")],
    },
    {
        "id": "enve",
        "name": "Environmental Engineering",
        "notes": [],
        "parts": [FIRST_YEAR, part("enve", "Program Requirements")],
    },
    {
        "id": "geol",
        "name": "Geological Engineering",
        "notes": [],
        "parts": [FIRST_YEAR, part("geol", "Geological Engineering")],
    },
    {
        "id": "igen",
        "name": "Integrated Engineering",
        "notes": [],
        "parts": [FIRST_YEAR, part("igen", "Integrated Engineering Program")],
    },
    {
        "id": "manu",
        "name": "Manufacturing Engineering",
        "notes": ["Second to fourth years for students who entered second year in 2026W or later."],
        "parts": [FIRST_YEAR] + [part("manu", "Program Requirements", block=f"{year} – {CURRENT_MANU}",
                                      title=year)
                                 for year in ["Second Year", "Third Year", "Fourth Year"]],
    },
    {
        "id": "mtrl",
        "name": "Materials Engineering",
        "notes": [],
        "parts": [FIRST_YEAR, part("mtrl", "Materials Engineering")],
    },
    {
        "id": "mech",
        "name": "Mechanical Engineering",
        "notes": ["Third and fourth years for students who started third year in 2026W or later."],
        "parts": [FIRST_YEAR, part("mech", "Degree requirements:", block="Second Year"),
                  part("mech", "Degree requirements:", version=CURRENT_MECH)],
    },
    {
        "id": "mine",
        "name": "Mining Engineering",
        "notes": [],
        "parts": [FIRST_YEAR, part("mine", "Mining Engineering")],
    },
]


def keep_choice(blocks: list[dict], choice: str) -> list[dict]:
    # A shared table's blocks as one program's years: each year's own rows, plus that program's
    # short list. The year's total comes after the last list, so it's on whichever block is last.
    years = []
    for block in blocks:
        if block["title"].endswith(" Year"):
            years.append(block)
            continue
        if block["title"] == choice:
            years[-1]["requirements"] += block["requirements"]
        if block["credits"] is not None:
            years[-1]["credits"] = block["credits"]
    return years


def years_for(tables: dict[str, list[dict]], p: dict) -> list[dict]:
    # The years one part points to. Stops the build if the calendar changed and they're gone.
    found = [t for t in tables[p["page"]] if t["heading"] == p["heading"] and t["version"] == p["version"]]
    blocks = [copy.deepcopy(b) for t in found for b in t["blocks"]
              if p["block"] is None or b["title"] == p["block"]]
    if p["choice"]:
        blocks = keep_choice(blocks, p["choice"])
    if not blocks:
        raise ValueError(f"Nothing for {p} on the {p['page']} page")
    for block in blocks:
        if p["title"]:
            block["title"] = p["title"]
        # Options aren't on the site, so neither are footnotes about them ("Students in the
        # Biomedical Engineering Option will take ELEC 271 and ELEC 292 instead of ELEC 291").
        for row in block["requirements"]:
            row["notes"] = [note for note in row["notes"] if " Option" not in note]
    return blocks


def parse_engineering(pages: dict[str, str]) -> list[dict]:
    # `pages`: each page's HTML, by the names in PAGES.
    tables = {name: read_tables(html) for name, html in pages.items()}
    programs = []
    for program in PROGRAMS:
        years = [year for p in program["parts"] for year in years_for(tables, p)]
        sources = list(dict.fromkeys(PAGES[p["page"]] for p in program["parts"]))
        programs.append({
            "id": program["id"],
            "name": program["name"],
            "sources": sources,
            "notes": program["notes"],
            "total_credits": sum(year["credits"] for year in years),
            "years": years,
        })
    return programs
