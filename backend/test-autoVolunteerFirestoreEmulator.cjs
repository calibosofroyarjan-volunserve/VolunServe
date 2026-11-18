"use strict";
/**
 * FIRESTORE EMULATOR ONLY. No production runtime imports this module.
 * Reproduces the PROPOSED Phase 3 per-case atomic decision policy inside a
 * REAL local Firestore transaction. This is not an approved write adapter.
 *
 * The existing Admin manual offer and Volunteer Web/Mobile client paths are
 * NOT updated by these tests; known conflicts are tested and kept as NO-GO.
 *
 * Run only with FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and a demo- project.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {proposeAutoVolunteerDecision,ASSIGNMENT_MODE}=
  require("./autoVolunteerAtomicDecisionPolicy");
const PROJECT="demo-volunserve-auto-phase4";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
  process.env.GCLOUD_PROJECT!==PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT&&process.env.GOOGLE_CLOUD_PROJECT!==PROJECT ||
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON){
  throw Error("LOCAL EMULATOR ONLY: refuse any non-demo project or credentials");
}
const app=initializeApp({projectId:PROJECT},"phase4_emulator_only");
const db=getFirestore(app);
const NOW=Date.now();
const env={VOLUNSERVE_AUTO_VOLUNTEER_DECISION_REVIEW:"enabled",
  VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"};
const active=new Set(["offered","accepted","responding","on_site"]);
function refs(caseId,uid){
  const aid=caseId+"_"+uid;
  return {
    aid,
    caseRef:db.collection("disasterCases").doc(caseId),
    offerRef:db.collection("responseAssignments").doc(aid),
    userRef:db.collection("users").doc(uid),
    appRef:db.collection("volunteerApplications").doc(uid),
    reserveRef:db.collection("autoVolunteerReservations").doc(uid),
    lockRef:db.collection("responderLocks").doc(uid)
  };
}
async function seed(name,users=["a","b"],override={}){
  const caseId="phase4_"+name;
  const batch=db.batch();
  const c={id:caseId,status:"assigned",verificationStatus:"validated",
    reporterUid:"qa_reporter",incidentBarangay:"Bagong Buhay I",
    requiredSkills:["First Aid"],dispatchBlocked:false,...override};
  batch.set(db.collection("disasterCases").doc(caseId),c);
  for(const name of users){
    const uid="qa_"+name+"_"+caseId;
    const r=refs(caseId,uid);
    batch.set(r.userRef,{uid,status:"approved",role:"resident",
      volunteerAccess:true,volunteerStatus:"approved",
      identityVerified:true,barangay:"Bagong Buhay I",skills:["First Aid"]});
    batch.set(r.appRef,{uid,status:"approved",skills:["First Aid"]});
    batch.set(r.offerRef,{caseId,id:r.aid,volunteerId:uid,
      offerMode:ASSIGNMENT_MODE,status:"offered",expiresAtMs:NOW+3600000,
      volunteerName:"FICTIONAL QA ONLY",createdAt:FieldValue.serverTimestamp()});
    batch.set(r.reserveRef,{uid,caseId,assignmentId:r.aid});
  }
  await batch.commit();
  return {caseId,uids:users.map(u=>"qa_"+u+"_"+caseId)};
}
/**
 * Emulator-only transaction implementation, not deployable app code.
 * Every read occurs before writes. Read-set includes case, offer, user,
 * approved application, reservation, lock, and complete bounded other
 * assignments by volunteer. Firestore detects conflicting writes to case.
 */
