import html
import re

# The Arts Majors on the site: one Major for each Arts subject with a map (WRDS only has a
# Minor), from the subjects' pages in the calendar's Bachelor of Arts section (Economics is in
# the Vancouver School of Economics section). English's Major comes in three emphases; the
# Literature emphasis is here.
#
# Unlike the Science and engineering pages, these pages have no requirement tables: they list
# the requirements in sentences and bullet points. So each program is written out here by hand,
# row by row. Rows quote the calendar (`row`), and parse_arts checks that every quote is still on
# the saved page, so a new calendar year that changes a program stops the build. When the
# calendar says "12 credits …, including A and B", A and B get their own rows and the rest
# becomes a row in our own words (`rest`), with the calendar's sentence in its note, since a
# course only counts toward one row.
#
# Every Major ends with the rest of the B.A.'s 120 credits as electives. The Faculty of Arts
# requirements (writing, breadth, …) aren't tracked yet.

BASE = "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/faculty-arts/bachelor-arts/"
ECONOMICS = (
    "https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools/vancouver-school-economics/"
    "bachelor-arts-economics"
)
PAGES = {name: BASE + name for name in [
    "anthropology", "english", "history", "human-geography", "linguistics", "philosophy",
    "political-science", "psychology", "sociology",
]} | {"bachelor-arts-economics": ECONOMICS}

DEGREE_CREDITS = 120


def row(text: str, credits: int, tree, notes: tuple[str, ...] = ()) -> dict:
    # A requirement in the calendar's words (without "_V" and footnote marks).
    return {"text": text, "credits": credits, "tree": tree, "notes": list(notes), "quoted": True}


def rest(text: str, credits: int, tree, sentence: str) -> dict:
    # The rest of a calendar requirement after the rows it names, in our own words.
    return {"text": text, "credits": credits, "tree": tree, "quoted": False,
            "notes": [f"The rest of the calendar's \"{sentence}\""]}


def reworded(text: str, credits: int, tree, sentence: str) -> dict:
    # A calendar requirement split up or put another way, in our own words.
    return {"text": text, "credits": credits, "tree": tree, "quoted": False,
            "notes": [f"The calendar says: \"{sentence}\""]}


def with_note(r: dict, note: str) -> dict:
    return r | {"notes": r["notes"] + [note]}


# A footnote on two of the Philosophy rows. The website leaves out courses that a row's note
# says "can not be used", "will not count", "is not permitted" or "may not be included".
PHIL_400 = ("Credit for PHIL 400 and PHIL 401 is not permitted toward any specialization in Philosophy, "
            "including the Major.")


def level(subjects: list[str], low: int, high: int | None = None) -> dict:
    spec = {"subjects": subjects, "min_level": low}
    return {"credits_of": spec | {"max_level": high} if high else spec}


def codes(subject: str, numbers: str) -> list[str]:
    # "SOCI", "380, 381, 382" → ["SOCI 380", "SOCI 381", "SOCI 382"]
    return [f"{subject} {n}" for n in re.findall(r"\d{3}", numbers)]


def major(id: str, name: str, page: str, heading: str, years: list[tuple[str, list[dict]]],
          notes: tuple[str, ...] = ()) -> dict:
    blocks = [{"title": title, "credits": sum(r["credits"] for r in rows), "requirements": rows}
              for title, rows in years]
    major_credits = sum(b["credits"] for b in blocks)
    electives = row("Electives", DEGREE_CREDITS - major_credits, {"electives": True}, (
        "The rest of the 120 credits for the B.A. All 120 credits must also meet the Faculty of "
        "Arts requirements (Writing and Research, Ways of Knowing Breadth, Outside, Upper-level "
        "and Arts Credit Minimum), which the site doesn't check yet.",
    ))
    electives["quoted"] = False
    blocks.append({"title": "Rest of the Degree", "credits": electives["credits"], "requirements": [electives]})
    return {"id": id, "name": name, "page": page, "heading": heading, "notes": list(notes),
            "total_credits": DEGREE_CREDITS, "years": blocks}


