import re

# "[CPSC320]" → groups ("CPSC", "320"). Only CPSC 420 and 449 write codes this way.
BRACKETED = re.compile(r"\[([A-Z]{2,4})(\d{3})\]")

# "CPSC_V" → group "CPSC". Okanagan codes like "MATH_O" don't match, so they're kept.
VANCOUVER = re.compile(r"\b([A-Z]{2,4})_V\b")


def normalize_codes(text: str) -> str:
    text = BRACKETED.sub(r"\1 \2", text)
    return VANCOUVER.sub(r"\1", text)
