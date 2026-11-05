#!/usr/bin/env python3
"""Prepare ONLY verified LGU Admin barangay assignment authorization from LIVE Rules.

Reads the exact published Ruleset and writes a temporary local candidate for
Firestorm emulator/immutable compilation. NEVER deploys or activates rules.
"""
import hashlib,json,os,re,subprocess,urllib.request

PROJECT="volunserve-3aa5b"
ROOT="https://firebaserules.googleapis.com/v1/"
TOKEN=subprocess.check_output(["gcloud","auth","print-access-token"],text=True).strip()
def get(path):
    req=urllib.request.Request(ROOT+path,headers={"Authorization":"Bearer "+TOKEN})
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
live=get(f"projects/{PROJECT}/releases/cloud.firestore")
published=live["rulesetName"]
rs=get(published)
sources=rs.get("source",{}).get("files",[])
files=[f for f in sources if f.get("name","").endswith("firestore.rules")]
if not files and len(sources)==1:files=sources
if len(files)!=1:raise SystemExit("STOP: published Firestore Rules source ambiguous")
original=files[0]["content"]
start=original.find("match /users/{uid} {")
end=original.find("    match /",start+len("match /users/{uid} {"))
if start<0 or end<0:raise SystemExit("STOP: users rule boundary unexpected")
block=original[start:end]
# Target the FIRST general self-service profile update only; no other rules.
p=re.compile(r"(allow update:\s*if signedIn\(\)\s*&& request.auth.uid == uid\s*&& request.resource.data\s*\.diff\(resource.data\)\s*\.affectedKeys\(\)\s*\.hasOnly\(\[)(.*?)(\]\))",re.S)
matches=list(p.finditer(block))
if len(matches)!=1 or "'barangay'" not in matches[0].group(2) or "'fullName'" not in matches[0].group(2):
    raise SystemExit("STOP: self-edit profile condition changed; manual review required")
m=matches[0]
guard=("\n        // LGU geographic authority is a Super Admin-only assignment.\n"
       "        && !(resource.data.get('role', '') in ['admin','superadmin','lgu_personnel']\n"
       "          && request.resource.data.diff(resource.data).affectedKeys().hasAny(['barangay']))")
block=block[:m.end()]+guard+block[m.end():]
# Existing LGU review helpers remain byte-for-byte unchanged. The published
# Ruleset may name these helpers differently; this patch never modifies them.
# Generate official 62 PSGC barangays from project constants (no free-form client choice).
js=open("constants/sjdmBarangays.ts",encoding="utf8").read()
group=re.search(r"export const SJDM_BARANGAYS:\s*string\[\]\s*=\s*\[(.*?)\];",js,re.S)
if not group:raise SystemExit("STOP: official SJDM list missing")
areas=re.findall(r'"([^"]+)"',group.group(1))
if len(areas)!=62 or len(set(areas))!=62:raise SystemExit("STOP: SJDM list count unexpected")
allowed=",\n          ".join("'"+x.replace("'","\\'")+"'" for x in areas)
extra=("\n      // ONLY verified Super Admin can assign the true area of an existing LGU Admin.\n"
       "      allow update: if isSuperAdmin()\n"
       "        && request.auth.uid != uid\n"
       "        && resource.data.role == 'admin'\n"
       "        && request.resource.data.role == 'admin'\n"
       "        && request.resource.data.diff(resource.data).affectedKeys()\n"
       "          .hasOnly(['barangay','adminUpdatedAt','adminUpdatedBy'])\n"
       "        && request.resource.data.diff(resource.data).affectedKeys().hasAny(['barangay'])\n"
       "        && request.resource.data.barangay in [\n          "+allowed+"\n        ]\n"
       "        && request.resource.data.adminUpdatedAt == request.time\n"
       "        && request.resource.data.adminUpdatedBy == request.auth.uid;\n")
# Insert before existing privileged Super Admin role grants; don't replace them.
pos=block.find("      allow update: if isSuperAdmin()")
if pos<0:raise SystemExit("STOP: privileged Super Admin user rules missing")
block=block[:pos]+extra+block[pos:]
candidate=original[:start]+block+original[end:]
if candidate[:start]!=original[:start] or not candidate.endswith(original[end:]):
    raise SystemExit("STOP: changes outside users match were attempted")
with open("firestore.rules","w",encoding="utf8",newline="\n") as out:out.write(candidate)
digest=lambda t:hashlib.sha256(t.encode("utf8")).hexdigest()
manifest={"originalRuleset":published,"originalSha":digest(original),"candidateSha":digest(candidate),
          "file":files[0]["name"],"count":len(areas)}
with open(os.path.join(os.environ.get("RUNNER_TEMP","."),"lgu-barangay-rules-manifest.json"),"w") as out:json.dump(manifest,out)
print("PASS active Cloud Ruleset base:",published)
print("PASS candidate touches ONLY /users role-controlled barangay access")
print("PASS official list count:",len(areas))
print("PASS live published source hash:",manifest["originalSha"])
print("PASS candidate hash:",manifest["candidateSha"])
print("NO CLOUD FIRESTORE RULES DEPLOYMENT")
