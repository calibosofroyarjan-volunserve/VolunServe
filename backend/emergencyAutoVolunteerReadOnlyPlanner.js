"use strict";
/**
 * PRODUCTION-BASE INTEGRATION CANDIDATE, PREVIEW ONLY.
 * No Firebase imports, authentication, API endpoints, timers, notifications,
 * transactions or dispatch. This module is NOT imported by backend/server.js.
 * A later, separately approved server implementation must authenticate,
 * read complete fresh state and revalidate inside atomic write transactions.
 *
 * Staging-derived 62-name allowlist is provisional and needs independent SJDM
 * geographic review before real Emergency Response production activation.
 */
const reviewedNames = require("./autoVolunteerSJDMBarangays.review.json");
const ACTIVE = new Set(["offered","accepted","responding","on_site"]);
const CASE_ACTIVE = new Set([...ACTIVE,"completed"]);
const GOOD_STATUS = new Set(["validated","assigned","in_progress"]);
const MAX_PER_WAVE=40;
const MAX_REVIEWED=200;
const norm=x=>String(x||"").normalize("NFKC").trim().toLowerCase()
  .replace(/^(brgy\.?|barangay)\s+/i,"").replace(/[.,-]/g," ")
  .replace(/\s+/g," ").trim();
const list=value=>Array.isArray(value)?value.filter(x=>typeof x==="string").map(x=>x.trim()).filter(Boolean):[];
const known = new Set(reviewedNames.map(norm));
const blocked=(reason,extra={})=>Object.assign({status:"blocked",reason,readOnly:true,
  dispatchEnabled:false},extra);
const validId=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);

/**
 * Explicit preview opt-in is for local, audited simulations only. No runtime
 * imports this module. Dispatch capability does not exist in this candidate.
 */
function previewEnabled(env={}){
  return env?.VOLUNSERVE_AUTO_VOLUNTEER_PREVIEW==="enabled" &&
    env?.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH!=="enabled";
}
function hasApprovedIdentity(user){
  return user.identityVerified===true||
    String(user.identityStatus||"").trim().toLowerCase()==="verified";
}
function hasRequiredSkills(report,user,application){
  const required=list(report.requiredSkills).map(norm)
    .filter(x=>x!=="general volunteer");
  if(!required.length)return true;
  const skills=[
    ...list(user.skills),...list(user.volunteerSkills),
    ...list(application.skills),...list(application.volunteerSkills)
  ].map(norm);
  return required.some(req=>skills.some(s=>s===req));
}
function verifyNeighbors(neighborMap,reviewApproved){
  if(reviewApproved!==true||!neighborMap||typeof neighborMap!=="object"||
     Array.isArray(neighborMap))return null;
  const out={};
  for(const [key,value] of Object.entries(neighborMap)){
    const k=norm(key);
    if(!known.has(k)||!Array.isArray(value))return null;
    const normalized=value.map(norm);
    if(normalized.some(v=>!known.has(v)||v===k))return null;
    if(out[k])return null;
    out[k]=new Set(normalized);
  }
  return out;
}

/**
 * Returns only private in-process candidate IDs and aggregate exclusion codes.
 * Caller MUST NOT send candidate IDs to an unauthenticated client.
 * Input requirements are intentionally fail-closed; incomplete query results
 * can never be interpreted as "these are ALL eligible Volunteers."
 */
