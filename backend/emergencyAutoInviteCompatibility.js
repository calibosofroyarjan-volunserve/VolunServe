"use strict";
/**
 * Production-SCHEMA compatibility contract for a proposed automatic Volunteer
 * invitation engine. NO Firestore imports, no network, no writers, no timers,
 * no Firebase Functions trigger and NO production registration.
 *
 * The deployed production Admin UI still assigns one optional Volunteer
 * manually and stores an activeVolunteerSupportAssignmentId. This module
 * MUST reject such cases rather than silently mix two assignment models.
 *
 * For future SERVER-side dispatch: read the verified case + full candidate
 * application/user docs + per-case and cross-case active assignments,
 * compute this plan, then RE-READ and revalidate ALL relevant records
 * INSIDE one atomic Firestore transaction before writing deterministic
 * assignments, notifications and reservations. Never call from browser.
 */
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const ACTIVE=new Set(["offered","accepted","responding","on_site"]);
const VALID_CASE_STATUS=new Set(["validated","assigned","in_progress"]);
const norm=value=>String(value||"").normalize("NFKC").trim()
  .toLowerCase().replace(/^(brgy\.?|barangay)\s*/i,"")
  .replace(/[.,-]/g," ").replace(/\s+/g," ").trim();
const strings=a=>Array.isArray(a)?a.filter(x=>typeof x==="string")
  .map(s=>s.trim()).filter(Boolean):[];
const skills=a=>strings(a).map(s=>s.toLowerCase());
const stop=(reason,extra={})=>({
  status:"blocked",reason,offers:[],wave:0,
  productionDispatchEnabled:false,readOnly:true,...extra
});
function planApprovedEmergencyVolunteerInvites({
  incident,roster=[],caseAssignments=[],activeAssignments=[],
  knownBarangays=[],maxPerWave=40
}={}){
  if(!incident||typeof incident!=="object")
    return stop("case_missing");
  const id=String(incident.id||"");
  if(!UID.test(id))return stop("invalid_case_id");
  if(incident.verificationStatus!=="validated"||
     !VALID_CASE_STATUS.has(String(incident.status||""))||
     incident.dispatchBlocked===true||
     incident.resolvedAt||incident.closedAt)
    return stop("case_not_approved_or_closed");
  if(incident.activeVolunteerSupportAssignmentId||
     incident.activeVolunteerSupportUid||
     incident.autoVolunteerDispatch?.state)
    return stop("existing_legacy_or_auto_assignment");
  if(caseAssignments.length)
    return stop("existing_case_assignment_requires_review");
  if(!Array.isArray(knownBarangays)||!knownBarangays.length)
    return stop("unverified_sjdm_barangay_configuration");
  const places=new Set(knownBarangays.map(norm));
  const location=norm(incident.incidentBarangay||
    incident.emergencyBarangay||incident.barangay);
  if(!location||!places.has(location))
    return stop("unverified_case_barangay");
  if(!Array.isArray(roster)||!Array.isArray(activeAssignments)||
     !Array.isArray(caseAssignments))
    return stop("invalid_candidate_data");
  if(!Number.isInteger(maxPerWave)||maxPerWave<1||maxPerWave>40)
    return stop("invalid_atomic_wave_limit");
  const busy=new Set(activeAssignments.filter(a=>
    a&&ACTIVE.has(String(a.status||"").toLowerCase()))
    .map(a=>String(a.volunteerId||"")).filter(Boolean));
  const needed=skills(incident.requiredSkills)
    .filter(s=>!s.includes("general volunteer"));
  const eligible=new Map();
  const exclusions={};
  for(const row of roster){
    const app=row?.application||{};
    const user=row?.user||{};
    const uid=String(row?.uid||app.uid||app.userId||"");
    let reason="";
    if(!UID.test(uid)||app.uid&&app.uid!==uid)
      reason="invalid_volunteer_identity";
    else if(uid===incident.reporterUid)
      reason="reporter_cannot_volunteer";
    else if(app.status!=="approved")
      reason="application_not_approved";
    else if(!["volunteer","resident"].includes(user.role)||
            user.status!=="approved"||
            user.volunteerAccess!==true||
            user.volunteerStatus!=="approved")
      reason="unapproved_or_blocked_volunteer";
    else if(user.identityVerified!==true&&user.identityStatus!=="verified")
      reason="identity_not_verified";
    else if(busy.has(uid))
      reason="already_busy";
    else if(norm(user.barangay||user.addressBarangay)!==location)
      reason="outside_verified_same_barangay";
    else if(needed.length&&!needed.some(n=>skills([
      ...strings(user.skills),...strings(user.volunteerSkills),
      ...strings(app.skills),...strings(app.volunteerSkills)
    ]).some(s=>s===n||s.includes(n)||n.includes(s))))
      reason="skills_not_verified";
    if(reason){exclusions[reason]=(exclusions[reason]||0)+1;continue;}
    eligible.set(uid,{
      volunteerUid:uid,caseId:id,barangay:location,
      assignmentId:id+"_"+uid,
      notificationId:"auto_response_"+id+"_"+uid,
      offerMode:"automatic_volunteer_proposed",
      status:"offered",wave:1
    });
  }
  const offers=[...eligible.values()].sort((a,b)=>
    a.volunteerUid.localeCompare(b.volunteerUid));
  if(offers.length>maxPerWave)
    return stop("atomic_wave_exceeds_limit",{
      eligibleCount:offers.length,maxPerWave
    });
  return {
    status:offers.length?"ready":"no_eligible_volunteers",
    reason:offers.length?null:"manual_review_required",
    readOnly:true,productionDispatchEnabled:false,
    wave:offers.length?1:0,offers,exclusions,
    eligibleCount:offers.length,maxPerWave
  };
}
module.exports={planApprovedEmergencyVolunteerInvites,norm};
