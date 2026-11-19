"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {initializeTestEnvironment,assertFails,assertSucceeds}=
  require("@firebase/rules-unit-testing");
const {doc,setDoc,updateDoc,serverTimestamp}=require("firebase/firestore");
const {manualOfferConflictReason}=
  require("../lib/emergencyVolunteerWinnerGuard");
const {reconcileEmulatedAutomaticWave,persistentBatchRef}=
  require("./autoVolunteerPhase7WaveWorkerEmulator");
const {decideEmulatedAutomaticOffer}=
  require("./autoVolunteerPhase6EmulatorDecisionServer");
const {claimEmulatedDueWave,finishEmulatedLease,
  invokeEmulatedDueWave,leaseRef}=
  require("./autoVolunteerPhase8LeaseSchedulerEmulator");

const PROJECT="demo-volunserve-auto-phase4",NOW=Date.now(),OFFER_MS=180000;
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080" ||
   process.env.GCLOUD_PROJECT!==PROJECT ||
   (process.env.GOOGLE_CLOUD_PROJECT &&
    process.env.GOOGLE_CLOUD_PROJECT!==PROJECT) ||
   process.env.VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE!=="enabled" ||
   process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="enabled" ||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("Phase 8 must use ONLY isolated local demo Firestore Emulator");
