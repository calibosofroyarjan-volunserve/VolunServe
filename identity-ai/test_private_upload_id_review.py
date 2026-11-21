"""Synthetic only. No IDs, camera, network, Firebase or biometric data."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name("private_upload_id_review.py")
spec = importlib.util.spec_from_file_location("private_upload_id_review", SOURCE)
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)

def fixture(**overrides):
    base = {
        "status": "text_consistent_unverified",
        "detectedIdType": "national_id",
        "warningCodes": [],
        "imageQualityStatus": "adequate",
        "backImageQualityStatus": "adequate",
        "profileNameCheck": "possible_match",
        "profileBirthDateCheck": "possible_match",
    }
    base.update(overrides)
    return base

class UploadFirstTests(unittest.TestCase):
    def setUp(self):
        self.front = b"\xff\xd8\xff" + b"a" * 130
        self.back = b"\xff\xd8\xff" + b"b" * 130
        self.selfie = b"\xff\xd8\xff" + b"c" * 130

    def fake_ai(self, **values):
        answer = fixture(**values)
        def screen(**kwargs):
            self.assertEqual(kwargs["declared_type"], "national_id")
            self.assertEqual(kwargs["id_document_bytes"], self.front)
            self.assertEqual(kwargs["id_back_document_bytes"], self.back)
            return answer
        return types.SimpleNamespace(
            screen_government_id=screen, decode_image=lambda x, label: x)

    def test_both_sides_used_and_no_real_admin_approval(self):
        with patch.dict(sys.modules, {"main": self.fake_ai()}):
            v = lab.evaluate_private_uploads(
                self.front, self.back, reference_first="Sample",
                reference_last="Resident", reference_dob="1999-03-21")
        self.assertEqual(v["document"], "national_id_text_candidate")
        self.assertEqual(v["name"], "possible_match")
        self.assertEqual(v["dob"], "possible_match")
        self.assertFalse(v["identity_verified"])
        self.assertEqual(v["admin"], "manual_review_required_NOT_SUBMITTED")
        report = lab.safe_report(v)
        for forbidden in ("Sample", "Resident", "1999-03-21"):
            self.assertNotIn(forbidden, report)
        self.assertIn("DEMO ONLY", report)

    def test_uncertain_and_wrong_id_never_become_verified(self):
        for fields in [
            {"status": "inconclusive", "detectedIdType": None,
             "warningCodes": ["document_type_not_recognized"]},
            {"status": "mismatch", "detectedIdType": "passport",
             "warningCodes": ["selected_id_type_conflicts_with_ocr"]},
            {"status": "text_consistent_unverified",
             "warningCodes": ["document_back_layout_inconclusive"]},
        ]:
            with self.subTest(fields=fields), patch.dict(sys.modules, {"main": self.fake_ai(**fields)}):
                v = lab.evaluate_private_uploads(self.front, self.back)
                self.assertEqual(v["document"], "inconclusive_requires_review")
                self.assertFalse(v["identity_verified"])

    def test_duplicate_media_and_invalid_reference_date_blocked(self):
        with self.assertRaisesRegex(ValueError, "duplicate_image_capture"):
            lab.evaluate_private_uploads(self.front, self.front)
        with self.assertRaisesRegex(ValueError, "date_must_be_yyyy_mm_dd"):
            lab.evaluate_private_uploads(self.front, self.back, reference_dob="2026-02-30")
        with self.assertRaisesRegex(ValueError, "provide_both_reference_names"):
            lab.evaluate_private_uploads(self.front, self.back, reference_first="Sample")
        with self.assertRaisesRegex(ValueError, "selfie_required_for_face_research"):
            lab.evaluate_private_uploads(self.front, self.back, sface_opt_in=True)

    def test_private_file_picker_requires_real_photo_header(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "front.jpg"
            path.write_bytes(self.front)
            self.assertEqual(lab._read_local_photo(str(path)), self.front)
            path.write_bytes(b"not-an-image")
            with self.assertRaisesRegex(ValueError, "invalid_photo_content"):
                lab._read_local_photo(str(path))

    def test_sface_research_never_approves_identity(self):
        stub = types.SimpleNamespace(
            assess_pair_shadow=lambda a, b: {
                "status": "similarity_observed_unvalidated",
                "cosineSimilarity": 0.73224,
            })
        with patch.dict(sys.modules, {"main": self.fake_ai(),
                                      "sface_shadow": stub}):
            value = lab.evaluate_private_uploads(
                self.front, self.back, selfie_bytes=self.selfie, sface_opt_in=True)
        self.assertEqual(value["face_score"], 0.73224)
        self.assertEqual(value["face"], "similarity_observed_unvalidated")
        self.assertFalse(value["identity_verified"])
        self.assertFalse(value["liveness_validated"])

    def test_invalid_sface_score_does_not_produce_match(self):
        stub = types.SimpleNamespace(
            assess_pair_shadow=lambda a, b: {
                "status": "similarity_observed_unvalidated", "cosineSimilarity": float("nan")
            })
        with patch.dict(sys.modules, {"main": self.fake_ai(),
                                      "sface_shadow": stub}):
            v = lab.evaluate_private_uploads(self.front, self.back,
                    selfie_bytes=self.selfie, sface_opt_in=True)
        self.assertEqual(v["face"], "inconclusive")
        self.assertIsNone(v["face_score"])

if __name__ == "__main__":
    unittest.main()
