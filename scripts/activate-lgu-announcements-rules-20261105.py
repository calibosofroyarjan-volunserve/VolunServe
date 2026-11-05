#!/usr/bin/env python3
"""Guarded immutable compile, activate and rollback for ONLY LGU one-time area setup.

Never deploys Hosting, writes Firestore documents, changes sign-in, or edits the
programmer Super Admin rules. Must be used with a tested candidate built from
the exact active production rules source.
"""
import hashlib
import json
import os
import sys
import subprocess
import urllib.request

PROJECT = "volunserve-3aa5b"
API = "https://firebaserules.googleapis.com/v1/"
RELEASE = f"projects/{PROJECT}/releases/cloud.firestore"
EXPECTED_OLD = f"projects/{PROJECT}/rulesets/aae59e6b-d298-40a7-b4c3-f7a8f77e31ec"
EXPECTED_OLD_HASH = "600047206fac3d6aed4b955d6178aa2c0536d1b502a6df7ec9d3a02b6635c584"
EXPECTED_HOSTING = "905c0442b43a683bffe5b740ea061994cd94e8f2"
RUNNER_TEMP = os.environ.get("RUNNER_TEMP", ".")
MANIFEST_FILE = os.path.join(RUNNER_TEMP, "lgu-one-time-live-rules-release.json")
SOURCE_MANIFEST = os.path.join(RUNNER_TEMP, "lgu-recipient-manifest.json")
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()

def sha(text):
    return hashlib.sha256(text.encode("utf8")).hexdigest()

def canonical(text):
    return text.replace("\r\n", "\n").replace("\r", "\n")

def request(path, method="GET", payload=None):
    body = None if payload is None else json.dumps(payload).encode("utf8")
    headers = {"Authorization": "Bearer " + TOKEN}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=45) as reply:
        return json.load(reply)

def current():
    return request(RELEASE)["rulesetName"]

def content_for(name):
    result = request(name)
    files = result.get("source", {}).get("files", [])
    matches = [item for item in files if item.get("name", "").endswith("firestore.rules")]
    if not matches and len(files) == 1:
        matches = files
    if len(matches) != 1:
        raise RuntimeError("STOP ambiguous Ruleset source")
    return matches[0]["name"], matches[0]["content"]

def verify_hosting():
    for domain in ("https://volunserve.com", "https://volunserve-3aa5b.web.app"):
        req = urllib.request.Request(
            domain + "/volunserve-release.json?guard_lgu_1105=" + os.environ.get("GITHUB_RUN_ID", "0"),
            headers={"Cache-Control": "no-cache"},
        )
        with urllib.request.urlopen(req, timeout=30) as reply:
            meta = json.load(reply)
        if meta.get("revision") != EXPECTED_HOSTING:
            raise RuntimeError("STOP actual Hosting changed at " + domain)
    print("PASS current Hosting source still exact verified baseline")

def manifest():
    with open(MANIFEST_FILE, encoding="utf8") as file:
        return json.load(file)

def patch_pointer(name):
    response = request(
        RELEASE + "?updateMask=rulesetName",
        method="PATCH",
        payload={"release": {"name": RELEASE, "rulesetName": name}},
    )
    if response.get("rulesetName") != name:
        raise RuntimeError("Unexpected Firebase Rules release update response")

def do_stage():
    verify_hosting()
    if current() != EXPECTED_OLD:
        raise RuntimeError("STOP Firestore active Ruleset changed")
    name, original = content_for(EXPECTED_OLD)
    if sha(original) != EXPECTED_OLD_HASH:
        raise RuntimeError("STOP active Rules source hash differs from verified production")
    candidate = open("firestore.rules", "rb").read().decode("utf8")
    gen = json.load(open(SOURCE_MANIFEST, encoding="utf8"))
    if (gen.get("publishedRuleset") != EXPECTED_OLD or
        gen.get("originalSha") != EXPECTED_OLD_HASH or
        gen.get("candidateSha") != sha(candidate)):
        raise RuntimeError("STOP candidate manifest mismatch: original/source hash or published ruleset differs")
    start = original.find("match /users/{uid} {")
    end = original.find("    match /", start + len("match /users/{uid} {"))
    if start < 0 or end < 0 or candidate[:start] != original[:start] or not candidate.endswith(original[end:]):
        raise RuntimeError("STOP candidate changed non-user policies")
    if "LGU_AREA_ONE_TIME_SELF_DECLARATION_20261105" not in candidate:
        raise RuntimeError("STOP required staff setup guard missing")
    if len(candidate.encode("utf8")) >= 262144:
        raise RuntimeError("STOP Firebase Rules source exceeds size limit")
    compiled = request(
        f"projects/{PROJECT}/rulesets",
        method="POST",
        payload={"source": {"files": [{"name": name, "content": candidate}]}},
    )
    new = compiled.get("name", "")
    if not new.startswith(f"projects/{PROJECT}/rulesets/"):
        raise RuntimeError("STOP immutable compile response did not contain Ruleset name")
    staged_name, staged_source = content_for(new)
    if staged_name != name or canonical(staged_source) != canonical(candidate):
        raise RuntimeError("STOP compiled Ruleset content differs from emulator-tested candidate")
    if current() != EXPECTED_OLD:
        raise RuntimeError("STOP concurrent Firestore Rules activation detected")
    data = {"old": EXPECTED_OLD, "new": new, "oldHash": EXPECTED_OLD_HASH, "newHash": sha(candidate),
            "hostingBase": EXPECTED_HOSTING}
    with open(MANIFEST_FILE, "w", encoding="utf8") as file:
        json.dump(data, file)
    print("PASS compiled immutable INACTIVE Ruleset:", new)
    print("NO production Rules release changed yet")

def do_activate():
    info = manifest()
    if info.get("old") != EXPECTED_OLD or info.get("oldHash") != EXPECTED_OLD_HASH or info.get("hostingBase") != EXPECTED_HOSTING:
        raise RuntimeError("STOP stage manifest differs from release guard")
    verify_hosting()
    if current() != EXPECTED_OLD:
        raise RuntimeError("STOP production Rules changed before activation")
    _, staged_source = content_for(info["new"])
    candidate = open("firestore.rules", "rb").read().decode("utf8")
    if canonical(staged_source) != canonical(candidate) or sha(candidate) != info["newHash"]:
        raise RuntimeError("STOP previously compiled source no longer matches tested candidate")
    patch_pointer(info["new"])
    if current() != info["new"]:
        raise RuntimeError("STOP activation could not be verified")
    print("PASS activated only verified LGU one-time-area permission:", info["new"])

def do_rollback():
    if not os.path.isfile(MANIFEST_FILE):
        print("NO RULES ROLLBACK: stage manifest does not exist")
        return
    info = manifest()
    active = current()
    if active == info["old"]:
        print("NO RULES ROLLBACK: old Ruleset still active")
        return
    if active != info["new"]:
        raise RuntimeError("STOP: unrelated Ruleset now active; do not overwrite it")
    patch_pointer(info["old"])
    if current() != info["old"]:
        raise RuntimeError("CRITICAL: old Ruleset rollback did not verify")
    print("PASS safely rolled back ONLY this run's Ruleset activation")

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) == 2 else ""
    try:
        if mode == "stage":
            do_stage()
        elif mode == "activate":
            do_activate()
        elif mode == "rollback":
            do_rollback()
        else:
            raise RuntimeError("Use stage, activate or rollback")
    except Exception as exc:
        raise SystemExit("STOP: " + str(exc)[:1500])
