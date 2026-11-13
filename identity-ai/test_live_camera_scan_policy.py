"""Synthetic National ID camera OCR/side and live face framing tests (NO photos)."""
import unittest
from pathlib import Path
from live_camera_scan_policy import (
    evaluate_camera_side as assess, evaluate_selfie_face,
    advance_selfie_stability,
)


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




class CameraSelfieStabilityPolicy(unittest.TestCase):
    SHAPE = (480, 640, 3)
    BOX = (180, 105, 170, 175)

    def test_ten_continuous_well_framed_frames_reach_local_capture_count(self):
        previous, count = None, 0
        for i in range(10):
            moving = (180 + i % 3, 105 + i % 2, 170, 175)
            count, previous, steady = advance_selfie_stability(
                previous, count, moving, self.SHAPE, ready=True)
            self.assertTrue(steady)
            self.assertEqual(count, i + 1)
        self.assertEqual(count, 10)

    def test_small_normal_camera_motion_is_tolerated(self):
        count, box, steady = advance_selfie_stability(
            self.BOX, 6, (197, 117, 181, 166),
            self.SHAPE, ready=True)
        self.assertEqual(count, 7)
        self.assertTrue(steady)
        self.assertEqual(box, (197.0, 117.0, 181.0, 166.0))

    def test_large_jump_or_scale_change_restarts_count(self):
        for moved in (
            (355, 105, 170, 175),
            (180, 230, 170, 175),
            (170, 80, 275, 275),
            (188, 110, 94, 94),
        ):
            with self.subTest(moved=moved):
                count, box, steady = advance_selfie_stability(
                    self.BOX, 9, moved, self.SHAPE, ready=True)
                self.assertEqual(count, 1)
                self.assertFalse(steady)
                self.assertIsNotNone(box)

    def test_missing_ambiguous_bad_frames_reset_count(self):
        for candidate, ready in (
            (None, False),
            (self.BOX, False),
            ((), True),
            ((float("nan"), 10, 100, 100), True),
            ((-1, 50, 160, 170), True),
            ((520, 80, 200, 170), True),
            ((200, 90, 0, 140), True),
        ):
            with self.subTest(box=str(candidate), ready=ready):
                self.assertEqual(
                    advance_selfie_stability(
                        self.BOX, 9, candidate, self.SHAPE,
                        ready=ready), (0, None, False))

    def test_resuming_after_failure_starts_at_one_not_nine(self):
        count, box, _ = advance_selfie_stability(
            self.BOX, 9, None, self.SHAPE, ready=False)
        self.assertEqual((count, box), (0, None))
        count, box, steady = advance_selfie_stability(
            box, count, self.BOX, self.SHAPE, ready=True)
        self.assertEqual(count, 1)
        self.assertTrue(steady)

    def test_actual_scanner_uses_stability_and_resets_dropped_frames(self):
        source = Path("identity-ai/local_national_id_selfie_review.py").read_text(
            encoding="utf-8")
        self.assertIn("advance_selfie_stability(", source)
        self.assertIn('state["face_box"] = None', source)
        self.assertIn('state["face_frames"] = 0', source)
        self.assertIn('Camera frame interrupted.', source)
        self.assertIn('if state["face_frames"] >= 10:', source)
        self.assertNotIn("cv2.imwrite", source)


if __name__ == "__main__":
    unittest.main()
