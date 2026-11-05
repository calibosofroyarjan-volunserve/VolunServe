#!/usr/bin/env python3
"""Guarded exact-diff Firebase announcements Rules release with conditional rollback.

This updates the EXISTING cloud.firestore Rules RELEASE pointer only, after
verifying production revision and BOTH immutable Ruleset sources. Never deploys
Hosting, Auth, Firestore documents, Functions, Storage or indexes.
"""
import hashlib
import json
import subprocess
import urllib.error
import urllib.request

PROJECT = "volunserve-3aa5b"
RELEASE = f"projects/{PROJECT}/releases/cloud.firestore"
EXPECTED_OLD = f"projects/{PROJECT}/rulesets/b52b3100-43b9-4a01-aa2f-0c803022436e"
STAGED_NEW = f"projects/{PROJECT}/rulesets/eeb04c64-09ad-4b91-8652-284347ca70b2"
EXPECTED_OLD_SHA = "67fb37a13603b172c9a9c8bea6037fb75243907dd8a98bd18d90466681816db0"
EXPECTED_NEW_SHA = "7faeea5beb9491a42ef419d5df0997e6b7fd9c611144753723ef57af2a03e2a4"
LIVE_HOSTING_SHA = "579bed559b1ba81e2045ba420847f8635e8f182c"
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
BASE = "https://firebaserules.googleapis.com/v1/"
activated_by_this_run = False

def read_json(request):
    with urllib.request.urlopen(request, timeout=35) as reply:
        return json.load(reply)

def api(path, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode("utf8")
    headers = {"Authorization": "Bearer " + TOKEN}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE + path, method=method, data=body, headers=headers)
    return read_json(request)

def get_live():
    return api(RELEASE)

def source(name):
    r = api(name)
    files = r.get("source", {}).get("files", [])
    selected = [f for f in files if f.get("name", "").endswith("firestore.rules")]
    if not selected and len(files) == 1:
        selected = files
    if len(selected) != 1:
        raise RuntimeError("Unexpected Cloud Ruleset source files; abort")
    return selected[0]["content"]

def normalized(text):
    return text.replace("\r\n", "\n").replace("\r", "\n")

def digest(text):
    return hashlib.sha256(text.encode("utf8")).hexdigest()

def patch_release(name):
    result = api(RELEASE, "PATCH",
                 {"release": {"name": RELEASE, "rulesetName": name},
                  "updateMask": "rulesetName"})
    if result.get("rulesetName") != name:
        raise RuntimeError("Unexpected Firebase release PATCH response")

try:
    print("PRECHECK: Verify no concurrent live Hosting or Cloud Rules change")
    req = urllib.request.Request(
        "https://volunserve.com/volunserve-release.json?rules_readonly_guard=20261105",
        headers={"cache-control":"no-cache"}
    )
    stamp = read_json(req)
    if stamp.get("revision") != LIVE_HOSTING_SHA:
        raise RuntimeError("STOP: production Hosting source changed; no Rules activation")
    release = get_live()
    if release.get("rulesetName") != EXPECTED_OLD:
        raise RuntimeError("STOP: another Ruleset is active; no Rules activation")

    old = source(EXPECTED_OLD)
    new = source(STAGED_NEW)
    if digest(old) != EXPECTED_OLD_SHA:
        raise RuntimeError("STOP: original production Ruleset differs from reviewed source")
    # Firebase API canonicalizes CRLF in newly compiled immutable Ruleset.
    if digest(new) != EXPECTED_NEW_SHA and digest(normalized(new)) != digest(normalized(
        open("firestore.rules", "rb").read().decode("utf8")
    )):
        raise RuntimeError("STOP: staged compiled source differs from emulator-tested announcement-only change")
    if old == new:
        raise RuntimeError("STOP: no update to release")

    # Verify the exact reviewed candidate derived from current active bytes, not a
    # checked-out stale firestore.rules file.
    candidate = open("firestore.rules", "rb").read().decode("utf8")
    if digest(candidate) != EXPECTED_NEW_SHA or normalized(new) != normalized(candidate):
        raise RuntimeError("STOP: staged compiled Ruleset does not match reviewed candidate")
    if len(candidate.encode("utf8")) >= 262144:
        raise RuntimeError("STOP: source exceeds 256 KiB")
    if get_live().get("rulesetName") != EXPECTED_OLD:
        raise RuntimeError("STOP: concurrent production Rules change detected")
    print("PASS exact live Ruleset + staged compiled source + Hosting guards")

    patch_release(STAGED_NEW)
    activated_by_this_run = True
    final = get_live()
    if final.get("rulesetName") != STAGED_NEW:
        raise RuntimeError("Activation reply not consistent; attempt guarded rollback")
    # Public route check is read-only; it does not exercise authentication.
    for route in ("login", "signup", "admin-login"):
        request = urllib.request.Request(
            "https://volunserve.com/" + route,
            headers={"cache-control": "no-cache"}
        )
        with urllib.request.urlopen(request, timeout=25) as response:
            if response.status != 200:
                raise RuntimeError("Post-release public route failed: " + route)
            print("PASS live public route /" + route + ": HTTP 200")
    print("SUCCESS: activated surgically reviewed announcements Ruleset ONLY:", STAGED_NEW)
    print("Original immutable Ruleset retained for rollback:", EXPECTED_OLD)
except Exception as error:
    print("ERROR:", str(error)[:1000])
    # Fail closed: never roll back someone else's update.
    try:
        current_name = get_live().get("rulesetName")
        if current_name == STAGED_NEW:
            print("Restoring original Ruleset because this workflow's new Ruleset is active")
            patch_release(EXPECTED_OLD)
            if get_live().get("rulesetName") != EXPECTED_OLD:
                raise RuntimeError("CRITICAL: rollback verification failed")
            print("ROLLBACK SUCCESS: restored exact previous active Ruleset")
        elif current_name == EXPECTED_OLD:
            print("PASS: original Ruleset still active; no rollback needed")
        else:
            print("STOP: a different concurrent Ruleset is active; no overwrite attempted")
    except Exception as rollback_error:
        print("CRITICAL rollback check:", str(rollback_error)[:1000])
    raise SystemExit(1)
