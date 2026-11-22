"""Synthetic OCR-label regression; NO real National IDs or personal data."""
import unittest
from strict_document_screening import (
    assess_document_sides, add_photo_quality, add_back_photo_quality,
)
from profile_consistency import assess_profile_birth_date

FRONT = ("PAMBANSANG PAGKAKAKILANLAN\nPHILIPPINE IDENTIFICATION CARD\n"
         "APELYIDO: SAMPLE\nMGA PANGALAN: TEST\n"
         "DATE OF BIRTH: 1998-09-05")
BACK = ("KALAGAYANG SIBIL / MARITAL STATUS: SINGLE\n"
        "LUGAR NG KAPANGANAKAN / PLACE OF BIRTH: DEMO CITY")

class NationalIdLabelRegression(unittest.TestCase):
    def test_official_back_marital_label_plus_birthplace(self):
        report = assess_document_sides("national_id", FRONT, BACK)
        self.assertEqual(report["status"], "text_consistent_unverified")
        self.assertEqual(report["warningCodes"], [])
        self.assertFalse(report["authenticityVerified"])
        self.assertTrue(report["manualReviewRequired"])

    def test_english_issuance_label_with_birthplace(self):
        back = ("DATE OF ISSUANCE: 2026-01-01\n"
                "PLACE OF BIRTH: DEMO CITY")
        report = assess_document_sides("national_id", FRONT, back)
        self.assertEqual(report["status"], "text_consistent_unverified")
        self.assertFalse(report["authenticityVerified"])

    def test_single_generic_back_label_still_inconclusive(self):
        for back in ("KALAGAYANG SIBIL: SINGLE", "SEX: F", "PLACE OF BIRTH: TEST",
                     "THIS IS A NATIONAL ID", ""):
            with self.subTest(back=back):
                report = assess_document_sides("national_id", FRONT, back)
                self.assertEqual(report["status"], "inconclusive")
                self.assertTrue(report["warningCodes"])

    def test_duplicated_front_is_not_consistent_back(self):
        report = assess_document_sides("national_id", FRONT, FRONT)
        self.assertEqual(report["status"], "inconclusive")
        self.assertIn("document_duplicate_side_text", report["warningCodes"])

    def test_school_card_back_is_blocked(self):
        report = assess_document_sides("national_id", FRONT,
                                      "STUDENT ID\nKALAGAYANG SIBIL\nPLACE OF BIRTH")
        self.assertEqual(report["status"], "unsupported")

    def test_blurry_back_never_gets_clean_status(self):
        value = add_back_photo_quality(
            add_photo_quality(
                assess_document_sides("national_id", FRONT, BACK), 140.0), 3.0)
        self.assertEqual(value["status"], "inconclusive")
        self.assertIn("low_document_back_image_quality", value["warningCodes"])

    def test_labeled_year_first_named_month_is_possible_match_only(self):
        for text in (
            "DATE OF BIRTH: 1998 SEPTEMBER 05",
            "PETSA NG KAPANGANAKAN: 1998 SEP 05",
            "DATE OF BIRTH 1998 09 05",
            "DATE OF BIRTH 1998-09-05",
        ):
            with self.subTest(text=text):
                report = assess_profile_birth_date("1998-09-05", text)
                self.assertEqual(report["profileBirthDateCheck"], "possible_match")

    def test_conflict_remains_conflict(self):
        value = assess_profile_birth_date("1998-09-05", "DATE OF BIRTH: 1997 SEPTEMBER 05")
        self.assertEqual(value["profileBirthDateCheck"], "possible_conflict")

    def test_unlabeled_or_unrelated_dates_never_match(self):
        for text in ("1998 09 05", "DATE OF ISSUANCE: 1998 09 05",
                     "EXPIRY: 1998 SEPTEMBER 05"):
            with self.subTest(text=text):
                value = assess_profile_birth_date("1998-09-05", text)
                self.assertEqual(value["profileBirthDateCheck"], "inconclusive")

    def test_ambiguous_numeric_dob_still_inconclusive(self):
        value = assess_profile_birth_date("2004-02-03", "DATE OF BIRTH 02/03/2004")
        self.assertEqual(value["profileBirthDateCheck"], "inconclusive")

if __name__ == "__main__":
    unittest.main()
