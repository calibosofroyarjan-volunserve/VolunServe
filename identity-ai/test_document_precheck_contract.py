"""Offline tests of the actual ID-only precheck handler via AST extraction.

All "images" are synthetic byte labels, never real IDs or selfies. The real
document text screening module is exercised with stubbed image/OCR operations.
No media, Firebase, cloud credentials, network or verification writes.
"""
from __future__ import annotations
import ast
import asyncio
from pathlib import Path
import unittest

from document_screening import assess_document_text, combine_document_sides, document_ocr_unavailable


class RouteError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class Request:
    headers = {"content-type": "multipart/form-data; boundary=synthetic"}

    def __init__(self, *, front=b"national", back=b"back_unknown", id_type="national_id", consent="true"):
        self.values = {
            "idType": id_type,
            "consent": consent,
            "idDocument": front,
            "idBackDocument": back,
        }
        if back is None:
            del self.values["idBackDocument"]

    async def form(self):
        return self.values


def build_actual_route():
    source = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    matches = [
        node for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "document_precheck"
    ]
    assert len(matches) == 1, "Expected one actual ID precheck route"
    handler = matches[0]
    handler.decorator_list = []
    mod = ast.Module(
        body=[
            ast.ImportFrom(
                module="__future__", names=[ast.alias(name="annotations")], level=0,
            ),
            handler,
        ],
        type_ignores=[],
    )
    ast.fix_missing_locations(mod)
    read_calls = {"count": 0}
    fake_text = {
        b"national": "PHILIPPINE IDENTIFICATION CARD",
        b"back_unknown": "BLOOD TYPE O DATE OF ISSUE",
        b"school": "STI SCHOOL ID STUDENT NUMBER 1234",
        b"license": "DRIVER'S LICENSE LAND TRANSPORTATION OFFICE",
        b"outage": None,
        b"blurred": "PHILIPPINE IDENTIFICATION CARD",
        b"duplicate": "PHILIPPINE IDENTIFICATION CARD",
    }

    def check_key(key):
        if key != "synthetic-staging-secret":
            raise RouteError(401, "private key missing")

    def check_uid(uid):
        if uid != "synthetic-resident":
            raise RouteError(401, "user missing")

    async def read_upload(data, *, label, maximum_bytes):
        read_calls["count"] += 1
        if not isinstance(data, bytes) or not data or len(data) > maximum_bytes:
            raise RouteError(400, "scan missing or malformed")
        return data

    def screen_government_id(*, declared_type, id_document_bytes):
        text = fake_text[id_document_bytes]
        if text is None:
            return document_ocr_unavailable(declared_type)
        return assess_document_text(declared_type, text)

    scope = {
        "Request": Request,
        "Header": lambda **_kwargs: None,
        "HTTPException": RouteError,
        "require_internal_backend": check_key,
        "validate_forwarded_user": check_uid,
        "clean_text": lambda value, size: str(value or "").strip()[:size],
        "ACCEPTED_ID_TYPES": {
            "national_id", "drivers_license", "passport", "other_government_id",
        },
        "MAX_ID_DOCUMENT_BYTES": 10 * 1024 * 1024,
        "StarletteUploadFile": type("UnusedFile", (), {}),
        "read_upload": read_upload,
        "decode_image": lambda data, label: data,
        "image_quality": lambda data: {"score": 0.1 if data == b"blurred" else 0.9},
        "DEFAULT_MIN_IMAGE_QUALITY": 0.34,
        "screen_government_id": screen_government_id,
        "combine_document_sides": combine_document_sides,
        "asyncio": asyncio,
    }
    exec(compile(mod, "identity-ai/main.py", "exec"), scope)
    assert "db" not in source[source.index('async def document_precheck'):source.index('async def verify_identity')], (
        "ID-only precheck must not write identity or Firebase records"
    )
    return scope["document_precheck"], read_calls


class PrivateDocumentPrecheckRouteTests(unittest.TestCase):
    def setUp(self):
        self.handler, self.read_calls = build_actual_route()

    def run_precheck(self, request=None, key="synthetic-staging-secret", uid="synthetic-resident"):
        return asyncio.run(self.handler(
            request or Request(),
            x_volunserve_user_id=uid,
            x_volunserve_internal_key=key,
        ))

    def test_front_and_unrecognized_back_can_proceed_only_to_face_comparison(self):
        actual = self.run_precheck()
        self.assertEqual(actual["outcome"], "pass")
        self.assertFalse(actual["documentScreening"]["authenticityVerified"])
        self.assertTrue(actual["documentScreening"]["manualReviewRequired"])
        self.assertFalse(actual["documentScreening"]["livenessVerified"])
        self.assertTrue(actual["documentScreening"]["backSideScreened"])
        self.assertEqual(self.read_calls["count"], 2)

    def test_legacy_face_route_still_exists(self):
        source = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
        self.assertIn('async def verify_identity(', source)
        self.assertIn('run_face_verification,', source)

    def test_school_id_front_rejected_without_face_scan(self):
        actual = self.run_precheck(Request(front=b"school"))
        self.assertEqual(actual["outcome"], "rejected")
        self.assertIn("non_government_id_detected", actual["documentScreening"]["warningCodes"])

    def test_school_id_back_rejected_without_face_scan(self):
        actual = self.run_precheck(Request(back=b"school"))
        self.assertEqual(actual["outcome"], "rejected")
        self.assertIn("non_government_id_detected", actual["documentScreening"]["warningCodes"])

    def test_wrong_government_id_type_is_not_a_pass(self):
        actual = self.run_precheck(Request(front=b"license"))
        self.assertEqual(actual["outcome"], "retry")

    def test_blurry_front_fails_quality_gate(self):
        actual = self.run_precheck(Request(front=b"blurred"))
        self.assertEqual(actual["outcome"], "retry")
        self.assertIn("low_document_image_quality", actual["documentScreening"]["warningCodes"])

    def test_duplicate_front_and_back_fail(self):
        actual = self.run_precheck(Request(front=b"national", back=b"national"))
        self.assertEqual(actual["outcome"], "retry")
        self.assertIn("document_front_back_duplicate", actual["documentScreening"]["warningCodes"])

    def test_ocr_outage_is_not_a_pass(self):
        actual = self.run_precheck(Request(front=b"outage"))
        self.assertEqual(actual["outcome"], "retry")

    def test_missing_back_is_blocked_before_selfie(self):
        with self.assertRaises(RouteError) as caught:
            self.run_precheck(Request(back=None))
        self.assertEqual(caught.exception.status_code, 400)

    def test_missing_consent_is_blocked_before_image_read(self):
        with self.assertRaises(RouteError) as caught:
            self.run_precheck(Request(consent="false"))
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(self.read_calls["count"], 0)

    def test_private_key_and_authenticated_uid_required(self):
        for kwargs in ({"key": "wrong"}, {"uid": "wrong"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(RouteError) as caught:
                self.run_precheck(**kwargs)
            self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(self.read_calls["count"], 0)


if __name__ == "__main__":
    unittest.main()
