"use strict";
/**
 * Explicit, TEST-ONLY, fixed-case multi-Volunteer staging offer path.
 * Never imported by production. No background worker, no real emergencies.
 * Offers are atomic for the selected wave (up to 40 users per transaction).
 */
const {FieldValue,Timestamp}=require("./firebaseAdmin");
const {chooseAllEligibleWave}=require("../functions/emergencyAllEligibleWavePlanner");
const {validateVolunteer}=require("../functions/emergencyVolunteerWavePlanner");
const known=require("../functions/sjdmBarangays.json");
const {E2E_CASE_ID,recognizedStagingCase}=require("./stagingVolunteerTask");
const CASE_ID=E2E_CASE_ID;
const uidOK=x=>typeof x==="string" && /^[A-Za-z0-9_-]{1,160}$/.test(x);
const fail=reason=>({status:"blocked",reason});
const ACTIVE=["offered","accepted","responding","on_site"];
const expirationMs=3*60*1000;
const batchRef=db=>db.collection("emergencyAutoDispatchBatches").doc(CASE_ID);
const caseRef=db=>db.collection("disasterCases").doc(CASE_ID);
const assignmentRef=(db,uid)=>db.collection("responseAssignments").doc(CASE_ID+"_"+uid);
const reserveRef=(db,uid)=>db.collection("autoVolunteerReservations").doc(uid);
const lockRef=(db,uid)=>db.collection("responderLocks").doc(uid);
const userRef=(db,uid)=>db.collection("users").doc(uid);
const noteRef=(db,uid)=>db.collection("notifications").doc("auto_response_"+CASE_ID+"_"+uid);
const auditRef=(db,uid)=>db.collection("adminActivityLogs").doc("auto_offer_"+CASE_ID+"_"+uid);
async function startBatchOffers(db,adminUid,now=Date.now()){
  if(!uidOK(adminUid))return fail("approved_staging_admin_required");
  const caseSnap=await caseRef(db).get();
  if(!caseSnap.exists||!recognizedStagingCase(caseSnap.data(),CASE_ID))
    return fail("not_fixed_fictional_case");
  const incident={...caseSnap.data(),id:CASE_ID};
  if(!["validated","assigned"].includes(incident.status)||
    incident.verificationStatus!=="validated"||incident.dispatchBlocked===true)
    return fail("fictional_case_not_validated");
  const [batch,legacy,apps,busy,caseAssignments,settingsSnap]=await Promise.all([
    batchRef(db).get(),
    db.collection("emergencyAutoDispatch").doc(CASE_ID).get(),
    db.collection("volunteerApplications").where("status","==","approved").limit(201).get(),
    db.collection("responseAssignments").where("status","in",ACTIVE).limit(201).get(),
    db.collection("responseAssignments").where("caseId","==",CASE_ID).limit(201).get(),
    db.collection("systemSettings").doc("emergencyVolunteerMatching").get()
  ]);
  if(batch.exists)return {status:"already_started",wave:batch.data()?.wave||0};
  if(legacy.exists ||caseAssignments.docs.length)return fail("existing_single_or_manual_offer");
  if(apps.size>200||busy.size>200)return fail("approved_pool_exceeds_audited_limit");
  const settings=settingsSnap.exists?settingsSnap.data()||{}:{};
  // Never infer map adjacency from geography labels or user input.
  const neighborhoods=settings.enabled===true&&settings.approved===true&&
    settings.neighborsByBarangay&&typeof settings.neighborsByBarangay==="object"?
    settings.neighborsByBarangay:{};
  const bgyNames=new Set(known.map(n=>String(n).toLowerCase()));
  const configValid=Object.entries(neighborhoods).every(([key,vs])=>
    bgyNames.has(String(key).toLowerCase())&&Array.isArray(vs)&&
    vs.every(v=>bgyNames.has(String(v).toLowerCase())));
  const neighbors=configValid?neighborhoods:{};
  const roster=await Promise.all(apps.docs.map(async app=>{
    const data=app.data()||{};
    const uid=String(data.uid||data.userId||data.volunteerId||app.id);
    if(!uidOK(uid))return null;
    const person=await userRef(db,uid).get();
    return {uid,application:data,applicationRef:app.ref,user:person.exists?person.data()||{}:{}};
  }));
  const plan=chooseAllEligibleWave(incident,roster.filter(Boolean),{
    knownBarangays:known,neighborsByBarangay:neighbors,
    activeAssignments:busy.docs.map(s=>s.data()),
    existingAssignments:caseAssignments.docs.map(s=>s.data())
  });
  if(plan.action!=="offer_all")return fail(plan.action);
  const targets=plan.volunteers;
  const applicationRefs=new Map(roster.filter(Boolean).map(x=>[x.uid,x.applicationRef]));
  if(targets.length>40)return fail("fanout_exceeds_single_atomic_wave_limit");
  const expiresAtMs=now+expirationMs;
  return db.runTransaction(async tx=>{
    const base=[caseRef(db),batchRef(db),
      db.collection("emergencyAutoDispatch").doc(CASE_ID)];
    const refs=targets.flatMap(uid=>[
      assignmentRef(db,uid),reserveRef(db,uid),lockRef(db,uid),
      userRef(db,uid),
      applicationRefs.get(uid),
      noteRef(db,uid),auditRef(db,uid)
    ]);
    const snapshots=await Promise.all([...base,...refs].map(r=>tx.get(r)));
    const [realCase,batchState,singleState]=snapshots;
    if(!realCase.exists||!recognizedStagingCase(realCase.data(),CASE_ID)||
       !["validated","assigned"].includes(realCase.data().status)||
       realCase.data().verificationStatus!=="validated"||
       realCase.data().dispatchBlocked===true||batchState.exists||singleState.exists)
      return fail("case_state_changed");
    const live={...realCase.data(),id:CASE_ID};
    const changes=[];
    for(let i=0;i<targets.length;i++){
      const uid=targets[i],offset=3+i*7;
      const [a,reservation,lock,user,application,notice,audit]=snapshots.slice(offset,offset+7);
      if(a.exists||reservation.exists||lock.exists||notice.exists||audit.exists||
         !user.exists||!application.exists)
        return fail("candidate_busy_or_conflicting_records");
      const valid=validateVolunteer(live,{
        uid,user:user.data(),application:application.data()
      },{knownBarangays:known,neighborsByBarangay:neighbors,
        activeAssignments:busy.docs.map(d=>d.data())});
      if(!valid.eligible||valid.wave!==plan.wave)
        return fail("candidate_no_longer_eligible");
      changes.push({uid,name:String(user.data().fullName||
        application.data().fullName||"Volunteer").slice(0,120)});
    }
    const stamp=FieldValue.serverTimestamp();
    const expiry=Timestamp.fromMillis(expiresAtMs);
    tx.create(batchRef(db),{caseId:CASE_ID,status:"waiting",
      wave:plan.wave,volunteerCount:targets.length,
      expiresAtMs,createdAt:stamp,startedBy:adminUid,
      testOnly:true,origin:"staging_bulk_all_eligible_002"});
    for(const v of changes){
      const aid=CASE_ID+"_"+v.uid;
      tx.create(reserveRef(db,v.uid),{
        caseId:CASE_ID,assignmentId:aid,uid:v.uid,
        expiresAt:expiry,createdAt:stamp});
      tx.create(assignmentRef(db,v.uid),{
        caseId:CASE_ID,volunteerId:v.uid,volunteerName:v.name,
        caseTitle:live.title,status:"offered",createdBy:"automatic_matching_engine",
        offerMode:"staging_bulk_all_eligible",wave:plan.wave,
        expiresAtMs,createdAt:stamp,updatedAt:stamp});
      tx.create(noteRef(db,v.uid),{
        userId:v.uid,audience:"volunteer",type:"response_assignment",
        caseId:CASE_ID,assignmentId:aid,
        title:"Fictional Emergency Volunteer task offer",
        message:"This is a staging-only fictional response task. Accept or Decline within three minutes.",
        read:false,createdAt:stamp});
      tx.create(auditRef(db,v.uid),{
        action:"Automatic Staging Batch Volunteer Task Offered",
        caseId:CASE_ID,volunteerUid:v.uid,wave:plan.wave,
        performedBy:"automatic_matching_engine",timestamp:stamp});
    }
    tx.update(caseRef(db),{
      status:"assigned",
      autoVolunteerDispatch:{state:"waiting",wave:plan.wave,
        attemptedCount:targets.length,
        note:"Fictional staging bulk task offers sent; await independent acceptance",
        updatedAt:stamp},
      updatedAt:stamp});
    return {status:"offered",wave:plan.wave,offered:targets.length,
      expiresAtMs,fullWaveAtomic:true};
  });
}
async function getBatchOffer(db,uid,now=Date.now()){
  if(!uidOK(uid))return fail("invalid_volunteer");
  const [c,session,a]=await Promise.all([
    caseRef(db).get(),batchRef(db).get(),assignmentRef(db,uid).get()]);
  if(!c.exists||!recognizedStagingCase(c.data(),CASE_ID)||
     !session.exists||!a.exists)return {status:"not_offered"};
  const assignment=a.data()||{};
  if(assignment.volunteerId!==uid||
     assignment.offerMode!=="staging_bulk_all_eligible")
    return {status:"not_offered"};
  const expiresAtMs=Number(assignment.expiresAtMs||0);
  const active=assignment.status==="offered"&&session.data()?.status==="waiting"&&
    expiresAtMs>now;
  return {status:active?"offered":
    assignment.status==="offered"?"expired":String(assignment.status||"unavailable"),
    caseId:CASE_ID,caseTitle:c.data().title,
    expiresAt:expiresAtMs>0?new Date(expiresAtMs).toISOString():null,
    canRespond:active};
}
async function respondBatchOffer(db,uid,decision,now=Date.now()){
  if(!uidOK(uid)||!["accepted","declined"].includes(decision))
    return fail("invalid_volunteer_or_decision");
  return db.runTransaction(async tx=>{
    const refs=[caseRef(db),batchRef(db),assignmentRef(db,uid),
      reserveRef(db,uid),lockRef(db,uid)];
    const [c,s,a,reservation,lock]=await Promise.all(refs.map(r=>tx.get(r)));
    if(!c.exists||!recognizedStagingCase(c.data(),CASE_ID)||
       !s.exists||!a.exists)return fail("no_fictional_task");
    const task=a.data()||{},session=s.data()||{};
    if(task.volunteerId!==uid||task.caseId!==CASE_ID||
       task.offerMode!=="staging_bulk_all_eligible")
      return fail("not_your_offer");
    if(task.status===decision)return {status:"already_"+decision};
    if(task.status!=="offered"||session.status!=="waiting")
      return fail("not_pending");
    if(!Number.isFinite(Number(task.expiresAtMs))||
       Number(task.expiresAtMs)<=now)return fail("offer_expired");
    if(!reservation.exists||
       reservation.data()?.assignmentId!==CASE_ID+"_"+uid||lock.exists)
      return fail("reservation_or_lock_conflict");
    const stamp=FieldValue.serverTimestamp();
    tx.update(assignmentRef(db,uid),{status:decision,updatedAt:stamp});
    if(decision==="accepted"){
      tx.create(lockRef(db,uid),{caseId:CASE_ID,responderUid:uid,
        assignmentId:CASE_ID+"_"+uid,status:"accepted",updatedAt:stamp});
      const reporter=c.data().reporterUid;
      if(uidOK(reporter)&&reporter!==uid){
        tx.create(db.collection("notifications").doc("auto_batch_accepted_"+CASE_ID+"_"+uid),{
          userId:reporter,audience:"resident",type:"resident_response_update",
          caseId:CASE_ID,assignmentId:CASE_ID+"_"+uid,responderId:uid,
          title:"A staging test Volunteer accepted",
          message:"An eligible test Volunteer accepted the fictional emergency support task.",
          status:"accepted",read:false,createdAt:stamp
        });
      }
    }else{
      tx.delete(reserveRef(db,uid));
      const admin=c.data().validatedBy;
      if(uidOK(admin)&&admin!==uid){
        tx.create(db.collection("notifications").doc("auto_batch_declined_"+CASE_ID+"_"+uid),{
          userId:admin,audience:"admin",type:"emergency_dispatch_escalation",
          caseId:CASE_ID,assignmentId:CASE_ID+"_"+uid,
          title:"Staging Volunteer declined",
          message:"A fictional batch Volunteer task was declined.",
          read:false,createdAt:stamp});
      }
    }
    tx.create(db.collection("adminActivityLogs").doc("auto_batch_decision_"+CASE_ID+"_"+uid),{
      caseId:CASE_ID,volunteerUid:uid,
      action:decision==="accepted"?
        "Synthetic Bulk Volunteer Accepted":"Synthetic Bulk Volunteer Declined",
      performedBy:"staging_volunteer",timestamp:stamp});
    return {status:decision,caseId:CASE_ID};
  });
}
async function batchStatus(db){
  const [session,all]=await Promise.all([
    batchRef(db).get(),
    db.collection("responseAssignments").where("caseId","==",CASE_ID).limit(201).get()
  ]);
  if(!session.exists)return {status:"not_started",offered:0,pending:0,accepted:0,declined:0};
  const rows=all.docs.map(d=>d.data()).filter(a=>a.offerMode==="staging_bulk_all_eligible");
  return {status:session.data().status,wave:session.data().wave,
    offered:rows.length,pending:rows.filter(a=>a.status==="offered").length,
    accepted:rows.filter(a=>["accepted","responding","on_site","completed"].includes(a.status)).length,
    declined:rows.filter(a=>a.status==="declined").length};
}
module.exports={startBatchOffers,getBatchOffer,respondBatchOffer,batchStatus};
