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
# "Total Credits" row. Numbered footnotes come at the bottom of the table.


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
    blocks, footnotes = [], {}
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
        if text == "Total Credits":
            blocks[-1]["credits"] = credits
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
    return blocks


def read_tables(html: str) -> list[dict]:
    # Every table on the page, in order, with the heading above it ("Computer Engineering",
    # "Aerospace Option") and the "For students who started third year in 2026W or later:"
    # line just before it, if there is one.
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
        else:
            tables.append({"heading": heading, "version": version, "blocks": read_blocks(element)})
    return tables
