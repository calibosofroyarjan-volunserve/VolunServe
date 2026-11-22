"""Synthetic National ID-only label classification. No photos/IDs or PII."""
import unittest
from unittest.mock import patch
import importlib.util
from pathlib import Path
import sys
import types

source = Path(__file__).with_name("local_national_id_type_only.py")
spec = importlib.util.spec_from_file_location("national_id_type_lab", source)
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

FRONT = (
    "REPUBLIKA NG PILIPINAS\nPHILIPPINE IDENTIFICATION CARD\n"
    "PAMBANSANG PAGKAKAKILANLAN\n"
    "APELYIDO / LAST NAME: EXAMPLE\n"
    "MGA PANGALAN / GIVEN NAMES: SAMPLE\n"
    "GITNANG APELYIDO / MIDDLE NAME: DEMO\n"
    "PETSA NG KAPANGANAKAN / DATE OF BIRTH: JANUARY 01 2000\n"
)
NATIONAL_WITHOUT_DOB = (
    "REPUBLIKA NG PILIPINAS\n"
    "PAMBANSANG PAGKAKAKILANLAN\n"
    "APELYIDO / LAST NAME\nMGA PANGALAN / GIVEN NAMES\n"
)

class NationalIdTypeOnlyTests(unittest.TestCase):
    def classify(self, sample):
        # The pure classifier uses only the existing local lexical recognizer.
        # Import this on the test path, never the FastAPI backend.
        return lab.classify_national_id_ocr(sample)

    def test_physical_national_id_labels_are_candidate(self):
        result = self.classify(FRONT)
        self.assertEqual(result["status"], "national_id_format_candidate")
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["identityVerified"])
        self.assertTrue(result["manualReviewRequired"])

    def test_birthday_not_required(self):
        result = self.classify(NATIONAL_WITHOUT_DOB)
        self.assertEqual(result["status"], "national_id_format_candidate")
        self.assertNotIn("DOB", lab.report_safe(result))

    def test_only_title_without_front_layout_is_not_enough(self):
        for sample in (
            "NATIONAL ID CARD",
            "PHILSYS",
            "PHILIPPINE IDENTIFICATION CARD\nAPELYIDO",
            "NATIONAL ID CARD\nADVERTISEMENT",
            "REPUBLIKA NG PILIPINAS",
            "PAMBANSANG PAGKAKAKILANLAN\nQR CODE",
            "",
        ):
            with self.subTest(sample=sample):
                self.assertEqual(self.classify(sample)["status"], "needs_review")

    def test_other_cards_unsupported(self):
        for sample in (
            "SCHOOL ID\nSURNAME GIVEN NAMES DATE OF BIRTH",
            "STUDENT IDENTIFICATION CARD\nSAMPLE SCHOOL",
            "EMPLOYEE IDENTIFICATION CARD\nSAMPLE",
            "DRIVER'S LICENSE\nLAND TRANSPORTATION OFFICE",
            "REPUBLIC OF THE PHILIPPINES\nPASSPORT",
            "UMID\nUNIFIED MULTI PURPOSE ID",
            "PRC\nPROFESSIONAL IDENTIFICATION CARD",
        ):
            with self.subTest(sample=sample):
                self.assertEqual(
                    self.classify(sample)["status"], "unsupported_other_card")

    def test_school_student_ocr_variants_are_unsupported(self):
        # Synthetic mis-spaced strings representative of OCR; no real ID photos.
        for sample in (
            "SAMPLE UNIVERSITY\\nSTUDENT\\nI D",
            "STUDENT\\nSCHOOL",
            "COLLEGE\\nLEARNER\\nIDENTIFICATION",
            "ACADEMY\\nPUPIL\\nCARD",
            "STUDENT\\nSTUDENT NUMBER 123",
            "ELEMENTARY\\nESTUDYANTE",
        ):
            with self.subTest(sample=sample):
                self.assertEqual(
                    self.classify(sample.replace("\\\\n", "\\n"))["status"],
                    "unsupported_other_card")

    def test_weak_school_terms_alone_remain_inconclusive(self):
        for sample in (
            "SCHOOL", "STUDENT", "COLLEGE", "CAMPUS",
            "LEARNER", "HIGH SCHOOL", "INSTITUTE", "ID",
            "SCHOOL YEAR",
        ):
            with self.subTest(sample=sample):
                self.assertEqual(self.classify(sample)["status"], "needs_review")

    def test_philid_not_blocked_for_unrelated_school_address_word(self):
        sample = NATIONAL_WITHOUT_DOB + "\\nTIRAHAN NEAR SCHOOL"
        self.assertEqual(self.classify(sample.replace("\\\\n", "\\n"))["status"],
                         "national_id_format_candidate")

    def test_national_heading_embedded_on_student_card_is_never_candidate(self):
        sample = FRONT + "\nSTUDENT ID\nUNIVERSITY ID\n"
        self.assertEqual(
            self.classify(sample)["status"], "unsupported_other_card")

    def test_conflicting_real_document_types_need_review(self):
        sample = NATIONAL_WITHOUT_DOB + "\nPASSPORT\n"
        self.assertEqual(
            self.classify(sample)["status"], "needs_review")

    def test_readable_front_label_but_no_id_heading_is_not_candidate(self):
        sample = "APELYIDO\nMGA PANGALAN\nDATE OF BIRTH\nADDRESS"
        self.assertEqual(self.classify(sample)["status"], "needs_review")

    def test_report_has_no_raw_source_text_and_no_approval(self):
        result = self.classify(FRONT)
        report = lab.report_safe(result)
        for secret in ("EXAMPLE", "SAMPLE", "JANUARY", "2000", "QR CODE"):
            self.assertNotIn(secret, report)
        self.assertIn("NOT VERIFIED", report)
        self.assertIn("UNCHANGED", report)

    def test_retry_never_upgrades_clear_other_document(self):
        fake_ai = types.SimpleNamespace(
            extract_government_id_text=lambda data, label: "DRIVER'S LICENSE",
        )
        with patch.dict(sys.modules, {"main": fake_ai}):
            result = lab.screen_photo_type(b"synthetic-image")
        self.assertEqual(result["status"], "unsupported_other_card")

    def test_invalid_image_rejected_pre_ocr(self):
        for sample in (b"", "not bytes", b"a" * (10 * 1024 * 1024 + 1)):
            with self.subTest(sample_type=type(sample).__name__):
                with self.assertRaisesRegex(ValueError, "photo_size_invalid"):
                    lab.screen_photo_type(sample)

if __name__ == "__main__":
    unittest.main()
