"use strict";
/**
 * Phase 9 LOCAL Firebase AUTH + Firestore Emulator E2E.
 * No production project access. No LIVE server or deploy.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const express=require("express");
const {initializeApp:initializeAdminApp,deleteApp:deleteAdminApp}=
  require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getAuth:getAdminAuth}=require("firebase-admin/auth");
const {initializeApp:initializeClientApp,deleteApp:deleteClientApp}=
  require("firebase/app");
const {getAuth:clientAuth,connectAuthEmulator,
  signInWithEmailAndPassword,getIdToken}=
  require("firebase/auth");
const {reconcileEmulatedAutomaticWave,persistentBatchRef}=
  require("./autoVolunteerPhase7WaveWorkerEmulator");
const {decideEmulatedAutomaticOffer}=
  require("./autoVolunteerPhase6EmulatorDecisionServer");
const {claimEmulatedDueWave,finishEmulatedLease,leaseRef}=
  require("./autoVolunteerPhase8LeaseSchedulerEmulator");
const {cancelEmulatedPendingWave,registerPhase9EmulatorCancelRoute}=
  require("./autoVolunteerPhase9SafeCancelEmulator");
const {runPhase9DemoDueScan}=
  require("./autoVolunteerPhase9DueScanEmulator");
const {manualOfferConflictReason}=
  require("../lib/emergencyVolunteerWinnerGuard");

const PROJECT="demo-volunserve-auto-phase4",OFFER_MS=180000,NOW=Date.now();
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080" ||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099" ||
   process.env.GCLOUD_PROJECT!==PROJECT ||
   (process.env.GOOGLE_CLOUD_PROJECT &&
    process.env.GOOGLE_CLOUD_PROJECT!==PROJECT) ||
   process.env.VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE!=="enabled" ||
   process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="enabled" ||
   process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw Error("PHASE9: only local DEMO AUTH + FIRESTORE emulators allowed");
const app=initializeAdminApp({projectId:PROJECT},"phase9_test");
const db=getFirestore(app);
const adminAuth=getAdminAuth(app);
const clients=[];
let http,baseUrl,tokens={};
const uidAdmin="phase9_admin",uidPending="phase9_pending",
  uidResident="phase9_resident";
const ref=(col,id)=>db.collection(col).doc(id);
const batchRef=id=>persistentBatchRef(db,id);
const worker=(id,time=NOW)=>reconcileEmulatedAutomaticWave({
  db,caseId:id,now:time
});
const decide=(id,uid,decision="accepted")=>
  decideEmulatedAutomaticOffer({db,caseId:id,authenticatedUid:uid,
    decision,now:NOW+100});

async function makeUser(uid,emailVerified=true){
 const email=uid+"@phase9.example";
 await adminAuth.createUser({uid,email,password:"LocalDemoPassword!123",
   emailVerified});
 const c=initializeClientApp({apiKey:"demo-not-a-real-key",
   authDomain:"localhost",projectId:PROJECT},"client_"+uid);
 clients.push(c);
 const auth=clientAuth(c);
 connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
 const signed=await signInWithEmailAndPassword(auth,email,"LocalDemoPassword!123");
 return getIdToken(signed.user);
}
async function clearDemoOnly(){
 const clear=await fetch("http://127.0.0.1:8080/emulator/v1/projects/"+
   PROJECT+"/databases/(default)/documents",{method:"DELETE"});
 assert.equal(clear.ok,true,"MUST ONLY clear emulator documents, never live");
 await db.collection("users").doc(uidAdmin).set({
   uid:uidAdmin,role:"admin",status:"approved",adminStatus:"active"
 });
 await db.collection("users").doc(uidPending).set({
   uid:uidPending,role:"admin",status:"pending",adminStatus:"pending"
 });
 await db.collection("users").doc(uidResident).set({
   uid:uidResident,role:"resident",status:"approved"
 });
}
async function seed(tag,{same=2,outside=1,casePatch={}}={}){
 const id="phase9_"+tag,uids=[],batch=db.batch();
 batch.set(ref("disasterCases",id),{
   id,reporterUid:uidResident,title:"FICTIONAL case",
   status:"validated",verificationStatus:"validated",
   incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
   dispatchBlocked:false,...casePatch
 });
 for(let i=0;i<same+outside;i++){
   const uid="vol_"+tag+"_"+i;
   uids.push(uid);
   batch.set(ref("users",uid),{
     uid,role:"resident",status:"approved",volunteerAccess:true,
     volunteerStatus:"approved",identityVerified:true,
     skills:["First Aid"],barangay:i<same?"Bagong Buhay I":"Citrus"
   });
   batch.set(ref("volunteerApplications",uid),{
     uid,status:"approved",skills:["First Aid"]
   });
 }
 await batch.commit();
 return {id,same:uids.slice(0,same),outside:uids.slice(same),all:uids};
}
async function cancel(id,reason="admin_manual_takeover",uid=uidAdmin){
 return cancelEmulatedPendingWave({db,authenticatedAdminUid:uid,
   caseId:id,reason,now:NOW+1000});
}
async function post(id,token,body){
 const res=await fetch(baseUrl+"/api/admin/emergency-auto/preview/"+
  id+"/cancel",{
    method:"POST",
    headers:{"Content-Type":"application/json",
      ...(token?{Authorization:"Bearer "+token}:{})},
    body:JSON.stringify(body)
  });
 return {code:res.status,body:await res.json()};
}
test.before(async()=>{
 tokens.admin=await makeUser(uidAdmin);
 tokens.pending=await makeUser(uidPending);
 tokens.resident=await makeUser(uidResident);
 const e=express();
 e.use(express.json({limit:"4kb"}));
 // Actual demo Firebase Auth token verification (not a fake parsed UID).
 const requireFirebaseUser=async(req,res,next)=>{
   const header=String(req.headers.authorization||"");
   if(!header.startsWith("Bearer "))
     return res.status(401).json({ok:false,reason:"unauthenticated"});
   try{
     const decoded=await adminAuth.verifyIdToken(header.slice(7),true);
     if(!decoded.email_verified)return res.status(403).json({
       ok:false,reason:"verified_email_required"
     });
     req.firebaseUser=decoded;
     return next();
   }catch(_){return res.status(401).json({
     ok:false,reason:"invalid_firebase_token"
   })}
 };
 registerPhase9EmulatorCancelRoute(e,{db,requireFirebaseUser,
   clock:()=>NOW+1000});
 http=await new Promise(resolve=>{
   const server=e.listen(0,"127.0.0.1",()=>resolve(server));
 });
 baseUrl="http://127.0.0.1:"+http.address().port;
});
test.beforeEach(clearDemoOnly);

test("real Auth Emulator signed-in operational Admin can cancel all pending auto offers",async()=>{
 const x=await seed("authorized");
 const first=await worker(x.id);
 assert.equal(first.status,"offered",JSON.stringify(first));
 const result=await post(x.id,tokens.admin,{reason:"admin_manual_takeover"});
 assert.equal(result.code,200,JSON.stringify(result));
 assert.equal(result.body.status,"cancelled");
 assert.equal(result.body.cancelledOffers,2);
 const b=(await batchRef(x.id).get()).data();
 assert.equal(b.status,"cancelled");
 const c=(await ref("disasterCases",x.id).get()).data();
 assert.equal(c.autoVolunteerDispatch.state,"cancelled");
 assert.equal(c.activeVolunteerSupportUid,undefined);
 for(const uid of x.same){
  const [a,r]=await Promise.all([
    ref("responseAssignments",x.id+"_"+uid).get(),
    ref("autoVolunteerReservations",uid).get()
  ]);
  assert.equal(a.data().status,"cancelled");
  assert.equal(r.exists,false);
  assert.equal((await ref("notifications",
    "phase7_offer_"+x.id+"_"+uid).get()).exists,true,
    "historical offer notification preserved");
 }
 assert.equal((await ref("adminActivityLogs",
  "phase9_cancel_"+x.id).get()).exists,true);
 const after=await worker(x.id,NOW+OFFER_MS+3);
 assert.equal(after.status,"blocked");
 assert.equal((await ref("responseAssignments",
  x.id+"_"+x.outside[0]).get()).exists,false);
 assert.equal(manualOfferConflictReason(c,"manual_future","someone"),null);
});
test("real Auth Emulator pending Admin, Resident, missing token and spoofed UID are rejected",async()=>{
 const x=await seed("unauthorized");
 await worker(x.id);
 for(const token of [tokens.pending,tokens.resident,"", "totally_invalid"]){
  const result=await post(x.id,token,{reason:"safety_pause"});
  assert.notEqual(result.code,200,JSON.stringify(result));
 }
 const forged=await post(x.id,tokens.resident,
   {reason:"safety_pause",adminUid:uidAdmin});
 assert.equal(forged.code,400);
 assert.equal((await batchRef(x.id).get()).data().status,"waiting");
 assert.equal((await ref("adminActivityLogs",
  "phase9_cancel_"+x.id).get()).exists,false);
});
test("second cancellation is idempotent, no extra audit or offer mutations",async()=>{
 const x=await seed("replay");
 await worker(x.id);
 const first=await cancel(x.id),second=await cancel(x.id);
 assert.equal(first.status,"cancelled");
 assert.equal(second.status,"already_cancelled");
 assert.equal(second.changed,false);
 const doc=(await ref("adminActivityLogs","phase9_cancel_"+x.id).get());
 assert.equal(doc.exists,true);
 assert.equal(doc.data().cancelledOffers,2);
});
test("concurrent cancellation requests result in exactly one committed audit",async()=>{
 const x=await seed("double_cancel");
 await worker(x.id);
 const outcomes=await Promise.all([cancel(x.id),cancel(x.id)]);
 assert.equal(outcomes.filter(x=>x.status==="cancelled").length,1,
   JSON.stringify(outcomes));
 assert.equal(outcomes.filter(x=>x.status==="already_cancelled").length,1);
 assert.equal((await ref("adminActivityLogs","phase9_cancel_"+x.id).get()).exists,true);
});
test("accepted responder prevents cancellation and preserves lock/assignment",async()=>{
 const x=await seed("accepted");
 await worker(x.id);
 assert.equal((await decide(x.id,x.same[0])).status,"committed_accepted");
 const old=(await ref("responseAssignments",x.id+"_"+x.same[0]).get())
   .data().updatedAt.toMillis();
 const result=await cancel(x.id);
 assert.equal(result.reason,"accepted_or_manually_selected_responder");
 assert.equal((await ref("responseAssignments",
  x.id+"_"+x.same[0]).get()).data().updatedAt.toMillis(),old);
 assert.equal((await ref("responderLocks",x.same[0]).get()).exists,true);
 assert.equal((await ref("adminActivityLogs",
  "phase9_cancel_"+x.id).get()).exists,false);
 const after=await worker(x.id,NOW+OFFER_MS+5);
 assert.equal(after.status,"supported");
});
test("real Firestore race Accept-vs-Admin Cancel never loses winning responder",async()=>{
 const x=await seed("accept_race",{same:1,outside:1});
 await worker(x.id);
 const res=await Promise.all([cancel(x.id),decide(x.id,x.same[0])]);
 const cancellation=res[0].status==="cancelled";
 const c=(await ref("disasterCases",x.id).get()).data();
 const assignment=(await ref("responseAssignments",
   x.id+"_"+x.same[0]).get()).data();
 if(cancellation){
  assert.equal(c.autoVolunteerDispatch.state,"cancelled");
  assert.equal(assignment.status,"cancelled");
  assert.equal((await ref("responderLocks",x.same[0]).get()).exists,false);
  assert.notEqual(res[1].status,"committed_accepted");
 }else{
  assert.equal(res[1].status,"committed_accepted",JSON.stringify(res));
  assert.equal(c.autoVolunteerAcceptedAssignmentId,x.id+"_"+x.same[0]);
  assert.equal(assignment.status,"accepted");
  assert.equal((await ref("responderLocks",x.same[0]).get()).exists,true);
 }
});
test("foreign reservation or unexpected manual assignment blocks cancellation without partial writes",async()=>{
 const x=await seed("foreign_reserve",{same:1,outside:0});
 await worker(x.id);
 await ref("autoVolunteerReservations",x.same[0]).update({
   caseId:"another_case",assignmentId:"not_owned"
 });
 const out=await cancel(x.id);
 assert.equal(out.reason,"pending_reservation_missing_or_foreign");
 assert.equal((await batchRef(x.id).get()).data().status,"waiting");
 assert.equal((await ref("responseAssignments",
  x.id+"_"+x.same[0]).get()).data().status,"offered");
});
test("revoking operational Admin profile blocks real signed-in token cancellation",async()=>{
 const x=await seed("revoked");
 await worker(x.id);
 await ref("users",uidAdmin).update({status:"suspended"});
 const result=await post(x.id,tokens.admin,{reason:"safety_pause"});
 assert.equal(result.code,409);
 assert.equal(result.body.reason,"approved_operational_admin_required");
 assert.equal((await batchRef(x.id).get()).data().status,"waiting");
});
test("active lease is invalidated by cancel; stale worker cannot acknowledge",async()=>{
 const x=await seed("lease_cancel");
 await worker(x.id);
 const due=NOW+OFFER_MS+5;
 const held=await claimEmulatedDueWave({db,caseId:x.id,now:due});
 assert.equal(held.status,"claimed");
 assert.equal((await cancel(x.id)).status,"cancelled");
 const stale=await finishEmulatedLease({
  db,caseId:x.id,token:held.token,now:due+100,
  resultStatus:"offered"
 });
 assert.equal(stale.reason,"not_lease_holder");
 const lease=(await leaseRef(db,x.id).get()).data();
 assert.equal(lease.token,"");
 assert.equal(lease.nextDueAtMs,null);
});
test("manually invoked scheduler scanner processes due batches but skips cancelled ones",async()=>{
 const x=await seed("scanner");
 await worker(x.id);
 const future=await runPhase9DemoDueScan({db,now:NOW+1000});
 assert.equal(future.status,"scanned");
 assert.equal(future.executed,0);
 const due=await runPhase9DemoDueScan({db,now:NOW+OFFER_MS+5});
 assert.equal(due.status,"scanned");
 assert.equal(due.executed,1);
 assert.equal((await batchRef(x.id).get()).data().wave,3);
 assert.equal((await cancel(x.id)).status,"cancelled");
 const noMore=await runPhase9DemoDueScan({db,now:NOW+2*OFFER_MS+10});
 assert.equal(noMore.executed,0);
 assert.equal((await ref("responseAssignments",
   x.id+"_"+x.outside[0]).get()).data().status,"cancelled");
});
test("initial zero-batch request, unknown reason and forged environment cannot cancel",async()=>{
 const x=await seed("guard");
 assert.equal((await cancel(x.id)).reason,"case_or_batch_missing");
 await worker(x.id);
 assert.equal((await cancel(x.id,"garbage_reason")).reason,
   "invalid_cancel_request");
 const fake={...process.env};
 const refused=await cancelEmulatedPendingWave({
  db,env:fake,authenticatedAdminUid:uidAdmin,
  caseId:x.id,reason:"safety_pause",now:NOW+1000
 });
 assert.equal(refused.reason,"isolated_demo_emulators_only");
 assert.equal((await batchRef(x.id).get()).data().status,"waiting");
});
test("prototype remains unmounted, no production scheduler or Firebase production write",()=>{
 const live=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
 const code=fs.readFileSync(path.join(__dirname,
   "autoVolunteerPhase9SafeCancelEmulator.js"),"utf8");
 const scan=fs.readFileSync(path.join(__dirname,
   "autoVolunteerPhase9DueScanEmulator.js"),"utf8");
 for(const forbidden of [
   "autoVolunteerPhase9SafeCancelEmulator",
   "autoVolunteerPhase9DueScanEmulator"
 ])assert.equal(live.includes(forbidden),false);
 assert.equal(scan.includes("setInterval("),false);
 assert.equal(scan.includes("node-cron"),false);
 assert.equal(code.includes("https://volunserve.com"),false);
});
test.after(async()=>{
 if(http)await new Promise((resolve,reject)=>http.close(err=>
   err?reject(err):resolve()));
 await Promise.all(clients.map(c=>deleteClientApp(c)));
 await deleteAdminApp(app);
});
