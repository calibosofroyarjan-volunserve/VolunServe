"""Privacy-minimized OCR comparison to trusted VolunServe profile fields.

This is NOT issuer validation. It never stores/returns the profile DOB, address,
OCR values, ID numbers or facial landmarks. Unreadable or absent fields do not
become fraud/identity verdicts; all decisions remain subject to Admin review.
"""
from __future__ import annotations

from datetime import date
import re
import unicodedata


def _normalize(value: str) -> str:
    result = unicodedata.normalize("NFKD", str(value or "")).upper()
    return "".join(c for c in result if not unicodedata.combining(c))


def _valid_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _profile_date(value: str) -> date | None:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value or "")):
        return None
    year, month, day = map(int, value.split("-"))
    return _valid_date(year, month, day)


_MONTH_NAMES = (
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
)
_MONTH_LOOKUP = {key: month for month, name in enumerate(_MONTH_NAMES, 1)
                 for key in (name, name[:3])}
_DOB_LABEL = re.compile(r"\b(?:DATE\s+OF\s+BIRTH|BIRTH\s+DATE|PETSA\s+NG\s+KAPANGANAKAN|DOB)\b",
                        re.I)


def _ocr_dob_dates(value: str) -> set[date]:
    dates: set[date] = set()
    normalized = _normalize(value).replace(",", " ").replace(":", " ")
    # No more than 48 characters after a DOB label to reduce false hits on
    # unrelated issue/expiry/birthplace dates elsewhere on the document.
    for match in _DOB_LABEL.finditer(normalized):
        window = normalized[match.end():match.end() + 48]
        # Stop before subsequent fields to avoid matching another person's data.
        window = re.split(r"\b(?:PLACE\s+OF\s+BIRTH|DATE\s+OF\s+ISSUE|EXPIRY|SEX|GENDER|ADDRESS|SURNAME)\b", window)[0]
        for yyyy, mm, dd in re.findall(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b", window):
            parsed = _valid_date(int(yyyy), int(mm), int(dd))
            if parsed:
                dates.add(parsed)
        # For 01/02/2001, both day/month and month/day are plausible.
        # Ambiguous dates produce inconclusive, never a match by guessing.
        for a, b, yyyy in re.findall(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b", window):
            first, second, year = int(a), int(b), int(yyyy)
            for month, day in ((first, second), (second, first)):
                parsed = _valid_date(year, month, day)
                if parsed:
                    dates.add(parsed)
        for dd, month, yyyy in re.findall(
            r"\b(\d{1,2})\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s+(\d{4})\b",
            window):
            parsed = _valid_date(int(yyyy), _MONTH_LOOKUP.get(month[:3], 0), int(dd))
            if parsed:
                dates.add(parsed)
        for month, dd, yyyy in re.findall(
            r"\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\s+(\d{1,2})\s+(\d{4})\b",
            window):
            parsed = _valid_date(int(yyyy), _MONTH_LOOKUP.get(month[:3], 0), int(dd))
            if parsed:
                dates.add(parsed)
    return dates


def assess_profile_birth_date(expected_dob: str, ocr_text: str) -> dict:
    """Return a sanitized clue, never a certified DOB or identity verdict."""
    expected = _profile_date(expected_dob)
    if expected is None:
        return {"profileBirthDateCheck": "not_checked", "profileBirthDateCompared": False}
    dates = _ocr_dob_dates(ocr_text)
    if len(dates) != 1:
        status = "inconclusive"
    elif expected in dates:
        status = "possible_match"
    else:
        # OCR may be wrong or the profile may have a typo. Require review.
        status = "possible_conflict"
    return {"profileBirthDateCheck": status, "profileBirthDateCompared": True}


def _safe_barangay(value: str) -> str:
    normalized = re.sub(r"[^A-Z0-9 ]+", " ", _normalize(value))
    normalized = re.sub(r"\b(?:BARANGAY|BRGY|BRG|BARRIO)\b", " ", normalized)
    return " ".join(normalized.split())


def assess_profile_address(expected_barangay: str, ocr_text: str) -> dict:
    """Compare only a barangay clue in a labeled residential address.

    Birthplace is NOT the resident's current address. ID types without address
    fields produce inconclusive, not an automatic rejection.
    """
    expected = _safe_barangay(expected_barangay)
    if len(expected) < 3:
        return {"profileAddressCheck": "not_checked", "profileAddressCompared": False}
    normalized = re.sub(r"[^A-Z0-9 ]+", " ", _normalize(ocr_text))
    normalized = " ".join(normalized.split())
    labels = re.compile(r"\b(?:RESIDENTIAL\s+ADDRESS|HOME\s+ADDRESS|ADDRESS|TIRAHAN|TIRAHANAN)\b")
    found = False
    for match in labels.finditer(normalized):
        area = normalized[match.end():match.end()+120]
        # Never treat the 'PLACE OF BIRTH' value as residential evidence.
        area = re.split(r"\b(?:PLACE\s+OF\s+BIRTH|DATE\s+OF\s+BIRTH|EXPIRY|VALID\s+UNTIL)\b", area)[0]
        if re.search(r"(?<![A-Z0-9])"+re.escape(expected)+r"(?![A-Z0-9])", area):
            found = True
            break
    return {
        "profileAddressCheck": "possible_match" if found else "inconclusive",
        "profileAddressCompared": True,
    }


def profile_comparison(expected_dob: str, expected_barangay: str, ocr_text: str) -> dict:
    return {
        **assess_profile_birth_date(expected_dob, ocr_text),
        **assess_profile_address(expected_barangay, ocr_text),
    }
