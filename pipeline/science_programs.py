import copy
import re

from program_tables import read_tables

# The Science programs on the site besides Computer Science's own: the Majors and Honours of
# the subjects with maps, and the Combined Majors and Honours that have their own table, from
# the subjects' pages in the calendar's Bachelor of Science section. Combined programs that
# pair a subject with "Another Science Subject" have no fixed courses, so they aren't here.
# Each program is one table under its heading. Some tables say a year is "Same as for Biology
# Major (3095)" instead of listing it, and some split the upper years into "Third Year",
# "Third or Fourth Years" and "Fourth Year" with one total for all of them; those are put
# together as one year, and each row from a single-year block gets a note ("In third year").

BASE = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-science/"
    "bachelor-science/"
)
PAGES = {name: BASE + name for name in [
    "astronomy", "atmospheric-science", "biochemistry", "biology", "chemistry",
    "computer-science", "data-science", "earth-and-ocean-sciences", "environmental-sciences",
    "geological-sciences", "geophysics", "mathematics", "microbiology-and-immunology",
    "oceanography", "physics", "statistics",
]}


def program(id: str, name: str, page: str, heading: str, table: str | None = None,
            subjects: list[str] | None = None) -> dict:
    # `heading` is the calendar's heading for the program. `table` is the heading right above
    # its table, when that's a different one (Data Science's is "Specialization Requirements";
    # Geophysics Honours' has a footnote mark). `subjects`: for a combined program, the subjects
    # on the site it belongs to (Oceanography's courses are EOSC; BIOC and ECON aren't on the
    # site). The id starts with the first one.
    return {"id": id, "name": name, "page": page, "heading": heading, "table": table or heading,
            "subjects": subjects}


def combined(id: str, name: str, page: str, heading: str, subjects: list[str]) -> dict:
    assert id.split("-")[0] == subjects[0].lower(), id
    return program(id, name, page, heading, subjects=subjects)


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
    # Combined Majors and Honours, by the page their table is on.
    combined("atsc-cpsc-honours", "Combined Honours in Atmospheric Science and Computer Science",
             "atmospheric-science",
             "Combined Honours (1372): Atmospheric Science and Computer Science (ATSC, CPSC)",
             ["ATSC", "CPSC"]),
    combined("chem-bioc-major", "Combined Major in Biochemistry and Chemistry", "biochemistry",
             "Combined Major (3382): Biochemistry and Chemistry (BIOC, CHEM)", ["CHEM"]),
    combined("chem-bioc-honours", "Combined Honours in Biochemistry and Chemistry", "biochemistry",
             "Combined Honours (0565): Biochemistry and Chemistry (BIOC, CHEM)", ["CHEM"]),
    combined("cpsc-biol-major", "Combined Major in Computer Science and Biology", "biology",
             "Combined Major (1370): Computer Science and Biology", ["CPSC", "BIOL"]),
    combined("cpsc-biol-honours", "Combined Honours in Computer Science and Biology", "biology",
             "Combined Honours (1460): Computer Science and Biology", ["CPSC", "BIOL"]),
    combined("chem-biol-major", "Combined Major in Chemical Biology", "chemistry",
             "Combined Major (3340): Chemical Biology (CHEM, BIOL)", ["CHEM", "BIOL"]),
    combined("chem-biol-honours", "Combined Honours in Chemical Biology", "chemistry",
             "Combined Honours (3132): Chemical Biology (CHEM, BIOL)", ["CHEM", "BIOL"]),
    combined("chem-math-honours", "Combined Honours in Chemistry and Mathematics", "chemistry",
             "Combined Honours (0206): Chemistry and Mathematics (CHEM, MATH)", ["CHEM", "MATH"]),
    combined("cpsc-chem-major", "Combined Major in Computer Science and Chemistry", "computer-science",
             "Combined Major (3401): Computer Science and Chemistry (CPSC, CHEM)", ["CPSC", "CHEM"]),
    combined("cpsc-phys-major", "Combined Major in Computer Science and Physics", "computer-science",
             "Combined Major (1391): Computer Science and Physics", ["CPSC", "PHYS"]),
    combined("cpsc-stat-major", "Combined Major in Computer Science and Statistics", "computer-science",
             "Combined Major (1375): Computer Science and Statistics", ["CPSC", "STAT"]),
    combined("cpsc-math-honours", "Combined Honours in Computer Science and Mathematics",
             "computer-science",
             "Combined Honours (0021): Computer Science and Mathematics (CPSC, MATH)", ["CPSC", "MATH"]),
    combined("cpsc-phys-honours", "Combined Honours in Computer Science and Physics", "computer-science",
             "Combined Honours (0138): Computer Science and Physics (CPSC, PHYS)", ["CPSC", "PHYS"]),
    combined("cpsc-stat-honours", "Combined Honours in Computer Science and Statistics",
             "computer-science",
             "Combined Honours (1376): Computer Science and Statistics (CPSC, STAT)", ["CPSC", "STAT"]),
    combined("math-econ-major", "Combined Major in Mathematics and Economics", "mathematics",
             "Combined Major (1135): Mathematics and Economics (MATH, ECON)", ["MATH"]),
    combined("cpsc-math-major", "Combined Major in Computer Science and Mathematics", "mathematics",
             "Combined Major (1429): Computer Science and Mathematics", ["CPSC", "MATH"]),
    combined("cpsc-micb-major", "Combined Major in Computer Science and Microbiology and Immunology",
             "microbiology-and-immunology",
             "Combined Major (1371): Computer Science & Microbiology and Immunology", ["CPSC", "MICB"]),
    combined("cpsc-micb-honours", "Combined Honours in Computer Science and Microbiology and Immunology",
             "microbiology-and-immunology",
             "Combined Honours (1373): Computer Science & Microbiology and Immunology", ["CPSC", "MICB"]),
    combined("micb-eosc-major", "Combined Major in Microbiology and Oceanography",
             "microbiology-and-immunology",
             "Combined Major (3144): Microbiology and Oceanography", ["MICB", "EOSC"]),
    combined("eosc-biol-major", "Combined Major in Oceanography and Biology", "oceanography",
             "Combined Major (3125): Oceanography and Biology", ["EOSC", "BIOL"]),
    combined("eosc-chem-major", "Combined Major in Oceanography and Chemistry", "oceanography",
             "Combined Major (3383): Oceanography and Chemistry", ["EOSC", "CHEM"]),
    combined("eosc-phys-major", "Combined Major in Oceanography and Physics", "oceanography",
             "Combined Major (3126): Oceanography and Physics", ["EOSC", "PHYS"]),
    combined("eosc-biol-honours", "Combined Honours in Oceanography and Biology", "oceanography",
             "Combined Honours (0535): Oceanography and Biology (OCGY, BIOL)", ["EOSC", "BIOL"]),
    combined("phys-biop-honours", "Combined Honours in Biophysics", "physics",
             "Combined Honours (3676): Biophysics (BIOP)", ["PHYS"]),
    combined("phys-astr-honours", "Combined Honours in Physics and Astronomy", "physics",
             "Combined Honours (0009): Physics and Astronomy (PHYS, ASTR)", ["PHYS", "ASTR"]),
    combined("phys-chem-honours", "Combined Honours in Chemical Physics", "physics",
             "Combined Honours (0517): Chemical Physics (PHYS, CHEM)", ["PHYS", "CHEM"]),
    combined("phys-math-honours", "Combined Honours in Physics and Mathematics", "physics",
             "Combined Honours (0014): Physics and Mathematics (PHYS, MATH)", ["PHYS", "MATH"]),
    combined("stat-econ-major", "Combined Major in Statistics and Economics", "statistics",
             "Combined Major (1330): Statistics and Economics", ["STAT"]),
    combined("math-stat-honours", "Combined Honours in Mathematics and Statistics", "statistics",
             "Combined Honours (0550): Mathematics and Statistics (MATH, STAT)", ["MATH", "STAT"]),
]

