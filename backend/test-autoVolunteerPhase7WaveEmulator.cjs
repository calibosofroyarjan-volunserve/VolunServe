"use strict";
/**
 * Phase 7: genuine Firestore Emulator tests, no runtime server integration.
 * All IDs fictional. Wave 2 intentionally disabled without reviewed adjacency.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {reconcileEmulatedAutomaticWave,persistentBatchRef}
 =require("./autoVolunteerPhase7WaveWorkerEmulator");
const {decideEmulatedAutomaticOffer}
 =require("./autoVolunteerPhase6EmulatorDecisionServer");
const PROJECT="demo-volunserve-auto-phase4";
const now=Date.now(),DUE=180000;
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
  process.env.GCLOUD_PROJECT!==PROJECT||
  (process.env.GOOGLE_CLOUD_PROJECT&&
    process.env.GOOGLE_CLOUD_PROJECT!==PROJECT)||
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON||
  process.env.VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE!=="enabled"||
  process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="enabled")
  throw Error("REFUSE: local demo Firestore Emulator ONLY");
const app=initializeApp({projectId:PROJECT},"phase7_wave_emulator");
const db=getFirestore(app);
const ref=(col,id)=>db.collection(col).doc(id);
const offer=(cid,uid)=>ref("responseAssignments",cid+"_"+uid);
const reservation=uid=>ref("autoVolunteerReservations",uid);
const worker=(cid,time=now,dbOverride=db)=>reconcileEmulatedAutomaticWave({
  db:dbOverride,caseId:cid,now:time
});
async function seed(tag,{
  same=3,elsewhere=1,extra=0,casePatch={}
}={}){
  const cid="phase7_"+tag,bat=db.batch(),uids=[],outside=[];
  bat.set(ref("disasterCases",cid),{
    id:cid,status:"validated",verificationStatus:"validated",
    reporterUid:"fictional_reporter",title:"SIMULATED help case",
    requiredSkills:["First Aid"],incidentBarangay:"Bagong Buhay I",
    dispatchBlocked:false,...casePatch
  });
  for(let i=0;i<same+elsewhere+extra;i++){
    const uid="fake_"+tag+"_"+i;
    const barangay=i<same?"Bagong Buhay I":"Citrus";
    const approved=i<same+elsewhere;
    uids.push(uid);
    if(i>=same&&approved)outside.push(uid);
    bat.set(ref("users",uid),{
      uid,status:"approved",role:"resident",
      volunteerAccess:true,volunteerStatus:"approved",
      identityVerified:true,barangay,skills:["First Aid"],
      fullName:"Fictional Volunteer "+i
    });
    bat.set(ref("volunteerApplications",uid),{
      uid,status:approved?"approved":"pending",skills:["First Aid"]
    });
  }
  await bat.commit();
  return {cid,all:uids,same:uids.slice(0,same),outside};
}
async function inspect(cid,uids){
  const b=(await persistentBatchRef(db,cid).get());
  const items=await Promise.all(uids.map(async uid=>{
    const [a,r]=await Promise.all([offer(cid,uid).get(),reservation(uid).get()]);
    return {uid,status:a.exists?a.data().status:null,
      wave:a.exists?a.data().wave:null,
      reservation:r.exists,expiresAtMs:a.exists?a.data().expiresAtMs:null};
  }));
  return {batch:b.exists?b.data():null,items};
}
const accepted=(cid,uid)=>decideEmulatedAutomaticOffer({
  db,authenticatedUid:uid,caseId:cid,
  decision:"accepted",now:now+1000
});
const declined=(cid,uid)=>decideEmulatedAutomaticOffer({
  db,authenticatedUid:uid,caseId:cid,
  decision:"declined",now:now+1000
});
test("initial verified case starts all three same-barangay offers (Wave 1), never Wave 3 early",async()=>{
 const x=await seed("first");
 const result=await worker(x.cid);
 assert.equal(result.status,"offered",JSON.stringify(result));
 assert.equal(result.wave,1);
 assert.equal(result.offered,3);
 const data=await inspect(x.cid,x.all);
 assert.equal(data.batch.status,"waiting");
 assert.equal(data.batch.wave,1);
 assert.equal(data.batch.origin,"phase7_demo_persistent_worker");
 assert.equal(data.items.filter(v=>v.status==="offered").length,3);
 assert.equal(data.items.filter(v=>v.wave===3).length,0);
 assert.equal(data.items.find(v=>v.uid===x.outside[0]).status,null);
 const notices=await db.collection("notifications").get();
 for(const uid of x.same){
  const n=await ref("notifications","phase7_offer_"+x.cid+"_"+uid).get();
  const audit=await ref("adminActivityLogs","phase7_offer_"+x.cid+"_"+uid).get();
  assert.equal(n.exists,true);assert.equal(audit.exists,true);
 }
 assert.equal(notices.empty,false);
});
test("repeat and concurrent first tick cannot double-send offers or change deadlines",async()=>{
 const x=await seed("concurrent");
 const outcomes=await Promise.all([worker(x.cid),worker(x.cid)]);
 assert.equal(outcomes.filter(o=>o.status==="offered").length,1,
   JSON.stringify(outcomes));
 assert.equal(outcomes.filter(o=>o.status==="waiting").length,1,
   JSON.stringify(outcomes));
 const pre=await inspect(x.cid,x.same);
 assert.equal(pre.items.filter(o=>o.status==="offered").length,3);
 const again=await worker(x.cid,now+1000);
 assert.equal(again.status,"waiting");
 const after=await inspect(x.cid,x.same);
 assert.deepEqual(after.items.map(x=>x.expiresAtMs),
   pre.items.map(x=>x.expiresAtMs));
});
test("one pending offer prevents Wave 3 even after other Volunteers decline",async()=>{
 const x=await seed("some_decline");
 assert.equal((await worker(x.cid)).wave,1);
 await declined(x.cid,x.same[0]);
 await declined(x.cid,x.same[1]);
 const r=await worker(x.cid,now+1000);
 assert.equal(r.status,"waiting");
 assert.equal(r.pending,1);
 assert.equal((await offer(x.cid,x.outside[0]).get()).exists,false);
});
test("all Wave 1 declined: Wave 3 starts, Wave 2 skipped without verified adjacency",async()=>{
 const x=await seed("declined_wave");
 assert.equal((await worker(x.cid)).wave,1);
 for(const uid of x.same)
  assert.equal((await declined(x.cid,uid)).status,"committed_declined");
 const r=await worker(x.cid,now+5000);
 assert.equal(r.status,"offered",JSON.stringify(r));
 assert.equal(r.wave,3);
 assert.equal(r.offered,1);
 const data=await inspect(x.cid,x.all);
 assert.equal(data.batch.wave,3);
 assert.deepEqual(data.batch.completedWaves,[1]);
 assert.equal(data.items.find(v=>v.uid===x.outside[0]).status,"offered");
 for(const uid of x.same)assert.equal(data.items.find(v=>v.uid===uid).status,"declined");
});
test("expired Wave 1 offers are marked expired and reservations released BEFORE Wave 3",async()=>{
 const x=await seed("expired_wave");
 assert.equal((await worker(x.cid)).wave,1);
 const r=await worker(x.cid,now+DUE+1);
 assert.equal(r.status,"offered",JSON.stringify(r));
 assert.equal(r.wave,3);
 assert.equal(r.expired,3);
 const data=await inspect(x.cid,x.all);
 for(const uid of x.same){
  const previous=data.items.find(v=>v.uid===uid);
  assert.equal(previous.status,"expired");
  assert.equal(previous.reservation,false);
 }
 assert.equal(data.items.find(v=>v.uid===x.outside[0]).status,"offered");
});
test("later deadline and no further candidates produces persistent exhausted state",async()=>{
 const x=await seed("exhaustion");
 await worker(x.cid);
 await worker(x.cid,now+DUE+1);
 const exhausted=await worker(x.cid,now+2*DUE+2);
 assert.equal(exhausted.status,"exhausted",JSON.stringify(exhausted));
 const final=await inspect(x.cid,x.all);
 assert.equal(final.batch.status,"exhausted");
 assert.equal(final.batch.wave,3);
 assert.equal(final.items.every(x=>x.status==="expired"),true);
 const replay=await worker(x.cid,now+2*DUE+100000);
 assert.equal(replay.status,"exhausted");
 assert.equal(replay.changed,false);
});
test("an accepted Volunteer stops later waves, persists supported state, and preserves lock",async()=>{
 const x=await seed("accepted_stop");
 await worker(x.cid);
 const a=await accepted(x.cid,x.same[0]);
 assert.equal(a.status,"committed_accepted",JSON.stringify(a));
 const expected=(await offer(x.cid,x.same[0]).get()).data();
 const after=await worker(x.cid,now+DUE+5);
 assert.equal(after.status,"supported",JSON.stringify(after));
 assert.equal((await offer(x.cid,x.outside[0]).get()).exists,false);
 assert.equal((await persistentBatchRef(db,x.cid).get()).data().status,"supported");
 assert.equal((await offer(x.cid,x.same[0]).get()).data().status,"accepted");
 assert.equal((await ref("responderLocks",x.same[0]).get()).exists,true);
 assert.equal((await offer(x.cid,x.same[0]).get()).data().updatedAt.toMillis(),
  expected.updatedAt.toMillis());
 const replay=await worker(x.cid,now+3*DUE);
 assert.equal(replay.changed,false);
 assert.equal(replay.status,"supported");
});
test("Wave 3 acceptance also prevents any additional offers and keeps sole winner",async()=>{
 const x=await seed("wave3_accept");
 await worker(x.cid);
 await worker(x.cid,now+DUE+1);
 assert.equal((await accepted(x.cid,x.outside[0])).status,"committed_accepted");
 assert.equal((await worker(x.cid,now+2*DUE+2)).status,"supported");
 const c=(await ref("disasterCases",x.cid).get()).data();
 assert.equal(c.activeVolunteerSupportUid,x.outside[0]);
 const snap=await inspect(x.cid,x.all);
 assert.equal(snap.items.filter(x=>x.status==="accepted").length,1);
});
test("a second worker instance recovers deadlines from Firestore instead of in-memory counters",async()=>{
 const x=await seed("worker_restart");
 await worker(x.cid);
 const app2=initializeApp({projectId:PROJECT},"phase7_restarted_process");
 const db2=getFirestore(app2);
 try{
  const r=await worker(x.cid,now+DUE+2,db2);
  assert.equal(r.status,"offered");
  assert.equal(r.wave,3);
  assert.equal((await persistentBatchRef(db2,x.cid).get()).data().wave,3);
 }finally{
  await deleteApp(app2);
 }
});
test("manual case pointer and manual task history block an initial automatic batch",async()=>{
 const x=await seed("manual_pointer",{casePatch:{
   activeVolunteerSupportAssignmentId:"manual_assign_1",
   activeVolunteerSupportUid:"manual_volunteer_1"
 }});
 assert.equal((await worker(x.cid)).reason,"manual_or_accepted_responder_exists");
 assert.equal((await persistentBatchRef(db,x.cid).get()).exists,false);
 const y=await seed("manual_history");
 await ref("responseAssignments","manual_task_"+y.cid).set({
  caseId:y.cid,volunteerId:"old_manual_volunteer",status:"offered"
 });
 assert.equal((await worker(y.cid)).reason,
  "mixed_manual_and_automatic_assignment_history");
 assert.equal((await persistentBatchRef(db,y.cid).get()).exists,false);
});
test("an active manual offer created during a batch blocks further escalation",async()=>{
 const x=await seed("manual_collision");
 await worker(x.cid);
 await ref("responseAssignments","manual_offer_"+x.cid).set({
  caseId:x.cid,volunteerId:"manual_other",status:"offered"
 });
 const next=await worker(x.cid,now+DUE+1);
 assert.equal(next.reason,"mixed_manual_and_automatic_assignment_history");
 assert.equal((await offer(x.cid,x.outside[0]).get()).exists,false);
});
test("current reservation for unrelated case prevents offering that Volunteer",async()=>{
 const x=await seed("reserved_elsewhere");
 await reservation(x.same[0]).set({
  caseId:"another_case",uid:x.same[0],assignmentId:"another_case_offer"
 });
 const r=await worker(x.cid);
 assert.equal(r.status,"offered",JSON.stringify(r));
 assert.equal(r.offered,2);
 assert.equal((await offer(x.cid,x.same[0]).get()).exists,false);
 assert.equal((await reservation(x.same[0]).get()).data().caseId,"another_case");
});
test("invalid case status or missing incident location fails closed, no batch or offers",async()=>{
 const x=await seed("not_validated",{casePatch:{verificationStatus:"pending_verification"}});
 assert.equal((await worker(x.cid)).reason,"case_not_dispatchable");
 assert.equal((await persistentBatchRef(db,x.cid).get()).exists,false);
 const y=await seed("unknown_barangay",{casePatch:{
  incidentBarangay:"NOT_IN_SJDM"
 }});
 assert.equal((await worker(y.cid)).reason,
  "incident_barangay_unverified_or_outside_sjdm");
 assert.equal((await persistentBatchRef(db,y.cid).get()).exists,false);
});
test("a 41-person Wave 1 is blocked atomically, never silently truncated",async()=>{
 const x=await seed("too_many",{same:41,elsewhere:0});
 const r=await worker(x.cid);
 assert.equal(r.status,"blocked",JSON.stringify(r));
 assert.equal(r.reason,"wave_over_audited_fanout_limit");
 assert.equal((await persistentBatchRef(db,x.cid).get()).exists,false);
 for(const uid of x.all)assert.equal((await offer(x.cid,uid).get()).exists,false);
});
test("invalid existing offered deadline blocks expansion without modifying records",async()=>{
 const x=await seed("invalid_deadline");
 await worker(x.cid);
 await offer(x.cid,x.same[0]).update({expiresAtMs:"corrupt"});
 assert.equal((await worker(x.cid,now+DUE+1)).reason,
  "invalid_existing_offer_deadline");
 assert.equal((await offer(x.cid,x.outside[0]).get()).exists,false);
});
test("no eligible Volunteer gives a stable exhausted state, no fake offers",async()=>{
 const x=await seed("empty",{same:0,elsewhere:0});
 const r=await worker(x.cid);
 assert.equal(r.status,"exhausted");
 assert.equal((await persistentBatchRef(db,x.cid).get()).data().status,"exhausted");
 assert.equal((await worker(x.cid,now+DUE)).changed,false);
});
test("proof of emulator-only gate and unmounted production server",()=>{
 const source=fs.readFileSync(path.join(__dirname,
  "autoVolunteerPhase7WaveWorkerEmulator.js"),"utf8");
 const server=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
 assert.ok(!server.includes("autoVolunteerPhase7WaveWorkerEmulator"));
 assert.ok(!server.includes("autoVolunteerPhase6EmulatorDecisionServer"));
 assert.ok(source.includes("emulatorReady(env)"));
 assert.ok(!source.includes("setInterval("));
 assert.ok(!source.includes("functions.pubsub"));
});
test.after(async()=>{await deleteApp(app)});
