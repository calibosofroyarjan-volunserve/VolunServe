"""Synthetic staging-level route contract tests; never load real ID images or credentials.

Execute the actual async Python route handler AST with mocked transport/image/OCR.
This is not a physical-device, Tesseract-accuracy, issuer or PAD certification.
"""
from __future__ import annotations
import ast
import asyncio
import hashlib
import logging
from pathlib import Path
import unittest

from strict_document_screening import (
    assess_document_sides, add_photo_quality, blurry_national_id_claim_needs_review,
)
from profile_consistency import profile_comparison
from face_preflight_policy import screening_ready_for_face_comparison


class RouteHTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class Upload:
    def __init__(self, text: str):
        self.payload = text.encode("utf-8")
        self.closed = False

    async def close(self):
        self.closed = True


class Request:
    headers = {"content-type": "multipart/form-data; boundary=synthetic"}

    def __init__(self, values):
        self.values = values

    async def form(self):
        return self.values


def load_handlers():
    """Run actual selected main.py handlers with safe stubbed AI/image operations."""
    source = Path(__file__).with_name("main.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    found = []
    for node in tree.body:
        if isinstance(node, ast.AsyncFunctionDef) and node.name in (
            "document_precheck", "verify_identity",
        ):
            node.decorator_list = []
            found.append(node)
    if len(found) != 2:
        raise AssertionError("Expected two actual document/verify route handlers")
    module = ast.Module(
        body=[
            ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0),
            *found,
        ],
        type_ignores=[],
    )
    ast.fix_missing_locations(module)
    hits = {"face": 0, "screen": 0}

    def require_key(key):
        if key != "staging-internal-key":
            raise RouteHTTPException(401, "Backend key required")

    def validate_uid(uid):
        if uid != "resident-demo":
            raise RouteHTTPException(401, "User required")
        return uid

    async def read_upload(upload, *, label, maximum_bytes):
        if not isinstance(upload, Upload):
            raise RouteHTTPException(400, "Missing document " + label)
        if len(upload.payload) > maximum_bytes:
            raise RouteHTTPException(413, "Document too large")
        return upload.payload

    def screen_government_id(*, declared_type, id_document_bytes,
                             id_back_document_bytes=None,
                             expected_first_name="", expected_last_name="",
                             expected_date_of_birth="", expected_barangay=""):
        hits["screen"] += 1
        front = id_document_bytes.decode("utf-8")
        back = (id_back_document_bytes.decode("utf-8")
                if id_back_document_bytes is not None else None)
        screening = assess_document_sides(declared_type, front, back)
        screening = add_photo_quality(screening, 140.0)
        # This stub represents an already-measured, clear reverse photo.
        # Real production code uses add_back_photo_quality(image_variance).
        screening["backImageQualityStatus"] = (
            "not_required" if declared_type == "passport" else
            "adequate" if id_back_document_bytes is not None else "not_checked"
        )
        screening.update(profile_comparison(
            expected_date_of_birth, expected_barangay, front + "\n" + (back or "")
        ))
        screening["issuerAuthenticityStatus"] = "not_verified"
        screening["presentationAttackStatus"] = "not_validated"
        return screening

    def run_face_verification(*, uid, id_document_bytes, selfie_bytes):
        hits["face"] += 1
        return {
            "status": "pending", "decision": "manual_review",
            "verificationId": "test-identity-001",
        }

    env = {
        "Header": lambda **kwargs: None,
        "Request": Request, "HTTPException": RouteHTTPException,
        "StarletteUploadFile": Upload,
        "clean_text": lambda value, maximum_length=240: str(value or "").strip()[:maximum_length],
        "require_internal_backend": require_key,
        "validate_forwarded_user": validate_uid,
        "read_upload": read_upload,
        "decode_image": lambda value, label: object(),
        "screen_government_id": screen_government_id,
        "run_face_verification": run_face_verification,
        "manual_review_result": lambda **kwargs: {
            "status": "pending", "decision": "manual_review",
        },
        "failed_attempt_result": lambda **kwargs: {
            "status": "failed", "decision": "failed",
        },
        "face_mesh_engine_ready": lambda: True,
        "blurry_national_id_claim_needs_review": blurry_national_id_claim_needs_review,
        "document_ocr_unavailable": lambda declared_type: {},
        "MAX_ID_DOCUMENT_BYTES": 10 * 1024 * 1024,
        "MAX_SELFIE_BYTES": 10 * 1024 * 1024,
        "ACCEPTED_ID_TYPES": {
            "national_id", "drivers_license", "passport", "umid", "prc_id",
        },
        "hashlib": hashlib, "asyncio": asyncio, "logging": logging,
        "screening_ready_for_face_comparison": screening_ready_for_face_comparison,
    }
    exec(compile(module, "main.py:selected_routes", "exec"), env)
    return env, hits