# Years whose total in the calendar doesn't match their rows: the rows' sum is used, with a
# note. Computer Science and Chemistry's third and fourth years say 47, but the rows add up to
# 46, which also makes the degree's 120.
CREDIT_FIXES = {
    ("cpsc-chem-major", "Third and Fourth Years"): (
        46, "The calendar gives 47 credits for third and fourth years, but their rows add up to 46."),
}

# Rows whose bracket is in the wrong place: it gives choices for MATH 131, not MATH 215 (the
# row is 9 credits, three courses). The fixed wording is used, with a note quoting the calendar.
TEXT_FIXES = {
    ("cpsc-math-honours", "MATH 131, 215, (or one of 111, 221, 223), 227 (or 317)"):
        "MATH 131 (or one of 111, 221, 223), 215, 227 (or 317)",
}

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
        notes = list(table["minimums"])
        blocks = copy.deepcopy(table["blocks"])
        for block in blocks:
            fix = CREDIT_FIXES.get((p["id"], block["title"]))
            if fix:
                block["credits"] = fix[0]
                notes.append(fix[1])
        for block in blocks:
            for row in block["requirements"]:
                fixed = TEXT_FIXES.get((p["id"], row["text"]))
                if fixed:
                    row["notes"].insert(0, f'The calendar writes "{row["text"]}".')
                    row["text"] = fixed
        years = merge_years(resolve_same_as(blocks, done), table["degree_credits"])
        total = sum(y["credits"] for y in years)
        if table["degree_credits"] is not None and total != table["degree_credits"]:
            raise ValueError(f"{p['name']}: years add up to {total}, the degree to {table['degree_credits']}")
        done[p["id"]] = years
        programs.append({
            "id": p["id"],
            "name": p["name"],
            "heading": p["heading"],
            **({"subjects": p["subjects"]} if p["subjects"] else {}),
            "sources": [PAGES[p["page"]]],
            "notes": notes,
            "total_credits": total,
            "years": years,
        })
    return programs