async function proposedAcceptOrDecline(caseId,uid,decision="accepted"){
  const r=refs(caseId,uid);
  return db.runTransaction(async tx=>{
    const [c,a,u,application,reservation,lock,busy]=await Promise.all([
      tx.get(r.caseRef),tx.get(r.offerRef),tx.get(r.userRef),
      tx.get(r.appRef),tx.get(r.reserveRef),tx.get(r.lockRef),
      tx.get(db.collection("responseAssignments")
        .where("volunteerId","==",uid).limit(201))
    ]);
    if(!c.exists||!a.exists||!u.exists||!application.exists)
      return "blocked_missing_source";
    const checked=busy.size<=200 &&
      !busy.docs.some(s=>s.id!==r.aid &&
        active.has(String(s.data()?.status||"").toLowerCase()));
    const decisionResult=proposeAutoVolunteerDecision({
      env,caseData:{...c.data(),id:caseId},
      assignment:{...a.data(),id:r.aid},
      volunteer:{...u.data(),uid},
      application:application.data(),
      reservation:reservation.exists?reservation.data():null,
      lock:lock.exists?lock.data():null,
      decision,now:NOW,verifiedNoOtherActiveAssignments:checked
    });
    if(decisionResult.status!=="proposed_only")return decisionResult.status;
    // Test only; all writes in a single emulator transaction.
    for(const write of decisionResult.logicalWriteIntents){
      if(write.kind==="assignment_update"){
        tx.update(r.offerRef,{status:write.status,
          updatedAt:FieldValue.serverTimestamp()});
      }else if(write.kind==="case_winner_update"){
        tx.update(r.caseRef,{
          autoVolunteerAcceptedAssignmentId:write.autoVolunteerAcceptedAssignmentId,
          activeVolunteerSupportUid:write.activeVolunteerSupportUid,
          activeVolunteerSupportAssignmentId:write.activeVolunteerSupportAssignmentId,
          updatedAt:FieldValue.serverTimestamp()
        });
      }else if(write.kind==="responder_lock_create"){
        tx.create(r.lockRef,{responderUid:uid,caseId,
          assignmentId:r.aid,status:"accepted",
          updatedAt:FieldValue.serverTimestamp()});
      }else if(write.kind==="reservation_delete"){
        tx.delete(r.reserveRef);
      }else throw Error("Unknown test-only logical write");
    }
    return "committed_"+decision;
  },{maxAttempts:7});
}
/**
 * Deliberate minimum reproduction of the ACTUAL PRODUCTION manual Admin path:
 * it reads case, volunteer, assignment and lock, and sets the case active
 * pointers on OFFER, but DOES NOT check autoVolunteerAcceptedAssignmentId or
 * preexisting activeVolunteerSupportAssignmentId.
 *
 * This mirrors the relevant business invariant from the real app source;
 * it is not a verbatim bundled UI copy nor an authorization test.
 */
