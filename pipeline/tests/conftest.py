from pathlib import Path
import pytest
from parse_courses import parse_course_list

HTML_PATH = Path(__file__).parents[2] / "data" / "raw" / "cpsc.html"


# pytest shares fixtures in conftest.py with every test file in this folder.
# scope="session" means the HTML is parsed once for the whole test run.
@pytest.fixture(scope="session")
def courses():
    html = HTML_PATH.read_text(encoding="utf-8")
    return {c["code"]: c for c in parse_course_list(html)}
