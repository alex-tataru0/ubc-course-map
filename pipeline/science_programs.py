import copy
import re

from program_tables import read_tables

# The Science programs on the site besides Computer Science: the Majors and Honours of the
# subjects with maps, from the subjects' pages in the calendar's Bachelor of Science section.
# Each program is one table under its heading. Some tables say a year is "Same as for Biology
# Major (3095)" instead of listing it, and some split the upper years into "Third Year",
# "Third or Fourth Years" and "Fourth Year" with one total for all of them; those are put
# together as one year, and each row from a single-year block gets a note ("In third year").

BASE = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/"
    "bachelor-science/"
)
PAGES = {name: BASE + name for name in [
    "astronomy", "atmospheric-science", "biology", "chemistry", "data-science",
    "earth-and-ocean-sciences", "environmental-sciences", "geological-sciences", "geophysics",
    "mathematics", "microbiology-and-immunology", "oceanography", "physics", "statistics",
]}


def program(id: str, name: str, page: str, heading: str, table: str | None = None) -> dict:
    # `heading` is the calendar's heading for the program. `table` is the heading right above
    # its table, when that's a different one (Data Science's is "Specialization Requirements";
    # Geophysics Honours' has a footnote mark).
    return {"id": id, "name": name, "page": page, "heading": heading, "table": table or heading}


# In this order: a program that copies years from another comes after it.
PROGRAMS = [
    program("astr-major", "Astronomy Major", "astronomy", "Major (0030): Astronomy (ASTR)"),
    program("atsc-major", "Atmospheric Science Major", "atmospheric-science",
            "Major (0167): Atmospheric Science (ATSC)"),
    program("atsc-honours", "Atmospheric Science Honours", "atmospheric-science",
            "Honours (0429): Atmospheric Science (ATSC)"),
    program("biol-major", "Biology Major", "biology", "Major (3095): Biology (BIOL)"),
    program("biol-honours", "Biology Honours", "biology", "Honours (3194): Biology (BIOL)"),
    program("biol-animal-honours", "Animal Biology Honours", "biology",
            "Honours (0054): Animal Biology (ANIM)"),
    program("biol-cell-honours", "Cell and Developmental Biology Honours", "biology",
            "Honours (0405): Cell and Developmental Biology (CELL)"),
    program("biol-conservation-honours", "Conservation Biology Honours", "biology",
            "Honours (0583): Conservation Biology (CONS)"),
    program("biol-ecology-honours", "Ecology Honours", "biology", "Honours (0045): Ecology (ECOL)"),
    program("biol-evolution-honours", "Evolutionary Biology Honours", "biology",
            "Honours (0983): Evolutionary Biology (EVOL)"),
    program("biol-marine-honours", "Marine Biology Honours", "biology",
            "Honours (0518): Marine Biology (MRNB)"),
    program("biol-plant-honours", "Plant Biology Honours", "biology",
            "Honours (0372): Plant Biology (PTLB)"),
    program("chem-major", "Chemistry Major", "chemistry", "Major (0409): Chemistry (CHEM)"),
    program("chem-honours", "Chemistry Honours", "chemistry", "Honours (0213): Chemistry (CHEM)"),
    program("dsci-major", "Data Science Major", "data-science", "Major: Data Science (DSCI)",
            table="Specialization Requirements"),
    program("eosc-major", "Earth and Ocean Sciences Major", "earth-and-ocean-sciences",
            "Major (1223): Earth and Ocean Sciences"),
    program("eosc-geology-major", "Geology Major", "geological-sciences", "Major (3193): Geology"),
    program("eosc-geology-honours", "Geological Sciences Honours", "geological-sciences",
            "Honours (0462): Geological Sciences"),
    program("eosc-geophysics-major", "Geophysics Major", "geophysics", "Major (0001): Geophysics"),
    program("eosc-geophysics-honours", "Geophysics Honours", "geophysics",
            "Honours (0380): Geophysics (GEOP)", table="Honours (0380): Geophysics (GEOP) 1"),
    program("eosc-fisheries-honours", "Fisheries Oceanography Honours", "oceanography",
            "Honours (0577): Fisheries Oceanography"),
    program("envr-major", "Environmental Sciences Major", "environmental-sciences",
            "Major (1263): Environmental Sciences (ENSC)"),
    program("envr-honours", "Environmental Sciences Honours", "environmental-sciences",
            "Honours (0589): Environmental Sciences (ENSC)"),
    program("math-major", "Mathematics Major", "mathematics", "Major (0456): Mathematics (MATH)"),
    program("math-masc-major", "Mathematical Sciences Major", "mathematics",
            "Major (0185): Mathematical Sciences (MASC)"),
    program("math-honours", "Mathematics Honours", "mathematics", "Honours (0166): Mathematics (MATH)"),
    program("micb-major", "Microbiology and Immunology Major", "microbiology-and-immunology",
            "Major (1153): Microbiology and Immunology"),
    program("micb-honours", "Microbiology and Immunology Honours", "microbiology-and-immunology",
            "Honours (1154): Microbiology and Immunology (MBIM)"),
    program("phys-major", "Physics Major", "physics", "Major (0524): Physics (PHYS)"),
    program("phys-honours", "Physics Honours", "physics", "Honours (0344): Physics (PHYS)"),
    program("stat-major", "Statistics Major", "statistics", "Major (0562): Statistics (STAT)"),
    program("stat-honours", "Statistics Honours", "statistics", "Honours (0051): Statistics (STAT)"),
]

