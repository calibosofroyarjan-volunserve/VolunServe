"use strict";
/**
 * Fixed fictional staging case 002 only: wave advancement.
 * Never imported by production. No official emergency dispatch.
 * A single Firestore transaction expires old outstanding offers and issues
 * every eligible offer in the next verified geographic wave.
 *
 * May be called by a gated staging timer. Free Render sleep means this
 * is NOT an always-on production scheduler.
 */
const {FieldValue}=require("./firebaseAdmin");
const {Timestamp}=require("firebase-admin/firestore");
const {chooseAllEligibleWave}=require("../functions/emergencyAllEligibleWavePlanner");
const {validateVolunteer}=require("../functions/emergencyVolunteerWavePlanner");
const {E2E_CASE_ID,recognizedStagingCase}=require("./stagingVolunteerTask");
const barangays=require("../functions/sjdmBarangays.json");
const CASE_ID=E2E_CASE_ID,ACTIVE=["offered","accepted","responding","on_site"];
const uidOK=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
const blocked=reason=>({status:"blocked",reason});
const incidentRef=db=>db.collection("disasterCases").doc(CASE_ID);
const sessionRef=db=>db.collection("emergencyAutoDispatchBatches").doc(CASE_ID);
const assignmentRef=(db,uid)=>db.collection("responseAssignments").doc(CASE_ID+"_"+uid);
const reservationRef=(db,uid)=>db.collection("autoVolunteerReservations").doc(uid);
const lockRef=(db,uid)=>db.collection("responderLocks").doc(uid);
const noteRef=(db,uid)=>db.collection("notifications").doc("auto_response_"+CASE_ID+"_"+uid);
const auditRef=(db,uid)=>db.collection("adminActivityLogs").doc("auto_offer_"+CASE_ID+"_"+uid);
const expiresInMs=180000;

