"use strict";
/**
 * DRAFT PHASE 5: local real-Firestore emulator only. Test fixtures never use
 * production credentials, project, reports, Volunteer accounts or URLs.
 *
 * The relevant manual Admin test transaction uses the SAME shared pure
 * manualOfferConflictReason() imported by the actual reviewed Admin UI.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {manualOfferConflictReason,volunteerTransitionConflictReason}
 =require("../lib/emergencyVolunteerWinnerGuard");
const {proposeAutoVolunteerDecision,ASSIGNMENT_MODE}
 =require("./autoVolunteerAtomicDecisionPolicy");
const PROJECT="demo-volunserve-auto-phase4";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080" ||
  process.env.GCLOUD_PROJECT!==PROJECT ||
  (process.env.GOOGLE_CLOUD_PROJECT &&
    process.env.GOOGLE_CLOUD_PROJECT!==PROJECT) ||
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    throw Error("REFUSE nonlocal credentials or non-demo Firestore");
const app=initializeApp({projectId:PROJECT},"phase5_compat_emulator");
const db=getFirestore(app),NOW=Date.now();
const env={VOLUNSERVE_AUTO_VOLUNTEER_DECISION_REVIEW:"enabled",
 VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH:"disabled"};
const caseRef=id=>db.collection("disasterCases").doc(id);
const assignmentRef=(id,uid)=>db.collection("responseAssignments").doc(id+"_"+uid);
const userRef=uid=>db.collection("users").doc(uid);
const appRef=uid=>db.collection("volunteerApplications").doc(uid);
const reserveRef=uid=>db.collection("autoVolunteerReservations").doc(uid);
const lockRef=uid=>db.collection("responderLocks").doc(uid);
const active=new Set(["offered","accepted","responding","on_site"]);
async function seed(name){
 const caseId="phase5_"+name,autoUid="auto_"+name,manualUid="manual_"+name;
 const batch=db.batch();
 batch.set(caseRef(caseId),{id:caseId,status:"assigned",
  verificationStatus:"validated",reporterUid:"test_reporter",
  incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"]});
 for(const uid of [autoUid,manualUid]){
  batch.set(userRef(uid),{uid,role:"resident",status:"approved",
   volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
   skills:["First Aid"],barangay:"Bagong Buhay I"});
  batch.set(appRef(uid),{uid,status:"approved",skills:["First Aid"]});
 }
 batch.set(assignmentRef(caseId,autoUid),{
  caseId,volunteerId:autoUid,offerMode:ASSIGNMENT_MODE,
  status:"offered",expiresAtMs:NOW+3600000});
 batch.set(reserveRef(autoUid),{uid:autoUid,
  caseId,assignmentId:caseId+"_"+autoUid});
 await batch.commit();
 return {caseId,autoUid,manualUid};
}
async function proposedAccept(caseId,uid){
 const aRef=assignmentRef(caseId,uid);
 return db.runTransaction(async tx=>{
  const [c,a,user,ap,res,lock,others]=await Promise.all([
   tx.get(caseRef(caseId)),tx.get(aRef),tx.get(userRef(uid)),
   tx.get(appRef(uid)),tx.get(reserveRef(uid)),tx.get(lockRef(uid)),
   tx.get(db.collection("responseAssignments")
     .where("volunteerId","==",uid).limit(201))
  ]);
  if(!c.exists||!a.exists||!user.exists||!ap.exists)return "blocked";
  const clear=others.size<=200 && !others.docs.some(d=>d.id!==aRef.id&&
    active.has(String(d.data()?.status||"").toLowerCase()));
  const p=proposeAutoVolunteerDecision({
   env,caseData:{...c.data(),id:caseId},
   assignment:{...a.data(),id:aRef.id},
   volunteer:{...user.data(),uid},application:ap.data(),
   reservation:res.exists?res.data():null,lock:lock.exists?lock.data():null,
   now:NOW,decision:"accepted",verifiedNoOtherActiveAssignments:clear
  });
  if(p.status!=="proposed_only")return p.status;
  tx.update(aRef,{status:"accepted",updatedAt:FieldValue.serverTimestamp()});
  tx.update(caseRef(caseId),{
   autoVolunteerAcceptedAssignmentId:aRef.id,
   activeVolunteerSupportAssignmentId:aRef.id,
   activeVolunteerSupportUid:uid,
   updatedAt:FieldValue.serverTimestamp()
  });
  tx.create(lockRef(uid),{
   caseId,assignmentId:aRef.id,responderUid:uid,status:"accepted",
   updatedAt:FieldValue.serverTimestamp()
  });
  return "committed_accepted";
 },{maxAttempts:7});
}
async function patchedManualOffer(caseId,uid){
 return db.runTransaction(async tx=>{
  const cRef=caseRef(caseId),aRef=assignmentRef(caseId,uid);
  const [c,user,a,lock]=await Promise.all([
   tx.get(cRef),tx.get(userRef(uid)),tx.get(aRef),tx.get(lockRef(uid))
  ]);
  if(!c.exists||!user.exists||a.exists||lock.exists)return "blocked";
  const caseData=c.data();
  if(caseData.verificationStatus!=="validated"||
   !["validated","assigned","in_progress"].includes(caseData.status))
   return "blocked";
  // EXACT same guard used by review-branch Admin UI, INSIDE the transaction.
  if(manualOfferConflictReason(caseData,aRef.id,uid))return "blocked";
  tx.create(aRef,{caseId,volunteerId:uid,status:"offered",
   volunteerName:"FICTIONAL manual",createdAt:FieldValue.serverTimestamp()});
  tx.update(cRef,{
   activeVolunteerSupportUid:uid,
   activeVolunteerSupportAssignmentId:aRef.id,
   updatedAt:FieldValue.serverTimestamp()
  });
  return "manual_offer_created";
 },{maxAttempts:7});
}
async function legacyClientAcceptance(caseId,uid,mode){
 const aRef=assignmentRef(caseId,uid);
 return db.runTransaction(async tx=>{
  const [a,c]=await Promise.all([tx.get(aRef),tx.get(caseRef(caseId))]);
  if(!a.exists||a.data().status!=="offered")return "blocked";
  const reason=volunteerTransitionConflictReason(
   c.exists?c.data():null,
   {id:aRef.id,volunteerId:uid,offerMode:mode},"accepted");
  if(reason)return "blocked";
  tx.update(aRef,{status:"accepted",updatedAt:FieldValue.serverTimestamp()});
  return "client_manual_accepted";
 },{maxAttempts:7});
}
test("AFTER accepted automatic responder, patched manual Admin cannot overwrite case pointer",async()=>{
 const {caseId,autoUid,manualUid}=await seed("manual_after_auto");
 assert.equal(await proposedAccept(caseId,autoUid),"committed_accepted");
 assert.equal(await patchedManualOffer(caseId,manualUid),"blocked");
 const c=(await caseRef(caseId).get()).data();
 assert.equal(c.autoVolunteerAcceptedAssignmentId,caseId+"_"+autoUid);
 assert.equal(c.activeVolunteerSupportAssignmentId,caseId+"_"+autoUid);
 assert.equal(c.activeVolunteerSupportUid,autoUid);
 assert.equal((await assignmentRef(caseId,manualUid).get()).exists,false);
 assert.equal((await lockRef(autoUid).get()).exists,true);
});
test("real concurrent manual Admin offer and automatic Accept share ONE case pointer",async()=>{
 const {caseId,autoUid,manualUid}=await seed("actual_race");
 const results=await Promise.all([
   proposedAccept(caseId,autoUid),patchedManualOffer(caseId,manualUid)
 ]);
 const success=results.filter(x=>["committed_accepted","manual_offer_created"].includes(x));
 assert.equal(success.length,1,JSON.stringify(results));
 const c=(await caseRef(caseId).get()).data();
 const autoAccepted=(await assignmentRef(caseId,autoUid).get()).data().status==="accepted";
 if(autoAccepted){
  assert.equal(c.autoVolunteerAcceptedAssignmentId,caseId+"_"+autoUid);
  assert.equal(c.activeVolunteerSupportAssignmentId,caseId+"_"+autoUid);
  assert.equal((await assignmentRef(caseId,manualUid).get()).exists,false);
 }else{
  assert.equal(c.activeVolunteerSupportAssignmentId,caseId+"_"+manualUid);
  assert.equal(c.autoVolunteerAcceptedAssignmentId,undefined);
  assert.equal((await lockRef(autoUid).get()).exists,false);
 }
});
test("legacy manual Volunteer Accept succeeds with matching case pointer; stale competing offer blocked",async()=>{
 const {caseId,manualUid,autoUid}=await seed("client_guard");
 assert.equal(await patchedManualOffer(caseId,manualUid),"manual_offer_created");
 assert.equal(await legacyClientAcceptance(caseId,manualUid),"client_manual_accepted");
 assert.equal(await legacyClientAcceptance(caseId,autoUid,ASSIGNMENT_MODE),"blocked");
 assert.equal((await assignmentRef(caseId,autoUid).get()).data().status,"offered");
});
test("automatic client Accept without server mediation blocked even with no case winner",async()=>{
 const {caseId,autoUid}=await seed("auto_client_guard");
 assert.equal(await legacyClientAcceptance(caseId,autoUid,ASSIGNMENT_MODE),"blocked");
 assert.equal((await assignmentRef(caseId,autoUid).get()).data().status,"offered");
 assert.equal((await caseRef(caseId).get()).data().activeVolunteerSupportUid,undefined);
});
test.after(async()=>{await deleteApp(app)});
