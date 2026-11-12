"""Offline smoke tests for the actual OpenCV + MediaPipe AI runtime.

No real ID cards, human faces, Firebase accounts, network calls, or credentials.
Run: python -m unittest -v test_ai_runtime_smoke.py
"""
import unittest
import shutil
from io import BytesIO

import cv2
import mediapipe as mp
import numpy as np
from fastapi import HTTPException
from PIL import Image

from main import (
    decode_image,
    face_mesh_engine_ready,
    health,
    image_quality,
    run_face_verification,
)


def synthetic_image_bytes(color=(255, 255, 255)):
    image = Image.new("RGB", (320, 320), color)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class IdentityAiRuntimeSmokeTests(unittest.TestCase):
    def test_pinned_mediapipe_has_required_face_mesh_api(self):
        self.assertTrue(face_mesh_engine_ready())
        self.assertTrue(hasattr(mp.solutions.face_mesh, "FaceMesh"))

    def test_real_face_mesh_can_process_blank_image(self):
        # Exercise the installed/native MediaPipe runtime, not a mock.
        blank_rgb = np.full((256, 256, 3), 255, dtype=np.uint8)
        with mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=2,
            refine_landmarks=True,
            min_detection_confidence=0.5,
        ) as detector:
            detected = detector.process(blank_rgb)
        self.assertFalse(detected.multi_face_landmarks)

    def test_health_never_claims_liveness_or_document_authenticity(self):
        result = health()
        self.assertTrue(result["verificationEngineReady"])
        # This standalone MediaPipe job does not install Tesseract. The
        # Docker OCR job separately requires its executable and readiness.
        # Health must never claim OCR readiness when the binary is absent.
        self.assertEqual(result["documentOcrReady"], shutil.which("tesseract") is not None)
        self.assertTrue(result["profileComparisonReady"])
        self.assertEqual(
            result["documentPrecheckReady"],
            result["documentOcrReady"] and result["profileComparisonReady"],
        )
        self.assertFalse(result["livenessImplemented"])
        self.assertFalse(result["idDocumentAuthenticityVerified"])

    def test_valid_synthetic_image_decodes_and_scores(self):
        decoded = decode_image(synthetic_image_bytes(), "Synthetic fixture")
        self.assertEqual(decoded.shape, (320, 320, 3))
        quality = image_quality(decoded)
        self.assertTrue(0 <= quality["score"] <= 1)
        self.assertTrue(np.isfinite(quality["score"]))

    def test_corrupt_image_is_rejected_with_client_error(self):
        with self.assertRaises(HTTPException) as caught:
            decode_image(b"invalid image, not a government ID", "Synthetic fixture")
        self.assertEqual(caught.exception.status_code, 400)

    def test_too_small_image_is_rejected(self):
        output = BytesIO()
        Image.new("RGB", (60, 60), "white").save(output, format="PNG")
        with self.assertRaises(HTTPException) as caught:
            decode_image(output.getvalue(), "Synthetic fixture")
        self.assertEqual(caught.exception.status_code, 400)

    def test_blank_images_cannot_be_verified(self):
        # Includes the same processing path used by /verify, including
        # Haar detection and MediaPipe FaceMesh; never auto-approves a blank.
        blank = synthetic_image_bytes()
        result = run_face_verification(
            uid="synthetic-unit-test",
            id_document_bytes=blank,
            selfie_bytes=blank,
        )
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["decision"], "failed")
        self.assertFalse(result["livenessImplemented"])
        self.assertIsNone(result["livenessScore"])
        self.assertIn("id_face_not_detected", result["warnings"])


if __name__ == "__main__":
    unittest.main()
