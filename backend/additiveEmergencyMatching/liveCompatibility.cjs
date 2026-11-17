"use strict";

/**
 * Read-only adapter for the deployed-source Admin Emergency Reports schema.
 *
 * IMPORTANT: No Firebase imports, no Firestore mutations, no task sending.
 * Preview only. A later reviewed backend must revalidate EVERYTHING within
 * a transaction, including responderLocks and active auto reservations.
 * Never import this into a live workflow without separate approval.
 */
const {simulateVolunteerRecommendation}=require("./preview.cjs");

const ACTIVE_ASSIGNMENT_STATUSES=new Set(["offered","accepted","responding","on_site"]);
const TERMINAL_CASE_STATUSES=new Set(["resolved","closed","rejected","cancelled"]);
const TERMINAL_REVIEW_STATUSES=new Set(["rejected","failed","revoked","suspended","disabled","deactivated"]);
const clean=x=>typeof x==="string"?x.trim():"";
const lower=x=>clean(x).toLowerCase();
const isSafeId=x=>/^[a-zA-Z0-9_-]{1,160}$/.test(clean(x));
const strings=x=>Array.isArray(x)?x.map(clean).filter(Boolean):[];
const isIdentityVerified=x=>x?.identityVerified===true||lower(x?.identityStatus)==="verified";

/**
 * Only known deployed-source case fields are copied; the original document
 * and non-volunteer LGU/admin fields are never changed or reinterpreted.
 */
function normalizeLiveDisasterCase(id,record={}){
  if(!isSafeId(id)||!record||typeof record!=="object")return null;
  const incidentBarangay=clean(
    record.incidentBarangay||record.emergencyBarangay||
    record.barangay||record.reporterBarangay
  );
  return {
    id:clean(id),title:clean(record.title),
    status:lower(record.status),verificationStatus:lower(record.verificationStatus),
    reporterUid:clean(record.reporterUid),severity:lower(record.severity),
    incidentBarangay,requiredSkills:strings(record.requiredSkills),
    dispatchBlocked:record.dispatchBlocked===true,
    // These fields are read-only mutual-exclusion signals, not assignments.
    activeVolunteerSupportAssignmentId:clean(record.activeVolunteerSupportAssignmentId),
    activeResponderAssignmentId:clean(record.activeResponderAssignmentId),
    activeVolunteerSupportUid:clean(record.activeVolunteerSupportUid),
  };
}

/**
 * The live Admin directory derives approved Volunteer candidates from
 * volunteerApplications, but current barangay MUST come from users/{uid}.
 * The automatic preview requires explicit approved profile/access/identity;
 * it doesn't silently inherit legacy App UI fallback defaults.
 */
function normalizeLiveApprovedVolunteer({applicationId,application,user}={}){
  if(!application||typeof application!=="object"||!user||typeof user!=="object")
    return null;
  const uid=clean(application.uid||application.userId||
    application.volunteerId||applicationId);
  if(!isSafeId(uid))return null;
  const userUid=clean(user.uid);
  if(userUid&&userUid!==uid)return null;
  if(lower(application.status)!=="approved")return null;
  const role=lower(user.role);
  if(!["resident","volunteer"].includes(role))return null;
  const status=lower(user.status);
  if(status!=="approved")return null;
  if(TERMINAL_REVIEW_STATUSES.has(lower(user.volunteerStatus))||
     TERMINAL_REVIEW_STATUSES.has(lower(user.identityStatus))||
     TERMINAL_REVIEW_STATUSES.has(lower(application.identityStatus)))return null;
  // Fail closed for automatic matching: manual Admin screen can still show
  // older approved profiles where some mirrored properties are absent.
  if(user.volunteerAccess!==true||lower(user.volunteerStatus)!=="approved")return null;
  const verified=isIdentityVerified(user)||isIdentityVerified(application);
  if(!verified)return null;
  const barangay=clean(user.barangay||user.addressBarangay);
  if(!barangay)return null;
  const skills=strings(
    application.skills??application.skillSet??
    application.volunteerSkills??user.skills??user.volunteerSkills
  );
  return {
    uid,
    application:{status:"approved",skills,
      identityVerified:verified},
    user:{role,status:"approved",volunteerStatus:"approved",
      volunteerAccess:true,identityVerified:verified,barangay,
      skills,fullName:clean(application.fullName||user.fullName)||"Volunteer"}
  };
}
function normalizeLiveAssignments(rows=[]){
  if(!Array.isArray(rows))return [];
  return rows.filter(x=>x&&typeof x==="object").map(x=>({
    caseId:clean(x.caseId),volunteerId:clean(x.volunteerId),
    status:lower(x.status),assignmentId:clean(x.id||x.assignmentId),
  })).filter(x=>isSafeId(x.caseId)&&isSafeId(x.volunteerId));
}
function checkManualAssignmentConflict(caseData,assignments){
  if(caseData.activeVolunteerSupportAssignmentId||caseData.activeResponderAssignmentId||
     caseData.activeVolunteerSupportUid){
    return "existing_responder_reference";
  }
  if(assignments.some(x=>x.caseId===caseData.id&&ACTIVE_ASSIGNMENT_STATUSES.has(x.status))){
    return "existing_manual_or_auto_assignment";
  }
  return null;
}

