"""Synthetic test of local-only diagnostics; no photos, accounts, or network."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "private_upload_id_review", Path(__file__).with_name("private_upload_id_review.py"))
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

class SafeSecondaryOcrTests(unittest.TestCase):
    def test_unconfirmed_document_is_never_promoted_by_extra_clues(self):
        front, back = b"synthetic front", b"synthetic back"
        def screening(**kwargs):
            return {
                "status": "inconclusive", "detectedIdType": "national_id",
                "imageQualityStatus": "adequate", "backImageQualityStatus": "adequate",
                "warningCodes": ["document_back_evidence_inconclusive"],
                "profileNameCheck": "possible_match",
                "profileBirthDateCheck": "inconclusive",
            }
        with patch.dict(sys.modules, {"main": types.SimpleNamespace(
                screen_government_id=screening)}), patch.object(
                lab, "_extra_ocr_diagnostic", return_value={
                    "back": "extra_label_clues_observed",
                    "dob": "possible_match",
                }):
            result = lab.evaluate_private_uploads(
                front, back, reference_first="TEST",
                reference_last="RESIDENT", reference_dob="2004-12-18")
        self.assertEqual(result["ocr_status"], "inconclusive")
        self.assertEqual(result["document"], "inconclusive_requires_review")
        self.assertEqual(result["dob"], "inconclusive")
        self.assertEqual(result["extra_dob_ocr"], "possible_match")
        self.assertEqual(result["extra_back_ocr"], "extra_label_clues_observed")
        self.assertFalse(result["identity_verified"])
        self.assertEqual(result["admin"], "manual_review_required_NOT_SUBMITTED")
        report = lab.safe_report(result)
        for forbidden in ("2004-12-18", "TEST RESIDENT", "synthetic front"):
            self.assertNotIn(forbidden, report)

    def test_exception_in_extra_ocr_does_not_override_strict_warning(self):
        def screening(**kwargs):
            return {
                "status": "inconclusive", "detectedIdType": None,
                "imageQualityStatus": "adequate", "backImageQualityStatus": "adequate",
                "warningCodes": ["document_type_not_recognized"],
                "profileBirthDateCheck": "inconclusive",
                "profileNameCheck": "inconclusive",
            }
        with patch.dict(sys.modules, {"main": types.SimpleNamespace(
                screen_government_id=screening)}), patch.object(
                lab, "_extra_ocr_diagnostic", side_effect=RuntimeError("private text")):
            value = lab.evaluate_private_uploads(b"a", b"b", reference_dob="2004-12-18")
        self.assertEqual(value["extra_back_ocr"], "unavailable")
        self.assertEqual(value["ocr_status"], "inconclusive")
        self.assertNotIn("private text", lab.safe_report(value))

if __name__ == "__main__":
    unittest.main()