NATIONAL_FRONT = (
    "PHILIPPINE IDENTIFICATION CARD SURNAME DELA CRUZ GIVEN NAMES MARIA "
    "DATE OF BIRTH 1998-09-05"
)
NATIONAL_BACK = "BLOOD TYPE O MARITAL STATUS SINGLE DATE OF ISSUE 2022-09-01"


class RealRouteHandlerContractTests(unittest.TestCase):
    def setUp(self):
        self.env, self.hits = load_handlers()

    def call(self, handler, form, key="staging-internal-key", dob="1998-09-05"):
        return asyncio.run(self.env[handler](
            Request(form),
            x_volunserve_user_id="resident-demo",
            x_volunserve_internal_key=key,
            x_volunserve_profile_first_name="Maria",
            x_volunserve_profile_last_name="Dela Cruz",
            x_volunserve_profile_date_of_birth=dob,
            x_volunserve_profile_barangay="Muzon Proper",
        ))

    def form(self, id_type="national_id", front=NATIONAL_FRONT, back=NATIONAL_BACK,
             with_selfie=False):
        form = {"idType": id_type, "idDocument": Upload(front)}
        if back is not None:
            form["idBackDocument"] = Upload(back)
        if with_selfie:
            form["selfie"] = Upload("SYNTHETIC SELFIE")
        return form

    def test_invalid_backend_key_refused_before_media(self):
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("document_precheck", self.form(), key="wrong")
        self.assertEqual(exc.exception.status_code, 401)
        self.assertEqual(self.hits["screen"], 0)

    def test_unsupported_generic_id_refused(self):
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("document_precheck", self.form(id_type="other_government_id"))
        self.assertEqual(exc.exception.status_code, 400)

    def test_missing_nonpassport_back_refused(self):
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("document_precheck", self.form(back=None))
        self.assertEqual(exc.exception.status_code, 400)

    def test_exact_duplicate_front_back_refused(self):
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("document_precheck", self.form(back=NATIONAL_FRONT))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(self.hits["screen"], 0)

    def test_school_id_with_government_keywords_returns_retry(self):
        result = self.call("document_precheck", self.form(
            front="SCHOOL ID PHILIPPINE IDENTIFICATION CARD"))
        self.assertEqual(result["outcome"], "retry")
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])

    def test_matching_national_id_precheck_only_screening_not_approval(self):
        result = self.call("document_precheck", self.form())
        self.assertEqual(result["outcome"], "pass")
        self.assertFalse(result["authenticityVerified"])
        self.assertFalse(result["livenessVerified"])
        self.assertEqual(self.hits["face"], 0)

    def test_conflicting_birthdate_requires_retry_not_identity_verdict(self):
        result = self.call("document_precheck", self.form(), dob="1997-09-05")
        self.assertEqual(result["outcome"], "retry")
        self.assertEqual(result["documentScreening"]["profileBirthDateCheck"],
                         "possible_conflict")

    def test_passport_bio_page_has_no_back_requirement(self):
        result = self.call("document_precheck", self.form(
            id_type="passport", front="REPUBLIC OF THE PHILIPPINES PASSPORT",
            back=None))
        self.assertEqual(result["outcome"], "pass")
        self.assertFalse(result["authenticityVerified"])

    def test_precheck_rejects_unnecessary_selfie(self):
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("document_precheck", self.form(with_selfie=True))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(self.hits["face"], 0)

    def test_verify_does_not_run_face_match_for_school_id(self):
        result = self.call("verify_identity", self.form(
            front="STUDENT ID PHILIPPINE IDENTIFICATION CARD",
            with_selfie=True))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.hits["face"], 0)

    def test_verify_does_run_face_comparison_for_consistent_id(self):
        result = self.call("verify_identity", self.form(with_selfie=True))
        self.assertEqual(result["status"], "pending")
        self.assertEqual(self.hits["face"], 1)
        self.assertFalse(result["documentScreening"]["authenticityVerified"])

    def test_precheck_denies_contradictory_positive_status_before_face(self):
        original = self.env["screen_government_id"]

        def adversarial_screen(**kwargs):
            data = original(**kwargs)
            data["status"] = "text_consistent_unverified"
            data["detectedIdType"] = kwargs["declared_type"]
            data["warningCodes"] = ["school_id_not_supported"]
            return data

        self.env["screen_government_id"] = adversarial_screen
        result = self.call("document_precheck", self.form())
        self.assertEqual(result["outcome"], "retry")
        self.assertEqual(self.hits["face"], 0)

    def test_verify_never_computes_face_for_incomplete_back_evidence(self):
        original = self.env["screen_government_id"]

        def missing_back_quality(**kwargs):
            data = original(**kwargs)
            data["status"] = "text_consistent_unverified"
            data["backImageQualityStatus"] = "not_checked"
            return data

        self.env["screen_government_id"] = missing_back_quality
        result = self.call("verify_identity", self.form(with_selfie=True))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(self.hits["face"], 0)
        self.assertFalse(result["documentScreening"]["authenticityVerified"])

    def test_verify_never_computes_face_for_mrz_or_dob_conflicts(self):
        original = self.env["screen_government_id"]
        for field, value in (
            ("profileBirthDateCheck", "possible_conflict"),
            ("passportMrzCheck", "multiple_candidates"),
        ):
            def contradictory_screen(**kwargs):
                data = original(**kwargs)
                data["status"] = "text_consistent_unverified"
                data[field] = value
                return data
            self.env["screen_government_id"] = contradictory_screen
            result = self.call("verify_identity", self.form(with_selfie=True))
            self.assertEqual(result["status"], "failed")
            self.assertEqual(self.hits["face"], 0)
        self.env["screen_government_id"] = original

    def test_verify_rejects_identical_front_used_as_selfie(self):
        form = self.form(with_selfie=True)
        form["selfie"] = Upload(NATIONAL_FRONT)
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("verify_identity", form)
        self.assertEqual(exc.exception.status_code, 400)
        self.assertIn("different images", exc.exception.detail)
        self.assertEqual(self.hits["screen"], 0)
        self.assertEqual(self.hits["face"], 0)

    def test_verify_rejects_identical_back_used_as_selfie(self):
        form = self.form(with_selfie=True)
        form["selfie"] = Upload(NATIONAL_BACK)
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("verify_identity", form)
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(self.hits["screen"], 0)
        self.assertEqual(self.hits["face"], 0)

    def test_passport_front_used_as_selfie_is_rejected(self):
        form = self.form(id_type="passport",
                         front="REPUBLIC OF THE PHILIPPINES PASSPORT",
                         back=None, with_selfie=True)
        form["selfie"] = Upload("REPUBLIC OF THE PHILIPPINES PASSPORT")
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("verify_identity", form)
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(self.hits["face"], 0)

    def test_verify_rejects_missing_back_before_matching(self):
        with self.assertRaises(RouteHTTPException) as exc:
            self.call("verify_identity", self.form(back=None, with_selfie=True))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(self.hits["face"], 0)


if __name__ == "__main__":
    unittest.main()
