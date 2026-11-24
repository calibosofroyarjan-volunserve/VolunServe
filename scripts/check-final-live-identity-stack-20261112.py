"""Read-only live identity stack audit. No credentials, images, names or writes."""
import json
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BACKEND = "https://volunserve.onrender.com"
AI = "https://volunserve-identity-ai.onrender.com"
UA = "VolunServe-Final-Identity-ReadOnly-Audit"

def get(uri):
    req = Request(uri, headers={"Accept": "application/json", "User-Agent": UA})
    try:
        with urlopen(req, timeout=30) as r:
            return r.status, r.read(12000)
    except HTTPError as exc:
        return exc.code, b""

def verify():
    status, body = get(BACKEND + "/health")
    if status != 200:
        return "BACKEND_HEALTH_NON_200"
    backend = json.loads(body)
    if backend.get("ok") is not True or backend.get("service") != "volunserve-backend":
        return "BACKEND_HEALTH_INVALID"
    if backend.get("identityEngine") != "volunserve_ai_configured":
        return "BACKEND_IDENTITY_AI_NOT_CONFIGURED"
    status, body = get(AI + "/health")
    if status != 200:
        return "AI_HEALTH_NON_200"
    ai = json.loads(body)
    expected = {
        "ok": True, "verificationEngineReady": True,
        "internalAuthConfigured": True,
        "documentOcrReady": True,
        "profileComparisonReady": True,
        "documentPrecheckReady": True,
        "livenessImplemented": False,
        "idDocumentAuthenticityVerified": False
    }
    if any(ai.get(k) is not v for k,v in expected.items()):
        return "AI_HEALTH_UNREADY_OR_ASSURANCE_MISMATCH"
    for suffix in ("/api/identity/status", "/api/admin/identity/reviews",
                   "/api/identity/engine-health"):
        status, _ = get(BACKEND + suffix)
        if status not in (401, 403):
            return "UNAUTHENTICATED_IDENTITY_ROUTE_NOT_DENIED"
    return None

def main():
    for attempt in range(4):
        try:
            issue = verify()
            if issue is None:
                print("PASS: LIVE_BACKEND_AND_AI_READY")
                print("PASS: UNAUTHENTICATED_IDENTITY_READS_DENIED")
                print("INFO: Real-user Admin decisions, biometric PAD and issuer authenticity were NOT tested.")
                return 0
            print("BLOCKED: " + issue)
        except Exception:
            print("BLOCKED: HEALTH_REQUEST_OR_PARSE_FAILED")
        if attempt < 3:
            time.sleep(8)
    return 1

if __name__ == "__main__":
    sys.exit(main())
