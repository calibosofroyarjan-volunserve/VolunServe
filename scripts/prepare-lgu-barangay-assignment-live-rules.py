#!/usr/bin/env python3
"""Build a candidate LGU-REQUESTED area verification policy from the exact LIVE Ruleset.
Read-only source fetch + emulator-only patch. Never publishes or activates Rules.
"""
import hashlib,json,os,re,subprocess,urllib.request

PROJECT="volunserve-3aa5b"
ROOT="https://firebaserules.googleapis.com/v1/"
TOKEN=subprocess.check_output(["gcloud","auth","print-access-token"],text=True).strip()
def get(path):
    req=urllib.request.Request(ROOT+path,headers={"Authorization":"Bearer "+TOKEN})
    with urllib.request.urlopen(req,timeout=30) as response:
        return json.load(response)

live=get("projects/"+PROJECT+"/releases/cloud.firestore")
published=live["rulesetName"]
sources=get(published).get("source",{}).get("files",[])
files=[f for f in sources if f.get("name","").endswith("firestore.rules")]
if not files and len(sources)==1: files=sources
if len(files)!=1: raise SystemExit("STOP: published Firestore Rules source ambiguous")
original=files[0]["content"]

# Official 62 SJDM barangays, shared with application UI.
js=open("constants/sjdmBarangays.ts",encoding="utf8").read()
group=re.search(r"export const SJDM_BARANGAYS:\s*string\[\]\s*=\s*\[(.*?)\];",js,re.S)
if not group: raise SystemExit("STOP: official SJDM list not found")
areas=re.findall(r'"([^"]+)"',group.group(1))
if len(areas)!=62 or len(set(areas))!=62: raise SystemExit("STOP: official barangay list changed")
areas_literal="[\n          "+",\n          ".join("'"+v.replace("'","\\'")+"'" for v in areas)+"\n        ]"

start=original.find("match /users/{uid} {")
end=original.find("    match /",start+len("match /users/{uid} {"))
if start<0 or end<0: raise SystemExit("STOP: users rule boundary changed")
block=original[start:end]
# Close existing LGU self-edit bypass. Leave ordinary resident updates untouched.
self_update=re.compile(
    r"(allow update:\s*if signedIn\(\)\s*&& request.auth.uid == uid\s*&& request.resource.data\s*"
    r"\.diff\(resource.data\)\s*\.affectedKeys\(\)\s*\.hasOnly\(\[)(.*?)(\]\))",re.S)
matches=list(self_update.finditer(block))
if len(matches)!=1 or "'barangay'" not in matches[0].group(2) or "'fullName'" not in matches[0].group(2):
    raise SystemExit("STOP: base self-profile edit rule changed")
m=matches[0]
guard=("""
        // Admin area is an official authorization, never a self-service profile field.
        && !(resource.data.get('role', '') in ['admin','superadmin','lgu_personnel']
          && request.resource.data.diff(resource.data).affectedKeys().hasAny(['barangay']))""")
block=block[:m.end()]+guard+block[m.end():]

request_path="/databases/$(database)/documents/lguBarangayRequests/$(uid)"
user_path="/databases/$(database)/documents/users/$(uid)"
# The programmer can approve ONLY the area already submitted by a real LGU Admin.
# getAfter enforces review and user-profile grant within the same atomic write.
grant="""      allow update: if isSuperAdmin()
        && request.auth.uid != uid
        && resource.data.role == 'admin'
        && resource.data.get('barangay','') == ''
        && request.resource.data.role == 'admin'
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['barangay','adminUpdatedAt','adminUpdatedBy'])
        && request.resource.data.diff(resource.data).affectedKeys().hasAny(['barangay'])
        && request.resource.data.barangay in __OFFICIAL_AREAS__
        && exists(__REQUEST_PATH__)
        && get(__REQUEST_PATH__).data.status == 'pending'
        && get(__REQUEST_PATH__).data.uid == uid
        && get(__REQUEST_PATH__).data.desiredBarangay == request.resource.data.barangay
        && getAfter(__REQUEST_PATH__).data.status == 'approved'
        && getAfter(__REQUEST_PATH__).data.reviewedBy == request.auth.uid
        && getAfter(__REQUEST_PATH__).data.reviewedAt == request.time
        && request.resource.data.adminUpdatedAt == request.time
        && request.resource.data.adminUpdatedBy == request.auth.uid;
"""
grant=grant.replace("__OFFICIAL_AREAS__",areas_literal).replace("__REQUEST_PATH__",request_path)
pos=block.find("      allow update: if isSuperAdmin()")
if pos<0: raise SystemExit("STOP: existing privileged user rules missing")
block=block[:pos]+grant+block[pos:]
candidate=original[:start]+block+original[end:]
if candidate[:start]!=original[:start] or not candidate.endswith(original[end:]):
    raise SystemExit("STOP: unexpected modifications to existing rules")

