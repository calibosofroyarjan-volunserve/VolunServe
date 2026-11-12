"""Synthetic-only QA: no actual ID photo, face, personal DOB or network request."""
import ast
import logging
import math
from pathlib import Path
import unittest

from strict_document_screening import (
    assess_document_sides, add_photo_quality, add_back_photo_quality,
    assess_profile_name, document_ocr_unavailable,
)
from profile_consistency import profile_comparison
from passport_mrz_shadow import assess_passport_mrz


FRONT_TEXTS = {
    "national_id": "PHILIPPINE IDENTIFICATION CARD GIVEN NAMES TEST",
    "drivers_license": "LAND TRANSPORTATION OFFICE DRIVER S LICENSE",
    "umid": "UNIFIED MULTI PURPOSE ID",
    "prc_id": "PRC PROFESSIONAL IDENTIFICATION CARD",
}
GOOD_PHILID_BACK = "BLOOD TYPE O MARITAL STATUS SINGLE DATE OF ISSUE"
RANDOM_BACK = "THIS PICTURE CONTAINS TEXT BUT NO IDENTIFIABLE REVERSE SIDE"


def synthetic_screen(front, back, front_blur=160.0, back_blur=160.0,
                     id_type="national_id"):
    """Execute actual OCR request handler with fake in-memory OCR/photos."""
    code = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
    node = next(x for x in ast.parse(code).body
                if isinstance(x, ast.FunctionDef) and x.name == "screen_government_id")
    module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))

    def decode(data, _label):
        return data

    def quality(image_bytes):
        return {"blurVariance": back_blur if image_bytes == b"BACK" else front_blur}

    def ocr(data, _label):
        return back if data == b"BACK" else front

    ns = {
        "extract_government_id_text": ocr,
        "assess_document_sides": assess_document_sides,
        "decode_image": decode,
        "image_quality": quality,
        "add_photo_quality": add_photo_quality,
        "add_back_photo_quality": add_back_photo_quality,
        "assess_profile_name": assess_profile_name,
        "profile_comparison": profile_comparison,
        "assess_passport_mrz": assess_passport_mrz,
        "document_ocr_unavailable": document_ocr_unavailable,
        "logging": logging,
    }
    exec(compile(module, "synthetic_screen_government_id", "exec"), ns)
    return ns["screen_government_id"](
        declared_type=id_type, id_document_bytes=b"FRONT",
        id_back_document_bytes=(b"BACK" if back is not None else None),
        expected_first_name="Example", expected_last_name="Test",
        expected_date_of_birth="1992-08-11", expected_barangay="",
    )


class BackScanQualityTests(unittest.TestCase):
    def test_nonpassport_front_plus_generic_back_never_positive(self):
        for kind, front in FRONT_TEXTS.items():
            with self.subTest(kind=kind):
                result = assess_document_sides(kind, front, RANDOM_BACK)
                self.assertEqual(result["status"], "inconclusive")
                self.assertIn("document_back_evidence_inconclusive", result["warningCodes"])
                self.assertTrue(result["backSideScreened"])
                self.assertFalse(result["authenticityVerified"])

    def test_national_id_repeated_front_heading_without_reverse_layout_not_positive(self):
        res = assess_document_sides("national_id", FRONT_TEXTS["national_id"], "PHILID REPUBLIC OF PHILIPPINES")
        self.assertEqual(res["status"], "inconclusive")
        self.assertIn("document_back_layout_inconclusive", res["warningCodes"])

    def test_physical_national_id_back_labels_are_ocr_clue_only(self):
        res = assess_document_sides("national_id", FRONT_TEXTS["national_id"], GOOD_PHILID_BACK)
        self.assertEqual(res["status"], "text_consistent_unverified")
        self.assertEqual(res["warningCodes"], [])
        self.assertFalse(res["authenticityVerified"])
        self.assertTrue(res["manualReviewRequired"])

    def test_actual_handler_detects_blurry_back_independent_of_clear_front(self):
        res = synthetic_screen(FRONT_TEXTS["national_id"], GOOD_PHILID_BACK,
                               front_blur=160.0, back_blur=4.0)
        self.assertEqual(res["imageQualityStatus"], "adequate")
        self.assertEqual(res["backImageQualityStatus"], "low")
        self.assertEqual(res["status"], "inconclusive")
        self.assertIn("low_document_back_image_quality", res["warningCodes"])
        self.assertFalse(res["authenticityVerified"])
        self.assertEqual(res["issuerAuthenticityStatus"], "not_verified")
        self.assertEqual(res["presentationAttackStatus"], "not_validated")

    def test_actual_handler_clear_side_quality_but_no_id_authenticity(self):
        res = synthetic_screen(FRONT_TEXTS["national_id"], GOOD_PHILID_BACK)
        self.assertEqual(res["imageQualityStatus"], "adequate")
        self.assertEqual(res["backImageQualityStatus"], "adequate")
        self.assertEqual(res["status"], "text_consistent_unverified")
        self.assertFalse(res["authenticityVerified"])
        self.assertTrue(res["manualReviewRequired"])

    def test_passport_remains_bio_page_only(self):
        res = synthetic_screen("PASSPORT",None,id_type="passport")
        self.assertEqual(res["backImageQualityStatus"], "not_required")
        self.assertFalse(res["backSideProvided"])
        self.assertFalse(res["authenticityVerified"])

    def test_unknown_quality_never_becomes_adequate(self):
        for bad in [float("nan"),float("inf"),-5.0,None,"not-a-number"]:
            with self.subTest(bad=str(bad)):
                original = assess_document_sides("national_id", FRONT_TEXTS["national_id"], GOOD_PHILID_BACK)
                f = add_photo_quality(original,bad)
                self.assertEqual(f["imageQualityStatus"], "unknown")
                self.assertIn("document_image_quality_unavailable",f["warningCodes"])
                self.assertEqual(f["status"],"inconclusive")
                back = add_back_photo_quality(original,bad)
                self.assertEqual(back["backImageQualityStatus"],"unknown")
                self.assertIn("document_back_image_quality_unavailable",back["warningCodes"])
                self.assertEqual(back["status"],"inconclusive")

    def test_unsupported_school_id_stays_unsupported_even_if_back_blurry(self):
        document = assess_document_sides("national_id",
            "UNIVERSITY STUDENT ID NATIONAL ID CARD",GOOD_PHILID_BACK)
        damaged = add_back_photo_quality(document,2.0)
        self.assertEqual(damaged["status"],"unsupported")
        self.assertIn("school_id_not_supported",damaged["warningCodes"])
        self.assertFalse(damaged["authenticityVerified"])

    def test_no_private_personal_ocr_returned(self):
        front = FRONT_TEXTS["national_id"] + " NAME PRIVATE PERSON DATE OF BIRTH 1992-08-11"
        back = GOOD_PHILID_BACK + " EXAMPLE PRIVATE 7777-8888"
        report=synthetic_screen(front,back)
        for private in ("PRIVATE PERSON","1992-08-11","7777-8888"):
            self.assertNotIn(private,repr(report))
        self.assertFalse(report["authenticityVerified"])


if __name__ == "__main__":
    unittest.main()
