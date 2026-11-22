"""Conservative FRONT + BACK PhilID format screen; never an ID-authenticity decision.

Input is transient OCR text. Never return OCR text, names, QR payloads, numbers,
birthdates, photographs, or biometric data. Manual Admin review is mandatory.
"""
from document_screening import (
    METHOD, _contains, _document_signals, _normalized, assess_document_text,
)

BACK_LABEL_FAMILIES = (
    ("ARAW NG PAGKAKALOOB", "DATE OF ISSUE", "ISSUED ON"),
    ("KASARIAN", "SEX"),
    ("URI NG DUGO", "BLOOD TYPE"),
    ("KALAGAYANG SIBIL", "MARITAL STATUS"),
    ("LUGAR NG KAPANGANAKAN", "PLACE OF BIRTH"),
)
SCHOOL_MARKERS = (
    "SCHOOL ID", "STUDENT ID", "STUDENT IDENTIFICATION",
    "STUDENT NUMBER", "STUDENT NO", "STI EDUCATION",
    "UNIVERSITY STUDENT", "COLLEGE STUDENT",
)
PSA_MARKERS = ("PSA OFFICE", "PHILIPPINE STATISTICS AUTHORITY", "PSA GOV PH")
ALLOWED_WARNINGS = {
    "ocr_unavailable", "document_type_not_recognized",
    "selected_id_type_conflicts_with_ocr", "multiple_document_type_signals",
}


def assess_national_id_sides(front_text: str, back_text: str) -> dict:
    """Require independent National ID cues on both sides; fail closed.

    A high-confidence type *format* is not a genuine document determination.
    An actual school ID must not pass due to name/photo or similar demographics.
    """
    front = assess_document_text("national_id", front_text or "")
    back = _normalized(back_text or "")
    families = sum(
        any(_contains(back, term) for term in group)
        for group in BACK_LABEL_FAMILIES
    )
    has_psa = any(_contains(back, term) for term in PSA_MARKERS)
    school = any(_contains(_normalized(front_text), m) for m in SCHOOL_MARKERS) or any(
        _contains(back, m) for m in SCHOOL_MARKERS
    )
    other = (_document_signals(front_text) | _document_signals(back_text)) - {"national_id"}
    has_back = families >= 3 or (has_psa and families >= 2)
    strong_front = front["status"] == "text_consistent_unverified"
    if school or other or front["status"] == "mismatch":
        status = "mismatch"
        warnings = ["selected_id_type_conflicts_with_ocr"]
    elif strong_front and has_back:
        status = "text_consistent_unverified"
        warnings = []
    else:
        status = "inconclusive"
        warnings = ["document_type_not_recognized"]
    return {
        "method": METHOD,
        "declaredIdType": "national_id",
        "detectedIdType": "national_id" if strong_front and has_back and not (school or other) else None,
        "status": status,
        "authenticityVerified": False,
        "livenessVerified": False,
        "manualReviewRequired": True,
        "warningCodes": [w for w in warnings if w in ALLOWED_WARNINGS],
    }
