from parse_courses import parse_course_list


def test_finds_every_course(courses):
    assert len(courses) == 112


def test_cpsc_210(courses):
    c = courses["CPSC 210"]
    assert c["title"] == "Software Construction"
    assert c["credits"] == "4"
    assert c["description"].endswith("Prerequisite: One of CPSC 107, CPSC 110.")


def test_grad_course_with_zero_credits(courses):
    assert courses["CPSC 649"]["credits"] == "0"


EXCLUSION_LISTS = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/"
    "faculty-science/bachelor-science/credit-exclusion-lists"
)


def test_shortened_link_gets_its_full_address(courses):
    # The calendar shows this link as ".../faculties-colleges-and-schools/facult…".
    description = courses["CPSC 320"]["description"]
    assert EXCLUSION_LISTS in description
    assert "…" not in description


def test_only_shortened_links_change():
    html = (
        '<article class="node--type-course"><h3><strong>Demo</strong> CPSC_V 100 (3)</h3>'
        '<p>See <a href="https://example.com/a/very/long/page">https://example.com/a/ve…</a>, '
        '<a href="https://example.com/b">https://example.com/b</a> and '
        '<a href="/local">the rules…</a>.</p></article>'
    )
    [course] = parse_course_list(html)
    assert course["description"] == (
        "See https://example.com/a/very/long/page , https://example.com/b and the rules… ."
    )
