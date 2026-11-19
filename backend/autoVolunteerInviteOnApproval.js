"use strict";
/**
 * ADDITIVE, DISABLED-BY-DEFAULT integration candidate for VolunServe.
 * This code is NOT installed on production. No background timer or real
 * emergency outreach is enabled by adding it to the GitHub review branch.
 *
 * First-wave policy: atomically offer ALL eligible same-barangay Volunteers,
 * up to the hard safety cap. Later waves need verified SJDM neighbor mapping
 * and an audited always-on scheduler; neither is guessed or enabled here.
 */
const barangays=require("./autoVolunteerSJDMBarangays.json");
const {FieldValue,auth}=require("./firebaseAdmin");
const ACTIVE=new Set(["offered","accepted","responding","on_site"]);
const MAX_SCAN=200,MAX_ATOMIC_TARGETS=25,OFFER_MS=180000;
const uidOK=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const normalize=x=>String(x||"").normalize("NFKC").trim().toLowerCase()
  .replace(/^brgy\.?\s*|^barangay\s*/i,"")
  .replace(/[.,-]/g," ").replace(/\s+/g," ").trim();
const known=new Set(barangays.map(normalize));
const safeSkills=v=>Array.isArray(v)?
  v.filter(x=>typeof x==="string").map(x=>x.toLowerCase().trim()).filter(Boolean):[];
