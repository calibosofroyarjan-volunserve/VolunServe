"""Synthetic-only regression tests for private SFace photo selection.

No actual faces, camera, live ID, network request, account, model download
or identity approval. Tests use disposable fake bytes in temporary folders.
"""
import tempfile
from pathlib import Path
import unittest

from choose_sface_pair_local import selected_private_pair
from check_sface_two_photos_local import safe_block_reason, inspect_two_photos


class LocalPhotoPickerTests(unittest.TestCase):
    def test_choose_two_existing_files_in_same_private_folder(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "id.jpg").write_bytes(b"FAKE_JPEG_NOT_AN_IMAGE")
            (root / "selfie.png").write_bytes(b"FAKE_PNG_NOT_AN_IMAGE")
            args = selected_private_pair(str(root / "id.jpg"), str(root / "selfie.png"))
            self.assertEqual(args.image_root, str(root.resolve()))
            self.assertEqual(args.id_image, "id.jpg")
            self.assertEqual(args.selfie_image, "selfie.png")
            self.assertTrue(args.consent_confirmed)

    def test_missing_file_reports_safe_specific_blocker(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "private_photo_missing_or_invalid"):
                selected_private_pair(str(Path(temp) / "never-created.jpg"),
                                      str(Path(temp) / "also-absent.jpg"))

    def test_cancelled_selection_has_specific_code(self):
        with self.assertRaisesRegex(ValueError, "photo_selection_cancelled"):
            selected_private_pair("", "")
        self.assertEqual(safe_block_reason(ValueError("photo_selection_cancelled")),
                         "photo_selection_cancelled")

    def test_different_folders_are_rejected_without_paths(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            for name in ("folder1", "folder2"):
                (root / name).mkdir()
            one = root / "folder1" / "id.jpg"
            two = root / "folder2" / "selfie.jpg"
            one.write_bytes(b"FAKE_IMAGE1")
            two.write_bytes(b"FAKE_IMAGE2")
            with self.assertRaisesRegex(ValueError, "photos_must_share_private_folder"):
                selected_private_pair(str(one), str(two))

    def test_non_photo_extension_denied(self):
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / "id.txt"
            second = Path(temp) / "selfie.jpg"
            first.write_text("PRIVATE_PLACEHOLDER")
            second.write_bytes(b"FAKE_IMAGE")
            with self.assertRaisesRegex(ValueError, "private_photo_missing_or_invalid"):
                selected_private_pair(str(first), str(second))

    def test_malicious_error_does_not_leak_file_path_or_identity(self):
        private = "C:\\PrivateFaceQA\\FICTIONAL_SECRET_PERSON_99.jpg"
        self.assertEqual(safe_block_reason(ValueError(private)),
                         "prerequisite_or_runtime_unavailable")
        self.assertEqual(safe_block_reason(OSError(private)),
                         "prerequisite_or_runtime_unavailable")
        self.assertNotIn("FICTIONAL_SECRET_PERSON_99",
                         safe_block_reason(ValueError(private)))

    def test_missing_private_folder_caught_before_ai_import(self):
        with tempfile.TemporaryDirectory() as temp:
            from types import SimpleNamespace
            args = SimpleNamespace(consent_confirmed=True,
                image_root=str(Path(temp) / "missing-root"),
                id_image="id.jpg", selfie_image="selfie.jpg")
            with self.assertRaisesRegex(ValueError, "private_image_directory_unavailable"):
                inspect_two_photos(args)


if __name__ == "__main__":
    unittest.main()