PROGRAMS = [
    major("anth-major", "Anthropology Major", "anthropology", "Major in Anthropology", [
        ("Lower-level Requirements", [
            row("ANTH 100 (3)", 3, "ANTH 100"),
            row("ARCL 103 (3) or ARCL 140 (3)", 3, {"one_of": ["ARCL 103", "ARCL 140"]}),
            row("6 credits chosen from other ANTH or ARCL courses at the 200-level", 6,
                level(["ANTH", "ARCL"], 200, 299)),
        ]),
        ("Upper-level Requirements", [
            row("ANTH 300 (3)", 3, "ANTH 300"),
            row("ANTH 400 (3)", 3, "ANTH 400"),
            row("3 credits in research methods and techniques: ANTH 317, 407, 408, 409, 417, 418, 431, "
                "433, 451, 452, 471, 478, 480; ARCL 306, 345, 405, 406, 419, 424, 425, 430, 495.", 3,
                {"credits_from": codes("ANTH", "317, 407, 408, 409, 417, 418, 431, 433, 451, 452, 471, 478, 480")
                 + codes("ARCL", "306, 345, 405, 406, 419, 424, 425, 430, 495")}),
            rest("21 more credits of upper-level ANTH or ARCL courses", 21, level(["ANTH", "ARCL"], 300),
                 "Students must complete at least 30 credits of upper-level ANTH or ARCL courses, including:"),
        ]),
    ]),
    major("econ-major", "Economics Major", "bachelor-arts-economics", "Major in Economics", [
        ("Lower-Level Requirements", [
            row("ECON 101 and 102", 6, {"all_of": ["ECON 101", "ECON 102"]}),
            row("ECON credits numbered 200 or above", 3, level(["ECON"], 200)),
            row("ECON 325", 3, "ECON 325"),
        ]),
        ("Upper-Level Requirements", [
            row("ECON 301 or 304", 3, {"one_of": ["ECON 301", "ECON 304"]}),
            row("ECON 302 or 305", 3, {"one_of": ["ECON 302", "ECON 305"]}),
            row("ECON 326", 3, "ECON 326"),
            row("ECON 490", 3, "ECON 490"),
            row("ECON Electives numbered 300 or above", 6, level(["ECON"], 300)),
            row("ECON Electives numbered 400 or above", 12, level(["ECON"], 400),
                ("ECON 457 will not count towards 400-level electives",)),
        ]),
    ], notes=(
        "Economics courses that (i) have been granted unassigned first-year transfer credit (e.g., "
        "ECON 1st), or (ii) have been taken on a Credit/D/Fail basis, may not be included in the 42 "
        "credits required for a program in Economics.",
    )),
    major("engl-literature-major", "English Major: Literature Emphasis", "english",
          "Major in English: Literature Emphasis", [
        ("Lower-Level Requirements", [
            row("6 credits of 100-level English; or Arts One (6 credits); or CAP 100 and 101 (6 credits); "
                "or 3 credits of CAP 100 and 3 credits of 100-level English; or 3 credits of WRDS 150, 151 "
                "or 350 and 3 credits of 100-level English; or 6 credits of ASTU 100; or 3 credits of ASTU "
                "100 or 101 and 3 credits of 100-level English", 6,
                {"credits_from": ["ENGL 100-199", "CAP 100", "CAP 101", "WRDS 150", "WRDS 151", "WRDS 350",
                                  "ASTU 100", "ASTU 101"]},
                ("The site counts any 6 credits from these courses. The calendar allows only 3 credits "
                 "of WRDS, and Arts One (not a course code here) counts for all 6.",)),
            row("3 credits of ENGL 200", 3, "ENGL 200"),
            row("3 credits selected from ENGL 220-249", 3, {"credits_from": ["ENGL 220-249"]}),
        ]),
        ("Upper-Level Requirements", [
            reworded("3 credits from Group A (Medieval and Renaissance Literatures: ENGL 343 to 350)", 3,
                     {"credits_from": ["ENGL 343-350"]},
                     "12 credits comprising 3 credits selected from each of Group A, B, C, and D above"),
            reworded("3 credits from Group B (18th- and 19th-Century Literatures: ENGL 351 to 364)", 3,
                     {"credits_from": ["ENGL 351-364"]},
                     "12 credits comprising 3 credits selected from each of Group A, B, C, and D above"),
            reworded("3 credits from Group C (Modern, Contemporary, Transnational, and Indigenous Literatures: "
                     "ENGL 365 to 379)", 3, {"credits_from": ["ENGL 365-379"]},
                     "12 credits comprising 3 credits selected from each of Group A, B, C, and D above"),
            reworded("3 credits from Group D (Media, Theory, Genre, and Special Topic: ENGL 332 to 339; ENGL 380 "
                     "to 397)", 3, {"credits_from": ["ENGL 332-339", "ENGL 380-397"]},
                     "12 credits comprising 3 credits selected from each of Group A, B, C, and D above"),
            row("3 additional credits from either Group A or Group B", 3, {"credits_from": ["ENGL 343-364"]}),
            row("3 additional credits from either Group C or Group D", 3,
                {"credits_from": ["ENGL 365-379", "ENGL 332-339", "ENGL 380-397"]}),
            row("3 credits of Canadian Literature selected from ENGL 222, 360, 371, 372, 373, 394", 3,
                {"credits_from": codes("ENGL", "222, 360, 371, 372, 373, 394")},
                ("Or any other pre-approved course in which there is a large selection of Canadian "
                 "Literature; please see a Majors Advisor.",
                 "ENGL 222 may be used to satisfy the Canadian Literature requirement, but does not count "
                 "towards the required 30 credits of upper-level ENGL; please see a Majors Advisor.")),
            row("3 credits of ENGL 490", 3, "ENGL 490"),
            row("6 additional credits of upper-level ENGL", 6, level(["ENGL"], 300)),
        ]),
    ]),
    major("geog-human-major", "Human Geography Major", "human-geography", "Major in Human Geography", [
        ("Lower-level Requirements", [
            row("at least 9 credits from GEOG 121, 122, 202, 210, 211, 220, 250, 257, 281, 290, URST 200", 9,
                {"credits_from": codes("GEOG", "121, 122, 202, 210, 211, 220, 250, 257, 281, 290") + ["URST 200"]}),
            row("6 credits from GEOB/GEOS 102*, 103*", 6,
                {"credits_from": ["GEOS 102", "GEOS 103", "GEOB 102", "GEOB 103"]},
                ("As of 2021S, the course code GEOS replaced the course code GEOB.",
                 "*Students may obtain credit for only one of GEOB/GEOS 102 or EOSC 112 and only one of "
                 "GEOB/GEOS 103 or EOSC 110.")),
        ]),
        ("Upper-level Requirements", [
            reworded("6 credits from Cultures and Places: GEOG 321, 327, 328, 329, 342, 352, 380, 390, 391, 395, "
                     "396, 419, 423, 426, 429, 432, 439, 456, 481, 484, 485, 495, 496, 497, 498, URST 352", 6,
                     {"credits_from": codes("GEOG", "321, 327, 328, 329, 342, 352, 380, 390, 391, 395, 396, 419, "
                                                    "423, 426, 429, 432, 439, 456, 481, 484, 485, 495, 496, 497, 498")
                      + ["URST 352"]},
                     "6 credits from each of the three themes (Cultures and Places, Cities and Globalization, "
                     "Nature and Society)"),
            reworded("6 credits from Cities and Globalization: GEOG 321, 329, 342, 350, 351, 352, 353, 355, 357, 361, "
                     "362, 364, 380, 391, 396, 450, 453, 456, 457, 461, 493, 496, URST 352, 400", 6,
                     {"credits_from": codes("GEOG", "321, 329, 342, 350, 351, 352, 353, 355, 357, 361, 362, 364, "
                                                    "380, 391, 396, 450, 453, 456, 457, 461, 493, 496")
                      + ["URST 352", "URST 400"]},
                     "6 credits from each of the three themes (Cultures and Places, Cities and Globalization, "
                     "Nature and Society)"),
            reworded("6 credits from Nature and Society: GEOG 302, 310, 311, 312, 313, 314, 316, 318, 319, 351, 361, "
                     "395, 396, 410, 412, 418, 419, 423, 432, 496, 497, GEOS 415", 6,
                     {"credits_from": codes("GEOG", "302, 310, 311, 312, 313, 314, 316, 318, 319, 351, 361, 395, "
                                                    "396, 410, 412, 418, 419, 423, 432, 496, 497") + ["GEOS 415"]},
                     "6 credits from each of the three themes (Cultures and Places, Cities and Globalization, "
                     "Nature and Society)"),
            reworded("3 credits from Research and Methods A: GEOS 370, 372, 373, 472, 479, GEOG 374, 450", 3,
                     {"credits_from": codes("GEOS", "370, 372, 373, 472, 479") + ["GEOG 374", "GEOG 450"]},
                     "6 credits from the Research and Methods theme with 3 credits from concentration A and 3 "
                     "credits from concentration B"),
            reworded("3 credits from Research and Methods B: GEOG 315, 342, 345, 371, 424, 446, URST 400", 3,
                     {"credits_from": codes("GEOG", "315, 342, 345, 371, 424, 446") + ["URST 400"]},
                     "6 credits from the Research and Methods theme with 3 credits from concentration A and 3 "
                     "credits from concentration B"),
            rest("6 more credits of 300- or 400-level geography (GEOG/GEOS) courses", 6,
                 level(["GEOG", "GEOS", "GEOB"], 300),
                 "At least 30 credits of 300- or 400-level geography (GEOG/GEOB/GEOS) courses:"),
        ]),
    ], notes=(
        "No course can be counted twice to meet credit requirements in Cultures and Places, Cities and "
        "Globalization, Nature and Society, or within the A and B categories of the Research and Methods "
        "theme.",
    )),
    major("hist-major", "History Major", "history", "Major in History", [
        ("Lower-level Requirements", [
            reworded("At least 6 credits of 200-level History", 6, level(["HIST"], 200, 299),
                     "Students must take 12 credits from any of the 100- or 200-level courses in History, or "
                     "the equivalent taken at other institutions. At least 6 of these credits must be at the "
                     "200 level."),
            rest("6 more credits of 100- or 200-level History", 6, level(["HIST"], 100, 299),
                 "Students must take 12 credits from any of the 100- or 200-level courses in History"),
        ]),
        ("Upper-level Requirements", [
            row("3 credits of HIST 403, 466, 468, or 490, to be taken in the final year of study", 3,
                {"credits_from": codes("HIST", "403, 466, 468, 490")}),
            row("Students must take 6 credits of substantially pre-modern history.", 6,
                {"other": "6 credits of substantially pre-modern history"},
                ("A list of courses with substantial pre-modern content is available from departmental "
                 "advisors and on the Departmental website.",)),
            rest("21 more credits of 300- and 400-level History courses", 21, level(["HIST"], 300),
                 "Students must take 30 credits of 300- and 400- level History courses."),
        ]),
    ], notes=(
        "Subject to the approval of the Department, a maximum of 6 credits from other departments may be "
        "accepted as credits toward a Major in History.",
    )),
    major("ling-major", "Linguistics Major", "linguistics", "Major in Linguistics", [
        ("Language Requirement", [
            row("6 credits of coursework in a single language other than English", 6,
                {"other": "6 credits of coursework in a single language other than English"},
                ("Courses may be taken in any non-English language and at any level. Courses that say "
                 "\"in English\" or \"in translation\" can't be used. They may also count toward the "
                 "Faculty of Arts Ways of Knowing Breadth Requirement.",)),
        ]),
        ("Required Courses", [
            row("both LING 200 and 201", 6, {"all_of": ["LING 200", "LING 201"]}),
            row("all of LING 300, 311, 313, 327, and 333", 15,
                {"all_of": codes("LING", "300, 311, 313, 327, 333")}),
            row("LING 447", 3, "LING 447"),
            row("an additional 18 credits of courses numbered 300 or higher, of which 6 may be taken from "
                "upper-level courses in related areas", 18, level(["LING"], 300),
                ("The site counts LING courses only; up to 6 credits may come from related areas (see the "
                 "Department of Linguistics website).",)),
        ]),
    ], notes=("100-level LING courses do not count toward Honours, Major or Minor programs in Linguistics.",)),
    major("phil-major", "Philosophy Major", "philosophy", "Major in Philosophy", [
        ("Area Requirements", [
            row("Symbolic Logic: PHIL 220 or 222", 3, {"one_of": ["PHIL 220", "PHIL 222"]}),
            row("Value Theory: at least one of PHIL 230 or 330", 3, {"one_of": ["PHIL 230", "PHIL 330"]}),
            row("Epistemology/Metaphysics: at least one of PHIL 240 or 340", 3,
                {"one_of": ["PHIL 240", "PHIL 340"]}),
            row("History of Philosophy: at least 6 credits from PHIL 310, 311, 313, 314, 315, 316, 371, 378, "
                "388, or ASIA 372", 6,
                {"credits_from": codes("PHIL", "310, 311, 313, 314, 315, 316, 371, 378, 388") + ["ASIA 372"]}),
        ]),
        ("Research Requirement", [
            row("Research Seminar: at least one of PHIL 418, 426, 431, 432, 440, 450, 452, 455, 469, or 491",
                3, {"one_of": codes("PHIL", "418, 426, 431, 432, 440, 450, 452, 455, 469, 491")}),
        ]),
        ("Additional Philosophy", [
            with_note(rest("21 more upper-level PHIL credits", 21, level(["PHIL"], 300),
                           "Students are required to complete a total of 30 upper-level credits in "
                           "Philosophy including any upper-level courses taken to meet the Area Requirements "
                           "or the Research Requirement."), PHIL_400),
            with_note(rest("3 more PHIL credits at any level", 3, level(["PHIL"], 100),
                           "students must complete additional courses in Philosophy at any level in order "
                           "to meet the total number of credits (42) required for the Major."), PHIL_400),
        ]),
    ], notes=(
        "The rows assume the Area Requirements' PHIL 220/222, 230 and 240 are taken at the 200 level. Each "
        "of PHIL 330 or 340 used for an area also counts toward the 30 upper-level credits, so you'd need "
        "fewer than shown.",
    )),
    major("poli-major", "Political Science Major", "political-science", "Major in Political Science", [
        ("Lower-level Requirements", [
            row("POLI 100", 3, "POLI 100"),
            row("POLI 101", 3, "POLI 101"),
            row("POLI 110", 3, "POLI 110"),
            row("POLI 240 (or 340)", 3, {"one_of": ["POLI 240", "POLI 340"]},
                ("Students who have not completed POLI 240 may substitute POLI 340 for POLI 240, although "
                 "they are still required to complete a total of 12 POLI credits at the 100- and 200-level.",)),
        ]),
        ("Upper-level Requirements", [
            row("POLI 380", 3, "POLI 380"),
            reworded("One 400-level POLI course", 3, level(["POLI"], 400),
                     "To satisfy the Bachelor of Arts Writing and Research Requirement, students must take at "
                     "least one 400-level POLI course."),
            rest("24 more credits of Political Science courses numbered 300 or higher", 24, level(["POLI"], 300),
                 "30 credits of Political Science courses numbered 300 or higher, which must include:"),
        ]),
    ]),
    major("psyc-major", "Psychology Major", "psychology", "Major in Psychology", [
        ("Lower Level Requirements", [
            row("either PSYC 100; or PSYC 101 and PSYC 102", 6,
                {"one_of": ["PSYC 100", {"all_of": ["PSYC 101", "PSYC 102"]}]}),
            row("Quantitative Methods courses: PSYC 217 and 218", 6, {"all_of": ["PSYC 217", "PSYC 218"]}),
        ]),
        ("Upper Level Requirements", [
            reworded("6 credits from Behavioural Neuroscience (PSYC 301, 304, 306, 324, 344, 361, 363, 460, 461, "
                     "462, 466, 472) or Cognitive Science (PSYC 309, 321, 333, 335, 336, 365, 367, 368, 409, 421, "
                     "463)", 6,
                     {"credits_from": codes("PSYC", "301, 304, 306, 324, 344, 361, 363, 460, 461, 462, 466, 472, "
                                                    "309, 321, 333, 335, 336, 365, 367, 368, 409, 421, 463")},
                     "At least 6 credits from the following two lists:"),
            with_note(reworded("6 credits from each of two of: Clinical/Health, Developmental, "
                               "Foundations/Psychometrics, Personality/Social", 12,
                               {"other": "6 credits from each of two of the lists Clinical/Health, "
                                         "Developmental, Foundations/Psychometrics and Personality/Social"},
                               "At least 6 credits from each of two of the following four lists:"),
                      "The lists: Clinical/Health: PSYC 300, 311, 314, 331, 350, 400, 401, 402, 469. "
                      "Developmental: PSYC 302, 315, 319, 320, 322, 325, 412, 413, 414. "
                      "Foundations/Psychometrics: PSYC 303, 312, 359. Personality/Social: PSYC 305, 307, 308, "
                      "358, 403, 404, 407, 408, 415, 418."),
            with_note(rest("12 more credits of 300- and 400-level PSYC", 12, level(["PSYC"], 300),
                           "Students must take a minimum of 30 credits in 300- and/or 400-level courses "
                           "including:"),
                      "PSYC 340, 388, 440, or 488 may not be included for the minimum 30 Psychology "
                      "credits required for the Major Program."),
        ]),
    ]),
    major("soci-major", "Sociology Major", "sociology", "Major in Sociology", [
        ("Lower-level Requirements", [
            row("At least 3 credits from SOCI 100, 101, or 102", 3,
                {"credits_from": codes("SOCI", "100, 101, 102")}),
            row("SOCI 217 Research Methods", 3, "SOCI 217"),
            rest("6 more credits of 100- and 200-level SOCI", 6, level(["SOCI"], 100, 299),
                 "12 credits of 100-and 200-level SOCI, including:"),
        ]),
        ("Upper-level Requirements", [
            row("3 credits of SOCI 310 Canadian Society", 3, "SOCI 310"),
            row("3 credits of SOCI 328 Social Statistics I", 3, "SOCI 328"),
            row("3 credits of classical sociological theory (from SOCI 370* or SOCI 371)", 3,
                {"credits_from": ["SOCI 370", "SOCI 371"]},
                ("SOCI 370 is a 6-credit course that covers both classical sociological theory and "
                 "contemporary sociological theory.",)),
            row("3 credits of contemporary sociological theory (from SOCI 370*, SOCI 372, SOCI 414, SOCI 415, "
                "SOCI 416 or SOCI 469)", 3, {"credits_from": codes("SOCI", "370, 372, 414, 415, 416, 469")},
                ("SOCI 370 is a 6-credit course that covers both classical sociological theory and "
                 "contemporary sociological theory.",)),
            row("3 credits of advanced research methods (from SOCI 380, SOCI 381, SOCI 382 or SOCI 383)", 3,
                {"credits_from": codes("SOCI", "380, 381, 382, 383")}),
            row("15 additional credits of 300- and/or 400-level SOCI courses", 15, level(["SOCI"], 300)),
        ]),
    ]),
]


