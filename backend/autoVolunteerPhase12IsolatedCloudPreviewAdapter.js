"use strict";
/**
 * PHASE 12 — CLOUD-COMPATIBLE, STAGING-ONLY, READ-ONLY API ADAPTER.
 *
 * It supports a FUTURE NEW Firebase cloud project via injected Firebase Admin
 * Auth/Firestore instances. It creates NO Firebase apps or credentials,
 * performs NO writes, does NO dispatch, and is deliberately NOT imported by
 * backend/server.js or any deployed Render staging server.
 *
 * Config flags are a defense-in-depth runtime gate, NOT proof of a new
 * isolated project or authorization to create/deploy a cloud service.
 * CI tests use entirely local fakes and make ZERO external cloud calls.
 */
const express=require("express");
const {FORBIDDEN_FIREBASE_PROJECTS}
  =require("./autoVolunteerPhase11CloudIsolationGate.cjs");
const {isVerifiedFirebaseToken,isCompletedVolunServeProfile}
  =require("./verifiedFirebaseToken");
const {isOperationalAdminProfile}=require("./adminAccess");
const {loadProductionPreviewInputs,PreviewSourceError}
  =require("./autoVolunteerProductionPreviewReader");
const {previewAllEligibleWave}
  =require("./emergencyAutoVolunteerReadOnlyPlanner");
const {inspectPhase16RenderManagedOidc}
  =require("./autoVolunteerPhase16RenderManagedOidcGate.cjs");

