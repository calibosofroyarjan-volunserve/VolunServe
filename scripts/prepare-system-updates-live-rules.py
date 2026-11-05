#!/usr/bin/env python3
"""Build a surgical Super Admin global-publishing policy using CURRENT deployed Firebase rules.

This is preparation for emulator and compiler checks, NOT a live Rules release.
No other rules may change. Fail closed if active rules or Hosting differs.
"""
import hashlib
import json
import os
import re
import subprocess
import urllib.request

PROJECT = "volunserve-3aa5b"
EXPECTED_RELEASE = "projects/volunserve-3aa5b/rulesets/aae59e6b-d298-40a7-b4c3-f7a8f77e31ec"
EXPECTED_HOSTING = "8cf5141d6fc51b29e443878efb8619fb7186b086"
RULES_API = "https://firebaserules.googleapis.com/v1/"
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()

def get(path):
    req=urllib.request.Request(RULES_API + path,
        headers={"Authorization":"Bearer "+TOKEN})
    with urllib.request.urlopen(req,timeout=30) as response:
        return json.load(response)

def sha(content):
    return hashlib.sha256(content.encode("utf8")).hexdigest()

host_req=urllib.request.Request("https://volunserve.com/volunserve-release.json?check_system_updates=20261105",
    headers={"cache-control":"no-cache"})
with urllib.request.urlopen(host_req,timeout=20) as response:
    hosting=json.load(response)
if hosting.get("revision") != EXPECTED_HOSTING:
    raise SystemExit("STOP: live Hosting changed. Do not port Super Admin source from outdated base.")

active=get("projects/"+PROJECT+"/releases/cloud.firestore")
if active.get("rulesetName") != EXPECTED_RELEASE:
    raise SystemExit("STOP: different Firestore Ruleset is now active; requires new review.")
ruleset=get(EXPECTED_RELEASE)
files=ruleset.get("source",{}).get("files",[])
matches=[item for item in files if item.get("name","").endswith("firestore.rules")]
if not matches and len(files)==1:matches=files
if len(matches)!=1:raise SystemExit("STOP: could not isolate active Firestore rules source")
original=matches[0]["content"]
if sha(original) != "600047206fac3d6aed4b955d6178aa2c0536d1b502a6df7ec9d3a02b6635c584":
    raise SystemExit("STOP: active Rules source differs from reviewed new Cloud Ruleset")
if "function isSuperAdmin()" not in original:raise SystemExit("STOP: role helper missing")
start=original.find("match /announcements/{announcementId} {")
if start<0:raise SystemExit("STOP: announcements rule block absent")
end=original.find("    match /",start+len("match /announcements/{announcementId} {"))
if end<0:raise SystemExit("STOP: announcements block boundary missing")
block=original[start:end]
if "function ownAnnouncementArea()" not in block or "allow list:" not in block:
    raise SystemExit("STOP: audience-scoped announcements rules not active")
if re.search(r"allow create:\s*if isSuperAdmin\(",block):
    raise SystemExit("STOP: Super Admin system publisher policy already exists; review before modifying")
insert_at=block.rfind("\n    }")
if insert_at<0:raise SystemExit("STOP: announcements block closing brace missing")
addition="""
      // Super Admin platform notices only. An LGU Admin can never publish audience 'all'.
      // Posted updates are immutable in this version; no Super Admin update/delete grants.
      allow create: if isSuperAdmin()
        && request.resource.data.keys().hasOnly([
          'title', 'message', 'audience', 'priority', 'publishAt',
          'createdBy', 'createdAt', 'updatedAt', 'linkUrl', 'imageUrl'
        ])
        && request.resource.data.keys().hasAll([
          'title', 'message', 'audience', 'priority', 'publishAt',
          'createdBy', 'createdAt', 'updatedAt', 'linkUrl', 'imageUrl'
        ])
        && request.resource.data.audience == 'all'
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.title is string
        && request.resource.data.title.size() >= 3
        && request.resource.data.title.size() <= 120
        && request.resource.data.message is string
        && request.resource.data.message.size() >= 10
        && request.resource.data.message.size() <= 2000
        && request.resource.data.priority in ['normal', 'urgent']
        && request.resource.data.publishAt is timestamp
        && request.resource.data.createdAt is timestamp
        && request.resource.data.updatedAt is timestamp
        && request.resource.data.linkUrl is string
        && request.resource.data.imageUrl is string;
"""
patched_block=block[:insert_at]+addition+block[insert_at:]
# A malformed Admin profile with barangay 'all' must never impersonate
# a global System Update publisher or edit/delete system-wide notices.
for operation in ("create", "update", "delete"):
    base = "allow " + operation + ": if isAdmin()"
    if patched_block.count(base) != 1:
        raise SystemExit("STOP: Unexpected LGU announcement " + operation + " rule")
    patched_block = patched_block.replace(
        base, base + " && profile().get('barangay', '') != 'all'", 1)
candidate=original[:start]+patched_block+original[end:]
if not candidate.startswith(original[:start]) or not candidate.endswith(original[end:]):
    raise SystemExit("STOP: unrelated published Firestore rules would be touched")
with open("firestore.rules","w",encoding="utf8",newline="\n") as f:f.write(candidate)
tmp=os.environ.get("RUNNER_TEMP",".")
with open(os.path.join(tmp,"system-update-rules-manifest.json"),"w",encoding="utf8") as f:
    json.dump({"oldRuleset":EXPECTED_RELEASE,"oldSourceSha":sha(original),
               "newSourceSha":sha(candidate),"hosting":EXPECTED_HOSTING,
               "sourceFile":matches[0]["name"]},f)
print("PASS announcement-only Rules policy prepared from actual deployed Ruleset: "+EXPECTED_RELEASE)
print("PASS old source sha256: "+sha(original))
print("PASS candidate sha256: "+sha(candidate))
print("PASS no other collection rules changed; NO LIVE RULES DEPLOY")