def page_text(page: str) -> str:
    # The page's words as one line, the way the rows quote it: no footnote marks, no "_V".
    page = re.sub(r"<sup>.*?</sup>", "", page, flags=re.S)
    page = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", page, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", page)).replace("\xa0", " ")
    text = re.sub(r"\b([A-Z]{2,4})_V\b", r"\1", text)
    return re.sub(r"\s+", " ", text)


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_arts(pages: dict[str, str]) -> list[dict]:
    # The programs with each row in the shape build_programs writes. Raises if a quoted row or
    # a heading isn't on its page any more.
    programs = []
    for p in PROGRAMS:
        text = page_text(pages[p["page"]])
        missing = [r["text"] for y in p["years"] for r in y["requirements"]
                   if r["quoted"] and normalize(r["text"]) not in text]
        if p["heading"] not in text:
            missing.append(p["heading"])
        if missing:
            raise ValueError(f"{p['id']}: not on the calendar page any more: {missing}")
        years = [{"title": y["title"], "credits": y["credits"], "requirements": [
            # Written by hand and checked against the calendar, so nothing for the checker to flag
            # (it would trip over "ENGL 343 to 350" and the one-range lists).
            {"text": r["text"], "credits": r["credits"], "tree": r["tree"], "source": "hand",
             "problems": [], "notes": r["notes"]}
            for r in y["requirements"]]} for y in p["years"]]
        program = {"id": p["id"], "name": p["name"], "heading": p["heading"], "sources": [PAGES[p["page"]]],
                   "total_credits": p["total_credits"], "years": years}
        if p["notes"]:
            program["notes"] = p["notes"]
        programs.append(program)
    return programs
