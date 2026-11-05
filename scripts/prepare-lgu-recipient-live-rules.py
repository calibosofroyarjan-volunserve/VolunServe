#!/usr/bin/env python3
"""Construct a scoped, emulator-only LGU recipient policy from EXACT CURRENT published rules.

This script is intentionally read-only against live Firebase. No Rules release is
created, updated or activated. Existing Super Admin permissions stay byte-identical.
"""
import hashlib
import json
import os
import re
import subprocess
import urllib.request

project = "volunserve-3aa5b"
root = "https://firebaserules.googleapis.com/v1/"
token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
def fetch(path):
    req = urllib.request.Request(root + path, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

release = fetch("projects/" + project + "/releases/cloud.firestore")
ruleset_name = release["rulesetName"]
files = fetch(ruleset_name).get("source", {}).get("files", [])
matches = [item for item in files if item.get("name", "").endswith("firestore.rules")]
if not matches and len(files) == 1:
    matches = files
if len(matches) != 1:
    raise SystemExit("STOP: current published Firestore source is ambiguous")
original = matches[0]["content"]
start = original.find("match /announcements/{announcementId} {")
if start < 0:
    raise SystemExit("STOP: announcement rule block missing")
end = original.find("    match /", start + len("match /announcements/{announcementId} {"))
if end < 0:
    raise SystemExit("STOP: announcement block boundary missing")
block = original[start:end]
if "allow create: if isAdmin()" not in block or not any(permission in block for permission in ("allow read:", "allow get:", "allow list:")):
    raise SystemExit("STOP: live announcement structure changed; manual review required")
if "LGU_RECIPIENT_CHOICES_20261105" in original:
    raise SystemExit("STOP: recipient rule already exists; inspect released policy")

js = open("constants/sjdmBarangays.ts", encoding="utf8").read()
m = re.search(r"export const SJDM_BARANGAYS:\s*string\[\]\s*=\s*\[(.*?)\];", js, re.S)
if not m:
    raise SystemExit("STOP: SJDM barangay constant not found")
areas = re.findall(r'"([^"]+)"', m.group(1))
if len(areas) != 62 or len(set(areas)) != 62:
    raise SystemExit("STOP: expected 62 unique official SJDM barangays")
literal = "[\n          " + ",\n          ".join("'" + area.replace("'", "\\'") + "'" for area in areas) + "\n        ]"
addition = """
      // LGU_RECIPIENT_CHOICES_20261105
      // Operational LGU Admin selects a local SJDM recipient per announcement.
      // Does NOT modify any user's assigned barangay or Super Admin system notice grants.
      allow create: if isAdmin()
        && request.resource.data.keys().hasOnly([
          'title','message','linkUrl','imageUrl','audience','priority',
          'publishAt','createdBy','createdAt','updatedAt'
        ])
        && request.resource.data.keys().hasAll([
          'title','message','linkUrl','imageUrl','audience','priority',
          'publishAt','createdBy','createdAt','updatedAt'
        ])
        && request.resource.data.audience in __AREAS__
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.title is string
        && request.resource.data.title.size() >= 3
        && request.resource.data.title.size() <= 120
        && request.resource.data.message is string
        && request.resource.data.message.size() >= 10
        && request.resource.data.message.size() <= 2000
        && request.resource.data.linkUrl is string
        && request.resource.data.linkUrl.size() <= 2048
        && request.resource.data.imageUrl is string
        && request.resource.data.imageUrl.size() <= 2048
        && request.resource.data.priority in ['normal','urgent']
        && request.resource.data.publishAt == request.time
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time;
"""
addition = addition.replace("__AREAS__", literal)
pos = block.rfind("\n    }")
if pos < 0:
    raise SystemExit("STOP: announcement block final brace missing")
patched = block[:pos] + addition + block[pos:]
candidate = original[:start] + patched + original[end:]
if candidate[:start] != original[:start] or candidate[end + len(patched) - len(block):] != original[end:]:
    # The append-only rule must not touch content before/after announcements.
    raise SystemExit("STOP: unexpected modifications outside announcements")
with open("firestore.rules", "w", encoding="utf8", newline="\n") as out:
    out.write(candidate)
digest = lambda text: hashlib.sha256(text.encode("utf8")).hexdigest()
manifest = {"publishedRuleset": ruleset_name, "originalSha": digest(original),
            "candidateSha": digest(candidate), "officialAreas": len(areas)}
with open(os.path.join(os.environ.get("RUNNER_TEMP", "."), "lgu-recipient-manifest.json"), "w") as out:
    json.dump(manifest, out)
print("PASS read-only current live Ruleset:", ruleset_name)
print("PASS add-only LGU announcement create permission; other rules unchanged")
print("PASS official SJDM areas:", len(areas))
print("NO LIVE RULES RELEASE / ACTIVATION")
