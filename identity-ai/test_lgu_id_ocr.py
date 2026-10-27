"""Synthetic OCR rules tests: no real government IDs, no image decoding."""
import unittest
from unittest.mock import patch
import lgu_id_ocr


class LguGovernmentIdOcrTests(unittest.TestCase):
    def test_national_id_marker_is_consistency_only(self):
        result = lgu_id_ocr.classify_text(
            "Pambansang Pagkakakilanlan; name: Synthetic Citizen; 1234 5678",
            "ph_national_id",
        )
        self.assertEqual(result["documentTypeSignal"], "declared_type_text_consistent")
        self.assertEqual(result["decision"], "manual_review_required")
        self.assertNotIn("Synthetic", repr(result))
        self.assertNotIn("1234", repr(result))

    def test_passport_marker_is_consistency_only(self):
        result = lgu_id_ocr.classify_text(
            "Republic of the Philippines Passport Passport No. XXX",
            "ph_passport",
        )
        self.assertEqual(result["documentTypeSignal"], "declared_type_text_consistent")
        self.assertEqual(result["decision"], "manual_review_required")

    def test_drivers_license_matches(self):
        result = lgu_id_ocr.classify_text(
            "LAND TRANSPORTATION OFFICE - DRIVER'S LICENSE",
            "ph_drivers_license",
        )
        self.assertEqual(result["documentTypeSignal"], "declared_type_text_consistent")

    def test_school_and_company_cards_are_explicitly_unsupported(self):
        for type_ in lgu_id_ocr.SUPPORTED:
            for marker in ("SCHOOL ID", "COMPANY ID", "EMPLOYEE ID", "UNIVERSITY ID"):
                result = lgu_id_ocr.classify_text(
                    marker + " Philippine Identification", type_
                )
                self.assertEqual(
                    result["documentTypeSignal"],
                    "unsupported_document_suspected",
                )
                self.assertEqual(result["decision"], "manual_review_required")

    def test_no_mislabeled_government_id(self):
        result = lgu_id_ocr.classify_text("PASSPORT", "ph_drivers_license")
        self.assertEqual(result["documentTypeSignal"], "declared_type_text_mismatch")
        self.assertEqual(result["decision"], "manual_review_required")

    def test_ambiguous_image_never_counts_as_authentic(self):
        for content in ("", "republic of the philippines", "nonsense blurred"):
            result = lgu_id_ocr.classify_text(content, "ph_national_id")
            self.assertEqual(result["documentTypeSignal"], "document_type_inconclusive")
            self.assertEqual(result["decision"], "manual_review_required")

    def test_unspecified_document_is_rejected_for_screening(self):
        result = lgu_id_ocr.classify_text("PASSPORT", "company_id")
        self.assertEqual(result["documentTypeSignal"], "unsupported_declared_type")
        self.assertEqual(result["decision"], "manual_review_required")

    def test_front_back_evaluated_and_no_private_ocr_return(self):
        with patch.object(lgu_id_ocr, "recognize", side_effect=[
            "PAMBANSANG PAGKAKAKILANLAN Test Name 12345",
            "BACK OF CARD 675849231",
        ]) as mock:
            result = lgu_id_ocr.screen_document(
                b"z" * 1400, b"k" * 1600, "ph_national_id"
            )
        self.assertEqual(mock.call_count, 2)
        self.assertEqual(result["documentTypeSignal"], "declared_type_text_consistent")
        self.assertEqual(result["decision"], "manual_review_required")
        self.assertNotIn("12345", repr(result))
        self.assertNotIn("675849231", repr(result))

    def test_passport_does_not_need_fictional_reverse_side(self):
        with patch.object(lgu_id_ocr, "recognize", return_value="Passport") as mock:
            result = lgu_id_ocr.screen_document(
                b"z" * 1400, b"", "ph_passport"
            )
        mock.assert_called_once()
        self.assertEqual(result["documentTypeSignal"], "declared_type_text_consistent")

    def test_missing_back_or_scanner_failure_is_manual_only(self):
        missing = lgu_id_ocr.screen_document(b"z" * 1400, b"", "ph_drivers_license")
        self.assertEqual(missing["documentTypeSignal"], "missing_document_back")
        with patch.object(lgu_id_ocr, "recognize", side_effect=RuntimeError("Tesseract missing")):
            failure = lgu_id_ocr.screen_document(
                b"z" * 1400, b"k" * 1600, "ph_national_id"
            )
        self.assertFalse(failure["ocrEngineAvailable"])
        self.assertEqual(failure["decision"], "manual_review_required")


if __name__ == "__main__":
    unittest.main()
