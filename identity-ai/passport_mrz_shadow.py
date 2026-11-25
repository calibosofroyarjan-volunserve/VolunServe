"""ICAO Doc 9303 TD3 passport MRZ *format and checksum* screening.

Uses plaintext already produced by VolunServe's existing Tesseract OCR.
No new OCR model, document upload service, external API or resident PII store.
Raw OCR, MRZ data, names, passport numbers, dates and check digits are never
returned by this module. A valid MRZ checksum is NOT government issuance
authentication: counterfeit documents can reproduce valid check digits.
All cases require authorized Admin/issuer review.

Reference: ICAO Doc 9303, Parts 3 and 4 (TD3, 2 x 44 characters).
"""
from __future__ import annotations

from datetime import date
import re

_ALLOWED = re.compile(r"^[A-Z0-9<]{44}$")
_PROFILE_DOB = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_WEIGHTS = (7, 3, 1)
_MAX_TEXT = 20000


def _check_digit(field: str) -> int:
    total = 0
    for index, char in enumerate(field):
        if char == "<":
            value = 0
        elif "0" <= char <= "9":
            value = ord(char) - ord("0")
        elif "A" <= char <= "Z":
            value = ord(char) - ord("A") + 10
        else:
            raise ValueError("Invalid MRZ character")
        total += value * _WEIGHTS[index % 3]
    return total % 10


def _date_field_looks_possible(yy_mm_dd: str) -> bool:
    """Only structural plausibility: birth and expiry century cannot be inferred."""
    if not re.fullmatch(r"\d{6}", yy_mm_dd):
        return False
    yy, month, day = int(yy_mm_dd[:2]), int(yy_mm_dd[2:4]), int(yy_mm_dd[4:])
    if not (1 <= month <= 12):
        return False
    # Use a leap-year-preserving 2000-based 4-year cycle to avoid
    # incorrectly rejecting Feb 29 without knowing the actual century.
    test_year = 2000 + yy
    try:
        date(test_year, month, day)
    except ValueError:
        # Calendar plausibility only. Two-digit MRZ years cannot disambiguate
        # 1900 from 2000, but an impossible Feb 29 (e.g. YY=99) is never valid.
        return False
    return True


def _validate_td3_second_line(line: str) -> bool:
    if not _ALLOWED.fullmatch(line):
        return False
    if not (_date_field_looks_possible(line[13:19]) and
            _date_field_looks_possible(line[21:27])):
        return False
    for field, digit in (
        (line[0:9], line[9]),
        (line[13:19], line[19]),
        (line[21:27], line[27]),
    ):
        if not digit.isdigit() or _check_digit(field) != int(digit):
            return False
    personal_data = line[28:42]
    optional_check = line[42]
    if optional_check == "<":
        if any(char != "<" for char in personal_data):
            return False
    elif not optional_check.isdigit() or _check_digit(personal_data) != int(optional_check):
        return False
    composite = line[0:10] + line[13:20] + line[21:43]
    return line[43].isdigit() and _check_digit(composite) == int(line[43])


def _candidates(ocr_text: str) -> list[tuple[str, str]]:
    """Conservative OCR pairing; don't fabricate '<' or correct OCR digits."""
    lines = []
    for item in str(ocr_text or "")[:_MAX_TEXT].upper().splitlines():
        compact = re.sub(r"\s+", "", item)
        if _ALLOWED.fullmatch(compact):
            lines.append(compact)
    found = []
    for i in range(len(lines)-1):
        first, second = lines[i], lines[i+1]
        if (first.startswith("P<") or first.startswith("PP")) and \
                first[2:5].isalpha() and "<<" in first[5:]:
            found.append((first, second))
    # Two OCR passes may contain the same passport twice.
    return list(dict.fromkeys(found))


def _compare_birth_date(expected_dob: str, mrz_date: str) -> str:
    if not _PROFILE_DOB.fullmatch(str(expected_dob or "")):
        return "not_checked"
    try:
        expected = date.fromisoformat(expected_dob)
    except ValueError:
        return "not_checked"
    compact = expected.strftime("%y%m%d")
    return "possible_match" if compact == mrz_date else "possible_conflict"


def assess_passport_mrz(ocr_text: str, expected_date_of_birth: str = "") -> dict:
    """Return sanitized clues ONLY. No document or identity authenticity verdict."""
    candidates = _candidates(ocr_text)
    if not candidates:
        return {
            "passportMrzCheck": "not_detected",
            "passportMrzBirthDateCheck": "not_checked",
            "passportMrzCheckDigitsConsistent": False,
            "passportIssuerAuthenticityVerified": False,
            "passportMrzManualReviewRequired": True,
        }
    # Never choose a favorable candidate out of contradictory OCR passes.
    if len(candidates) > 1:
        return {
            "passportMrzCheck": "multiple_candidates",
            "passportMrzBirthDateCheck": "not_checked",
            "passportMrzCheckDigitsConsistent": False,
            "passportIssuerAuthenticityVerified": False,
            "passportMrzManualReviewRequired": True,
        }
    _first, second = candidates[0]
    consistent = _validate_td3_second_line(second)
    return {
        "passportMrzCheck": ("checksum_consistent_unverified" if consistent
                             else "checksum_inconsistent_or_ocr_error"),
        "passportMrzBirthDateCheck": (
            _compare_birth_date(expected_date_of_birth, second[13:19])
            if consistent else "inconclusive"
        ),
        "passportMrzCheckDigitsConsistent": bool(consistent),
        "passportIssuerAuthenticityVerified": False,
        "passportMrzManualReviewRequired": True,
    }
