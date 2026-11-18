"use strict";
/**
 * Phase 2: secure read-only route FACTORY, deliberately NOT mounted in the live
 * backend. No server.js changes are part of this PR. Future integration must
 * be separately authorized, reviewed and deployed.
 *
 * When explicitly mounted by a future release, it REQUIRES the existing
 * live middleware: requireFirebaseUser (revocation + email + signup checks)
 * followed by requireOperationalAdmin (persisted approved Admin role).
 */
const {isOperationalAdminProfile}=require("./adminAccess");
const {previewAllEligibleWave,previewEnabled}=require("./emergencyAutoVolunteerReadOnlyPlanner");
const {loadProductionPreviewInputs,PreviewSourceError}=require("./autoVolunteerProductionPreviewReader");

const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const BLOCKED={
  feature_off_by_default:404,
  invalid_case_id:400,
  case_not_found:404,
  source_exceeds_audited_200_limit:409,
  incident_barangay_requires_review:409,
  source_query_incomplete:503,
  database_unavailable:503
};

function registerAutoVolunteerAdminReadOnlyPreview(app,{
  db,requireFirebaseUser,requireOperationalAdmin,env={}
}={}){
  if(!app||typeof app.get!=="function"||
    !db||typeof db.collection!=="function"||
    typeof requireFirebaseUser!=="function"||
    typeof requireOperationalAdmin!=="function")
    throw new TypeError("Missing mandatory production middleware or Firestore reader");

  // This MUST NOT be wired into production while Phase 2 is a DRAFT.
  app.get("/api/admin/emergency-auto/preview/:caseId",
    requireFirebaseUser,requireOperationalAdmin,
    async(request,response)=>{
      response.set("Cache-Control","no-store, private");
      response.set("Pragma","no-cache");
      // Guard again inside handler against future middleware wiring errors.
      if(!request.firebaseUser?.uid ||
         !isOperationalAdminProfile(request.volunServeProfile))
        return response.status(403).json({
          ok:false,status:"blocked",reason:"approved_operational_admin_required"
        });
      if(!previewEnabled(env))
        return response.status(404).json({
          ok:false,status:"blocked",reason:"feature_off_by_default"
        });
      const caseId=request.params?.caseId;
      if(!validId(caseId))
        return response.status(400).json({
          ok:false,status:"blocked",reason:"invalid_case_id"
        });
      try{
        const inputs=await loadProductionPreviewInputs(db,caseId);
        // No client-provided UID, eligible roster, adjacency, or status used.
        // Even if a URL supplies ?neighborsByBarangay=..., ignore it.
        const outcome=previewAllEligibleWave({
          env,caseData:inputs.caseData,roster:inputs.roster,
          existingAssignments:inputs.existingAssignments,
          activeLocks:inputs.activeLocks,
          sourceScansComplete:inputs.sourceScansComplete,
          neighborsByBarangay:{},neighborMapReviewed:false
        });
        // STRICT OUTPUT ALLOWLIST: internal planner's offerCandidateUids
        // must NEVER be returned over HTTP (even to Admin).
        return response.status(outcome.status==="blocked"?409:200).json({
          ok:outcome.status==="preview_only",
          status:outcome.status,reason:outcome.reason||null,
          wave:outcome.wave||0,
          eligibleCount:outcome.candidateCount||0,
          reviewedApplications:inputs.sourceLimits.allApplications,
          approvedApplications:inputs.sourceLimits.approvedApplications,
          inspectedAssignments:inputs.sourceLimits.allAssignments,
          inspectedResponderLocks:inputs.sourceLimits.allResponderLocks,
          excludedByReason:outcome.exclusions||{},
          neighborWaveRequiresVerifiedMap:true,
          readOnly:true,dispatchEnabled:false,
          dataFreshness:"non_transactional_snapshot",
          caseSpecificRead:true,
          disclaimer:"Preview only. Not permission to dispatch or proof of full real-time eligibility."
        });
      }catch(error){
        if(error instanceof PreviewSourceError){
          const status=BLOCKED[error.code]||503;
          return response.status(status).json({
            ok:false,status:"blocked",reason:error.code,readOnly:true,
            dispatchEnabled:false
          });
        }
        // Avoid logging Firebase user data, the case document or token.
        return response.status(503).json({
          ok:false,status:"blocked",reason:"preview_read_unavailable",
          readOnly:true,dispatchEnabled:false
        });
      }
    }
  );
}
module.exports={registerAutoVolunteerAdminReadOnlyPreview};