function safeNeighborConfig(settings){
  if(settings.enabled!==true||settings.approved!==true||
     !settings.neighborsByBarangay||typeof settings.neighborsByBarangay!=="object")return {};
  const names=new Set(barangays.map(s=>String(s).toLowerCase()));
  const entries=Object.entries(settings.neighborsByBarangay);
  if(!entries.every(([key,values])=>names.has(String(key).toLowerCase())&&
      Array.isArray(values)&&values.every(v=>names.has(String(v).toLowerCase()))))
    return {};
  return Object.fromEntries(entries);
}
async function advanceBatchWave(db,now=Date.now()){
  if(!Number.isSafeInteger(now)||now<0)return blocked("invalid_clock");
  const [c,s,assignments,apps,busy,settingsSnap,legacy]=await Promise.all([
    incidentRef(db).get(),sessionRef(db).get(),
    db.collection("responseAssignments").where("caseId","==",CASE_ID).limit(201).get(),
    db.collection("volunteerApplications").where("status","==","approved").limit(201).get(),
    db.collection("responseAssignments").where("status","in",ACTIVE).limit(201).get(),
    db.collection("systemSettings").doc("emergencyVolunteerMatching").get(),
    db.collection("emergencyAutoDispatch").doc(CASE_ID).get()
  ]);
  if(!c.exists||!recognizedStagingCase(c.data(),CASE_ID)||!s.exists||
    s.data()?.testOnly!==true||
    s.data()?.origin!=="staging_bulk_all_eligible_002")
    return blocked("not_isolated_batch_002");
  if(s.data()?.status!=="waiting")
    return {status:String(s.data()?.status||"not_waiting"),wave:s.data()?.wave||0};
  if(!["assigned","validated"].includes(c.data()?.status)||
    c.data()?.verificationStatus!=="validated"||
    c.data()?.dispatchBlocked===true||legacy.exists||
    c.data()?.activeVolunteerSupportAssignmentId)
    return blocked("case_no_longer_dispatchable");
  if(assignments.size>200||apps.size>200||busy.size>200)
    return blocked("staging_pool_limit");
  const offers=assignments.docs.filter(d=>d.data()?.offerMode==="staging_bulk_all_eligible");
  if(!offers.length)return blocked("missing_original_test_wave");
  if(assignments.docs.some(d=>d.data()?.offerMode!=="staging_bulk_all_eligible"))
    return blocked("mixed_assignment_models");
  if(offers.some(d=>["accepted","responding","on_site","completed"].includes(d.data()?.status)))
    return {status:"supported",accepted:offers.filter(d=>
      ["accepted","responding","on_site","completed"].includes(d.data()?.status)).length};
  const pending=offers.filter(d=>d.data()?.status==="offered"&&
    Number(d.data()?.expiresAtMs||0)>now);
  if(pending.length)return {status:"waiting",pending:pending.length,
    wave:s.data().wave};
  const attempted=offers.map(d=>d.data().volunteerId).filter(uidOK);
  const completedWaves=[...new Set([...(s.data()?.completedWaves||[]),s.data()?.wave]
    .map(Number).filter(x=>[1,2,3].includes(x)))];
  const roster=await Promise.all(apps.docs.map(async app=>{
    const application=app.data()||{};
    const uid=String(application.uid||application.userId||application.volunteerId||app.id);
    if(!uidOK(uid))return null;
    const user=await db.collection("users").doc(uid).get();
    return {uid,application,applicationRef:app.ref,
      user:user.exists?user.data()||{}:{}};
  }));
  const incident={id:CASE_ID,...c.data()};
  const activeAssignments=busy.docs.map(d=>d.data());
  const plan=chooseAllEligibleWave(incident,roster.filter(Boolean),{
    knownBarangays:barangays,
    neighborsByBarangay:safeNeighborConfig(settingsSnap.exists?settingsSnap.data()||{}:{}),
    activeAssignments,attemptedVolunteerIds:attempted,completedWaves
  });
  const next=plan.action==="offer_all"?plan.volunteers:[];
  if(next.length>40)return blocked("fanout_exceeds_single_atomic_wave_limit");
  const byUid=new Map(roster.filter(Boolean).map(x=>[x.uid,x]));
  const expireRefs=offers.filter(d=>d.data()?.status==="offered").map(d=>({
    ref:d.ref,uid:d.data().volunteerId,
    reservation:reservationRef(db,d.data().volunteerId)
  }));
  // Do not move a case to another wave while an older accepted responder
  // or a later valid pending offer exists. Re-read the entire offer set
  // inside the transaction to serialize racing Accept/Decline actions.
  return db.runTransaction(async tx=>{
    const base=[incidentRef(db),sessionRef(db),
      db.collection("emergencyAutoDispatch").doc(CASE_ID)];
    const oldRefs=offers.map(d=>d.ref);
    const reservationRefs=expireRefs.map(d=>d.reservation);
    const newRefs=next.flatMap(uid=>{
      const user=byUid.get(uid);
      return [assignmentRef(db,uid),reservationRef(db,uid),
        lockRef(db,uid),db.collection("users").doc(uid),
        user.applicationRef,noteRef(db,uid),auditRef(db,uid)];
    });
    const snaps=await Promise.all([...base,...oldRefs,...reservationRefs,...newRefs]
      .map(ref=>tx.get(ref)));
    const [caseNow,sessionNow,legacyNow]=snaps;
    if(!caseNow.exists||!recognizedStagingCase(caseNow.data(),CASE_ID)||
       !sessionNow.exists||sessionNow.data()?.status!=="waiting"||
       sessionNow.data()?.wave!==s.data().wave||legacyNow.exists||
       caseNow.data()?.activeVolunteerSupportAssignmentId||
       caseNow.data()?.verificationStatus!=="validated")
      return blocked("case_or_wave_changed");
    const old=snaps.slice(3,3+oldRefs.length);
    if(old.some(d=>!d.exists||["accepted","responding","on_site","completed"]
      .includes(d.data()?.status)))return {status:"supported_or_changed"};
    if(old.some(d=>d.data()?.status==="offered"&&
      Number(d.data()?.expiresAtMs||0)>now))return {status:"waiting"};
    for(let i=0;i<expireRefs.length;i++){
      const reservation=snaps[3+oldRefs.length+i];
      if(reservation.exists&&reservation.data()?.assignmentId!==CASE_ID+"_"+expireRefs[i].uid)
        return blocked("reservation_owned_by_other_case");
    }
    const newIndex=3+oldRefs.length+reservationRefs.length;
    const confirmed=[];
    const settings=settingsSnap.exists?settingsSnap.data()||{}:{};
    const neighbors=safeNeighborConfig(settings);
    for(let i=0;i<next.length;i++){
      const uid=next[i],at=newIndex+i*7;
      const [a,r,lock,u,application,note,audit]=snaps.slice(at,at+7);
      if(a.exists||r.exists||lock.exists||!u.exists||!application.exists||
         note.exists||audit.exists)return blocked("candidate_conflict");
      const eligibility=validateVolunteer(
        {id:CASE_ID,...caseNow.data()},
        {uid,user:u.data(),application:application.data()},
        {knownBarangays:barangays,neighborsByBarangay:neighbors,activeAssignments});
      if(!eligibility.eligible||eligibility.wave!==plan.wave)
        return blocked("candidate_no_longer_eligible");
      confirmed.push({uid,name:String(u.data().fullName||
        application.data().fullName||"Volunteer").slice(0,120)});
    }
    const stamp=FieldValue.serverTimestamp();
    for(let i=0;i<offers.length;i++){
      if(old[i].data()?.status!=="offered")continue;
      tx.update(oldRefs[i],{status:"expired",updatedAt:stamp});
    }
    for(let i=0;i<expireRefs.length;i++){
      if(snaps[3+oldRefs.length+i].exists)tx.delete(expireRefs[i].reservation);
    }
    if(!confirmed.length){
      tx.update(sessionRef(db),{
        status:"exhausted",completedWaves,updatedAt:stamp});
      tx.update(incidentRef(db),{status:"validated",
        autoVolunteerDispatch:{
          state:"needs_admin_review",wave:s.data().wave,
          attemptedCount:attempted.length,updatedAt:stamp,
          note:"Fictional staging matching exhausted. No active responder; review manually."
        },updatedAt:stamp});
      return {status:"exhausted",expired:expireRefs.length,
        attempted:attempted.length};
    }
    const expiresAtMs=now+expiresInMs;
    tx.update(sessionRef(db),{
      status:"waiting",wave:plan.wave,volunteerCount:confirmed.length,
      expiresAtMs,completedWaves,updatedAt:stamp});
    for(const t of confirmed){
      const id=CASE_ID+"_"+t.uid;
      tx.create(reservationRef(db,t.uid),{caseId:CASE_ID,
        assignmentId:id,uid:t.uid,
        expiresAt:Timestamp.fromMillis(expiresAtMs),createdAt:stamp});
      tx.create(assignmentRef(db,t.uid),{
        caseId:CASE_ID,volunteerId:t.uid,volunteerName:t.name,
        caseTitle:caseNow.data().title,status:"offered",
        createdBy:"automatic_matching_engine",offerMode:"staging_bulk_all_eligible",
        wave:plan.wave,expiresAtMs,createdAt:stamp,updatedAt:stamp});
      tx.create(noteRef(db,t.uid),{
        userId:t.uid,audience:"volunteer",type:"response_assignment",
        caseId:CASE_ID,assignmentId:id,
        title:"Fictional Emergency Volunteer task offer",
        message:"Staging-only fictional response task. Accept or Decline within three minutes.",
        read:false,createdAt:stamp});
      tx.create(auditRef(db,t.uid),{
        action:"Automatic Staging Batch Volunteer Task Offered",
        caseId:CASE_ID,volunteerUid:t.uid,wave:plan.wave,
        performedBy:"automatic_matching_engine",timestamp:stamp});
    }
    tx.update(incidentRef(db),{
      status:"assigned",autoVolunteerDispatch:{
        state:"waiting",wave:plan.wave,
        attemptedCount:attempted.length+confirmed.length,
        note:"Staging-only automatic next geographic wave",
        updatedAt:stamp},updatedAt:stamp});
    return {status:"offered",wave:plan.wave,offered:confirmed.length,
      expired:expireRefs.length,fullWaveAtomic:true,expiresAtMs};
  });
}
module.exports={advanceBatchWave,safeNeighborConfig};