/**
 * Snapshot-fed preview that can be called by isolated test tools.
 * Does not query Firestore or send notifications. No production enable flag.
 * Distinguishes manually assigned Volunteers from available candidates.
 */
function previewExistingLiveEmergency({
  caseId,caseData,approvedApplications=[],usersByUid={},
  assignments=[],responderLocksByUid,
  knownBarangays=[],neighborsByBarangay={},
}={}){
  const safe={kind:"preview",offerSent:false,productionDispatchEnabled:false};
  const incident=normalizeLiveDisasterCase(caseId,caseData);
  if(!incident)return {...safe,status:"blocked",reason:"invalid_case"};
  if(TERMINAL_CASE_STATUSES.has(incident.status)||
     incident.verificationStatus!=="validated"||
     !["validated","assigned","in_progress"].includes(incident.status)||
     incident.dispatchBlocked||!isSafeId(incident.reporterUid)){
    return {...safe,status:"blocked",reason:"not_validated_open_case"};
  }
  // A missing lock snapshot must not look like an empty lock roster.
  // Read-only previews are not an authorization decision, but should not
  // imply an available candidate without this safety input.
  if(!responderLocksByUid||typeof responderLocksByUid!=="object"||
     Array.isArray(responderLocksByUid)){
    return {...safe,status:"blocked",reason:"lock_snapshot_missing"};
  }
  const normalizedAssignments=normalizeLiveAssignments(assignments);
  const manualConflict=checkManualAssignmentConflict(incident,normalizedAssignments);
  if(manualConflict)return {...safe,status:"blocked",reason:manualConflict};
  if(!Array.isArray(approvedApplications)||!Array.isArray(knownBarangays)||
     knownBarangays.length===0||!usersByUid||typeof usersByUid!=="object"){
    return {...safe,status:"blocked",reason:"missing_reviewed_roster"};
  }
  const volunteers=[];
  const max=200;
  if(approvedApplications.length>max)return {...safe,status:"blocked",reason:"pool_limit"};
  for(const row of approvedApplications){
    if(!row||typeof row!=="object")continue;
    const application=row.application||row;
    const applicationId=clean(row.id||row.applicationId);
    const uid=clean(application.uid||application.userId||
      application.volunteerId||applicationId);
    if(!isSafeId(uid))continue;
    const user=usersByUid[uid];
    const normalized=normalizeLiveApprovedVolunteer({
      applicationId,application,user
    });
    if(!normalized)continue;
    if(responderLocksByUid?.[uid])continue;
    volunteers.push(normalized);
  }
  const result=simulateVolunteerRecommendation({
    incident,volunteers,knownBarangays,neighborsByBarangay,
    activeAssignments:normalizedAssignments
  });
  return {
    ...safe,status:result.status,reason:result.reason,
    wave:result.wave||0,volunteerId:result.volunteerId||null,
    eligible:result.eligible||0,reviewed:result.reviewed||0,
    requiresOfficialEscalation:result.requiresOfficialEscalation===true
  };
}

/**
 * Compatibility with the ALREADY-MERGED Admin screen's approvedVolunteers
 * interface, without requiring duplicate subscriptions to applications/users.
 * It consumes the existing UI profiles but still requires a separately
 * reviewed responder-lock snapshot for any confident preview. No writes.
 */
function previewFromLiveAdminDirectory({
  incident,approvedVolunteers,assignments=[],
  responderLocksByUid,knownBarangays=[],neighborsByBarangay={}
}={}){
  const safe={kind:"preview",offerSent:false,productionDispatchEnabled:false};
  if(!incident||typeof incident!=="object"||
     !Array.isArray(approvedVolunteers)){
    return {...safe,status:"blocked",reason:"missing_admin_directory"};
  }
  const approvedApplications=[];
  const usersByUid=Object.create(null);
  for(const row of approvedVolunteers){
    if(!row||typeof row!=="object"||row.applicationApproved!==true||
       !isSafeId(row.uid))continue;
    const uid=clean(row.uid);
    approvedApplications.push({
      id:uid,application:{
        uid,status:"approved",fullName:clean(row.fullName),
        skills:strings(row.skills),identityVerified:row.identityVerified===true,
        identityStatus:clean(row.identityStatus)
      }
    });
    usersByUid[uid]={
      uid,role:clean(row.role),status:clean(row.status),
      volunteerAccess:row.volunteerAccess===true,
      volunteerStatus:clean(row.volunteerStatus),
      identityVerified:row.identityVerified===true,
      identityStatus:clean(row.identityStatus),
      barangay:clean(row.barangay),skills:strings(row.skills)
    };
  }
  return previewExistingLiveEmergency({
    caseId:incident.id,caseData:incident,
    approvedApplications,usersByUid,assignments,
    responderLocksByUid,knownBarangays,neighborsByBarangay
  });
}
module.exports={
  normalizeLiveDisasterCase,normalizeLiveApprovedVolunteer,
  normalizeLiveAssignments,checkManualAssignmentConflict,
  previewExistingLiveEmergency,previewFromLiveAdminDirectory,
};
