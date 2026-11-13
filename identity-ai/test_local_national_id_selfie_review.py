"""Synthetic no-media tests for camera-only National ID local research UI."""
import inspect
import queue
import unittest
import local_national_id_selfie_review as local


class CameraOnlyLocalReviewTests(unittest.TestCase):
    def test_no_file_upload_or_picker_in_user_interface(self):
        source = inspect.getsource(local.main)
        self.assertNotIn("askopenfilename", source)
        self.assertNotIn("filedialog", source)
        self.assertNotIn("read_selected_image", source)
        self.assertIn("START LIVE SCAN", source)
        self.assertIn("run_ocr_worker", source)
        self.assertIn("evaluate_camera_side", source)
        self.assertIn("evaluate_selfie_face", source)

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
