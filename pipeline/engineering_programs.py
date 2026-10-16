import copy

from program_tables import read_tables

# The engineering programs on the site, each put together from calendar tables: the first
# year every engineering program shares, the department's second year, and the program's own
# third and fourth years. Where a year has versions by when students started, the one for
# students starting now is used.

BASE = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-applied-science/"
    "bachelor-applied-science/"
)
PAGES = {
    "first-year": BASE + "curriculum-and-first-year",
    "ece": BASE + "electrical-and-computer-engineering",
    "mech": BASE + "mechanical-engineering",
}

CURRENT_MECH = "For students who started third year in 2026W or later"
CURRENT_CPEN = "For Computer Engineering – For students who entered second year in 2023W or later"


def part(page: str, heading: str, version: str | None = None, block: str | None = None,
         title: str | None = None, swap: dict | None = None) -> dict:
    # Where some years come from: the tables under `heading` on `page` with that `version`
    # line before them (None: no such line), and only the block titled `block`, if given.
    # `title` renames the year. `swap` replaces a row: {"ELEC 291": ("ELEC 271, ELEC 292", 7)}.
    return {"page": page, "heading": heading, "version": version, "block": block,
            "title": title, "swap": swap or {}}


FIRST_YEAR = part("first-year", "First-Year Curriculum", title="First Year")
ELEC_SECOND = part("ece", "Second Year", block="For Electrical Engineering", title="Second Year")
MECH_SECOND = part("mech", "Degree requirements:", block="Second Year")
OPTION_NOTE = ("Students are admitted to an option at the end of second year by permission of "
               "the option coordinator.")
MECH_NOTE = "Third and fourth years for students who started third year in 2026W or later."


def mech_option(id: str, name: str, heading: str, version: str | None = CURRENT_MECH) -> dict:
    notes = [OPTION_NOTE] + ([MECH_NOTE] if version else [])
    return {"id": id, "name": name, "notes": notes,
            "parts": [FIRST_YEAR, MECH_SECOND, part("mech", heading, version=version)]}


PROGRAMS = [
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
        "parts": [FIRST_YEAR, ELEC_SECOND, part("ece", "Electrical Engineering")],
    },
    {
        "id": "elec-bmeg",
        "name": "Electrical Engineering, Biomedical Engineering option",
        "notes": ["Students are admitted to the option at the end of first year by permission of "
                  "the option coordinator."],
        # The second year's footnote: "Students in the Biomedical Engineering Option will take
        # ELEC 271 and ELEC 292 instead of ELEC 291" (1 + 6 credits instead of 6).
        "parts": [FIRST_YEAR, {**ELEC_SECOND, "swap": {"ELEC 291": ("ELEC 271, ELEC 292", 7)}},
                  part("ece", "Biomedical Engineering Option")],
    },
    {
        "id": "mech",
        "name": "Mechanical Engineering",
        "notes": [MECH_NOTE],
        "parts": [FIRST_YEAR, MECH_SECOND, part("mech", "Degree requirements:", version=CURRENT_MECH)],
    },
    mech_option("mech-aerospace", "Mechanical Engineering, Aerospace option", "Aerospace Option"),
    mech_option("mech-biomechanics", "Mechanical Engineering, Biomechanics and Medical Devices option",
                "Biomechanics and Medical Devices Option"),
    mech_option("mech-energy", "Mechanical Engineering, Energy and Environment option",
                "Energy and Environment Option"),
    # Mechatronics has one version only.
    mech_option("mech-mechatronics", "Mechanical Engineering, Mechatronics option",
                "Mechatronics Option", version=None),
    mech_option("mech-naval", "Mechanical Engineering, Naval Architecture and Marine Engineering option",
                "Naval Architecture and Marine Engineering Option"),
]


def years_for(tables: dict[str, list[dict]], p: dict) -> list[dict]:
    # The years one part points to. Stops the build if the calendar changed and they're gone.
    found = [t for t in tables[p["page"]] if t["heading"] == p["heading"] and t["version"] == p["version"]]
    blocks = [copy.deepcopy(b) for t in found for b in t["blocks"]
              if p["block"] is None or b["title"] == p["block"]]
    if not blocks:
        raise ValueError(f"Nothing for {p} on the {p['page']} page")
    for block in blocks:
        if p["title"]:
            block["title"] = p["title"]
        for row in block["requirements"]:
            if row["text"] in p["swap"]:
                text, credits = p["swap"][row["text"]]
                block["credits"] += credits - row["credits"]
                row.update(text=text, credits=credits)
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