const blocked=reason=>({ok:false,status:"blocked",reason,offersWritten:false});
const NO_RELEASE="automatic_volunteer_release_not_authorized";
function getCredentialProject(env){
  try{
    const value=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON||"{}");
    return typeof value.project_id==="string"?value.project_id:"";
  }catch{return ""}
}
function releaseGate(env=process.env,credentialProject=getCredentialProject(env)){
  const enabled=env.VOLUNSERVE_AUTO_VOLUNTEER_INVITES_MODE==="enabled" &&
    env.VOLUNSERVE_AUTO_VOLUNTEER_RELEASE_REVIEWED==="yes" &&
    env.VOLUNSERVE_AUTO_VOLUNTEER_EXPLICIT_PRODUCTION_APPROVAL==="yes" &&
    env.VOLUNSERVE_AUTO_VOLUNTEER_TARGET_PROJECT==="volunserve-3aa5b" &&
    credentialProject==="volunserve-3aa5b";
  return {enabled,reason:enabled?null:NO_RELEASE};
}
function caseReady(caseData){
  if(!caseData||caseData.verificationStatus!=="validated"||
     !["validated","assigned"].includes(caseData.status)||
     caseData.dispatchBlocked===true||
     !uidOK(caseData.reporterUid)||!uidOK(caseData.validatedBy)||
     !!caseData.activeVolunteerSupportAssignmentId||
     !!caseData.autoVolunteerDispatch?.state)return false;
  const barangay=normalize(caseData.incidentBarangay||
    caseData.emergencyBarangay||caseData.barangay);
  return barangay.length>0&&known.has(barangay);
}
function candidateOK(caseData,person,application,{busy=new Set()}={}){
  const uid=String(person?.uid||"");
  if(!uidOK(uid)||uid===caseData.reporterUid||busy.has(uid))return false;
  const role=String(person.role||"").toLowerCase();
  if(!["resident","volunteer"].includes(role)||person.status!=="approved"||
     person.volunteerAccess!==true||person.volunteerStatus!=="approved"||
     (person.identityVerified!==true&&person.identityStatus!=="verified")||
     application?.status!=="approved")return false;
  const incidentBarangay=normalize(caseData.incidentBarangay||
    caseData.emergencyBarangay||caseData.barangay);
  const volunteerBarangay=normalize(person.barangay||person.addressBarangay);
  if(!known.has(volunteerBarangay)||volunteerBarangay!==incidentBarangay)return false;
  const required=safeSkills(caseData.requiredSkills).filter(x=>!x.includes("general volunteer"));
  const offered=safeSkills([
    ...(person.skills||[]),...(person.volunteerSkills||[]),
    ...(application.skills||[]),...(application.volunteerSkills||[])
  ]);
  return !required.length||required.some(r=>offered.some(s=>
    s===r||s.includes(r)||r.includes(s)));
}
function refs(db,caseId,uid){
  return {
    assignment:db.collection("responseAssignments").doc(caseId+"_"+uid),
    reservation:db.collection("autoVolunteerReservations").doc(uid),
    lock:db.collection("responderLocks").doc(uid),
    notification:db.collection("notifications").doc("auto_response_"+caseId+"_"+uid),
    audit:db.collection("adminActivityLogs").doc("auto_offer_"+caseId+"_"+uid),
    user:db.collection("users").doc(uid),
    application:db.collection("volunteerApplications").doc(uid)
  };
}
async function inviteAfterApproval({
  db,env=process.env,credentialProject=getCredentialProject(env),
  caseId,adminUid,now=Date.now()
}={}){
  const gate=releaseGate(env,credentialProject);
  if(!gate.enabled)return blocked(gate.reason);
  if(!uidOK(caseId)||!uidOK(adminUid)||
     !Number.isSafeInteger(now)||now<0)
    return blocked("invalid_case_or_admin");
  const caseRef=db.collection("disasterCases").doc(caseId);
  const batchRef=db.collection("emergencyAutoDispatchBatches").doc(caseId);
  const legacyRef=db.collection("emergencyAutoDispatch").doc(caseId);
  const [caseSnap,existingBatch,legacy,apps,active,existing]=await Promise.all([
    caseRef.get(),batchRef.get(),legacyRef.get(),
    db.collection("volunteerApplications").where("status","==","approved")
      .limit(MAX_SCAN+1).get(),
    db.collection("responseAssignments").where("status","in",[...ACTIVE])
      .limit(MAX_SCAN+1).get(),
    db.collection("responseAssignments").where("caseId","==",caseId)
      .limit(MAX_SCAN+1).get()
  ]);
  if(!caseSnap.exists||!caseReady(caseSnap.data()))
    return blocked("case_not_validated_or_manual_response_active");
  if(existingBatch.exists||legacy.exists||!existing.empty)
    return blocked("existing_dispatch_or_offer_records");
  if(apps.size>MAX_SCAN||active.size>MAX_SCAN)
    return blocked("volunteer_pool_requires_batched_release");
  const incident={...caseSnap.data(),id:caseId};
  const busy=new Set(active.docs.filter(s=>ACTIVE.has(s.data()?.status))
    .map(s=>s.data()?.volunteerId).filter(uidOK));
  const applications=await Promise.all(apps.docs.map(async d=>{
    const app=d.data()||{};
    const uid=String(app.uid||app.userId||app.volunteerId||d.id);
    if(!uidOK(uid))return null;
    const user=await db.collection("users").doc(uid).get();
    return {uid,app,person:user.exists?{...user.data(),uid}:null};
  }));
  const candidates=[...new Set(applications.filter(x=>x&&x.person&&
    candidateOK(incident,x.person,x.app,{busy})).map(x=>x.uid))].sort();
  if(!candidates.length)return blocked("no_eligible_same_barangay_volunteers");
  // A partial subset would falsely claim 'ALL'; fail closed instead.
  if(candidates.length>MAX_ATOMIC_TARGETS)
    return blocked("atomic_fanout_limit_requires_batched_engine");
  const expiresAtMs=now+OFFER_MS;
  const byUid=new Map(applications.filter(Boolean).map(x=>[x.uid,x]));
  return db.runTransaction(async tx=>{
    const fixed=[caseRef,batchRef,legacyRef];
    const candidateRefs=candidates.map(uid=>refs(db,caseId,uid));
    const reads=candidateRefs.flatMap(x=>Object.values(x));
    const snapshots=await Promise.all([...fixed,...reads].map(x=>tx.get(x)));
    const [incidentNow,batchNow,legacyNow]=snapshots;
    if(!incidentNow.exists||!caseReady(incidentNow.data())||
       batchNow.exists||legacyNow.exists)
      return blocked("case_state_changed_or_already_invited");
    const records=[];
    for(let i=0;i<candidates.length;i++){
      const row=snapshots.slice(3+i*7,3+(i+1)*7);
      const [assignment,reservation,lock,notification,audit,user,application]=row;
      const uid=candidates[i];
      if(assignment.exists||reservation.exists||lock.exists||
         notification.exists||audit.exists||
         !user.exists||!application.exists)
        return blocked("candidate_conflict_or_existing_invite");
      const person={...user.data(),uid};
      if(!candidateOK(incidentNow.data(),person,application.data(),{busy})||
         !byUid.get(uid))return blocked("candidate_no_longer_eligible");
      records.push({uid,refs:candidateRefs[i],
        name:String(person.fullName||application.data().fullName||
          "Volunteer").slice(0,120)});
    }
    const stamp=FieldValue.serverTimestamp();
    tx.create(batchRef,{
      caseId,status:"waiting",wave:1,volunteerCount:records.length,
      expiresAtMs,testOnly:false,
      origin:"server_auto_volunteer_wave1",
      validatedBy:adminUid,createdAt:stamp
    });
    for(const item of records){
      const aid=caseId+"_"+item.uid;
      tx.create(item.refs.reservation,{
        uid:item.uid,caseId,assignmentId:aid,
        expiresAtMs,createdAt:stamp});
      tx.create(item.refs.assignment,{
        caseId,volunteerId:item.uid,volunteerName:item.name,
        caseTitle:String(incidentNow.data().title||"Emergency Report").slice(0,120),
        status:"offered",createdBy:"automatic_matching_engine",
        offerMode:"automatic_all_eligible_wave1",wave:1,expiresAtMs,
        createdAt:stamp,updatedAt:stamp
      });
      tx.create(item.refs.notification,{
        userId:item.uid,audience:"volunteer",type:"response_assignment",
        caseId,assignmentId:aid,
        title:"Emergency Volunteer task offer",
        message:"An Admin-approved emergency support task is available. Open VolunServe to review and Accept or Decline.",
        read:false,createdAt:stamp
      });
      tx.create(item.refs.audit,{
        caseId,volunteerUid:item.uid,wave:1,
        action:"Automatic Volunteer Offer Created",
        performedBy:"automatic_matching_engine",timestamp:stamp
      });
    }
    tx.update(caseRef,{
      status:"assigned",
      autoVolunteerDispatch:{
        state:"waiting",wave:1,attemptedCount:records.length,
        expiresAtMs,updatedAt:stamp
      },updatedAt:stamp
    });
    return {ok:true,status:"offered",wave:1,offered:records.length,
      expiresAtMs,offersWritten:true,partial:false};
  });
}
function installAutoVolunteerInvitationRoute({
  app,db,requireFirebaseUser,requireOperationalAdmin
}={}){
  if(!app||!db||!requireFirebaseUser||!requireOperationalAdmin)
    throw Error("Missing existing VolunServe Admin dependencies");
  // This has no feature effect with default production environment:
  // requires three independent explicit release approvals + credential match.
  app.post("/api/admin/emergency-auto/offer-after-validation",
    requireFirebaseUser,requireOperationalAdmin,async(req,res)=>{
      if(!releaseGate().enabled)
        return res.status(503).json(blocked(NO_RELEASE));
      const caseId=req.body?.caseId,adminUid=req.firebaseUser?.uid;
      try{
        const result=await inviteAfterApproval({db,caseId,adminUid});
        res.status(result.ok?200:409).json(result);
      }catch(error){
        console.error("[Volunteer auto invitation] fail closed",String(error?.code||"unknown").slice(0,90));
        res.status(503).json(blocked("automatic_invites_require_admin_review"));
      }
    });
}
module.exports={
  releaseGate,caseReady,candidateOK,inviteAfterApproval,
  installAutoVolunteerInvitationRoute,MAX_ATOMIC_TARGETS
};