async function legacyManualOfferReproduction(caseId,uid){
  const r=refs(caseId,uid);
  return db.runTransaction(async tx=>{
    const [c,u,a,lock]=await Promise.all([
      tx.get(r.caseRef),tx.get(r.userRef),tx.get(r.offerRef),tx.get(r.lockRef)
    ]);
    if(!c.exists||!u.exists||a.exists||lock.exists)return "blocked";
    const value=c.data()||{};
    if(value.verificationStatus!=="validated"||
      !["validated","assigned","in_progress"].includes(value.status))
      return "blocked";
    tx.create(r.offerRef,{caseId,volunteerId:uid,volunteerName:"FICTIONAL manual",
      status:"offered",createdAt:FieldValue.serverTimestamp()});
    tx.update(r.caseRef,{
      activeVolunteerSupportUid:uid,
      activeVolunteerSupportAssignmentId:r.aid,
      updatedAt:FieldValue.serverTimestamp()
    });
    return "manual_offer_created";
  },{maxAttempts:7});
}
test("actual Firestore: two independent concurrent Accepts yield one winner/lock",async()=>{
  const {caseId,uids}=await seed("parallel_accept");
  const results=await Promise.all(uids.map(u=>proposedAcceptOrDecline(caseId,u)));
  assert.equal(results.filter(x=>x==="committed_accepted").length,1,JSON.stringify(results));
  const c=(await refs(caseId,uids[0]).caseRef.get()).data();
  const winner=uids.find(u=>c.activeVolunteerSupportUid===u);
  assert.ok(winner);
  assert.equal(c.activeVolunteerSupportAssignmentId,caseId+"_"+winner);
  assert.equal(c.autoVolunteerAcceptedAssignmentId,caseId+"_"+winner);
  const items=await Promise.all(uids.map(async uid=>{
    const r=refs(caseId,uid);
    const [a,l]=await Promise.all([r.offerRef.get(),r.lockRef.get()]);
    return {uid,status:a.data().status,locked:l.exists};
  }));
  assert.equal(items.filter(x=>x.status==="accepted").length,1);
  assert.equal(items.filter(x=>x.locked).length,1);
  assert.equal(items.find(x=>x.locked).uid,winner);
});
test("actual Firestore: repeated Accept for same Volunteer is idempotent",async()=>{
  const {caseId,uids:[uid]}=await seed("repeat_accept",["a"]);
  const statuses=await Promise.all([
    proposedAcceptOrDecline(caseId,uid),
    proposedAcceptOrDecline(caseId,uid)
  ]);
  assert.equal(statuses.filter(s=>s==="committed_accepted").length,1);
  assert.equal(statuses.filter(s=>s==="already_accepted").length,1);
  const r=refs(caseId,uid);
  assert.equal((await r.offerRef.get()).data().status,"accepted");
  assert.equal((await r.lockRef.get()).data().assignmentId,r.aid);
});
test("actual Firestore: declined offer releases reservation but no case winner",async()=>{
  const {caseId,uids:[uid]}=await seed("decline",["a"]);
  assert.equal(await proposedAcceptOrDecline(caseId,uid,"declined"),"committed_declined");
  const r=refs(caseId,uid);
  const [caseSnap,a,lock,reserve]=await Promise.all([
    r.caseRef.get(),r.offerRef.get(),r.lockRef.get(),r.reserveRef.get()
  ]);
  assert.equal(a.data().status,"declined");
  assert.equal(lock.exists,false);
  assert.equal(reserve.exists,false);
  assert.equal(caseSnap.data().activeVolunteerSupportUid,undefined);
});
test("actual Firestore: existing MANUAL case pointer blocks new auto acceptance",async()=>{
  const {caseId,uids:[uid]}=await seed("manual_first",["a"],{
    activeVolunteerSupportUid:"manual_existing",
    activeVolunteerSupportAssignmentId:"manual_existing_offer"});
  assert.equal(await proposedAcceptOrDecline(caseId,uid),"blocked");
  assert.equal((await refs(caseId,uid).offerRef.get()).data().status,"offered");
  assert.equal((await refs(caseId,uid).lockRef.get()).exists,false);
});
test("actual Firestore: expired offer cannot accept even if all other data valid",async()=>{
  const {caseId,uids:[uid]}=await seed("expired",["a"]);
  const r=refs(caseId,uid);
  await r.offerRef.update({expiresAtMs:NOW-1000});
  assert.equal(await proposedAcceptOrDecline(caseId,uid),"blocked");
  assert.equal((await r.lockRef.get()).exists,false);
});
test("actual Firestore: user revocation before decision stops acceptance",async()=>{
  const {caseId,uids:[uid]}=await seed("revoke",["a"]);
  const r=refs(caseId,uid);
  await r.userRef.update({status:"suspended"});
  assert.equal(await proposedAcceptOrDecline(caseId,uid),"blocked");
  assert.equal((await r.offerRef.get()).data().status,"offered");
  assert.equal((await r.lockRef.get()).exists,false);
});
test("actual Firestore: another active response for same Volunteer blocks acceptance",async()=>{
  const {caseId,uids:[uid]}=await seed("busy_other",["a"]);
  await db.collection("responseAssignments").doc("other_incident_"+uid)
    .set({caseId:"other_incident",volunteerId:uid,status:"accepted"});
  assert.equal(await proposedAcceptOrDecline(caseId,uid),"blocked");
  assert.equal((await refs(caseId,uid).lockRef.get()).exists,false);
});
test("KNOWN P0 INCOMPATIBILITY: existing manual Admin offer can overwrite automatic winner pointer",async()=>{
  const {caseId,uids:[autoUid]}=await seed("manual_after_auto",["a"]);
  assert.equal(await proposedAcceptOrDecline(caseId,autoUid),"committed_accepted");
  const manualUid="manual_"+caseId;
  await db.collection("users").doc(manualUid).set({
    uid:manualUid,role:"resident",status:"approved",identityVerified:true,
    barangay:"Bagong Buhay I",skills:["First Aid"]
  });
  // Existing manual flow does not read/guard existing active case pointer.
  const manualStatus=await legacyManualOfferReproduction(caseId,manualUid);
  assert.equal(manualStatus,"manual_offer_created");
  const c=(await refs(caseId,autoUid).caseRef.get()).data();
  assert.equal(c.autoVolunteerAcceptedAssignmentId,caseId+"_"+autoUid);
  assert.equal(c.activeVolunteerSupportAssignmentId,caseId+"_"+manualUid);
  assert.notEqual(c.activeVolunteerSupportAssignmentId,
    c.autoVolunteerAcceptedAssignmentId,
    "P0: legacy manual path overwrote the accepted case pointer");
  const lock=await refs(caseId,autoUid).lockRef.get();
  assert.equal(lock.exists,true,"accepted lock preserved while case pointer diverged");
  // Test PASS means a REAL blocker was reproduced, not that the system is safe.
});
test("source guards: emulator code is not imported by running production backend",()=>{
  const fs=require("node:fs");
  const path=require("node:path");
  const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  assert.ok(!server.includes("test-autoVolunteerFirestoreEmulator"));
  assert.ok(!server.includes("autoVolunteerAtomicDecisionPolicy"));
});
test.after(async()=>{await deleteApp(app)});
