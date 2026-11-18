"use strict";
/**
 * Phase 2 production-schema Firestore READ-ONLY adapter.
 * NEVER imports firebaseAdmin, Firestore FieldValue, cron, or an assignment writer.
 * A caller provides the existing authenticated production db instance.
 *
 * LIMITATIONS: bounded snapshots are not transactionally consistent, and this
 * read is neither a safe dispatch decision nor "all eligible" at large scale.
 * Fail CLOSED rather than interpreting limit-truncated queries as complete.
 */
const MAX=200;
const LIMIT=MAX+1;
const validId=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(s);
class PreviewSourceError extends Error {
  constructor(code){
    super("Auto Volunteer preview source unavailable");
    this.name="PreviewSourceError";
    this.code=code;
  }
}
function requireComplete(snap,source){
  if(!snap||!Array.isArray(snap.docs)||
     !Number.isInteger(snap.size)||snap.size!==snap.docs.length)
    throw new PreviewSourceError("source_query_incomplete");
  if(snap.docs.length>=LIMIT)
    throw new PreviewSourceError("source_exceeds_audited_200_limit");
  return snap.docs;
}
async function loadProductionPreviewInputs(db,caseId){
  if(!validId(caseId))
    throw new PreviewSourceError("invalid_case_id");
  if(!db||typeof db.collection!=="function")
    throw new PreviewSourceError("database_unavailable");

  // This ref is an existing *real* Emergency Report. Never synthesize one.
  const caseSnap=await db.collection("disasterCases").doc(caseId).get();
  if(!caseSnap?.exists)
    throw new PreviewSourceError("case_not_found");
  const caseData={...(caseSnap.data()||{}),id:caseId};
  // Never infer the incident location from reporterBarangay: it describes
  // the Resident, and may differ from the actual emergency location.
  if(!caseData.incidentBarangay&&!caseData.emergencyBarangay&&!caseData.barangay)
    throw new PreviewSourceError("incident_barangay_requires_review");

  // Read *all* assignments, not only "offered", to retain declined,
  // completed and unknown statuses for conflict/attempt checks.
  // Bounded all-collection queries may refuse large production datasets.
  // This is intentional until index-scoped, fully paginated queries are reviewed.
  const [applicationSnapshots,allAssignments,allLocks]=await Promise.all([
    db.collection("volunteerApplications").limit(LIMIT).get(),
    db.collection("responseAssignments").limit(LIMIT).get(),
    db.collection("responderLocks").limit(LIMIT).get()
  ]);
  // Read all applications: the existing Admin UI treats status case-insensitively.
  // A lower-case only Firestore query would silently miss old approved records.
  const allApps=requireComplete(applicationSnapshots,"volunteerApplications");
  const apps=allApps.filter(s=>String(s.data()?.status||"").trim().toLowerCase()==="approved");
  const assignments=requireComplete(allAssignments,"responseAssignments")
    .map(s=>({...s.data()}));
  const locks=requireComplete(allLocks,"responderLocks")
    .map(s=>({uid:s.id,...s.data()}));

  // Profiles from canonical users/{uid}, never from client-supplied data.
  // No fallback to fake "approved" profiles when Firestore is missing.
  const roster=await Promise.all(apps.map(async snap=>{
    const application={...(snap.data()||{})};
    application.status=String(application.status||"").trim().toLowerCase();
    const uid=String(application.uid||application.userId||
      application.volunteerId||snap.id||"").trim();
    if(!validId(uid))return {uid:"",application,user:{}};
    const userSnap=await db.collection("users").doc(uid).get();
    return {uid,application,user:userSnap?.exists?{...userSnap.data(),uid}:{}};
  }));

  return {
    caseData,roster,existingAssignments:assignments,activeLocks:locks,
    sourceScansComplete:true,
    sourceLimits:{allApplications:allApps.length,approvedApplications:apps.length,
      allAssignments:assignments.length,allResponderLocks:locks.length},
    snapshotConsistency:"non_transactional_read_only"
  };
}
module.exports={loadProductionPreviewInputs,PreviewSourceError,MAX};
