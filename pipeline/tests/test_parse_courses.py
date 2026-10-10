def test_finds_every_course(courses):
    assert len(courses) == 112


def test_cpsc_210(courses):
    c = courses["CPSC 210"]
    assert c["title"] == "Software Construction"
    assert c["credits"] == "4"
    assert c["description"].endswith("Prerequisite: One of CPSC 107, CPSC 110.")


def test_grad_course_with_zero_credits(courses):
    assert courses["CPSC 649"]["credits"] == "0"