# Additional collection only: scope requests to self-owned active LGU Admin,
# authorize independent Super Admin reviews, never permit arbitrary area grants.
request_rule="""    match /lguBarangayRequests/{uid} {
      function requestShapeValid() {
        return request.resource.data.keys().hasOnly([
            'uid','desiredBarangay','office','position','appointmentReference',
            'status','submittedAt','reviewedBy','reviewedAt','rejectionReason'
          ])
          && request.resource.data.keys().hasAll([
            'uid','desiredBarangay','office','position','appointmentReference',
            'status','submittedAt','reviewedBy','reviewedAt','rejectionReason'
          ])
          && request.resource.data.uid == uid
          && request.resource.data.desiredBarangay in __OFFICIAL_AREAS__
          && request.resource.data.office is string
          && request.resource.data.office.size() >= 3
          && request.resource.data.office.size() <= 160
          && request.resource.data.position is string
          && request.resource.data.position.size() >= 3
          && request.resource.data.position.size() <= 120
          && request.resource.data.appointmentReference is string
          && request.resource.data.appointmentReference.size() >= 5
          && request.resource.data.appointmentReference.size() <= 160;
      }
      allow get: if isSuperAdmin() || (isAdmin() && request.auth.uid == uid);
      allow list: if isSuperAdmin();
      allow create: if isAdmin()
        && request.auth.uid == uid
        && profile().get('barangay','') == ''
        && requestShapeValid()
        && request.resource.data.status == 'pending'
        && request.resource.data.submittedAt == request.time
        && request.resource.data.reviewedBy == ''
        && request.resource.data.reviewedAt == null
        && request.resource.data.rejectionReason == '';
      allow update: if (
        isAdmin()
        && request.auth.uid == uid
        && profile().get('barangay','') == ''
        && resource.data.status == 'rejected'
        && requestShapeValid()
        && request.resource.data.status == 'pending'
        && request.resource.data.submittedAt == request.time
        && request.resource.data.reviewedBy == ''
        && request.resource.data.reviewedAt == null
        && request.resource.data.rejectionReason == ''
      ) || (
        isSuperAdmin()
        && request.auth.uid != uid
        && resource.data.uid == uid
        && resource.data.status == 'pending'
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['status','reviewedBy','reviewedAt','rejectionReason'])
        && request.resource.data.reviewedBy == request.auth.uid
        && request.resource.data.reviewedAt == request.time
        && (
          (
            request.resource.data.status == 'approved'
            && request.resource.data.rejectionReason == ''
            && existsAfter(__USER_PATH__)
            && getAfter(__USER_PATH__).data.role == 'admin'
            && getAfter(__USER_PATH__).data.barangay == resource.data.desiredBarangay
            && getAfter(__USER_PATH__).data.adminUpdatedBy == request.auth.uid
            && getAfter(__USER_PATH__).data.adminUpdatedAt == request.time
          )
          || (
            request.resource.data.status == 'rejected'
            && request.resource.data.rejectionReason is string
            && request.resource.data.rejectionReason.size() >= 10
            && request.resource.data.rejectionReason.size() <= 300
          )
        )
      );
      allow delete: if false;
    }

"""
request_rule=request_rule.replace("__OFFICIAL_AREAS__",areas_literal).replace("__USER_PATH__",user_path)
anchor="    match /announcements/{announcementId} {"
if candidate.count(anchor)!=1 or "match /lguBarangayRequests/{uid}" in original:
    raise SystemExit("STOP: announcement anchor changed or request rule already exists")
candidate=candidate.replace(anchor,request_rule+anchor)
if candidate.count("match /lguBarangayRequests/{uid}")!=1:
    raise SystemExit("STOP: request rule inserted unexpectedly")
with open("firestore.rules","w",encoding="utf8",newline="\n") as out:
    out.write(candidate)
sha=lambda data:hashlib.sha256(data.encode("utf8")).hexdigest()
manifest={
    "originalRuleset":published,
    "originalSha":sha(original),
    "candidateSha":sha(candidate),
    "file":files[0]["name"],
    "count":len(areas)
}
with open(os.path.join(os.environ.get("RUNNER_TEMP","."),"lgu-barangay-rules-manifest.json"),"w") as out:
    json.dump(manifest,out)
print("PASS exact LIVE published Ruleset:",published)
print("PASS candidate: staff-submitted verification + atomic approved-area grant")
print("PASS official area count:",len(areas))
print("PASS source SHA:",manifest["originalSha"])
print("PASS candidate SHA:",manifest["candidateSha"])
print("NO CLOUD FIRESTORE RULES DEPLOYMENT")
