"use strict";
/**
 * Production BASELINE PRESERVATION guard ONLY.
 * This does NOT make automatic Volunteer matching production ready.
 * Reads source text; it cannot write Firebase, deploy, or authenticate.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const source=file=>fs.readFileSync(path.join(root,file),"utf8");
const contracts=[
  ["backend/server.js",[
    "startCommunityCertificateAutoSync({db,reconcile:reconcileCommunityEventCertificates});",
    "isVerifiedFirebaseToken(decodedToken)",
    "isCompletedVolunServeProfile(storedProfile)"
  ]],
  ["app/(admin)/admin-cases.tsx",[
    "const reviewVerification = async",
    "const assignVolunteerToCase = async",
    "responseAssignments",
    "responderLocks"
  ]],
  ["app/(tabs)/volunteer.tsx",[
    "const transitionAssignment = async",
    "responseAssignments",
    "runTransaction("
  ]],
  ["app/(tabs)/volunteer.web.tsx",[
    "const transitionAssignment = async",
    "responseAssignments",
    "runTransaction("
  ]],
  ["firestore.rules",[
    "match /responseAssignments/{assignmentId}",
    "match /responderLocks/{uid}",
    "match /volunteerApplications/{uid}",
    "validVolunteerResponseTransition()"
  ]],
  ["lib/firebase.ts",[
    'projectId: "volunserve-3aa5b"'
  ]]
];
const forbiddenInProd=[
  "STAGING_E2E_002",
  "staging002.qa.volunteer",
  "volunserve-emergency-match-staging-free.onrender.com",
  "volunserve-volunteer-staging"
];
let checked=0;
for(const [file,needles] of contracts){
  const s=source(file);
  for(const needle of needles){
    assert.ok(s.includes(needle),"LIVE BASELINE DRIFT: "+file+" missing "+needle);
    checked++;
  }
  for(const banned of forbiddenInProd){
    assert.ok(!s.includes(banned),
      "STAGING FIXTURE LEAKED INTO PRODUCTION ENTRYPOINT: "+file+": "+banned);
  }
}
for(const file of [
  "backend/emergencyAutoDispatchStagingServer.js",
  "backend/staging002TestVolunteerProvisioning.js",
  "lib/stagingBulkVolunteerClient.ts"
]){
  assert.ok(!fs.existsSync(path.join(root,file)),
    "Staging-only file must not enter production baseline: "+file);
}
console.log("PASS: "+checked+" existing LIVE entrypoint/source contract markers preserved.");
console.log("PASS: fixed fictional staging paths are excluded from production baseline.");
console.log("REVIEW ONLY: NO production automatic dispatch approval, no deploy, no Firestore access.");