const app=initializeApp({projectId:PROJECT},"phase8_emulator");
const db=getFirestore(app);
let rulesEnv;
test.before(async()=>{
  rulesEnv=await initializeTestEnvironment({
    projectId:PROJECT,firestore:{host:"127.0.0.1",port:8080,
      rules:fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8")}
  });
});
test.beforeEach(async()=>{
  const cleared=await fetch(
    "http://127.0.0.1:8080/emulator/v1/projects/"+
    PROJECT+"/databases/(default)/documents",{method:"DELETE"});
  assert.equal(cleared.ok,true,"NEVER clear anything except local demo emulator");
});
function ref(col,id){return db.collection(col).doc(id)}
function offer(caseId,uid){return ref("responseAssignments",caseId+"_"+uid)}
async function seed(tag,{same=2,outside=1,casePatch={}}={}){
 const caseId="phase8_"+tag,values=[],batch=db.batch();
 batch.set(ref("disasterCases",caseId),{
  id:caseId,title:"FICTIONAL case",status:"validated",
  verificationStatus:"validated",reporterUid:"test_reporter",
  incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
  dispatchBlocked:false,...casePatch
 });
 for(let i=0;i<same+outside;i++){
  const uid="volunteer_"+tag+"_"+i;
  values.push(uid);
  batch.set(ref("users",uid),{
   uid,role:"resident",status:"approved",
   volunteerAccess:true,volunteerStatus:"approved",
   identityVerified:true,skills:["First Aid"],barangay:i<same?
      "Bagong Buhay I":"Citrus"
  });
  batch.set(ref("volunteerApplications",uid),{
    uid,status:"approved",skills:["First Aid"]});
 }
 await batch.commit();
 return {caseId,uid:values[0],same:values.slice(0,same),
   outside:values.slice(same)};
}
async function patchedManualOffer(caseId,uid){
 return db.runTransaction(async tx=>{
   const cRef=ref("disasterCases",caseId),aRef=offer(caseId,uid);
   const [c,a,user]=await Promise.all([
     tx.get(cRef),tx.get(aRef),tx.get(ref("users",uid))
   ]);
   if(!c.exists||a.exists||!user.exists)return "blocked_missing";
   if(manualOfferConflictReason(c.data(),aRef.id,uid))
     return "blocked_pending_or_winner";
   tx.create(aRef,{caseId,volunteerId:uid,status:"offered"});
   tx.update(cRef,{activeVolunteerSupportUid:uid,
     activeVolunteerSupportAssignmentId:aRef.id});
   return "manual_created";
 },{maxAttempts:7});
}
const worker=(caseId,now=NOW)=>reconcileEmulatedAutomaticWave({
  db,caseId,now
});
test("manual guard refuses waiting wave BEFORE acceptance, but no-wave manual still allowed",async()=>{
 assert.match(manualOfferConflictReason({
   autoVolunteerDispatch:{state:"waiting",wave:1}
  },"case_a","a"),/pending/i);
 assert.equal(manualOfferConflictReason({
   autoVolunteerDispatch:{state:"needs_admin_review"}
  },"case_a","a"),null);
 assert.equal(manualOfferConflictReason({},"case_a","a"),null);
});
test("patched Admin transaction CANNOT create manual task during pending wave",async()=>{
 const x=await seed("blocked_manual",{same:1,outside:1});
 assert.equal((await worker(x.caseId)).status,"offered");
 const other="manual_emergency";
 await ref("users",other).set({uid:other,status:"approved",
  role:"resident",volunteerStatus:"approved"});
 assert.equal(await patchedManualOffer(x.caseId,other),
  "blocked_pending_or_winner");
 assert.equal((await offer(x.caseId,other).get()).exists,false);
 assert.equal((await persistentBatchRef(db,x.caseId).get()).data().status,
  "waiting");
});
test("concurrent initial worker and patched manual offer cannot leave both manual pointer and automatic offers",async()=>{
 const x=await seed("race_initial",{same:1,outside:1});
 const adminUid="manual_race_admin";
 await ref("users",adminUid).set({uid:adminUid,status:"approved",
  role:"resident",volunteerStatus:"approved"});
 const [automatic,manual]=await Promise.all([
   worker(x.caseId),patchedManualOffer(x.caseId,adminUid)
 ]);
 const caseData=(await ref("disasterCases",x.caseId).get()).data();
 const activeAuto=(await persistentBatchRef(db,x.caseId).get()).exists;
 if(activeAuto){
   assert.equal(automatic.status,"offered");
   assert.notEqual(manual,"manual_created");
   assert.equal(caseData.activeVolunteerSupportAssignmentId,undefined);
 }else{
   assert.equal(manual,"manual_created");
   assert.equal(caseData.activeVolunteerSupportUid,adminUid);
   assert.notEqual(automatic.status,"offered");
 }
});
test("client Rules reject old Admin manual pointer overwrite while wave is waiting",async()=>{
 const x=await seed("rules_pending",{same:1,outside:1});
 assert.equal((await worker(x.caseId)).status,"offered");
 const admin="rules_admin_pending";
 await ref("users",admin).set({uid:admin,role:"admin",
  status:"approved",adminStatus:"active"});
 const ctx=rulesEnv.authenticatedContext(admin);
 const incident=doc(ctx.firestore(),"disasterCases",x.caseId);
 await assertFails(updateDoc(incident,{
  activeVolunteerSupportUid:"fake_manual",
  activeVolunteerSupportAssignmentId:"fake_offer",
  updatedAt:serverTimestamp()
 }));
 await assertFails(updateDoc(incident,{
  autoVolunteerDispatch:{state:"needs_admin_review"},
  activeVolunteerSupportUid:"fake_manual",
  activeVolunteerSupportAssignmentId:"fake_offer",
  updatedAt:serverTimestamp()
 }));
 await assertSucceeds(updateDoc(incident,{
  adminNote:"Case reviewed; wave still in progress",
  updatedAt:serverTimestamp()
 }));
 const actual=(await ref("disasterCases",x.caseId).get()).data();
 assert.equal(actual.activeVolunteerSupportUid,undefined);
 assert.equal(actual.autoVolunteerDispatch.state,"waiting");
});
test("no active wave: Admin manual case pointer continues to work",async()=>{
 const x=await seed("manual_legacy",{same:1,outside:0});
 const admin="rules_admin_no_wave";
 await ref("users",admin).set({uid:admin,role:"admin",
   status:"approved",adminStatus:"active"});
 const ctx=rulesEnv.authenticatedContext(admin);
 await assertSucceeds(updateDoc(doc(ctx.firestore(),"disasterCases",x.caseId),{
  activeVolunteerSupportUid:x.uid,
  activeVolunteerSupportAssignmentId:x.caseId+"_"+x.uid,
  updatedAt:serverTimestamp()
 }));
});
test("lease requires an existing batch; cannot invent or dispatch a case by itself",async()=>{
 const x=await seed("no_batch");
 const r=await claimEmulatedDueWave({db,caseId:x.caseId,now:NOW});
 assert.equal(r.reason,"batch_or_case_missing");
 assert.equal((await leaseRef(db,x.caseId).get()).exists,false);
});
test("future deadline does not claim early or produce new offers",async()=>{
 const x=await seed("too_early");
 await worker(x.caseId);
 const result=await claimEmulatedDueWave({db,caseId:x.caseId,now:NOW+100});
 assert.equal(result.status,"not_due");
 assert.equal((await leaseRef(db,x.caseId).get()).exists,false);
 assert.equal((await offer(x.caseId,x.outside[0]).get()).exists,false);
});
test("two simultaneous due-lease claims produce exactly ONE owner",async()=>{
 const x=await seed("one_lease");
 await worker(x.caseId);
 const due=NOW+OFFER_MS+1;
 const [first,second]=await Promise.all([
  claimEmulatedDueWave({db,caseId:x.caseId,now:due}),
  claimEmulatedDueWave({db,caseId:x.caseId,now:due})
 ]);
 const claims=[first,second];
 assert.equal(claims.filter(x=>x.status==="claimed").length,1,
   JSON.stringify(claims));
 assert.equal(claims.filter(x=>x.status==="leased_elsewhere").length,1);
 const owner=claims.find(x=>x.status==="claimed");
 const done=await finishEmulatedLease({
   db,caseId:x.caseId,token:owner.token,now:due+100,
   resultStatus:"waiting"});
 assert.equal(done.status,"finished");
 const snapshot=(await leaseRef(db,x.caseId).get()).data();
 assert.equal(snapshot.token,"");
 assert.equal(snapshot.lastResult,"waiting");
});
test("lost worker recovers expired lease; stale owner cannot acknowledge",async()=>{
 const x=await seed("crash_recovery");
 await worker(x.caseId);
 const due=NOW+OFFER_MS+1;
 const first=await claimEmulatedDueWave({db,caseId:x.caseId,now:due});
 assert.equal(first.status,"claimed");
 const early=await claimEmulatedDueWave({
  db,caseId:x.caseId,now:due+1000});
 assert.equal(early.status,"leased_elsewhere");
 const second=await claimEmulatedDueWave({
  db,caseId:x.caseId,now:due+45001});
 assert.equal(second.status,"claimed");
 assert.notEqual(first.token,second.token);
 const stale=await finishEmulatedLease({
  db,caseId:x.caseId,token:first.token,now:due+45002,
  resultStatus:"offered"
 });
 assert.equal(stale.reason,"not_lease_holder");
 const completion=await finishEmulatedLease({
  db,caseId:x.caseId,token:second.token,now:due+45003,
  resultStatus:"waiting"
 });
 assert.equal(completion.status,"finished");
});
test("explicit due-worker invocation expires Wave 1 then advances to Wave 3 and stores next due",async()=>{
 const x=await seed("due_transition",{same:2,outside:1});
 await worker(x.caseId);
 const r=await invokeEmulatedDueWave({db,caseId:x.caseId,
  now:NOW+OFFER_MS+1});
 assert.equal(r.status,"offered",JSON.stringify(r));
 assert.equal(r.acknowledged,true);
 const batch=(await persistentBatchRef(db,x.caseId).get()).data();
 assert.equal(batch.wave,3);
 assert.equal((await offer(x.caseId,x.outside[0]).get()).data().status,"offered");
 for(const uid of x.same)
  assert.equal((await offer(x.caseId,uid).get()).data().status,"expired");
 const lease=(await leaseRef(db,x.caseId).get()).data();
 assert.equal(lease.nextDueAtMs,batch.expiresAtMs);
 assert.equal(lease.token,"");
});
test("accepted Volunteer triggers early supported STOP without waiting for deadline",async()=>{
 const x=await seed("accepted_guard",{same:1,outside:1});
 await worker(x.caseId);
 const acceptance=await decideEmulatedAutomaticOffer({
  db,authenticatedUid:x.uid,caseId:x.caseId,
  decision:"accepted",now:NOW+100
 });
 assert.equal(acceptance.status,"committed_accepted");
 const result=await invokeEmulatedDueWave({
   db,caseId:x.caseId,now:NOW+1000
 });
 assert.equal(result.status,"supported");
 assert.equal(result.acknowledged,true);
 assert.equal((await persistentBatchRef(db,x.caseId).get()).data().status,
   "supported");
 assert.equal((await offer(x.caseId,x.outside[0]).get()).exists,false);
 assert.equal((await ref("responderLocks",x.uid).get()).exists,true);
 const subsequent=await invokeEmulatedDueWave({
  db,caseId:x.caseId,now:NOW+OFFER_MS+1});
 assert.equal(subsequent.status,"terminal");
});
test("synthetic injected config cannot unlock leases; worker has NO automatic timer or live import",async()=>{
 const x=await seed("guard_disabled");
 const fake={...process.env};
 const result=await claimEmulatedDueWave({
   db,caseId:x.caseId,env:fake});
 assert.equal(result.reason,"isolated_emulator_only");
 assert.equal((await leaseRef(db,x.caseId).get()).exists,false);
 const src=fs.readFileSync(path.join(__dirname,
   "autoVolunteerPhase8LeaseSchedulerEmulator.js"),"utf8");
 const live=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
 assert.ok(!live.includes("autoVolunteerPhase8LeaseSchedulerEmulator"));
 assert.ok(!src.includes("setInterval("));
 assert.ok(!src.includes("cron.schedule("));
 assert.ok(!src.includes("app.post("));
});
test.after(async()=>{
 if(rulesEnv)await rulesEnv.cleanup();
 await deleteApp(app);
});
