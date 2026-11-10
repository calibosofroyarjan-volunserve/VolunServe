"use strict";
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const fs=require("node:fs");
const cp=require("node:child_process");

const ACTIVE_SHA256="b4e67103503213bec28671f2dc2ab0440edd4e38a2ffd9d6ad6d2f93ccb9a269";
const CANDIDATE_SHA256="672379f29797c323242549038ae3e3cc0985739a2c99c074c087ea07c44de13c";
const BASE="1a049274a0747257cb31c0deceb21c67661127e6";
const sha256=(s)=>crypto.createHash("sha256").update(s).digest("hex");
const candidate=fs.readFileSync("firestore.rules","utf8");
assert.equal(sha256(candidate),CANDIDATE_SHA256,
  "BLOCKED: candidate Rules no longer match the separately validated 3-hunk review artifact");

const startMarker="      // STAGED ONLY: new community user profiles accept verified Yahoo or";
const endMarker="      // Firestore creation must enforce the same required inputs as the wizard.";
const first=candidate.indexOf(startMarker),last=candidate.indexOf(endMarker);
assert(first>0&&last>first,"BLOCKED: scoped helper not found");
assert.equal(candidate.indexOf(startMarker,first+1),-1);
let original=candidate.slice(0,first)+candidate.slice(last);
const undo=[
  "        && permittedNewResidentEmail()\n",
  "        && permittedNewApplicantEmail()\n",
];
for(const token of undo){
  assert.equal(original.split(token).length,2,"BLOCKED: missing or duplicate profile gate");
  original=original.replace(token,"");
}
assert.equal(sha256(original),ACTIVE_SHA256,
  "BLOCKED: candidate is not precisely the production Firestore Rules with 3 insertions");
assert(candidate.includes("function blockedTempMailOrgAlias(email)"),
  "BLOCKED: removed live disposable-email protection");
assert(candidate.includes("&& !blockedTempMailOrgAlias(request.resource.data.email)"),
  "BLOCKED: removed live profile-creation protection");
assert(candidate.includes("match /volunteerInvitations/{invitationId}"),
  "BLOCKED: volunteer invitations policy removed");
const git=(...args)=>cp.execFileSync("git",args,{encoding:"utf8"}).trim();
const allowed=new Set([
  "firestore.rules",
  "scripts/test-exact-active-firebase-rules-provenance-20261111.cjs",
  ".github/workflows/verify-exact-active-firebase-rules-no-deploy-20261111.yml",
]);
const changes=git("diff","--name-status","--no-renames",
  "f871262eb01bcc5a8629ba05f211dd36011e6921","HEAD")
  .split("\n").filter(Boolean).map(row=>row.split("\t"));
for(const [status,file] of changes){
  assert(["A","M"].includes(status),"BLOCKED: deletion in staged review");
  assert(allowed.has(file),"BLOCKED: unrelated file changed "+file);
}
assert.equal(changes.length,3,"BLOCKED: unexpected diff count");
console.log("PASS exact uploaded LIVE Rules SHA256: "+ACTIVE_SHA256);
console.log("PASS review candidate only adds the 3 approved insertions");
console.log("PASS live temp-mail aliases and volunteer invitations retained");
console.log("NO DEPLOY; no production Rules modified");
