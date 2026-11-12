"""Read-only public VolunServe AI health gate.

No credentials, uploads, user data, Firebase writes, or deployment operations.
This checks operational readiness, NOT real-ID accuracy, liveness/PAD or issuer trust.
"""
import json
import sys
import time
from urllib.request import Request, urlopen

URL = "https://volunserve-identity-ai.onrender.com/health"
REQUIRED = {
    "ok": True,
    "internalAuthConfigured": True,
    "verificationEngineReady": True,
    "documentOcrReady": True,
    "profileComparisonReady": True,
    "documentPrecheckReady": True,
    "idDocumentScreeningImplemented": True,
    "idFrontBackScreeningImplemented": True,
    "livenessImplemented": False,
    "idDocumentAuthenticityVerified": False,
}


def check():
    request = Request(URL, headers={"Accept": "application/json",
                                   "User-Agent": "VolunServe-ReadOnly-AI-Health-Audit"})
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError("NON_200_STATUS")
        content = response.read(16384)
    values = json.loads(content)
    if not isinstance(values, dict):
        raise RuntimeError("INVALID_HEALTH_JSON")
    return [key for key, expected in REQUIRED.items()
            if values.get(key) is not expected]


def main():
    for attempt in range(1, 5):
        try:
            blocked = check()
            if not blocked:
                print("PASS: LIVE_IDENTITY_AI_RUNTIME_READY")
                print("INFO: ID authenticity and independent PAD remain unverified.")
                return 0
            print("BLOCKED: LIVE_IDENTITY_AI_READINESS: " + ", ".join(blocked))
        except Exception:
            print(f"BLOCKED: LIVE_AI_HEALTH_REQUEST attempt {attempt} / 4")
        if attempt < 4:
            time.sleep(10)
    print("BLOCKED: production readiness could not be independently confirmed.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
