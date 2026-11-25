"""Offline synthetic contract test for the ORIGINAL face-only Python endpoint.
No real face, ID, user, secret, Cloudinary, Firebase or network access.
"""
from __future__ import annotations

import ast
import asyncio
import hashlib
import logging
from pathlib import Path

SOURCE = Path("identity-ai/main.py").read_text(encoding="utf-8")
tree = ast.parse(SOURCE)
handler = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef)
               and node.name == "verify_identity")
handler.decorator_list = []
module = ast.Module(body=[handler], type_ignores=[])
ast.fix_missing_locations(module)


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class Upload:
    def __init__(self, raw: bytes):
        self.raw = raw
        self.closed = False

    async def close(self):
        self.closed = True


class FakeForm:
    def __init__(self, values):
        self.values = values

    def get(self, key):
        return self.values.get(key)


class Request:
    def __init__(self, route, values):
        self.url = type("URL", (), {"path": route})()
        self.headers = {"content-type": "multipart/form-data; boundary=SYNTHETIC"}
        self.values = values

    async def form(self):
        return FakeForm(self.values)


calls = {"face": 0, "ocr": 0}
face_result = {"ok": True, "decision": "manual_review",
               "matchScore": 0.64, "matchThreshold": 0.52,
               "message": "Synthetic matched-face preliminary Admin review"}


def require_internal_backend(key):
    if key != "DUMMY_INTERNAL_TEST_KEY_NOT_REAL":
        raise HTTPException(401, "Unauthorized")


def validate_forwarded_user(uid):
    if uid != "test_resident":
        raise HTTPException(401, "Bad synthetic UID")
    return uid


def clean_text(x, _limit):
    return str(x or "").strip()


async def read_upload(item, *, label, maximum_bytes):
    if not isinstance(item, Upload):
        raise HTTPException(400, "Missing synthetic " + label)
    return item.raw


def run_face_verification(*, uid, id_document_bytes, selfie_bytes):
    calls["face"] += 1
    assert uid == "test_resident"
    assert id_document_bytes != selfie_bytes
    return dict(face_result)


def screen_government_id(**_kwargs):
    calls["ocr"] += 1
    raise AssertionError("OCR MUST NEVER RUN in original face-only mode")


ns = {
    "__name__": "isolated_original_ai_face_only",
    "Header": lambda **kwargs: None,
    "HTTPException": HTTPException,
    "StarletteUploadFile": Upload,
    "MAX_ID_DOCUMENT_BYTES": 12_000_000,
    "MAX_SELFIE_BYTES": 12_000_000,
    "ACCEPTED_ID_TYPES": {"national_id", "drivers_license", "passport", "umid", "prc_id"},
    "require_internal_backend": require_internal_backend,
    "validate_forwarded_user": validate_forwarded_user,
    "clean_text": clean_text,
    "read_upload": read_upload,
    "hashlib": hashlib,
    "logging": logging,
    "asyncio": asyncio,
    "face_mesh_engine_ready": lambda: True,
    "decode_image": lambda *_args: None,
    "run_face_verification": run_face_verification,
    "screen_government_id": screen_government_id,
}
compiled = compile(module, filename="identity-ai/main.py", mode="exec")
exec(compiled, ns)
verify_identity = ns["verify_identity"]


async def check(route, id_type="national_id", *, match_photo=False, back=False, key="DUMMY_INTERNAL_TEST_KEY_NOT_REAL"):
    front = b"SYNTHETIC_FICTIONAL_ID_FRONT_IMAGE"
    selfie = front if match_photo else b"SYNTHETIC_FICTIONAL_SELFIE_IMAGE"
    fields = {"idType": id_type, "idDocument": Upload(front), "selfie": Upload(selfie)}
    if back:
        fields["idBackDocument"] = Upload(b"SYNTHETIC_FICTIONAL_ID_BACK_IMAGE")
    return await verify_identity(Request(route, fields), x_volunserve_user_id="test_resident",
                                 x_volunserve_internal_key=key)


async def main():
    reply = await check("/verify-face-only")
    assert reply["faceOnly"] is True
    assert reply["decision"] == "manual_review"
    assert reply["faceComparisonPassed"] is True
    assert reply["documentScreening"]["status"] == "inconclusive"
    assert reply["documentScreening"]["authenticityVerified"] is False
    assert reply["documentScreening"]["manualReviewRequired"] is True
    assert calls == {"face": 1, "ocr": 0}
    print("PASS: National ID front + selfie executes 1:1 face match WITHOUT OCR/back scan")

    for label, options, expected in [
        ("school ID refused", {"id_type": "school_id"}, 400),
        ("other government ID refused in National-ID-only mode", {"id_type": "passport"}, 400),
        ("same photo reused for selfie refused", {"match_photo": True}, 400),
        ("missing internal secret refused", {"key": None}, 401),
    ]:
        try:
            await check("/verify-face-only", **options)
        except HTTPException as exc:
            assert exc.status_code == expected, (label, exc.status_code)
        else:
            raise AssertionError("Unsafe submission passed: " + label)
        print("PASS:", label)
    assert calls == {"face": 1, "ocr": 0}

    try:
        await check("/verify", back=False)
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("Existing OCR route accepted a missing back scan")
    print("PASS: unchanged OCR /verify still requires front and back")
    face_result.clear()
    face_result.update({"ok": True, "decision": "manual_review", "matchScore": 0.38,
                        "warnings": ["face_match_uncertain_uncalibrated"]})
    uncertain = await check("/verify-face-only")
    assert uncertain["faceComparisonPassed"] is False
    assert uncertain["decision"] == "manual_review"
    assert uncertain["documentScreening"]["authenticityVerified"] is False
    print("PASS: below-threshold original manual_review explicitly NOT a face-match pass")

    face_result.clear()
    face_result.update({"ok": True, "decision": "failed", "matchScore": None})
    no_face = await check("/verify-face-only")
    assert no_face["faceComparisonPassed"] is False
    print("PASS: missing/failed comparison cannot pass the Admin face-match gate")
    assert calls == {"face": 3, "ocr": 0}
    print("SUCCESS: 8 isolated face-only Python tests; no SDKs, no real media, no deployment")


if __name__ == "__main__":
    asyncio.run(main())
