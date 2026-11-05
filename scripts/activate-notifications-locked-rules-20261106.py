#!/usr/bin/env python3
"""Guarded immutable compile, activate and rollback of ONLY notification content security.

Never deploys Hosting, writes Firestore documents, changes sign-in or alters
programmer Super Admin / LGU Admin authorization. Compile from the exact active
Cloud Rules source, test with the emulator, then update ONLY the release pointer.
The Firebase Rules REST PATCH updateMask belongs in the JSON body, not URL.
"""
import hashlib
import json
import os
import sys
import subprocess
import urllib.request
import urllib.error

PROJECT = "volunserve-3aa5b"
API = "https://firebaserules.googleapis.com/v1/"
RELEASE = f"projects/{PROJECT}/releases/cloud.firestore"
EXPECTED_OLD = f"projects/{PROJECT}/rulesets/7a7ae2c0-1eeb-49ac-af54-d8fe37c3a164"
EXPECTED_OLD_HASH = "f6f7d433d85bc0083539b9de9b38d2afb7f625bbad4dec0b1fd9ba275b2c240d"
EXPECTED_HOSTING = "12f840178b6fce3ff642ef33f036e2f8ed4d37cf"
RUNNER_TEMP = os.environ.get("RUNNER_TEMP", ".")
MANIFEST_FILE = os.path.join(RUNNER_TEMP, "notifications-locked-rules-release.json")
SOURCE_MANIFEST = os.path.join(RUNNER_TEMP, "notification-rules-manifest.json")
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
    try:
        with urllib.request.urlopen(req, timeout=45) as reply:
            return json.load(reply)
    except urllib.error.HTTPError as error:
        # Log only sanitized diagnostic words from the Firebase error message.
        # Never echo raw credentials, URLs, emails, JSON or request headers.
        import re
        details = error.read().decode("utf8", errors="replace")
        try:
            payload = json.loads(details)
            error_body = payload.get("error", {})
            status = str(error_body.get("status", "unknown"))
            message = str(error_body.get("message", "unknown"))
        except Exception:
            status, message = "unparsed", "unavailable"
        safe_words = " ".join(re.findall(r"[A-Za-z_]+", message)[:45])
        raise RuntimeError(
            "Firebase Rules API HTTP " + str(error.code) +
            " status=" + status + " message_words=" + safe_words[:400]
        ) from error

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
            domain + "/volunserve-release.json?guard_notifications_1106=" + os.environ.get("GITHUB_RUN_ID", "0"),
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
        RELEASE,
        method="PATCH",
        payload={
            "release": {"name": RELEASE, "rulesetName": name},
            "updateMask": "rulesetName",
        },
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
    if (gen.get("originalRuleset") != EXPECTED_OLD or
        gen.get("originalSha") != EXPECTED_OLD_HASH or
        gen.get("candidateSha") != sha(candidate)):
        raise RuntimeError("STOP candidate manifest mismatch: original/source hash or published ruleset differs")
    start = original.find("match /notifications/{notificationId} {")
    end = original.find("    match /", start + len("match /notifications/{notificationId} {"))
    if start < 0 or end < 0 or candidate[:start] != original[:start] or not candidate.endswith(original[end:]):
        raise RuntimeError("STOP candidate changed non-notification policies")
    if "A recipient can acknowledge a notification" not in candidate:
        raise RuntimeError("STOP notification read-only-content guard missing")
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
    if (info.get("old") != EXPECTED_OLD or
        info.get("oldHash") != EXPECTED_OLD_HASH or
        info.get("hostingBase") != EXPECTED_HOSTING):
        raise RuntimeError("STOP stage manifest differs from release guard")
    verify_hosting()
    if current() != EXPECTED_OLD:
        raise RuntimeError("STOP active Firestore Rules changed before activation")
    _, staged_source = content_for(info["new"])
    candidate = open("firestore.rules", "rb").read().decode("utf8")
    if canonical(staged_source) != canonical(candidate) or sha(candidate) != info["newHash"]:
        raise RuntimeError("STOP immutable staged candidate differs from emulator-tested source")

    # The first variant is the exact PATCH shape used in VolunServe's previous
    # successful LGU Rules-only activation. Additional documented API shapes
    # are safe fallbacks only if the preceding request leaves the old Rules active.
    variants = [
        (RELEASE + "?updateMask=rulesetName", {
            "release": {"name": RELEASE, "rulesetName": info["new"]}
        }),
        (RELEASE, {
            "release": {"name": RELEASE, "rulesetName": info["new"]}
        }),
        (RELEASE, {
            "release": {"name": RELEASE, "rulesetName": info["new"]},
            "updateMask": "rulesetName"
        }),
    ]
    messages = []
    for index, (url, payload) in enumerate(variants, start=1):
        if current() != EXPECTED_OLD:
            if current() == info["new"]:
                print("PASS new Ruleset is already active from the previous update attempt")
                return
            raise RuntimeError("STOP a different Ruleset became active during activation")
        try:
            response = request(url, method="PATCH", payload=payload)
            if response.get("rulesetName") != info["new"] or current() != info["new"]:
                raise RuntimeError("STOP unexpected Firebase release update response")
            print("PASS activated notification content-protection only:", info["new"])
            return
        except Exception as exc:
            if current() == info["new"]:
                print("PASS verified active Ruleset even though update response failed")
                return
            messages.append("variant " + str(index) + ": " + str(exc)[:550])
    raise RuntimeError("STOP no Firebase Rules PATCH form succeeded. " + " | ".join(messages))


def do_rollback():
    if not os.path.isfile(MANIFEST_FILE):
        print("NO RULES ROLLBACK: stage manifest missing")
        return
    info = manifest()
    active = current()
    if active == info["old"]:
        print("NO RULES ROLLBACK: old Ruleset remains active")
        return
    if active != info["new"]:
        raise RuntimeError("STOP unrelated Ruleset active; refuse to overwrite")
    # Reuse exact known-successful release PATCH form to restore the previous
    # immutable Ruleset, never reading stale checked-in Firestore rules.
    response = request(RELEASE + "?updateMask=rulesetName", method="PATCH",
                       payload={"release": {"name": RELEASE, "rulesetName": info["old"]}})
    if response.get("rulesetName") != info["old"] or current() != info["old"]:
        raise RuntimeError("CRITICAL old Ruleset rollback not verified")
    print("PASS reverted only this workflow's Ruleset pointer to old version")


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
