"""Public read-only staging identity contract check. No keys, photos or writes."""
import json
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

AI = "https://volunserve-identity-ai-staging.onrender.com"
NODE = "https://volunserve-backend-staging.onrender.com"
HEADERS = {"Accept": "application/json", "User-Agent": "VolunServe-Staging-Identity-ReadOnly-20261112"}


def get(url):
    try:
        with urlopen(Request(url, headers=HEADERS), timeout=35) as response:
            return response.status, response.read(12000)
    except HTTPError as exc:
        return exc.code, b""


def check():
    code, payload = get(AI + "/health")
    if code != 200:
        return "AI_HEALTH_HTTP_" + str(code)
    ai = json.loads(payload)
    required = {
        "ok": True,
        "internalAuthConfigured": True,
        "verificationEngineReady": True,
        "documentOcrReady": True,
        "profileComparisonReady": True,
        "documentPrecheckReady": True,
        "livenessImplemented": False,
        "idDocumentAuthenticityVerified": False
    }
    for field, expected in required.items():
        if ai.get(field) is not expected:
            return "AI_HEALTH_" + field.upper() + "_UNEXPECTED"
    code, payload = get(NODE + "/health")
    if code != 200:
        return "NODE_HEALTH_HTTP_" + str(code)
    node = json.loads(payload)
    if node.get("ok") is not True or node.get("identityEngine") != "volunserve_ai_configured":
        return "NODE_IDENTITY_HEALTH_NOT_CONFIGURED"
    for url in [
        NODE + "/api/identity/status",
        NODE + "/api/identity/engine-health",
        NODE + "/api/admin/identity/reviews",
        AI + "/api/internal/auth-check",
    ]:
        code, _ = get(url)
        if code not in (401, 403):
            return "UNAUTHENTICATED_IDENTITY_ROUTE_NOT_DENIED"
    return None


def main():
    for attempt in range(1, 4):
        try:
            issue = check()
            if issue is None:
                print("PASS: FULL_STAGING_NODE_AND_AI_RUNTIME_READY")
                print("PASS: FULL_STAGING_OCR_PROFILE_PRECHECK_AVAILABLE")
                print("PASS: UNAUTHENTICATED_IDENTITY_ENDPOINTS_DENIED")
                print("INFO: Backend-to-AI matching key, Firebase token and camera PAD not tested.")
                return 0
            print("BLOCKED: " + issue)
        except Exception:
            print("BLOCKED: FULL_STAGING_HEALTH_REQUEST_OR_PARSE_FAILED")
        if attempt < 3:
            time.sleep(8)
    return 1


if __name__ == "__main__":
    sys.exit(main())
