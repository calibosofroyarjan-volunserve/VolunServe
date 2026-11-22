"""Synthetic-only front/back OCR screening tests; no real ID images or user data."""
import unittest
from unittest.mock import patch
import sys
import types

from local_national_id_both_sides import (
    classify_pair_ocr, safe_report, screen_two_images,
)

FRONT = (
    "REPUBLIKA NG PILIPINAS\nPAMBANSANG PAGKAKAKILANLAN\n"
    "PHILIPPINE IDENTIFICATION CARD\n"
    "APELYIDO / LAST NAME\nMGA PANGALAN / GIVEN NAMES\n"
    "TIRAHAN / ADDRESS\n"
)
BACK = (
    "ARAW NG PAGKAKALOOB / DATE OF ISSUE\n"
    "URI NG DUGO / BLOOD TYPE\n"
    "KALAGAYANG SIBIL / MARITAL STATUS\n"
    "LUGAR NG KAPANGANAKAN / PLACE OF BIRTH\n"
)

class BothSidesOcrTests(unittest.TestCase):
    def test_national_id_needs_front_and_back_layout(self):
        out = classify_pair_ocr(FRONT, BACK)
        self.assertEqual(out["status"], "national_id_format_candidate")
        self.assertEqual(out["front"], "national_id_heading_and_labels")
        self.assertEqual(out["back"], "reverse_labels_observed")
        self.assertFalse(out["authenticityVerified"])
        self.assertFalse(out["samePhysicalCardVerified"])
        self.assertFalse(out["identityVerified"])
        self.assertTrue(out["manualReviewRequired"])

    def test_valid_front_cannot_pass_without_back_evidence(self):
        for back in ("", "ID CARD", "SEX MALE", "QR CODE", "STI CAMPUS",
                     "KALAGAYANG SIBIL"):
            with self.subTest(back=back):
                out = classify_pair_ocr(FRONT, back)
                self.assertEqual(out["status"], "needs_review")

    def test_school_id_back_rejected_even_when_front_looks_national(self):
        for back in (
            "SCHOOL ID\nSTUDENT NUMBER",
            "STUDENT\nSAMPLE UNIVERSITY\nID",
            "HIGH SCHOOL\nLEARNER\nCARD",
        ):
            with self.subTest(back=back):
                out = classify_pair_ocr(FRONT, back)
                self.assertEqual(out["status"], "unsupported_other_card")
                self.assertNotIn("national_id_format_candidate", safe_report(out))

    def test_school_id_front_rejected_with_national_looking_back(self):
        front = "STUDENT ID\nSAMPLE ACADEMY"
        self.assertEqual(
            classify_pair_ocr(front, BACK)["status"], "unsupported_other_card")

    def test_unrecognized_school_brand_only_is_not_false_approval(self):
        out = classify_pair_ocr("STI\nSAMPLE CAMPUS\nSTUDENT NAME", BACK)
        self.assertNotEqual(out["status"], "national_id_format_candidate")

    def test_other_government_ids_on_either_side_do_not_pass(self):
        for text in (
            "DRIVER'S LICENSE",
            "REPUBLIC OF THE PHILIPPINES PASSPORT",
            "UNIFIED MULTI PURPOSE ID UMID",
            "PRC PROFESSIONAL IDENTIFICATION CARD",
        ):
            with self.subTest(text=text):
                out = classify_pair_ocr(text, BACK)
                self.assertNotEqual(out["status"], "national_id_format_candidate")
                out2 = classify_pair_ocr(FRONT, text)
                self.assertNotEqual(out2["status"], "national_id_format_candidate")

    def test_duplicate_front_as_back_is_not_valid(self):
        self.assertEqual(classify_pair_ocr(FRONT, FRONT)["status"], "needs_review")

    def test_two_independent_back_labels_needed(self):
        out = classify_pair_ocr(FRONT, "DATE OF ISSUE\nPLACE OF BIRTH")
        self.assertEqual(out["status"], "national_id_format_candidate")
        self.assertEqual(classify_pair_ocr(FRONT, "DATE OF ISSUE")["status"],
                         "needs_review")

    def test_no_birthdate_or_person_name_required(self):
        out = classify_pair_ocr(
            "PHILIPPINE IDENTIFICATION CARD\nAPELYIDO\nMGA PANGALAN",
            "BLOOD TYPE\nMARITAL STATUS",
        )
        self.assertEqual(out["status"], "national_id_format_candidate")
        report = safe_report(out)
        self.assertIn("NOT REQUIRED", report)
        self.assertIn("NOT VERIFIED", report)
        self.assertIn("UNCHANGED", report)

    def test_identical_binary_image_is_blocked(self):
        with self.assertRaisesRegex(ValueError, "front_and_back_same_photo"):
            screen_two_images(b"synthetic bytes", b"synthetic bytes")

    def test_initial_non_national_document_never_retried_to_pass(self):
        fake = types.SimpleNamespace(
            extract_government_id_text=lambda data, label: "SCHOOL ID"
        )
        with patch.dict(sys.modules, {"main": fake}):
            result = screen_two_images(b"synthetic-front", b"synthetic-back")
        self.assertEqual(result["status"], "unsupported_other_card")

if __name__ == "__main__":
    unittest.main()
