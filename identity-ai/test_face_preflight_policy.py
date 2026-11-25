"""No-media, no-network preflight regression tests for experimental face matching."""
import unittest

from face_preflight_policy import screening_ready_for_face_comparison as allows


def screening(kind="national_id"):
    passport = kind == "passport"
    return {
        "declaredIdType": kind,
        "detectedIdType": kind,
        "status": "text_consistent_unverified",
        "warningCodes": [],
        "imageQualityStatus": "adequate",
        "backSideProvided": not passport,
        "backSideScreened": not passport,
        "backImageQualityStatus": "not_required" if passport else "adequate",
        "profileBirthDateCheck": "possible_match",
        "profileNameCheck": "possible_match",
        "profileAddressCheck": "possible_match",
        "passportMrzCheck": "checksum_consistent_unverified" if passport else None,
    }


class FacePreflightPolicyTests(unittest.TestCase):
    def test_all_five_allowed_types_only_advance_to_nondecisional_comparison(self):
        for kind in ("national_id", "drivers_license", "passport", "umid", "prc_id"):
            with self.subTest(kind=kind):
                self.assertTrue(allows(screening(kind), kind))

    def test_school_and_mismatched_type_never_run_face_comparison(self):
        for kind in ("school_id", "employee_id", "other_government_id", "", None):
            self.assertFalse(allows(screening("national_id"), kind))
        wrong = screening("national_id")
        wrong["detectedIdType"] = "passport"
        self.assertFalse(allows(wrong, "national_id"))
        self.assertFalse(allows({"status": "text_consistent_unverified"}, "national_id"))

    def test_any_warning_including_unknown_must_block(self):
        base = screening()
        for warnings in (
            ["school_id_not_supported"],
            ["document_front_back_swapped"],
            ["low_document_back_image_quality"],
            ["untrusted_future_warning"],
            None, "no_warnings", {"0": "school_id_not_supported"},
        ):
            with self.subTest(warnings=warnings):
                self.assertFalse(allows({**base, "warningCodes": warnings}, "national_id"))

    def test_unsupported_and_incomplete_ocr_or_quality_block(self):
        base = screening()
        for field, invalid in (
            ("status", "inconclusive"),
            ("status", "unsupported"),
            ("imageQualityStatus", "low"),
            ("imageQualityStatus", "unknown"),
            ("imageQualityStatus", None),
            ("backImageQualityStatus", "low"),
            ("backImageQualityStatus", "not_checked"),
            ("backSideProvided", False),
            ("backSideScreened", False),
            ("profileBirthDateCheck", "possible_conflict"),
            ("profileNameCheck", "possible_conflict"),
            ("profileAddressCheck", "possible_conflict"),
            ("passportMrzCheck", "multiple_candidates"),
        ):
            with self.subTest(field=field, invalid=invalid):
                self.assertFalse(allows({**base, field: invalid}, "national_id"))

    def test_passport_bio_page_exempt_from_reverse_side_but_not_mrz_conflict(self):
        base = screening("passport")
        self.assertTrue(allows(base, "passport"))
        self.assertFalse(allows({**base,
                                "passportMrzBirthDateCheck": "possible_conflict"}, "passport"))
        self.assertFalse(allows({**base,
                                "passportMrzCheck": "checksum_inconsistent_or_ocr_error"}, "passport"))
        self.assertFalse(allows({**base, "warningCodes": ["passport_mrz_review_required"]},
                                "passport"))

    def test_face_preflight_never_produces_an_approval_or_biometric_score(self):
        result = allows(screening(), "national_id")
        self.assertIs(type(result), bool)
        self.assertTrue(result)


if __name__ == "__main__":
    unittest.main()
