"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {
  assessPhase11CloudStaging,assessPhase11SourceBaseline,
  FORBIDDEN_FIREBASE_PROJECTS,PROTECTED_RENDER_SERVICES
}=require("./autoVolunteerPhase11CloudIsolationGate.cjs");
const script=()=>{
 const root=path.resolve(__dirname,"..");
 return {
  liveServer:fs.readFileSync(path.join(root,"backend/server.js"),"utf8"),
  localApp:fs.readFileSync(path.join(root,
    "backend/autoVolunteerPhase10LocalApp.js"),"utf8"),
  firebaseConfig:fs.readFileSync(path.join(root,"firebase.json"),"utf8"),
  // Intentionally unavailable in production-based candidate tree.
  stagingServer:""
 };
};
test("unknown / absent plan is emphatically NO-GO, never a deployment authorization",()=>{
  for(const input of [undefined,null,{},[],{firebaseProjectId:""}]){
    const result=assessPhase11CloudStaging(input);
    assert.equal(result.status,"NO_GO");
    assert.equal(result.productionDispatchAllowed,false);
    assert.equal(result.stagingDeploymentAuthorized,false);
    assert.equal(result.externalCloudCallsMade,false);
    assert.ok(result.blockers.length>12);
  }
});
test("all known production, accepted staging and demo Firebase projects are forbidden",()=>{
  for(const project of FORBIDDEN_FIREBASE_PROJECTS){
    const result=assessPhase11CloudStaging({firebaseProjectId:project});
    assert.ok(result.blockers.includes("new_dedicated_firebase_project_required"),
      project);
  }
  for(const project of ["demo-foo","prod","UPPERCASE","x/x"]){
    const result=assessPhase11CloudStaging({firebaseProjectId:project});
    assert.ok(result.blockers.includes("new_dedicated_firebase_project_required"),project);
  }
});
test("existing production and staging Render services NEVER qualify as a new deployment target",()=>{
  for(const service of PROTECTED_RENDER_SERVICES){
    const out=assessPhase11CloudStaging({
      firebaseProjectId:"volunserve-auto-freshqa-2026",
      renderServiceId:service
    });
    assert.ok(out.blockers.includes("brand_new_render_service_required"),
      service);
  }
});
test("protected or existing staging Git branches and auto-deploy are rejected",()=>{
  for(const branch of [
    "backend-live-protected",
    "feat/emergency-auto-dispatch-server-staging-20261115",
    "feat/staging-gated-admin-volunteer-preview-ui-20261117",
    "qa/auto-volunteer-phase10-isolated-app-e2e-20261119",
    ""
  ]){
    const r=assessPhase11CloudStaging({
      renderBranch:branch,autoDeploy:"yes"
    });
    assert.ok(r.blockers.includes("isolated_candidate_git_branch_required"));
    assert.ok(r.blockers.includes("render_auto_deploy_must_be_off"));
  }
});
test("a cloud staging review cannot use emulator-only Phase 10 code as a deployed adapter",()=>{
  const r=assessPhase11CloudStaging({
    cloudAuthAdapterImplementedAndReviewed:false,
    cloudFirestoreAdapterImplementedAndReviewed:false
  });
  assert.ok(r.blockers.includes("emulator_only_auth_adapter_cannot_run_in_cloud"));
  assert.ok(r.blockers.includes("emulator_only_firestore_writer_cannot_run_in_cloud"));
});
test("production writes, accepted staging fixture writes, live dispatch or secrets deny preflight",()=>{
  const r=assessPhase11CloudStaging({
    allowProductionFirebaseWrites:true,
    allowExistingStagingWrites:true,
    productionDispatch:"enabled",
    noProductionCredentialsMounted:false
  });
  for(const reason of [
    "production_firebase_access_must_be_disabled",
    "existing_staging_fixture_write_access_must_be_disabled",
    "real_emergency_dispatch_must_be_disabled",
    "cloud_secret_scope_unverified"
  ])assert.ok(r.blockers.includes(reason),reason);
});
test("even all self-declared OK flags mean review only, not permission to deploy",()=>{
  const p={
    firebaseProjectId:"volunserve-auto-freshqa-2026",
    firebaseProjectIndependentlyVerified:true,
    renderServiceId:"srv-phase11brandnewdemo001",
    renderServiceIndependentlyVerified:true,
    renderBranch:"candidate/auto-volunteer-cloud-isolated-20261119",
    autoDeploy:"no",
    allowProductionFirebaseWrites:false,
    allowExistingStagingWrites:false,
    productionDispatch:"disabled",
    noProductionCredentialsMounted:true,
    cloudAuthAdapterImplementedAndReviewed:true,
    cloudFirestoreAdapterImplementedAndReviewed:true,
    productionCompatibleRulesAndRolesTested:true,
    provenSJDMGeoAllowlist:true,
    verifiedCrossCaseAssignmentGuards:true,
    retrySafeCancelAndNotificationConsumerTests:true,
    monitoringAndRollbackPlanReviewed:true,
    externalJobTriggerTested:true,
    costAndScaleApproved:true,
    explicitIndependentReleaseApproval:true
  };
  const r=assessPhase11CloudStaging(p);
  assert.equal(r.status,"HUMAN_REVIEW_REQUIRED",JSON.stringify(r.blockers));
  assert.equal(r.stagingDeploymentAuthorized,false);
  assert.equal(r.productionDispatchAllowed,false);
  assert.equal(r.externalCloudCallsMade,false);
  assert.equal(r.blockers.length,0);
});
test("source baseline reports missing separate staging branch as evidence blocker",()=>{
  const r=assessPhase11SourceBaseline(script());
  assert.equal(r.status,"BLOCKED");
  assert.deepEqual(r.failures,["independent_staging_branch_source_review_required"]);
  assert.equal(r.deployed,false);
  assert.equal(r.cloudReady,false);
});
test("synthetic fixture of separately reviewed staging source can pass source-only audit",()=>{
  const f=script();
  f.stagingServer="// STAGING_E2E_002 accepted-responder protection; staging002";
  const out=assessPhase11SourceBaseline(f);
  assert.equal(out.status,"SOURCE_BASELINE_CHECK_PASSED");
  assert.equal(out.cloudReady,false);
  assert.equal(out.deployed,false);
});
test("old production or accepted staging server cannot import the local QA app",()=>{
  const f=script();
  f.stagingServer="STAGING_E2E_002";
  const prod=assessPhase11SourceBaseline({...f,
    liveServer:f.liveServer+"\nrequire(\"./autoVolunteerPhase10LocalApp\");"
  });
  assert.ok(prod.failures.includes("local_demo_app_wired_into_production"));
  const staging=assessPhase11SourceBaseline({...f,
    stagingServer:"STAGING_E2E_002 autoVolunteerPhase10LocalApp"
  });
  assert.ok(staging.failures.includes("local_demo_app_wired_into_accepted_staging"));
  const disabled=assessPhase11SourceBaseline({...f,localApp:"module.exports={}"});
  assert.ok(disabled.failures.includes("local_app_emulator_guard_not_proven"));
});
test("preflight source has no Firebase or Render write operations",()=>{
  const text=fs.readFileSync(path.join(__dirname,
    "autoVolunteerPhase11CloudIsolationGate.cjs"),"utf8");
  for(const marker of [
    "firebase-admin", "runTransaction(",
    "setInterval(", "app.post(", "render deploy", "firebase deploy",
    "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_JSON"
  ])assert.equal(text.includes(marker),false,marker);
});
