"""Synthetic National ID camera OCR/side and live face framing tests (NO photos)."""
import unittest
from live_camera_scan_policy import evaluate_camera_side as assess, evaluate_selfie_face


FRONT = (
    "PHILIPPINE IDENTIFICATION CARD SURNAME DELA CRUZ GIVEN NAMES MARIA "
    "DATE OF BIRTH 1998 09 05"
)
BACK = "BLOOD TYPE O MARITAL STATUS SINGLE DATE OF ISSUE 2022 09 01"
SCHOOL = "SCHOOL ID STUDENT IDENTIFICATION NAME SAMPLE SCHOOL"
OTHER = "DRIVER'S LICENSE LAND TRANSPORTATION OFFICE"


class CameraOCRPolicy(unittest.TestCase):
    def test_only_matching_front_and_back_become_capture_ready(self):
        front = assess("front", FRONT, 130.0, 120.0)
        back = assess("back", BACK, 130.0, 120.0)
        self.assertEqual(front["state"], "front_candidate")
        self.assertEqual(back["state"], "back_candidate")
        self.assertTrue(front["ready"])
        self.assertTrue(back["ready"])

    def test_front_back_swap_rejected(self):
        self.assertEqual(assess("front", BACK, 130.0, 120.0)["state"], "wrong_side")
        self.assertEqual(assess("back", FRONT, 130.0, 120.0)["state"], "wrong_side")

    def test_school_id_never_becomes_national_id(self):
        for stage in ("front", "back"):
            with self.subTest(stage=stage):
                result = assess(stage, SCHOOL, 130.0, 110.0)
                self.assertFalse(result["ready"])
                self.assertEqual(result["state"], "unsupported")

    def test_wrong_document_or_ambiguous_text_not_ready(self):
        self.assertFalse(assess("front", OTHER, 130.0, 120.0)["ready"])
        self.assertFalse(assess("back", "UNKNOWN CARD", 130.0, 120.0)["ready"])

    def test_low_quality_or_invalid_ocr_is_never_ready(self):
        for stage, ocr in (("front", FRONT), ("back", BACK)):
            for blur, bright in ((5.0, 120.0), (130.0, 20.0),
                                 (130.0, 251.0), (float("nan"), 120.0)):
                with self.subTest(stage=stage, blur=blur, bright=bright):
                    self.assertFalse(assess(stage, ocr, blur, bright)["ready"])
            self.assertFalse(assess(stage, None, 140.0, 120.0)["ready"])

    def test_no_decision_or_sensitive_fields_returned(self):
        for kind, text in (("front", FRONT), ("back", BACK)):
            result = assess(kind, text, 140.0, 110.0)
            self.assertEqual(set(result), {"ready", "state", "guidance"})
            self.assertNotIn("DELA CRUZ", str(result))


class CameraSelfiePolicy(unittest.TestCase):
    def test_single_well_framed_face_ready_only_for_capture(self):
        result = evaluate_selfie_face([(160, 95, 160, 170)], (480, 640, 3),
                                      120.0, 126.0)
        self.assertTrue(result["ready"])
        self.assertEqual(set(result), {"ready", "guidance"})

    def test_no_tiny_offscreen_or_multiple_face(self):
        for faces in ([], [(1, 2, 100, 100)], [(150, 70, 65, 65)],
                      [(140, 70, 100, 100), (370, 70, 110, 110)]):
            with self.subTest(faces=faces):
                self.assertFalse(evaluate_selfie_face(
                    faces, (480, 640, 3), 110.0, 125.0)["ready"])

    def test_selfie_dark_or_blurry_never_ready(self):
        faces = [(160, 95, 160, 170)]
        for blur, brightness in ((5.0, 100.0), (100.0, 10.0),
                                 (100.0, 251.0), (float("inf"), 110.0)):
            with self.subTest(blur=blur, brightness=brightness):
                self.assertFalse(evaluate_selfie_face(
                    faces, (480, 640, 3), blur, brightness)["ready"])


if __name__ == "__main__":
    unittest.main()