# The "Same as …" sentences the tables use, and the program each one points to.
SAME_AS = {"Same as for Biology Major (3095)": "biol-major"}

ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth"]


def year_numbers(title: str) -> list[int]:
    # "Third or Fourth Years" → [3, 4]. "First year" → [1].
    numbers = [ORDINALS.index(w) + 1 for w in re.findall(r"[A-Z][a-z]+", title.title()) if w in ORDINALS]
    if not numbers:
        raise ValueError(f"Not a year: {title!r}")
    return numbers


def year_title(numbers: list[int]) -> str:
    # [1] → "First Year", [3, 4] → "Third and Fourth Years", [2, 3, 4] → "Second to Fourth Years".
    first, last = ORDINALS[min(numbers) - 1], ORDINALS[max(numbers) - 1]
    if first == last:
        return f"{first} Year"
    joiner = "and" if max(numbers) - min(numbers) == 1 else "to"
    return f"{first} {joiner} {last} Years"


def resolve_same_as(blocks: list[dict], done: dict[str, list[dict]]) -> list[dict]:
    # Swaps "First Year" + "Same as for Biology Major (3095)" for a copy of that program's
    # first year (or first and second years, whatever the title before it says).
    result = []
    for block in blocks:
        if not block["title"].startswith("Same as"):
            result.append(block)
            continue
        if block["title"] not in SAME_AS:
            raise ValueError(f"Unknown 'Same as' sentence: {block['title']!r}")
        title = result.pop()
        if title["requirements"]:
            raise ValueError(f"Expected a year title before {block['title']!r}, got {title}")
        wanted = year_numbers(title["title"])
        copied = [copy.deepcopy(y) for y in done[SAME_AS[block["title"]]]
                  if set(year_numbers(y["title"])) <= set(wanted)]
        if block["credits"] is not None and block["credits"] != sum(y["credits"] for y in copied):
            raise ValueError(f"{block['title']!r}: {block['credits']} credits, but the copied years differ")
        result += copied
    return result


def merge_years(blocks: list[dict], degree_credits: int | None) -> list[dict]:
    # Blocks with no total of their own go together with the next block that has one (or, at
    # the end, with whatever the degree total leaves). A row from a block that covers fewer
    # years than the merged one gets a note saying when it's taken.
    groups, pending = [], []
    for block in blocks:
        pending.append(block)
        if block["credits"] is None:
            continue
        # A total that says which years it's for ("Total Credits in Third and Fourth Years")
        # leaves out an earlier block with no total (Conservation Biology's Second Year):
        # that one's total is its rows.
        if "total_for" in block:
            covered = set(year_numbers(block["total_for"]))
            while not set(year_numbers(pending[0]["title"])) <= covered:
                alone = pending.pop(0)
                alone["credits"] = sum(r["credits"] for r in alone["requirements"])
                groups.append([alone])
        groups.append(pending)
        pending = []
    if pending:
        if degree_credits is None:
            raise ValueError(f"No total for {[b['title'] for b in pending]}")
        pending[-1]["credits"] = degree_credits - sum(g[-1]["credits"] for g in groups)
        groups.append(pending)

    years = []
    for group in groups:
        numbers = sorted({n for b in group for n in year_numbers(b["title"])})
        requirements = []
        for block in group:
            for row in block["requirements"]:
                if len(group) > 1 and sorted(set(year_numbers(block["title"]))) != numbers:
                    row["notes"] = [f"In {block['title'].lower().removesuffix('s')}"] + row["notes"]
                requirements.append(row)
        year = {"title": year_title(numbers), "credits": group[-1]["credits"], "requirements": requirements}
        if "credits_text" in group[-1]:
            year["credits_text"] = group[-1]["credits_text"]
        years.append(year)
    return years


def parse_science(pages: dict[str, str]) -> list[dict]:
    # `pages`: each page's HTML, by the names in PAGES.
    headings = {p["table"] for p in PROGRAMS}
    tables = {name: read_tables(html, headings) for name, html in pages.items()}
    done, programs = {}, []
    for p in PROGRAMS:
        found = [t for t in tables[p["page"]] if t["heading"] == p["table"]]
        if len(found) != 1 or found[0]["version"] is not None:
            raise ValueError(f"Expected one table under {p['table']!r} on the {p['page']} page, found {len(found)}")
        table = found[0]
        years = merge_years(resolve_same_as(copy.deepcopy(table["blocks"]), done), table["degree_credits"])
        total = sum(y["credits"] for y in years)
        if table["degree_credits"] is not None and total != table["degree_credits"]:
            raise ValueError(f"{p['name']}: years add up to {total}, the degree to {table['degree_credits']}")
        done[p["id"]] = years
        programs.append({
            "id": p["id"],
            "name": p["name"],
            "heading": p["heading"],
            "sources": [PAGES[p["page"]]],
            "notes": [],
            "total_credits": total,
            "years": years,
        })
    return programs
