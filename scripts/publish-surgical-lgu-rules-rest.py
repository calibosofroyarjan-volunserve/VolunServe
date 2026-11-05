#!/usr/bin/env python3
"""Publish exactly-reviewed LGU staff rules to EXISTING Firebase Rules release.

Never CREATE/DELETE a Firebase release. Validates exact previous source and
expected preview candidate before updating the one cloud.firestore pointer.
The immutable old ruleset is retained for rollback.
"""
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "https://firebaserules.googleapis.com/v1/"
PROJECT = "volunserve-3aa5b"
RELEASE = "projects/" + PROJECT + "/releases/cloud.firestore"
OLD_SHA = "67fb37a13603b172c9a9c8bea6037fb75243907dd8a98bd18d90466681816db0"
OLD_RULESET = "projects/volunserve-3aa5b/rulesets/b52b3100-43b9-4a01-aa2f-0c803022436e"
CANDIDATE = "/tmp/volunserve-lgu-candidate.rules"
OLD_FILE = "/tmp/volunserve-lgu-before.rules"
NEW_RULESET_PATH = "/tmp/volunserve-lgu-new-ruleset-id"


def token():
    return subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()


def request(method, path, body=None):
    headers = {"Authorization": "Bearer " + token()}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        snippet = exc.read().decode("utf8", errors="replace")[:550]
        raise RuntimeError("Firebase Rules API HTTP " + str(exc.code) + ": " + snippet) from None


def sha(s):
    return hashlib.sha256(s.encode("utf8")).hexdigest()


def release_state():
    release = request("GET", RELEASE)
    ruleset = release.get("rulesetName", "")
    rules = request("GET", ruleset)
    txt = max((x.get("content", "") for x in rules["source"]["files"]), key=len)
    return release, ruleset, txt


def update_pointer(new_name):
    payload = {"release": {"name": RELEASE, "rulesetName": new_name}, "updateMask": "rulesetName"}
    result = request("PATCH", RELEASE, payload)
    if result.get("rulesetName") != new_name:
        raise RuntimeError("Release update did not confirm expected ruleset name")
    return result


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "publish":
        candidate_raw = open(CANDIDATE, encoding="utf8", newline="").read()
        # Firebase API canonicalizes CRLF to LF when storing immutable Ruleset
        # sources. Require BOTH the audited byte-exact original and compiled
        # canonical fingerprint, never silently normalize unknown differences.
        if sha(candidate_raw) != "485d47bcd06a168201156ee66a0f8c05f65e4199a6000e477715ae53f65cd5ba":
            raise RuntimeError("BLOCKED: candidate source changed from emulator-tested exact bytes")
        candidate = candidate_raw.replace("\r\n", "\n")
        if sha(candidate) != "094fcc25048d47d5016b35d35334b9eff0be7e577dcc409f7c8dd3b3170f8673":
            raise RuntimeError("BLOCKED: normalized candidate differs from Firebase-compiled audited Ruleset")
        old = open(OLD_FILE, encoding="utf8", newline="").read()
        if sha(old) != OLD_SHA:
            raise RuntimeError("Local backup of the original audited rules has changed")
        release, ruleset, current = release_state()
        if ruleset != OLD_RULESET or sha(current) != OLD_SHA:
            raise RuntimeError("BLOCKED: another production Firestore Rules release is active")
        # This immutable Ruleset was pre-compiled by the separate validation CI
        # against Firebase's hard 256KB executable quota. No speculative upload.
        new_name = "projects/volunserve-3aa5b/rulesets/26e27c96-ca08-4e5e-ace5-437ee4df086b"
        expected_candidate_sha = "094fcc25048d47d5016b35d35334b9eff0be7e577dcc409f7c8dd3b3170f8673"
        if sha(candidate) != expected_candidate_sha:
            raise RuntimeError("BLOCKED: compact LGU policy differs from compiled audited Ruleset")
        check = request("GET", new_name)
        new_text = max((x.get("content", "") for x in check["source"]["files"]), key=len)
        if new_text != candidate:
            raise RuntimeError("BLOCKED: created ruleset content differs from reviewed candidate")
        # Narrow concurrency guard immediately before the pointer update.
        release2, current_name, current2 = release_state()
        if current_name != OLD_RULESET or sha(current2) != OLD_SHA:
            raise RuntimeError("BLOCKED: production rules changed while preparing; no PATCH made")
        update_pointer(new_name)
        _, active_name, active_content = release_state()
        if active_name != new_name or active_content != candidate:
            raise RuntimeError("Production Firebase Rules did not match candidate after PATCH")
        with open(NEW_RULESET_PATH, "w", encoding="utf8") as f:
            f.write(new_name)
        print("SUCCESS: existing cloud.firestore release safely pointed at audited LGU ruleset", new_name)
        print("No Rules release deleted, no user data accessed, no Storage/Functions/index changes")
    elif mode == "verify":
        _, active_name, active_content = release_state()
        candidate_raw = open(CANDIDATE, encoding="utf8", newline="").read()
        candidate = candidate_raw.replace("\r\n", "\n")
        if sha(candidate_raw) != "485d47bcd06a168201156ee66a0f8c05f65e4199a6000e477715ae53f65cd5ba" or sha(candidate) != "094fcc25048d47d5016b35d35334b9eff0be7e577dcc409f7c8dd3b3170f8673":
            raise RuntimeError("Candidate Rules fingerprint mismatch")
        if active_content != candidate:
            raise RuntimeError("Live Rules verification failed")
        print("PASS exact surgical LGU staff Rules published", active_name)
    elif mode == "rollback":
        if not os.path.exists(NEW_RULESET_PATH):
            print("Skip rule rollback: no verified newly published ruleset ID")
            return
        new_name = open(NEW_RULESET_PATH, encoding="utf8").read().strip()
        _, active_name, active = release_state()
        if active_name != new_name:
            print("Skip rule rollback: another ruleset is live; never overwrite it")
            return
        candidate = open(CANDIDATE, encoding="utf8", newline="").read().replace("\r\n", "\n")
        if active != candidate:
            print("Skip rule rollback: published source differs from our candidate")
            return
        update_pointer(OLD_RULESET)
        _, restored, previous = release_state()
        if restored != OLD_RULESET or sha(previous) != OLD_SHA:
            raise RuntimeError("Restored Firestore release did not match original rules")
        print("PASS rolled existing cloud.firestore release back to its original immutable ruleset")
    else:
        raise RuntimeError("Usage: publish-surgical-lgu-rules-rest.py publish|verify|rollback")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("BLOCKED:", str(exc), file=sys.stderr)
        sys.exit(1)
