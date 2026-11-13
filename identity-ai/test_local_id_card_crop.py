"""Synthetic-only card-region OCR geometry tests. NO real ID, face or media."""
import unittest
import cv2
import numpy as np
from local_id_card_crop import crop_candidate_card


class LocalIDCardOCRRegionTests(unittest.TestCase):
    def example_frame(self):
        # Blank synthetic quadrilateral with invented filler. No citizen data.
        frame = np.full((480, 760, 3), 70, dtype=np.uint8)
        cv2.rectangle(frame, (170, 148), (605, 421),
                      (234, 236, 240), thickness=-1)
        cv2.putText(frame, "SYNTHETIC TEST CARD", (195, 198),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (25, 30, 35), 2)
        cv2.putText(frame, "SURNAME TEST", (195, 260),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (25, 30, 35), 2)
        return frame

    def test_centered_card_crop_enlarges_text_share_without_leaking_to_disk(self):
        image = self.example_frame()
        crop = crop_candidate_card(image)
        self.assertIsNotNone(crop)
        self.assertEqual(crop.dtype, np.uint8)
        self.assertEqual(crop.shape[2], 3)
        self.assertLess(crop.shape[0], image.shape[0])
        self.assertLess(crop.shape[1], image.shape[1])
        self.assertGreater(crop.shape[1], 380)
        self.assertGreater(crop.shape[0], 245)
        self.assertFalse(np.shares_memory(crop, image))

    def test_mild_card_rotation_can_still_be_cropped(self):
        image = self.example_frame()
        transform = cv2.getRotationMatrix2D((380, 240), 7, 1)
        rotated = cv2.warpAffine(image, transform, (760, 480),
                                 borderValue=(70, 70, 70))
        crop = crop_candidate_card(rotated)
        self.assertIsNotNone(crop)

    def test_unrecognized_empty_or_bad_images_fall_back_cleanly(self):
        for image in (
            None, np.zeros((480, 760, 3), np.uint8),
            np.zeros((100, 200, 3), np.uint8),
            np.zeros((480, 760), np.uint8),
            np.zeros((480, 760, 3), np.float32),
        ):
            with self.subTest(shape=getattr(image, "shape", None)):
                self.assertIsNone(crop_candidate_card(image))

    def test_local_scanner_keeps_original_strict_ocr_gate(self):
        from pathlib import Path
        source = Path("identity-ai/local_national_id_selfie_review.py").read_text(
            encoding="utf8")
        self.assertIn("crop_candidate_card(snapshot)", source)
        self.assertIn("card if card is not None else snapshot", source)
        self.assertIn("evaluate_camera_side(stage, ocr,", source)
        self.assertIn('if evidence["ready"] and payload is not None:', source)
        self.assertIn('if state["matching"] >= 2:', source)
        self.assertNotIn("cv2.imwrite", source)
        self.assertNotIn("requests.post", source)


if __name__ == "__main__":
    unittest.main()
