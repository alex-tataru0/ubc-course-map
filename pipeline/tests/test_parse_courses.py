from pathlib import Path
import pytest
from parse_courses import parse_course_list

HTML_PATH = Path(__file__).parents[2] / "data" / "raw" / "cpsc.html"


@pytest.fixture(scope="module")
def courses():
    html = HTML_PATH.read_text(encoding="utf-8")
    return {c["code"]: c for c in parse_course_list(html)}


def test_finds_every_course(courses):
    assert len(courses) == 112


def test_cpsc_210(courses):
    c = courses["CPSC 210"]
    assert c["title"] == "Software Construction"
    assert c["credits"] == "4"
    assert c["description"].endswith("Prerequisite: One of CPSC 107, CPSC 110.")


def test_grad_course_with_zero_credits(courses):
    assert courses["CPSC 649"]["credits"] == "0"