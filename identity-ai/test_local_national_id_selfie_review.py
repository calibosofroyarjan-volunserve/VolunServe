"""Synthetic no-media tests for camera-only National ID local research UI."""
import inspect
import queue
import unittest
from pathlib import Path
import local_national_id_selfie_review as local


class CameraOnlyLocalReviewTests(unittest.TestCase):
    def test_windows_launcher_checks_real_tesseract_before_scan(self):
        # Inspect only command text: no network, Windows OCR or personal media.
        command = Path("Start-VolunServe-Private-ID-Review.cmd").read_text(
            encoding="utf-8")
        self.assertIn("where tesseract.exe", command)
        self.assertIn("Tesseract-OCR\\tesseract.exe", command)
        self.assertIn("pytesseract.get_tesseract_version()", command)
        self.assertIn("goto OCR_MISSING", command)
        self.assertIn(":OCR_MISSING", command)
        self.assertLess(command.index("pytesseract.get_tesseract_version()"),
                        command.index('py -3.11 "identity-ai\\local_national_id_selfie_review.py"'))
        self.assertNotIn("curl ", command.lower())
        self.assertNotIn("powershell -", command.lower())

    def test_each_camera_capture_must_be_distinct(self):
        # Fabricated bytes only. No IDs, faces, image models or network.
        local.validate_distinct_local_captures(
            b"synthetic FRONT", b"synthetic BACK", b"synthetic SELFIE")

        for frames in (
            (b"same", b"same", b"selfie"),
            (b"front", b"back", b"front"),
            (b"front", b"back", b"back"),
        ):
            with self.subTest(frames=frames):
                with self.assertRaisesRegex(ValueError, "reused"):
                    local.validate_distinct_local_captures(*frames)

    def test_reject_missing_or_oversized_frame_before_importing_ai_models(self):
        for frames in (
            (b"", b"back", b"selfie"),
            (b"front", None, b"selfie"),
            (b"front", b"back", "not bytes"),
            (b"front", b"back", b"x" * (local.MAX_IMAGE_BYTES + 1)),
        ):
            with self.subTest(sizes=[len(f) if isinstance(f, bytes) else "bad" for f in frames]):
                with self.assertRaisesRegex(ValueError, "missing or invalid"):
                    local.validate_distinct_local_captures(*frames)
        source = inspect.getsource(local.perform_local_review)
        self.assertLess(source.index("validate_distinct_local_captures("),
                        source.index("import main as ai"))

    def test_no_file_upload_or_picker_in_user_interface(self):
        source = inspect.getsource(local.main)
        self.assertNotIn("askopenfilename", source)
        self.assertNotIn("filedialog", source)
        self.assertNotIn("read_selected_image", source)
        self.assertIn("START LIVE SCAN", source)
        self.assertIn("run_ocr_worker", source)
        self.assertIn("evaluate_camera_side", source)
        self.assertIn("evaluate_selfie_face", source)

    def test_low_quality_camera_manual_capture_is_explicit_and_unverified(self):
        source = inspect.getsource(local.main)
        # The user must explicitly consent and confirm any manual snapshot.
        # This is LOCAL in-memory review, not acceptance of a government ID.
        self.assertIn("MANUAL CAPTURE FOR REVIEW — NOT VERIFIED", source)
        self.assertIn("messagebox.askyesno(", source)
        self.assertIn('if stage not in ("front", "back"):', source)
        self.assertIn("manual_captures.add(stage)", source)
        self.assertIn('text="Manual capture only — NOT VERIFIED"', source)
        self.assertIn("manual_captures.clear()", source)
        self.assertIn("camera_id_roi_bounds(frame.shape, compact=True)", source)
        self.assertIn("cv2.imencode", source)
        self.assertIn("review_in_memory", source)
        self.assertIn("manual Admin review still required", inspect.getsource(local.safe_summary))
        self.assertIn("screening_ready_for_face_comparison", inspect.getsource(local.perform_local_review))
        self.assertNotIn("cv2.imwrite", source)
        self.assertNotIn("requests.post", source)

    def test_manual_capture_still_reports_no_verified_identity(self):
        display = local.safe_summary({
            "status": "inconclusive",
            "detectedIdType": None,
            "warningCodes": ["document_type_not_recognized"],
        })
        self.assertIn("NOT VERIFIED IDENTITY", display)
        self.assertIn("Account action: NONE", display)
        self.assertIn("Not performed", display)

    def test_automatic_review_does_not_verify_any_identity(self):
        result = local.safe_summary(
            {"status": "text_consistent_unverified",
             "detectedIdType": "national_id",
             "imageQualityStatus": "adequate",
             "backImageQualityStatus": "adequate",
             "warningCodes": []},
            {"status": "pending", "decision": "manual_review",
             "matchScore": 0.91},
        )
        self.assertIn("NOT VERIFIED IDENTITY", result)
        self.assertIn("manual Admin review still required", result)
        self.assertIn("Uncalibrated similarity score", result)

    def test_unsupported_id_stays_unmatched(self):
        result = local.safe_summary(
            {"status": "unsupported", "detectedIdType": None,
             "warningCodes": ["school_id_not_supported"]})
        self.assertIn("not established", result)
        self.assertIn("Not performed", result)
        self.assertIn("school_id_not_supported", result)

    def test_nan_inf_and_boolean_not_displayed_as_scores(self):
        for value in (float("nan"), float("inf"), True):
            with self.subTest(value=str(value)):
                text = local.safe_summary({"warningCodes": []},
                    {"decision": "manual_review", "matchScore": value})
                self.assertNotIn("Uncalibrated similarity score", text)

    def test_no_account_or_network_calls_in_camera_application(self):
        source = inspect.getsource(local.main)
        for forbidden in (
            "requests.post", "requests.get", "firebase", "httpx",
            "urlopen(", "Cloudinary", "verified=True", "open(\"",
            "cv2.imwrite", "filedialog"):
            self.assertNotIn(forbidden, source)

    def test_abort_drops_partial_frames_and_queued_ocr_media(self):
        private_front = object()
        private_back = object()
        queued_media = object()
        captures = {"front": private_front, "back": private_back}
        result_queue = queue.Queue()
        result_queue.put(("front", {"ready": True}, queued_media))
        result_queue.put(("back", {"ready": False}, None))
        local.release_scan_buffers(captures, result_queue)
        self.assertEqual(captures, {})
        self.assertTrue(result_queue.empty())

    def test_buffer_release_is_safe_for_no_frames_or_queue(self):
        local.release_scan_buffers()
        local.release_scan_buffers({}, queue.Queue())

    def test_cancel_close_consent_and_clear_use_shared_cleanup(self):
        source = inspect.getsource(local.main)
        self.assertIn("cancel_ocr.set()", source)
        self.assertIn("if not cancel_ocr.is_set()", source)
        self.assertIn("if not completed:", source)
        self.assertIn("reset_captures()", source)
        self.assertIn("release_scan_buffers(", source)
        self.assertIn("active_window[\"close\"]()", source)
        self.assertIn("close(completed=True)", source)
        self.assertIn("command=clear_scans", source)
        self.assertIn("del scans", source)
        self.assertIn("release_scan_buffers(captured)", source)


if __name__ == "__main__":
    unittest.main()
