"use strict";
/*
 * Read-only production compatibility audit for VolunServe emergency auto-offer.
 * No network calls, Firebase access, secrets, writes or deployment.
 * Exit 0 for a COMPLETE AUDIT, NOT a production release approval.
 */
const fs=require("node:fs");
const cp=require("node:child_process");
const path=require("node:path");
const LIVE_SHA="4bc0893a6c678ea7738be8f9176fea9721bbc6af";
function live(file){
  return cp.execFileSync("git",["show",LIVE_SHA+":"+file],{
    encoding:"utf8",maxBuffer:10*1024*1024,
    stdio:["ignore","pipe","pipe"]
  });
}
function local(file){
  return fs.readFileSync(path.join(__dirname,"..",file),"utf8");
}
const admin=live("app/(admin)/admin-cases.tsx");
const volunteerWeb=live("app/(tabs)/volunteer.web.tsx");
const volunteerNative=live("app/(tabs)/volunteer.tsx");
const rules=live("firestore.rules");
const stageServer=local("backend/emergencyAutoDispatchStagingServer.js");
const stageBulk=local("backend/stagingBulkVolunteerOffers.js");
const stageWave=local("backend/stagingBulkWaveAdvance.js");
const checks=[
  ["Live Admin still has one-active-assignment manual guard",
    admin.includes("if (activeCount >= 1)")],
  ["Live Admin assignment uses deterministic per-case/per-Volunteer ID",
    admin.includes('\${incident.id}_\${volunteer.uid}')],
  ["Live Volunteer web reads responseAssignments using user.uid",
    volunteerWeb.includes('collection(db, "responseAssignments")')&&
    volunteerWeb.includes('where("volunteerId", "==", user.uid)')],
  ["Live Volunteer native reads responseAssignments",
    volunteerNative.includes('collection(db, "responseAssignments")')],
  ["Live Volunteer web transitions status in Firestore transaction",
    volunteerWeb.includes("await runTransaction(db")],
  ["Live Rules restrict responderLocks ownership",
    rules.includes("match /responderLocks/{uid}")&&
    rules.includes("lockTargetsMatch(")],
  ["Staging bulk engine only accepts fixed fictional case",
    stageBulk.includes("recognizedStagingCase(")&&
    stageBulk.includes("const CASE_ID=E2E_CASE_ID")],
  ["Staging all-volunteer offer cap is 40",
    stageBulk.includes("if(targets.length>40)")],
  ["Staging wave engine requires fictional fixture markers",
    stageWave.includes("recognizedStagingCase(")&&
    stageWave.includes("const CASE_ID=E2E_CASE_ID")],
  ["Staging wave timer remains opt-in",
    stageServer.includes('VOLUNSERVE_STAGING_E2E_002_AUTO_WAVES==="enabled"')],
  ["Staging validation auto-offers remain opt-in",
    stageServer.includes('VOLUNSERVE_STAGING_E2E_002_AUTO_AFTER_VALIDATION==="enabled"')]
];
for(const [name,ok] of checks){
  console.log((ok?"PASS":"FAIL")+": "+name);
}
if(checks.some(([,ok])=>!ok)){
  console.error("STOP: source contract changed; require manual review");
  process.exitCode=1;
  return;
}
const blockers=[
  "LIVE_MANUAL_ONE_ACTIVE_ONLY: Admin manual pathway forbids more than one active Volunteer assignment per case",
  "STAGING_FIXED_CASE_002_ONLY: automatic engine cannot dispatch real report IDs",
  "STAGING_ACCEPT_DECLINE_SEPARATE: no authenticated real Volunteer web/mobile integration of staging HTTP acceptance",
  "STAGING_40_PERSON_ATOMIC_CAP: >40 eligible Volunteers is explicitly blocked",
  "STAGING_FREE_RENDER_TIMER: sleeping Free instance cannot guarantee deadline-triggered escalation",
  "UNVERIFIED_FIREBASE_STAGING_ACCOUNTS: no real multi-account acceptance test result",
  "EXPOSED_STAGING_SERVICE_ACCOUNT_KEY: rotation and authorized account checks required before resumed live staging QA",
  "PRODUCTION_AUTOMATION_SWITCH_OFF: production backend and Firebase rules were not changed in verified Admin UI-only Hosting release"
];
console.log("");
console.log("AUDIT COMPLETE — PRODUCTION AUTO ASSIGNMENT IS NOT RELEASE-READY");
for(const x of blockers)console.log("BLOCKER: "+x);
const markdown=[
  "## VolunServe production automatic-matching gate (read-only)",
  "- Baseline: \`"+LIVE_SHA+"\` (last verified Admin UI Hosting release source).",
  "- All "+checks.length+" source contracts located.",
  "- **NO PRODUCTION DEPLOYMENT AUTHORIZED**.",
  "",
  "### Unresolved integration blockers",
  ...blockers.map(s=>"- "+s),
  "",
  "This workflow does not authenticate to or write to Firebase or Render."
].join("\n");
if(process.env.GITHUB_STEP_SUMMARY){
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown+"\n");
}
