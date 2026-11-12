"""Run real screen_government_id() handler with mocked OCR/image IO only.

No real ID samples, uploads, credentials, internet access or approvals.
"""
import ast
from pathlib import Path
import logging
import unittest

from strict_document_screening import (
    assess_document_sides, assess_profile_name, document_ocr_unavailable,
    add_photo_quality, add_back_photo_quality,
)
from profile_consistency import profile_comparison
from passport_mrz_shadow import assess_passport_mrz

FIRST = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"
SECOND = "L898902C36UTO7408122F1204159ZE184226B<<<<<10"


def screened(front_text, dob="1974-08-12", id_type="passport", back_text=None):
    src = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    handler = next(x for x in tree.body if isinstance(x, ast.FunctionDef)
                   and x.name == "screen_government_id")
    module = ast.Module(body=[handler], type_ignores=[])
    ast.fix_missing_locations(module)

    def ocr(data, _label):
        return data.decode("utf-8")
    scope = {
        "extract_government_id_text": ocr,
        "assess_document_sides": assess_document_sides,
        "add_photo_quality": add_photo_quality,
        "add_back_photo_quality": add_back_photo_quality,
        "decode_image": lambda *_args: object(),
        "image_quality": lambda *_args: {"blurVariance": 135.0},
        "assess_profile_name": assess_profile_name,
        "profile_comparison": profile_comparison,
        "assess_passport_mrz": assess_passport_mrz,
        "document_ocr_unavailable": document_ocr_unavailable,
        "logging": logging,
    }
    exec(compile(module, "screen_government_id:synthetic", "exec"), scope)
    return scope["screen_government_id"](
        declared_type=id_type, id_document_bytes=front_text.encode("utf-8"),
        id_back_document_bytes=(back_text.encode("utf-8") if back_text is not None else None),
        expected_first_name="Anna", expected_last_name="Eriksson",
        expected_date_of_birth=dob, expected_barangay="Muzon",
    )


class PassportMRZIntegrationTests(unittest.TestCase):
    def test_existing_tesseract_output_plus_mrz_only_clues(self):
        result = screened("PASSPORT\n" + FIRST + "\n" + SECOND)
        self.assertEqual(result["status"], "text_consistent_unverified")
        self.assertEqual(result["passportMrzCheck"], "checksum_consistent_unverified")
        self.assertEqual(result["passportMrzBirthDateCheck"], "possible_match")
        self.assertEqual(result["profileBirthDateCheck"], "possible_match")
        self.assertFalse(result["issuerAuthenticityStatus"] == "verified")
        self.assertFalse(result["authenticityVerified"])
        self.assertTrue(result["manualReviewRequired"])
        for personal in ("ERIKSSON", "ANNA", "L898902C3", "740812", "1974-08-12"):
            self.assertNotIn(personal, repr(result))

    def test_valid_checksum_but_profile_date_conflict_is_review_not_fraud(self):
        result = screened("PASSPORT\n" + FIRST + "\n" + SECOND, dob="1973-08-12")
        self.assertEqual(result["profileBirthDateCheck"], "possible_conflict")
        self.assertIn("passport_mrz_profile_birth_date_conflict", result["warningCodes"])
        self.assertTrue(result["manualReviewRequired"])
        self.assertFalse(result["authenticityVerified"])

    def test_corrupted_mrz_downgrades_document_precheck_not_authenticity(self):
        corrupt = SECOND[:-1] + "8"
        result = screened("PASSPORT\n" + FIRST + "\n" + corrupt)
        self.assertEqual(result["status"], "inconclusive")
        self.assertIn("passport_mrz_review_required", result["warningCodes"])
        self.assertFalse(result["authenticityVerified"])

    def test_blank_mrz_never_claims_machine_readable_validation(self):
        result = screened("REPUBLIC OF THE PHILIPPINES PASSPORT")
        self.assertEqual(result["passportMrzCheck"], "not_detected")
        self.assertFalse(result["passportMrzCheckDigitsConsistent"])
        self.assertFalse(result["passportIssuerAuthenticityVerified"])
        self.assertTrue(result["manualReviewRequired"])

    def test_other_allowed_id_types_do_not_require_passport_mrz(self):
        for id_type, text in (
            ("national_id", "PHILIPPINE IDENTIFICATION CARD"),
            ("drivers_license", "DRIVER S LICENSE LAND TRANSPORTATION OFFICE"),
            ("umid", "UNIFIED MULTI PURPOSE ID"),
            ("prc_id", "PRC PROFESSIONAL IDENTIFICATION CARD"),
        ):
            with self.subTest(id_type=id_type):
                result = screened(text, id_type=id_type, back_text="REVERSE SIDE")
                self.assertNotIn("passportMrzCheck", result)
                self.assertFalse(result["authenticityVerified"])
                self.assertTrue(result["manualReviewRequired"])


if __name__ == "__main__":
    unittest.main()
