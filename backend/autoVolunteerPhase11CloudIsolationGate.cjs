"use strict";
/**
 * PHASE 11 CLOUD STAGING PREFLIGHT — PURE, READ-ONLY, NO DEPLOY.
 *
 * This is NOT a deployment tool, a permission grant, or a production
 * authorization check. Inputs are untrusted planning data, NOT independently
 * verified cloud service/project evidence. An "eligible" result means the
 * submitted plan merits human review, never permission to deploy.
 */
const FORBIDDEN_FIREBASE_PROJECTS=Object.freeze([
  "volunserve-3aa5b",               // protected production
  "volunserve-volunteer-staging",    // accepted historical staging fixtures
  "demo-volunserve-auto-phase4"     // local test emulator
]);
const PROTECTED_RENDER_SERVICES=Object.freeze([
  "srv-daofqomk1f9s73btsg20", // protected production backend
  "srv-dbsglle1egvs73dq7i8g", // already accepted staging backend
  "srv-dbufki67bikc739qfmlg"  // current staging UI
]);
const PROTECTED_BRANCHES=Object.freeze([
  "backend-live-protected",
  "feat/emergency-auto-dispatch-server-staging-20261115",
  "feat/staging-gated-admin-volunteer-preview-ui-20261117"
]);
function validProjectId(value){
  return typeof value==="string" &&
    /^[a-z][a-z0-9-]{5,28}[a-z0-9]$/.test(value) &&
    !value.startsWith("demo-") &&
    !FORBIDDEN_FIREBASE_PROJECTS.includes(value);
}
function safeValue(x){
  return typeof x==="string"&&x.length<180?
    x.trim():"";
}
const isTrue=x=>x===true;
function assessPhase11CloudStaging(plan={}){
  const p=plan&&typeof plan==="object"&&!Array.isArray(plan)?plan:{};
  const blockers=[];
  const add=(test,code)=>{if(!test)blockers.push(code)};
  const pid=safeValue(p.firebaseProjectId);
  const renderId=safeValue(p.renderServiceId);
  const renderBranch=safeValue(p.renderBranch);
  add(validProjectId(pid),"new_dedicated_firebase_project_required");
  add(isTrue(p.firebaseProjectIndependentlyVerified),
    "firebase_project_isolation_evidence_missing");
  add(/^srv-[a-z0-9]{12,40}$/.test(renderId)&&
     !PROTECTED_RENDER_SERVICES.includes(renderId),
     "brand_new_render_service_required");
  add(isTrue(p.renderServiceIndependentlyVerified),
    "render_service_isolation_evidence_missing");
  add(renderBranch.startsWith("candidate/auto-volunteer-cloud-") &&
    renderBranch.length<130 &&
    !PROTECTED_BRANCHES.includes(renderBranch),
    "isolated_candidate_git_branch_required");
  add(p.autoDeploy==="no","render_auto_deploy_must_be_off");
  add(p.allowProductionFirebaseWrites===false,
    "production_firebase_access_must_be_disabled");
  add(p.allowExistingStagingWrites===false,
    "existing_staging_fixture_write_access_must_be_disabled");
  add(p.productionDispatch==="disabled",
    "real_emergency_dispatch_must_be_disabled");
  add(isTrue(p.noProductionCredentialsMounted),
    "cloud_secret_scope_unverified");
  add(isTrue(p.cloudAuthAdapterImplementedAndReviewed),
    "emulator_only_auth_adapter_cannot_run_in_cloud");
  add(isTrue(p.cloudFirestoreAdapterImplementedAndReviewed),
    "emulator_only_firestore_writer_cannot_run_in_cloud");
  add(isTrue(p.productionCompatibleRulesAndRolesTested),
    "rules_and_role_contract_unverified");
  add(isTrue(p.provenSJDMGeoAllowlist),
    "sjdm_geographic_allowlist_not_independently_verified");
  add(isTrue(p.verifiedCrossCaseAssignmentGuards),
    "all_assignment_writers_not_verified");
  add(isTrue(p.retrySafeCancelAndNotificationConsumerTests),
    "cancel_and_notification_consumer_e2e_missing");
  add(isTrue(p.monitoringAndRollbackPlanReviewed),
    "monitoring_and_rollback_review_missing");
  add(isTrue(p.externalJobTriggerTested),
    "durable_external_scheduler_not_tested");
  add(isTrue(p.costAndScaleApproved),
    "cost_and_full_roster_scale_unreviewed");
  add(isTrue(p.explicitIndependentReleaseApproval),
    "independent_release_approval_missing");
  // Deliberately no auto-approval even when checklist booleans all true.
  // Real proof comes from independent verification in a later deployment
  // procedure and an explicitly approved release, never this pure function.
  return Object.freeze({
    status:blockers.length?"NO_GO":"HUMAN_REVIEW_REQUIRED",
    productionDispatchAllowed:false,
    stagingDeploymentAuthorized:false,
    externalCloudCallsMade:false,
    plannedProjectSupplied:validProjectId(pid),
    blockers:Object.freeze(blockers),
    note:"Self-declared planning flags are not proof. No deploy or credentials action exists in this module."
  });
}
/**
 * Check repo/runtime *source markers* without touching Firebase or Render.
 * Fail closed when staging app cannot be safely separated from the local demo.
 */
function assessPhase11SourceBaseline({
  liveServer="",localApp="",stagingServer="",firebaseConfig=""
}={}){
  const failures=[];
  const test=(v,code)=>{if(!v)failures.push(code)};
  test(/FIRESTORE_EMULATOR_HOST/.test(localApp)&&
    /FIREBASE_AUTH_EMULATOR_HOST/.test(localApp)&&
    /env===process\.env/.test(localApp)&&
    /demo-volunserve-auto-phase4/.test(localApp),
    "local_app_emulator_guard_not_proven");
  test(!/autoVolunteerPhase10LocalApp/.test(liveServer),
    "local_demo_app_wired_into_production");
  // The accepted staging service is deployed from a DIFFERENT Git ref.
  // The Phase 10 parent tree intentionally lacks that server file. Missing
  // source is an explicit audit blocker, not an empty "safe" service.
  test(stagingServer.length>0,
    "independent_staging_branch_source_review_required");
  if(stagingServer.length>0){
    test(!/autoVolunteerPhase10LocalApp/.test(stagingServer),
      "local_demo_app_wired_into_accepted_staging");
    test(/STAGING_E2E_002|e2e-002|staging002/.test(stagingServer),
      "accepted_staging_fixture_protection_marker_missing");
  }
  test(/127\.0\.0\.1/.test(firebaseConfig)&&
    /9099/.test(firebaseConfig)&&/8080/.test(firebaseConfig),
    "local_test_emulator_config_missing");
  return Object.freeze({
    status:failures.length?"BLOCKED":"SOURCE_BASELINE_CHECK_PASSED",
    cloudReady:false,
    deployed:false,
    failures:Object.freeze(failures)
  });
}
module.exports={
  assessPhase11CloudStaging,assessPhase11SourceBaseline,
  FORBIDDEN_FIREBASE_PROJECTS,PROTECTED_RENDER_SERVICES,
  PROTECTED_BRANCHES
};
