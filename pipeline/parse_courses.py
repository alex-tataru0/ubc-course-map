import re
from bs4 import BeautifulSoup

# Matches "CPSC_V 210 (4)" → ("CPSC", "210", "4"). Credits can be ranges like "1-6".
HEADING = re.compile(r"([A-Z]{2,4})_V\s+(\d{3}[A-Z]?)\s+\(([\d.\-]+)\)")


def full_links(tag) -> None:
    # The calendar shortens long link texts with "…", e.g.
    # "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/facult…".
    # Put the link's real address in their place, so the text has a working link.
    for a in tag.find_all("a"):
        href = a.get("href", "")
        if href.startswith("http") and a.get_text(strip=True).endswith(("…", "...")):
            a.string = href


def parse_course_list(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    courses = []
    for article in soup.select("article.node--type-course"):
        h3 = article.find("h3")
        match = HEADING.search(h3.get_text(" ", strip=True))
        if match is None:
            raise ValueError(f"Unexpected heading: {h3.get_text(strip=True)}")
        subject, number, credits = match.groups()
        p = article.find("p")
        if p:
            full_links(p)
        courses.append({
            "code": f"{subject} {number}",
            "credits": credits,
            "title": h3.find("strong").get_text(strip=True),
            "description": p.get_text(" ", strip=True) if p else "",
        })
    return courses