"""Offline route tests for consented ID-only scanning; no genuine personal IDs.

Use fabricated cards, no HTTP server, no Firestore, no network and no selfie.
"""
import os
import unittest
from contextlib import contextmanager
from io import BytesIO
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile, Headers
from main import document_precheck
from test_synthetic_document_pipeline import (
    synthetic_photo, NATIONAL_SAMPLE, BACK_SIDE_SAMPLE, SCHOOL_SAMPLE,
)


@contextmanager
def internal_key():
    with patch.dict(os.environ, {"IDENTITY_AI_INTERNAL_KEY": "test-private-key"}):
        yield


def fake_image(content):
    return UploadFile(
        file=BytesIO(content), filename="DEMO-ONLY.png",
        headers=Headers({"content-type": "image/png"}),
    )


class FakeRequest:
    headers = {"content-type": "multipart/form-data; boundary=DEMO-ONLY"}
    def __init__(self, fields):
        self.fields = fields

    async def form(self):
        return self.fields


class DocumentPrecheckTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.front, _ = synthetic_photo(NATIONAL_SAMPLE)
        cls.back, _ = synthetic_photo(BACK_SIDE_SAMPLE)
        cls.school, _ = synthetic_photo(SCHOOL_SAMPLE)

    async def run_check(self, front=None, back=None, id_type="national_id", selfie=None, key="test-private-key"):
        fields = {"idType": id_type, "idDocument": fake_image(self.front if front is None else front)}
        if back is not None:
            fields["idBackDocument"] = fake_image(back)
        if selfie is not None:
            fields["selfie"] = fake_image(self.front)
        with internal_key():
            return await document_precheck(
                FakeRequest(fields), x_volunserve_user_id="synthetic-user",
                x_volunserve_internal_key=key,
            )

    async def test_clear_correct_sides_can_continue_to_face_scan_only(self):
        result = await self.run_check(back=self.back)
        self.assertEqual(result["outcome"], "pass")
        self.assertEqual(result["documentScreening"]["detectedIdType"], "national_id")
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])
        self.assertNotIn("selfie", repr(result).lower())

    async def test_reversed_sides_prevent_face_stage(self):
        result = await self.run_check(front=self.back, back=self.front)
        self.assertEqual(result["outcome"], "retry")
        self.assertIn("document_front_back_swapped", result["documentScreening"]["warningCodes"])

    async def test_school_id_is_rejected_before_selfie(self):
        result = await self.run_check(front=self.school, back=self.back)
        self.assertEqual(result["outcome"], "retry")
        self.assertIn("school_id_not_supported", result["documentScreening"]["warningCodes"])

    async def test_identical_front_back_rejected(self):
        with self.assertRaises(HTTPException) as captured:
            await self.run_check(back=self.front)
        self.assertEqual(captured.exception.status_code, 400)

    async def test_missing_reverse_rejected(self):
        with self.assertRaises(HTTPException) as captured:
            await self.run_check()
        self.assertEqual(captured.exception.status_code, 400)

    async def test_selfie_is_not_allowed_during_precheck(self):
        with self.assertRaises(HTTPException) as captured:
            await self.run_check(back=self.back, selfie=self.front)
        self.assertEqual(captured.exception.status_code, 400)

    async def test_internal_key_is_required_even_for_precheck(self):
        with self.assertRaises(HTTPException) as captured:
            await self.run_check(back=self.back, key="wrong-private-key")
        self.assertEqual(captured.exception.status_code, 401)

    async def test_unsupported_selected_type_rejected(self):
        with self.assertRaises(HTTPException) as captured:
            await self.run_check(back=self.back, id_type="school_id")
        self.assertEqual(captured.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