const CASE=/^[A-Za-z0-9_-]{1,160}$/;
const forbidden=new Set(FORBIDDEN_FIREBASE_PROJECTS);
// Mirror the Phase 11 format gate locally: Phase 11 intentionally exports
// only review outputs, not an authorization-granting validation function.
function validProjectId(value){
  return typeof value==="string"&&
    /^[a-z][a-z0-9-]{5,28}[a-z0-9]$/.test(value)&&
    !value.startsWith("demo-")&&!forbidden.has(value);
}
const disabled=reason=>({
  ok:false,status:"blocked",reason,readOnly:true,dispatchEnabled:false
});
function getCloudStagingPreviewGate({
  db,authClient,env=process.env
}={}){
  const reasons=[];
  const requireGate=(ok,reason)=>{if(!ok)reasons.push(reason)};
  const project=String(env?.VOLUNSERVE_PHASE12_NEW_FIREBASE_PROJECT||"").trim();
  requireGate(env===process.env,"actual_runtime_environment_required");
  requireGate(env?.VOLUNSERVE_PHASE12_CLOUD_PREVIEW==="enabled",
    "cloud_preview_off_by_default");
  requireGate(env?.VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW==="enabled",
    "read_only_preview_off");
  requireGate(env?.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="disabled",
    "dispatch_must_be_explicitly_disabled");
  requireGate(env?.VOLUNSERVE_PHASE12_MODE==="new_isolated_read_only",
    "new_isolated_read_only_mode_required");
  requireGate(!env?.FIRESTORE_EMULATOR_HOST&&!env?.FIREBASE_AUTH_EMULATOR_HOST,
    "cloud_emulators_not_supported");
  // Render-managed Google OIDC sets GOOGLE_APPLICATION_CREDENTIALS to a
  // generated external_account config. Only the audited Phase 16 bounded
  // local file-shape guard can permit that path; arbitrary service-account
  // JSON, invalid paths, impersonation or injected env remain blocked.
  const oidcPathAccepted=env?.GOOGLE_APPLICATION_CREDENTIALS?
    inspectPhase16RenderManagedOidc({env}).allowed:true;
  requireGate(!env?.FIREBASE_SERVICE_ACCOUNT_JSON&&oidcPathAccepted,
    "standalone_service_account_files_not_approved");
  requireGate(validProjectId(project)&&!forbidden.has(project),
    "new_dedicated_project_required");
  // An explicit, independent project ID must match BOTH Firebase Admin
  // instances and the hosting runtime's credential-selected project.
  // Never infer authorization from a string in a client request.
  requireGate(String(env?.GCLOUD_PROJECT||"")===project,
    "runtime_project_mismatch");
  requireGate(!env?.GOOGLE_CLOUD_PROJECT||
    String(env.GOOGLE_CLOUD_PROJECT)===project,
    "google_cloud_project_mismatch");
  requireGate(db?.projectId===project&&typeof db?.collection==="function",
    "firestore_project_binding_unverified");
  requireGate(authClient?.app?.options?.projectId===project&&
    typeof authClient?.verifyIdToken==="function",
    "auth_project_binding_unverified");
  // No external network requests, provisioning or project existence
  // validation occur in this pure configuration check.
  return Object.freeze({
    allowed:reasons.length===0,
    reasons:Object.freeze(reasons),
    readOnly:true,
    dispatchEnabled:false,
    cloudResourceIndependentlyVerified:false
  });
}
function createPhase12IsolatedCloudReadOnlyApp({
  db,authClient,env=process.env
}={}){
  const initial=getCloudStagingPreviewGate({db,authClient,env});
  if(!initial.allowed)
    throw new Error("Phase 12 cloud preview refused: "+
      initial.reasons.join(","));

  const app=express();
  app.disable("x-powered-by");
  app.use((_req,res,next)=>{
    res.set("Cache-Control","no-store, private");
    res.set("Pragma","no-cache");
    res.set("X-Content-Type-Options","nosniff");
    res.set("Content-Security-Policy","default-src 'none'");
    return next();
  });
  function recheck(res){
    const gate=getCloudStagingPreviewGate({db,authClient,env});
    if(gate.allowed)return true;
    res.status(503).json(disabled("isolated_cloud_preview_disabled"));
    return false;
  }
  app.get("/api/phase12/staging/health",(req,res)=>{
    if(!recheck(res))return;
    return res.json({
      ok:true,readOnly:true,dispatchEnabled:false,
      autoSchedulingEnabled:false,cloudProvisionedByThisAdapter:false
    });
  });
  app.get("/api/phase12/staging/admin/cases/:caseId/preview",
    async(req,res)=>{
      if(!recheck(res))return;
      const id=String(req.params?.caseId||"");
      if(!CASE.test(id))
        return res.status(400).json(disabled("invalid_case_id"));
      // Never accept a target Firebase project, Admin identity, candidate
      // list, neighboring barangays, or authorization from request fields.
      const header=String(req.headers.authorization||"");
      const bearer=/^Bearer ([^\s]{1,8192})$/.exec(header);
      if(!bearer)
        return res.status(401).json(disabled("firebase_sign_in_required"));
      let decoded;
      try{
        decoded=await authClient.verifyIdToken(bearer[1],true);
      }catch(_error){
        return res.status(401).json(disabled("invalid_or_revoked_token"));
      }
      if(!isVerifiedFirebaseToken(decoded)||!CASE.test(decoded.uid))
        return res.status(403).json(disabled("verified_email_required"));
      try{
        // Persisted user profile, never token.role or client role.
        const userSnap=await db.collection("users").doc(decoded.uid).get();
        const profile=userSnap?.exists?userSnap.data():null;
        if(!isCompletedVolunServeProfile(profile)||
          !isOperationalAdminProfile(profile))
          return res.status(403).json(disabled("approved_operational_admin_required"));

        // Recheck the kill switch and project binding before the candidate
        // source query; Admin authorization alone never enables dispatch.
        if(!recheck(res))return;
        const inputs=await loadProductionPreviewInputs(db,id);
        const outcome=previewAllEligibleWave({
          env:{
            VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW:"enabled",
            VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"
          },
          caseData:inputs.caseData,
          roster:inputs.roster,
          existingAssignments:inputs.existingAssignments,
          activeLocks:inputs.activeLocks,
          sourceScansComplete:inputs.sourceScansComplete,
          neighborsByBarangay:{},
          neighborMapReviewed:false
        });
        return res.status(outcome.status==="blocked"?409:200).json({
          ok:outcome.status==="preview_only",
          status:outcome.status,
          reason:outcome.reason||null,
          wave:outcome.wave||0,
          eligibleCount:outcome.candidateCount||0,
          inspectedApplications:inputs.sourceLimits.allApplications,
          approvedApplications:inputs.sourceLimits.approvedApplications,
          inspectedAssignments:inputs.sourceLimits.allAssignments,
          inspectedResponderLocks:inputs.sourceLimits.allResponderLocks,
          readOnly:true,dispatchEnabled:false,
          dataFreshness:"non_transactional_snapshot",
          wave2Enabled:false,
          limitations:"Review only: bounded sources, unverified SJDM adjacency, and no server-side write integration."
        });
      }catch(error){
        if(error instanceof PreviewSourceError){
          const forbiddenRecord=error.code==="case_not_found";
          const tooMany=error.code==="source_exceeds_audited_200_limit";
          return res.status(forbiddenRecord?404:tooMany?409:503)
            .json(disabled(error.code));
        }
        // Never log tokens, UID, case data, candidate lists or private
        // Firestore errors to application logs or HTTP.
        return res.status(503).json(disabled("staging_preview_unavailable"));
      }
    });
  return app;
}
module.exports={
  getCloudStagingPreviewGate,createPhase12IsolatedCloudReadOnlyApp
};
