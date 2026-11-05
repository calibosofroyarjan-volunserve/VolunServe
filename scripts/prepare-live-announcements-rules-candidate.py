#!/usr/bin/env python3
"""Build an ANNOUNCEMENTS-ONLY Rules candidate from the actual active production source.

Never publishes a Ruleset or changes the active Firebase release. Requires a
pinned active ruleset identity and checksum to fail closed on concurrent updates.
"""
import hashlib
import json
import os
import re
import subprocess
import urllib.request

PROJECT = "volunserve-3aa5b"
EXPECTED_RULESET = "projects/volunserve-3aa5b/rulesets/b52b3100-43b9-4a01-aa2f-0c803022436e"
EXPECTED_SHA = "67fb37a13603b172c9a9c8bea6037fb75243907dd8a98bd18d90466681816db0"
TEMP = os.environ["RUNNER_TEMP"]
BASE = "https://firebaserules.googleapis.com/v1/"
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()

def get(path):
    request = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)

def digest(value):
    return hashlib.sha256(value.encode("utf8")).hexdigest()

release = get("projects/" + PROJECT + "/releases/cloud.firestore")
if release.get("rulesetName") != EXPECTED_RULESET:
    raise SystemExit("STOP: actual live Firebase Ruleset changed, no staging allowed")
ruleset = get(EXPECTED_RULESET)
files = ruleset.get("source", {}).get("files", [])
selected = [f for f in files if f.get("name", "").endswith("firestore.rules")]
if not selected and len(files) == 1:
    selected = files
if len(selected) != 1:
    raise SystemExit("STOP: Ambiguous live Firestore Rules file")
filename = selected[0]["name"]
original = selected[0]["content"]
if digest(original) != EXPECTED_SHA:
    raise SystemExit("STOP: live Firebase Rules bytes changed, no staging allowed")

start = original.find("match /announcements/{announcementId} {")
if start < 0:
    raise SystemExit("STOP: live announcements block missing")
end = original.find("match /", start + len("match /announcements/{announcementId} {"))
if end < 0:
    raise SystemExit("STOP: rules match boundary not found")
block = original[start:end]
old_read = re.compile(
    r"(?m)^[ \t]*allow read:\s*if isAdminOrSuperAdmin\(\)\s*\|\|\s*\(\s*approved\(\)\s*&&\s*resource\.data\.publishAt\s+is\s+timestamp\s*&&\s*resource\.data\.publishAt\s*<=\s*request\.time\s*\);"
)
matches = list(old_read.finditer(block))
if len(matches) != 1:
    raise SystemExit("STOP: unexpected current announcements read condition")
new_read = "\n".join([
    "      // Individual get: own area or city-wide, published and approved.",
    "      function ownAnnouncementArea() {",
    "        return resource.data.audience == 'all'",
    "          || resource.data.audience == profile().get('barangay', '');",
    "      }",
    "      allow get: if isAdminOrSuperAdmin()",
    "        || (approved() && ownAnnouncementArea()",
    "          && resource.data.publishAt is timestamp",
    "          && resource.data.publishAt <= request.time);",
    "      // List: query must constrain audience; publishAt <= now remains in client.",
    "      allow list: if isAdminOrSuperAdmin()",
    "        || (approved() && ownAnnouncementArea());",
])
m = matches[0]
patched = block[:m.start()] + new_read + block[m.end():]
for verb in ("create", "update", "delete"):
    old = "allow " + verb + ": if isAdmin()"
    if patched.count(old) != 1:
        raise SystemExit("STOP: Unexpected " + verb + " policy in active announcements block")
    patched = patched.replace(old, old + " && profile().get('adminStatus', 'active') != 'suspended'", 1)

candidate = original[:start] + patched + original[end:]
if candidate[:start] != original[:start] or not candidate.endswith(original[end:]):
    raise SystemExit("STOP: patch changed non-announcements rules")

with open(TEMP + "/actual-original-firestore.rules", "w", encoding="utf8") as f:
    f.write(original)
with open("firestore.rules", "w", encoding="utf8") as f:
    f.write(candidate)
with open(TEMP + "/candidate-metadata.json", "w", encoding="utf8") as f:
    json.dump({"project": PROJECT, "previousRuleset": EXPECTED_RULESET, "previousSha": EXPECTED_SHA,
               "candidateSha": digest(candidate), "filename": filename}, f)

print("PASS pinned actual published Ruleset:", EXPECTED_RULESET)
print("PASS non-announcements rules byte-identical")
print("PASS only announcement get/list and suspended-admin write conditions changed")
print("Original text size bytes:", len(original.encode("utf8")))
print("Candidate text size bytes:", len(candidate.encode("utf8")))
print("Candidate sha256:", digest(candidate))
