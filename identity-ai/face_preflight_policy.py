"""Fail-closed ID document preflight for staged 1:1 face comparison.

This gates whether an OCR *type candidate* is complete enough to run the
unvalidated face-comparison experiment. It NEVER authenticates an issued
government ID, confirms a real person, or grants Verified Resident.
No photos, ID numbers, DOB, raw OCR text or facial features are persisted.
"""

SUPPORTED_ID_TYPES = frozenset({
    "national_id",
})
CONFLICT_VALUES = frozenset({"possible_conflict", "conflict"})
BAD_MRZ_VALUES = frozenset({
    "checksum_inconsistent_or_ocr_error", "multiple_candidates",
})


def screening_ready_for_face_comparison(screening, declared_type):
    """Return False whenever ID-side/OCR evidence is missing or contradictory.

    A positive result authorizes *only* a non-decisional 1:1 comparison.
    Final identity approval always requires an independent Admin review.
    """
    if not isinstance(screening, dict) or declared_type not in SUPPORTED_ID_TYPES:
        return False
    if (
        screening.get("declaredIdType") != declared_type
        or screening.get("detectedIdType") != declared_type
        or screening.get("status") != "text_consistent_unverified"
    ):
        return False

    # Both absent warnings and malformed responses fail closed.
    if screening.get("warningCodes") != []:
        return False
    if screening.get("imageQualityStatus") != "adequate":
        return False

    if declared_type != "passport" and not (
        screening.get("backSideProvided") is True
        and screening.get("backSideScreened") is True
        and screening.get("backImageQualityStatus") == "adequate"
    ):
        return False

    # In this demo/research path, compare faces only after positive OCR clues
    # for BOTH the resident's name and DOB. Missing, unreadable, or unchecked
    # demographics must route to an Admin rescan/review rather than advance.
    # This remains non-decisional: OCR text can be forged or misread.
    if (screening.get("profileNameCheck") != "possible_match"
            or screening.get("profileBirthDateCheck") != "possible_match"):
        return False

    # Address is not universally printed on government IDs (e.g. passports).
    # If the scanner flags a definite conflict, fail closed; otherwise missing
    # address is for independent Admin verification, not a biometric claim.
    if (screening.get("profileAddressCheck") in CONFLICT_VALUES
            or screening.get("passportMrzBirthDateCheck") in CONFLICT_VALUES
            or screening.get("passportMrzCheck") in BAD_MRZ_VALUES):
        return False
    return True
