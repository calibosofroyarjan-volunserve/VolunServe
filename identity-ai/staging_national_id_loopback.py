"""Offline loopback companion for the staging Verified Resident web preview.

Usage: py -3.11 identity-ai/staging_national_id_loopback.py
Binds ONLY to 127.0.0.1:8765, only accepts browser Origins from local
development. No Firebase, Render, persistence, account decisions, QR checks
or selfie/face matching. Never expose the port to LAN or public network.

A local browser submits front/back photos to THIS SAME COMPUTER, not to
the VolunServe Node, Python cloud service or ChatGPT.
"""
from __future__ import annotations

import base64
import binascii
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import re

HOST = "127.0.0.1"
PORT = 8765
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_BODY_BYTES = 29 * 1024 * 1024
ALLOWED_ORIGINS = frozenset((
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
))
ALLOWED_RESULTS = frozenset((
    "national_id_format_candidate", "unsupported_other_card", "needs_review",
))
ALLOWED_SIDES = frozenset((
    "national_id_heading_and_labels", "not_confirmed",
    "reverse_labels_observed", "insufficient_reverse_labels",
    "other_card_evidence",
))
ALLOWED_REASONS = frozenset((
    "both_sides_format_evidence", "school_card_evidence",
    "other_id_evidence", "conflicting_document_types",
    "front_national_id_not_established", "back_national_id_not_established",
    "side_consistency_inconclusive",
))

def allowed_origin(origin: str | None) -> bool:
    return isinstance(origin, str) and origin in ALLOWED_ORIGINS

def safe_photo_payload(value: object) -> bytes:
    """Validate one base64 photo without retaining/logging the original."""
    if not isinstance(value, str) or len(value) > MAX_IMAGE_BYTES * 4 // 3 + 16:
        raise ValueError("invalid_photo_data")
    if not re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", value):
        raise ValueError("invalid_photo_data")
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("invalid_photo_data") from None
    if not 0 < len(data) <= MAX_IMAGE_BYTES:
        raise ValueError("invalid_photo_data")
    if not (data.startswith(b"\xff\xd8\xff") or
            data.startswith(b"\x89PNG\r\n\x1a\n") or
            (data.startswith(b"RIFF") and data[8:12] == b"WEBP")):
        raise ValueError("invalid_photo_data")
    return data

def process_request(data: object, scanner=None) -> dict:
    """Only two media fields. Does not provide a Resident verification outcome."""
    if not isinstance(data, dict) or set(data.keys()) != {"front", "back"}:
        raise ValueError("only_front_and_back_allowed")
    front = safe_photo_payload(data["front"])
    back = safe_photo_payload(data["back"])
    if scanner is None:
        from local_national_id_both_sides import screen_two_images
        scanner = screen_two_images
    result = scanner(front, back)
    if not isinstance(result, dict):
        return {"status": "needs_review", "reason": "side_consistency_inconclusive",
                "front": "not_confirmed", "back": "insufficient_reverse_labels"}
    return {
        "status": result.get("status") if result.get("status") in ALLOWED_RESULTS else "needs_review",
        "reason": result.get("reason") if result.get("reason") in ALLOWED_REASONS else "side_consistency_inconclusive",
        "front": result.get("front") if result.get("front") in ALLOWED_SIDES else "not_confirmed",
        "back": result.get("back") if result.get("back") in ALLOWED_SIDES else "insufficient_reverse_labels",
        "identityVerified": False,
        "authenticityVerified": False,
        "manualReviewRequired": True,
        "stored": False,
    }

class LocalOnlyHandler(BaseHTTPRequestHandler):
    server_version = "VolunServeLocalOcr/1"
    sys_version = ""

    def log_message(self, format, *args):
        # Never log a path, IP, document names, OCR text or photo bytes.
        pass

    def _send(self, status: int, payload: dict) -> None:
        reply = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        origin = self.headers.get("Origin")
        if allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)

    def _permitted(self) -> bool:
        return (self.headers.get("Host") == f"{HOST}:{PORT}"
                and allowed_origin(self.headers.get("Origin")))

    def do_OPTIONS(self) -> None:
        if not self._permitted() or self.path != "/check":
            self._send(403, {"error": "origin_not_allowed"})
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health" and self._permitted():
            self._send(200, {"ready": True, "localOnly": True, "identityVerified": False})
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/check":
            self._send(404, {"error": "not_found"})
            return
        if not self._permitted():
            self._send(403, {"error": "origin_not_allowed"})
            return
        if self.headers.get("Content-Type") != "application/json":
            self._send(415, {"error": "json_only"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = -1
        if not 0 < size <= MAX_BODY_BYTES:
            self._send(413, {"error": "invalid_request_size"})
            return
        try:
            data = json.loads(self.rfile.read(size).decode("utf-8"))
            result = process_request(data)
            self._send(200, result)
        except (UnicodeError, json.JSONDecodeError, ValueError):
            self._send(400, {"error": "invalid_image_pair"})
        except Exception:
            # Never leak OCR text, file paths or internal stack details.
            self._send(503, {"error": "local_ocr_unavailable"})

def main() -> None:
    server = HTTPServer((HOST, PORT), LocalOnlyHandler)
    print(f"LOCAL ONLY OCR COMPANION: http://{HOST}:{PORT}")
    print("Allowed browser: localhost:8081 / 19006 / 3000 only")
    print("No ID storage, internet upload, Firebase, or account approval.")
    print("Press Ctrl+C to stop this loopback-only tool.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
