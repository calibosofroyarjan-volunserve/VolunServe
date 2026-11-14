"""No real media, Firebase, model downloads or network.

Test the exact read_upload / decode_image functions extracted from main.py
without importing heavyweight cv2 / MediaPipe / FastAPI dependencies.
"""
import ast
import asyncio
import sys
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from image_upload_bounds import (  # noqa: E402
    MAX_IMAGE_PIXELS, matching_image_signature, image_dimensions_allowed,
)

SOURCE = (ROOT / "main.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


class StubHTTPException(Exception):
    def __init__(self, *, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class StubUpload:
    def __init__(self, data, content_type):
        self.data = data
        self.content_type = content_type
        self.read_sizes = []

    async def read(self, size=-1):
        self.read_sizes.append(size)
        return self.data[:size] if size >= 0 else self.data


def extracted_function(name, extra):
    node = next(
        n for n in TREE.body
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        and n.name == name
    )
    module = ast.Module(body=[node], type_ignores=[])
    ast.fix_missing_locations(module)
    ns = extra.copy()
    exec(compile(module, "main.py:extracted_" + name, "exec"), ns)
    return ns[name]


read_upload = extracted_function("read_upload", {
    "StarletteUploadFile": StubUpload,
    "clean_text": lambda value, count: str(value or "")[:count],
    "ALLOWED_IMAGE_TYPES": {"image/jpeg", "image/jpg", "image/png", "image/webp"},
    "HTTPException": StubHTTPException,
    "matching_image_signature": matching_image_signature,
})

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00"
PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x00"
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 "


class UploadSecurityTests(unittest.TestCase):
    def _read(self, upload, *, maximum=1024):
        return asyncio.run(read_upload(upload, label="Fictional ID image",
                                       maximum_bytes=maximum))

    def test_exact_supported_signatures(self):
        for mime, data in [
            ("image/jpeg", JPEG), ("image/jpg", JPEG),
            ("image/png", PNG), ("image/webp", WEBP),
        ]:
            with self.subTest(mime=mime):
                upload = StubUpload(data, mime)
                self.assertEqual(self._read(upload), data)
                self.assertEqual(upload.read_sizes, [1025])

    def test_wrong_magic_is_refused_even_if_mime_looks_valid(self):
        for mime, data in [
            ("image/jpeg", PNG),
            ("image/png", JPEG),
            ("image/webp", b"plain-text-not-a-picture"),
        ]:
            with self.subTest(mime=mime):
                with self.assertRaises(StubHTTPException) as caught:
                    self._read(StubUpload(data, mime))
                self.assertEqual(caught.exception.status_code, 415)
                self.assertNotIn("plain-text-not-a-picture", caught.exception.detail)

    def test_missing_empty_and_wrong_mime_are_rejected(self):
        with self.assertRaises(StubHTTPException) as missing:
            self._read(None)
        self.assertEqual(missing.exception.status_code, 400)
        with self.assertRaises(StubHTTPException) as empty:
            self._read(StubUpload(b"", "image/png"))
        self.assertEqual(empty.exception.status_code, 400)
        bad = StubUpload(JPEG, "text/html")
        with self.assertRaises(StubHTTPException) as rejected:
            self._read(bad)
        self.assertEqual(rejected.exception.status_code, 415)
        self.assertEqual(bad.read_sizes, [])

    def test_rejects_oversize_without_reading_more_than_limit_plus_one(self):
        blob = JPEG + b"X" * 1024
        upload = StubUpload(blob, "image/jpeg")
        with self.assertRaises(StubHTTPException) as caught:
            self._read(upload, maximum=32)
        self.assertEqual(caught.exception.status_code, 413)
        self.assertEqual(upload.read_sizes, [33])

    def test_no_claims_of_authenticity_from_magic_bytes(self):
        self.assertFalse(matching_image_signature(JPEG, "image/png"))
        self.assertFalse(matching_image_signature(b"", "image/jpeg"))
        self.assertFalse(matching_image_signature(b"GIF89a", "image/jpeg"))
        self.assertFalse(matching_image_signature(JPEG, "application/octet-stream"))
        self.assertFalse(matching_image_signature(JPEG, None))

    def test_pixel_budget_bounds_before_exif_or_conversion(self):
        self.assertEqual(MAX_IMAGE_PIXELS, 16_000_000)
        self.assertTrue(image_dimensions_allowed(4000, 4000))
        self.assertFalse(image_dimensions_allowed(5000, 4000))
        self.assertFalse(image_dimensions_allowed(0, 1))
        self.assertFalse(image_dimensions_allowed(-1, 40))
        self.assertFalse(image_dimensions_allowed(1.4, 1000))
        self.assertFalse(image_dimensions_allowed(True, 1000))

    def test_actual_decoder_checks_pixels_before_exif_expansion(self):
        events = []

        class FakeImage:
            width = 5000
            height = 4000

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return None

        class FakePillow:
            @staticmethod
            def open(_):
                events.append("header_open")
                return FakeImage()

        class FakeOps:
            @staticmethod
            def exif_transpose(_):
                events.append("EXIF_EXPANDED")
                raise AssertionError("EXIF should not process oversized image")

        decode = extracted_function("decode_image", {
            "Image": FakePillow,
            "ImageOps": FakeOps,
            "BytesIO": lambda _: object(),
            "image_dimensions_allowed": image_dimensions_allowed,
            "HTTPException": StubHTTPException,
        })
        with self.assertRaises(StubHTTPException) as rejected:
            decode(b"synthetic-non-image", "Fictional ID")
        self.assertEqual(rejected.exception.status_code, 413)
        self.assertEqual(events, ["header_open"])


if __name__ == "__main__":
    unittest.main()
