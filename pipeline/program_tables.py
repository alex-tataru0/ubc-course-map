import re

from bs4 import BeautifulSoup

from parse_programs import clean, is_footnote, read_cell

# Reads every requirement table on a calendar program page, for pages where the programs are
# put together from tables in different places (engineering: first year on one page, second
# to fourth year on the department's). parse_programs.py reads the Computer Science page,
# which says which years are "Same as" others instead.
#
# A table holds one or more blocks, each starting with a title row with no credits ("First
# Year", "For Electrical Engineering"), then one row per requirement with its credits, and a
# "Total Credits" row. Numbered footnotes come at the bottom of the table. Science tables can
# also end with "Total Credits for Degree", and give one total for several blocks ("Total
# Credits in Third and Fourth Years", put on the last of them).

# "Total Credits", "Total Credits for Degree", "Minimum Credits for Degree", "Total Credits in
# Third and Fourth Years", "Total credits for the degree". Group 1 is what the total is for,
# if the row says.
TOTAL = re.compile(r"(?:Total|Minimum) Credits(?: (?:for|in) (?:the )?(.+))?", re.IGNORECASE)

# "Minimum total credits for second year" (Computer Science and Microbiology) is a floor for
# part of a block, not its total, so it's kept as a note about the program.
MINIMUM = re.compile(r"Minimum total credits (?:for|in) (.+)", re.IGNORECASE)


def read_credits(text: str) -> tuple[int | None, str | None]:
    # "4" → (4, None). "3 or 5" (MECH 226 or 227) → (3, "3 or 5"): the smaller number, plus
    # the calendar's wording to show. Empty → (None, None).
    text = " ".join(text.split())
    if not text:
        return None, None
    if text.isdigit():
        return int(text), None
    numbers = [int(n) for n in re.findall(r"\d+", text)]
    if not numbers:
        raise ValueError(f"Unexpected credits: {text!r}")
    return min(numbers), text


def read_blocks(table) -> list[dict]:
    return read_table(table)["blocks"]


def read_table(table) -> dict:
    # The table's blocks, the degree's total credits if the table gives it (else None), and
    # any minimums ("Minimum total credits for second year" 30 → "At least 30 credits in
    # second year.").
    blocks, footnotes, degree_credits, minimums = [], {}, None, []
    for tr in table.find_all("tr"):
        # Title rows are <th> on some pages and <td> on others.
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        first = cells[0]
        if is_footnote(first):
            n = int(first.find("sup").get_text().strip())
            footnotes[n] = clean(first.get_text(" ")).removeprefix(str(n)).strip()
            continue
        text, marks = read_cell(first)
        if not text:
            continue  # the empty row between third and fourth year
        credits, credits_text = read_credits(cells[1].get_text() if len(cells) > 1 else "")
        total, minimum = TOTAL.fullmatch(text), MINIMUM.fullmatch(text)
        if minimum:
            minimums.append(f"At least {credits} credits in {minimum[1].lower()}.")
        elif total and (total[1] or "").lower() == "degree":
            degree_credits = credits
        elif total:
            blocks[-1]["credits"] = credits
            if total[1]:
                blocks[-1]["total_for"] = total[1]  # e.g. "Third and Fourth Years"
            if credits_text:
                blocks[-1]["credits_text"] = credits_text
        elif credits is None:
            blocks.append({"title": text, "credits": None, "requirements": []})
        else:
            if not blocks:
                raise ValueError(f"A requirement before any title: {text!r}")
            row = {"text": text, "credits": credits, "notes": marks}
            if credits_text:
                row["credits_text"] = credits_text
            blocks[-1]["requirements"].append(row)

    # Swap each footnote number for the footnote's text. A mark with no footnote is left out:
    # Computer Engineering's second year marks "Electives" with a 1 that the calendar never
    # gives.
    for block in blocks:
        for row in block["requirements"]:
            row["notes"] = [footnotes[n] for n in row["notes"] if n in footnotes]
    return {"blocks": blocks, "degree_credits": degree_credits, "minimums": minimums}


def is_requirement_table(table) -> bool:
    # A requirement table has a requirement and its credits on each row (Biomedical
    # Engineering's add an empty third column). Others, like Engineering Physics' co-op
    # schedule ("Year | Term 1 | Term 2 | Summer"), are left out.
    return all(sum(1 for cell in tr.find_all(["td", "th"]) if cell.get_text(strip=True)) <= 2
               for tr in table.find_all("tr"))


def read_tables(html: str, headings: set[str] | None = None) -> list[dict]:
    # Every table on the page, in order, with the heading above it ("Computer Engineering",
    # "Aerospace Option") and the "For students who started third year in 2026W or later:"
    # line just before it, if there is one. With `headings`, only the tables under those
    # headings are read (some pages have other tables, like a list of subjects).
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main") or soup
    heading, version, tables = None, None, []
    for element in main.find_all(["h3", "h4", "p", "table"]):
        if element.find_parent("table") is not None:
            continue
        if element.name in ("h3", "h4"):
            heading, version = element.get_text(" ", strip=True), None
        elif element.name == "p":
            text = clean(element.get_text(" "))
            if text.startswith("For students who"):
                version = text.rstrip(":")
        elif (headings is None or heading in headings) and is_requirement_table(element):
            tables.append({"heading": heading, "version": version, **read_table(element)})
    return tables