function previewAllEligibleWave({
  env={},caseData,roster,existingAssignments,activeLocks,
  sourceScansComplete=false,completedWaves=[],attemptedVolunteerIds=[],
  neighborsByBarangay={},neighborMapReviewed=false
}={}){
  if(!previewEnabled(env))return blocked("feature_off_by_default");
  if(!caseData||!validId(caseData.id)||!validId(caseData.reporterUid))
    return blocked("invalid_case_identity");
  if(!GOOD_STATUS.has(caseData.status)||
     caseData.verificationStatus!=="validated"||
     caseData.dispatchBlocked===true||
     caseData.status==="resolved"||caseData.status==="closed")
    return blocked("admin_verified_open_report_required");
  if(caseData.activeVolunteerSupportAssignmentId||
     caseData.activeVolunteerSupportUid)
    return blocked("manual_or_active_responder_exists");
  // The Resident's home barangay does not prove the incident is there.
  const caseBarangay=norm(caseData.incidentBarangay||
    caseData.emergencyBarangay||caseData.barangay);
  if(!known.has(caseBarangay))
    return blocked("incident_barangay_unverified_or_outside_sjdm");
  if(sourceScansComplete!==true||!Array.isArray(roster)||
    !Array.isArray(existingAssignments)||!Array.isArray(activeLocks))
    return blocked("complete_trusted_source_snapshots_required");
  if(roster.length>MAX_REVIEWED||existingAssignments.length>MAX_REVIEWED||
    activeLocks.length>MAX_REVIEWED)
    return blocked("source_pool_exceeds_audited_preview_limit");
  if(existingAssignments.some(a=>a&&a.caseId===caseData.id&&
    CASE_ACTIVE.has(String(a.status||"").toLowerCase())))
    return blocked("existing_manual_or_auto_offers");
  if(activeLocks.some(x=>x&&x.caseId===caseData.id))
    return blocked("existing_responder_lock");
  const tried=new Set([
    ...list(attemptedVolunteerIds),
    ...existingAssignments.filter(a=>a&&a.caseId===caseData.id)
      .map(a=>a.volunteerId).filter(validId)
  ]);
  const completed=new Set(Array.isArray(completedWaves)?
    completedWaves.filter(x=>[1,2,3].includes(x)):[]);
  const neighbors=verifyNeighbors(neighborsByBarangay,neighborMapReviewed);
  const exclusionCounts={};
  const groups={1:[],2:[],3:[]};
  const seen=new Set();
  for(const member of roster){
    const app=member?.application||{},user=member?.user||{};
    const uid=member?.uid||app.uid||app.userId||"";
    let exclude="";
    if(!validId(uid)||seen.has(uid)||
      (app.uid&&app.uid!==uid)||(user.uid&&user.uid!==uid))
      exclude="missing_duplicate_or_mismatched_uid";
    else{
      seen.add(uid);
      if(uid===caseData.reporterUid)exclude="self_report";
      else if(app.status!=="approved"||
          user.status!=="approved"||
          !["resident","volunteer"].includes(user.role)||
          user.volunteerAccess!==true||user.volunteerStatus!=="approved"||
          !hasApprovedIdentity(user))exclude="not_currently_approved";
      else if(tried.has(uid)||existingAssignments.some(a=>a&&
          a.volunteerId===uid&&ACTIVE.has(String(a.status||"").toLowerCase()))||
          activeLocks.some(x=>x&&x.uid===uid))
          exclude="previous_offer_or_busy";
      else if(!hasRequiredSkills(caseData,user,app))
          exclude="specialized_skill_not_verified";
      else{
        const barangay=norm(user.barangay||user.addressBarangay);
        if(!known.has(barangay))exclude="volunteer_barangay_unverified";
        else{
          const wave=barangay===caseBarangay?1:
            neighbors&&neighbors[caseBarangay]?.has(barangay)?2:3;
          groups[wave].push(uid);
        }
      }
    }
    if(exclude)exclusionCounts[exclude]=(exclusionCounts[exclude]||0)+1;
  }
  for(const wave of [1,2,3]){
    if(completed.has(wave))continue;
    if(wave===2&&!neighbors)continue;
    if(!groups[wave].length)continue;
    const unique=groups[wave].sort();
    if(unique.length>MAX_PER_WAVE)
      return blocked("wave_over_audited_fanout_limit",{wave,
        wouldOffer:unique.length});
    return {status:"preview_only",readOnly:true,dispatchEnabled:false,
      wave,offerCandidateUids:unique,candidateCount:unique.length,
      reviewed:roster.length,exclusions:exclusionCounts,
      wave2RequiresReviewedAdjacency:!neighbors,
      warning:"No offers sent. Preview must be revalidated transactionally before any approved rollout."};
  }
  return blocked("no_verified_eligible_volunteers",{reviewed:roster.length,
    exclusions:exclusionCounts});
}
module.exports={previewAllEligibleWave,previewEnabled,norm};
