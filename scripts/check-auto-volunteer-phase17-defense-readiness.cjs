#!/usr/bin/env node
"use strict";
/**
 * Phase 17 — DEFENSE EVIDENCE / RELEASE STOPLIGHT.
 * Pure local source audit. Does not access Firebase, Render, GitHub, tokens,
 * secrets, environment variables, networks, deployments or actual user data.
 *
 * PASS means the LOCAL demonstration evidence can be reviewed, NOT that
 * production dispatch is ready or that a real web/Android test was completed.
 */
const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");

const ROOT=path.resolve(__dirname,"..");
function source(file){
  const abs=path.resolve(ROOT,file);
  if(!abs.startsWith(ROOT+path.sep))throw Error("invalid_audit_path");
  return fs.readFileSync(abs,"utf8");
}
const files={
  package:"backend/package.json",
  live:"backend/server.js",
  admin:"app/(admin)/admin-cases.tsx",
  volunteerWeb:"app/(tabs)/volunteer.web.tsx",
  volunteerMobile:"app/(tabs)/volunteer.tsx",
  guard:"lib/emergencyVolunteerWinnerGuard.js",
  caseRules:"firestore.rules",
  localApp:"backend/autoVolunteerPhase10LocalApp.js",
  localE2E:"backend/test-autoVolunteerPhase10LocalAppE2E.cjs",
  phase9:"backend/autoVolunteerPhase9SafeCancelEmulator.js",
  phase7:"backend/autoVolunteerPhase7WaveWorkerEmulator.js",
  phase8:"backend/autoVolunteerPhase8LeaseSchedulerEmulator.js",
  phase12:"backend/autoVolunteerPhase12IsolatedCloudPreviewAdapter.js",
  phase14:"backend/autoVolunteerPhase14StagingServer.cjs",
  phase16:"backend/autoVolunteerPhase16RenderManagedOidcGate.cjs",
  config:"firebase.json",
  qa:"docs/emergency-volunteer/PHASE10_LOCAL_STAGING_APP_INTEGRATION_20261119.md"
};
const evidence={};
const failures=[];
function check(name,fn){
  let pass=false;
  try{pass=fn()===true}catch(_error){pass=false}
  evidence[name]=pass;
  if(!pass)failures.push(name);
}
function has(s,t){return s.includes(t)}
const doc={};
for(const [name,file] of Object.entries(files)){
  try{doc[name]=source(file)}catch(_error){doc[name]=null}
  check("source_exists_"+name,()=>typeof doc[name]==="string"&&
    doc[name].length>40);
}
check("live_backend_start_remains_original",()=>{
  const p=JSON.parse(doc.package);
  return p.scripts.start==="node server.js";
});
check("no_demo_modules_imported_in_live_backend",()=>
  ![
    "autoVolunteerPhase6EmulatorDecisionServer",
    "autoVolunteerPhase7WaveWorkerEmulator",
    "autoVolunteerPhase8LeaseSchedulerEmulator",
    "autoVolunteerPhase9SafeCancelEmulator",
    "autoVolunteerPhase10LocalApp",
    "autoVolunteerPhase12IsolatedCloudPreviewAdapter",
    "autoVolunteerPhase14StagingServer",
    "autoVolunteerPhase16RenderManagedOidcGate"
  ].some(x=>has(doc.live,x)));
check("production_admin_manual_case_guard_present",()=>
  has(doc.admin,"manualOfferConflictReason")&&
  has(doc.guard,"autoVolunteerAcceptedAssignmentId"));
check("web_and_mobile_volunteer_guard_present",()=>
  has(doc.volunteerWeb,"volunteerTransitionConflictReason")&&
  has(doc.volunteerMobile,"volunteerTransitionConflictReason"));
check("automatic_offer_direct_client_rule_guard_present",()=>
  has(doc.caseRules,"automatic_")&&
  has(doc.caseRules,"preservePendingAutoWave"));
check("demo_http_app_requires_local_auth_and_firestore",()=>
  has(doc.localApp,"FIREBASE_AUTH_EMULATOR_HOST")&&
  has(doc.localApp,"emulatorReady(env)")&&
  has(doc.localApp,"demo-volunserve-auto-phase4"));
check("demo_auth_emulator_e2e_covers_accept_and_cancel",()=>
  has(doc.localE2E,"Accept")&&
  has(doc.localE2E,"cancel")&&
  has(doc.localE2E,"signInWithEmailAndPassword"));
check("phase7_has_persisted_demo_batch",()=>
  has(doc.phase7,"persistentBatchRef")&&
  has(doc.phase7,"runTransaction"));
check("phase9_cancellation_is_emulator_only",()=>
  has(doc.phase9,"cancelEmulatedPendingWave")&&
  has(doc.phase9,"emulatorReady"));
check("phase8_manual_scheduler_is_not_24_hour_worker",()=>
  has(doc.phase8,"invokeEmulatedDueWave")&&
  !has(doc.phase8,"setInterval("));
check("phase12_cloud_preview_has_no_mutation_route",()=>
  has(doc.phase12,"createPhase12IsolatedCloudReadOnlyApp")&&
  !has(doc.phase12,'app.post(')&&
  !has(doc.phase12,"runTransaction("));
check("phase14_candidate_is_not_default_start",()=>
  has(doc.phase14,"inspectPhase14Listener")&&
  !has(doc.package,"autoVolunteerPhase14StagingServer"));
check("phase16_external_account_check_is_no_deploy",()=>
  has(doc.phase16,"external_account")&&
  has(doc.phase16,"provenCloudIam:false")&&
  !has(doc.phase16,"CloudTasksClient"));
check("only_loopback_local_auth_and_firestore_emulators",()=>{
  const j=JSON.parse(doc.config);
  return j.emulators.auth.host==="127.0.0.1"&&
    j.emulators.auth.port===9099&&
    j.emulators.firestore.host==="127.0.0.1"&&
    j.emulators.firestore.port===8080;
});

const report={
  report:"Phase 17 automatic volunteer — defense proof and release stoplight",
  sourceAuditPassed:failures.length===0,
  sourceAuditFailures:failures,
  sourceChecksPassed:Object.values(evidence).filter(Boolean).length,
  sourceChecksTotal:Object.keys(evidence).length,
  verifiedScope:"repository-source review only; tests verified separately by CI",
  localEndToEndEvidence:"CI must pass real LOCAL Firebase Auth and Firestore Emulator tests",
  realCloudAuthVerified:false,
  realCloudAutomaticDispatchVerified:false,
  managed24HourSchedulerDeployed:false,
  officialSJDMAdjacentBarangaysVerified:false,
  productionAllWriterRaceRegressionVerified:false,
  mobileAndroidRealDeviceE2EVerified:false,
  liveAutomaticVolunteerEnabledByThisPhase:false,
  productionDeploymentAuthorized:false,
  existingStagingResetAuthorized:false,
  verdict:"NO_GO_FOR_PRODUCTION_AUTOMATIC_DISPATCH",
  nextHumanDecision:"Present a labeled local/staging prototype at defense; production launch needs independently approved integration and operational gates."
};
process.stdout.write(JSON.stringify(report,null,2)+"\n");
if(failures.length)process.exitCode=1;
