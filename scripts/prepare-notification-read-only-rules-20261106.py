#!/usr/bin/env python3
"""Create an EMULATOR-ONLY candidate from the exact PUBLISHED Firestore Ruleset.

The only change is to prevent notification recipients changing title/message/
recipient metadata. Recipients can still acknowledge their OWN notice by
setting read:true. Admin authority and every other Firestore rule are unchanged.
This script NEVER calls a write endpoint or activates a Rules release.
"""
import hashlib
import json
import os
import subprocess
import urllib.request

PROJECT = "volunserve-3aa5b"
API = "https://firebaserules.googleapis.com/v1/"
RULESET = "projects/volunserve-3aa5b/rulesets/7a7ae2c0-1eeb-49ac-af54-d8fe37c3a164"
ORIGINAL_SHA = "f6f7d433d85bc0083539b9de9b38d2afb7f625bbad4dec0b1fd9ba275b2c240d"
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()

def get(path):
    request = urllib.request.Request(API + path, headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

def digest(text):
    return hashlib.sha256(text.encode("utf8")).hexdigest()

release = get("projects/" + PROJECT + "/releases/cloud.firestore")
if release.get("rulesetName") != RULESET:
    raise SystemExit("STOP published Firestore Ruleset changed; no modifications made")
sources = get(RULESET).get("source", {}).get("files", [])
matches = [item for item in sources if item.get("name", "").endswith("firestore.rules")]
if not matches and len(sources) == 1:
    matches = sources
if len(matches) != 1:
    raise SystemExit("STOP published Firestore Rules source ambiguous")
original = matches[0]["content"]
if digest(original) != ORIGINAL_SHA:
    raise SystemExit("STOP current active Firestore source fingerprint changed")

start = original.find("match /notifications/{notificationId} {")
end = original.find("    match /", start + len("match /notifications/{notificationId} {"))
if start < 0 or end < 0:
    raise SystemExit("STOP notifications rule boundaries changed")
block = original[start:end]
old = """      allow read, update: if approved()
        && (
          resource.data.userId == request.auth.uid
          || resource.data.recipientUid == request.auth.uid
        );"""
new = """      // A recipient can acknowledge a notification but never edit its content.
      // Keep a single permission expression to meet compiled Firestore Rules size.
      allow read, update: if approved()
        && (
          resource.data.userId == request.auth.uid
          || resource.data.recipientUid == request.auth.uid
        )
        && (
          request.method != 'update'
          || (
            request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read'])
            && request.resource.data.read == true
          )
        );"""
# Keep the exact published newline convention (CRLF or LF) in the candidate.
eol = "\r\n" if "\r\n" in original else "\n"
old = old.replace("\n", eol)
new = new.replace("\n", eol)
if block.count(old) != 1:
    raise SystemExit("STOP unexpected published notification permissions; requires manual review")
if "allow read, update, delete: if isAdmin();" not in block:
    raise SystemExit("STOP existing LGU Admin authority unexpectedly changed")
patched_block = block.replace(old, new)
candidate = original[:start] + patched_block + original[end:]
if candidate[:start] != original[:start] or not candidate.endswith(original[end:]):
    raise SystemExit("STOP candidate differs outside notification policies")
if candidate.count("A recipient can acknowledge a notification") != 1:
    raise SystemExit("STOP notification restriction not uniquely inserted")
with open("firestore.rules", "w", encoding="utf8", newline="\n") as output:
    output.write(candidate)
manifest = {
    "originalRuleset": RULESET,
    "originalSha": ORIGINAL_SHA,
    "candidateSha": digest(candidate),
    "fileName": matches[0]["name"],
}
with open(os.path.join(os.environ.get("RUNNER_TEMP", "."), "notification-rules-manifest.json"), "w") as output:
    json.dump(manifest, output)
print("PASS candidate differs only within notifications allow read/update")
print("PASS preserve Admin permissions, all other collections, and existing data")
print("PASS exact old Cloud Ruleset SHA:", ORIGINAL_SHA)
print("PASS candidate SHA:", manifest["candidateSha"])
print("NO FIREBASE RULES DEPLOYMENT")
