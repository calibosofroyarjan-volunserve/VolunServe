#!/usr/bin/env python3
"""Build read-only emulator candidate: one-time self-declared LGU area, no Super Admin assignment.

The candidate modifies only user-profile area permissions; the active Cloud
Ruleset and all announcement/Super Admin permissions remain untouched.
"""
import hashlib,json,os,re,subprocess,urllib.request
project="volunserve-3aa5b"
api="https://firebaserules.googleapis.com/v1/"
token=subprocess.check_output(["gcloud","auth","print-access-token"],text=True).strip()
def fetch(path):
    req=urllib.request.Request(api+path,headers={"Authorization":"Bearer "+token})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
live=fetch("projects/"+project+"/releases/cloud.firestore")
published=live["rulesetName"]
files=fetch(published).get("source",{}).get("files",[])
matches=[f for f in files if f.get("name","").endswith("firestore.rules")]
if not matches and len(files)==1:matches=files
if len(matches)!=1:raise SystemExit("STOP: current published Firestore rules ambiguous")
original=matches[0]["content"]
start=original.find("match /users/{uid} {")
end=original.find("    match /",start+len("match /users/{uid} {"))
if start<0 or end<0:raise SystemExit("STOP: user profile rule boundary changed")
block=original[start:end]
self_update=re.compile(
    r"(allow update:\s*if signedIn\(\)\s*&& request.auth.uid == uid\s*"
    r"&& request.resource.data\s*\.diff\(resource.data\)\s*"
    r"\.affectedKeys\(\)\s*\.hasOnly\(\[)(.*?)(\]\))",re.S)
hits=list(self_update.finditer(block))
if len(hits)!=1 or "'barangay'" not in hits[0].group(2) or "'fullName'" not in hits[0].group(2):
    raise SystemExit("STOP: first general self-profile edit structure changed")
m=hits[0]
guard="""
        // An approved LGU Admin can set their empty area ONCE through the dedicated route.
        // Ordinary self-profile edits cannot change an existing Admin operational area.
        && !(resource.data.get('role', '') == 'admin'
          && request.resource.data.diff(resource.data).affectedKeys().hasAny(['barangay']))"""
block=block[:m.end()]+guard+block[m.end():]
js=open("constants/sjdmBarangays.ts",encoding="utf8").read()
a=re.search(r"export const SJDM_BARANGAYS:\s*string\[\]\s*=\s*\[(.*?)\];",js,re.S)
if not a:raise SystemExit("STOP: official SJDM constants missing")
areas=re.findall(r'"([^"]+)"',a.group(1))
if len(areas)!=62 or len(set(areas))!=62:raise SystemExit("STOP: expected 62 unique SJDM areas")
literal="[\n          "+",\n          ".join("'"+v.replace("'","\\'")+"'" for v in areas)+"\n        ]"
addition="""
      // LGU_AREA_ONE_TIME_SELF_DECLARATION_20261105.
      // Existing approved LGU staff may initialize a previously blank area once.
      // Never permits changing it again, escalating roles, or changing Super Admin accounts.
      allow update: if isAdmin()
        && request.auth.uid == uid
        && resource.data.get('role','') == 'admin'
        && resource.data.get('status','approved') == 'approved'
        && resource.data.get('adminStatus','active') != 'suspended'
        && resource.data.get('barangay','') == ''
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['barangay','barangayDeclaredAt','barangayDeclaredBy'])
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasAll(['barangay','barangayDeclaredAt','barangayDeclaredBy'])
        && request.resource.data.barangay in __OFFICIAL_AREAS__
        && request.resource.data.barangayDeclaredAt == request.time
        && request.resource.data.barangayDeclaredBy == request.auth.uid;
"""
addition=addition.replace("__OFFICIAL_AREAS__",literal)
pos=block.find("      allow update: if isSuperAdmin()")
if pos<0:raise SystemExit("STOP: privileged account rule insertion boundary changed")
block=block[:pos]+addition+block[pos:]
candidate=original[:start]+block+original[end:]
if candidate[:start]!=original[:start] or not candidate.endswith(original[end:]):
    raise SystemExit("STOP: changes outside users rule detected")
with open("firestore.rules","w",encoding="utf8",newline="\n") as f:f.write(candidate)
hashtext=lambda t:hashlib.sha256(t.encode("utf8")).hexdigest()
manifest={"publishedRuleset":published,"originalSha":hashtext(original),
          "candidateSha":hashtext(candidate),"officialAreas":len(areas)}
with open(os.path.join(os.environ.get("RUNNER_TEMP","."),"lgu-recipient-manifest.json"),"w") as f:json.dump(manifest,f)
print("PASS current live base:",published)
print("PASS one-time LGU self-setup candidate; no Super Admin or announcement rule changed")
print("PASS 62 official SJDM areas")
print("NO PRODUCTION RULES ACTIVATION")
