"use strict";
/**
 * PHASE 6 ONLY: Real Firestore Emulator transaction/route tests.
 * No production API or Firebase project access is used.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {initializeApp,deleteApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {
 decideEmulatedAutomaticOffer,registerEmulatorOnlyDecisionRoute,emulatorReady,
 ASSIGNMENT_MODE
}=require("./autoVolunteerPhase6EmulatorDecisionServer");
const PROJECT="demo-volunserve-auto-phase4";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080" ||
 process.env.GCLOUD_PROJECT!==PROJECT ||
 (process.env.GOOGLE_CLOUD_PROJECT &&
  process.env.GOOGLE_CLOUD_PROJECT!==PROJECT) ||
 process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
 process.env.VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE!=="enabled" ||
 process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="enabled")
 throw Error("Phase 6 MUST run against isolated Firestore demo emulator");
const app=initializeApp({projectId:PROJECT},"phase6_emulator_qa");
const db=getFirestore(app);
const now=Date.now();
function ids(caseId,uid){
 const aid=caseId+"_"+uid;
 return {
  aid,
  caseRef:db.collection("disasterCases").doc(caseId),
  offerRef:db.collection("responseAssignments").doc(aid),
  userRef:db.collection("users").doc(uid),
  applicationRef:db.collection("volunteerApplications").doc(uid),
  reservationRef:db.collection("autoVolunteerReservations").doc(uid),
  lockRef:db.collection("responderLocks").doc(uid),
  auditRef:db.collection("adminActivityLogs")
    .doc("automatic_phase6_decision_"+aid),
  notificationRef:db.collection("notifications")
    .doc("automatic_phase6_resident_"+aid)
 };
}
async function seedCase(tag,volunteers=["a","b"],casePatch={}){
 const caseId="phase6_"+tag,bat=db.batch();
 bat.set(ids(caseId,"qa_none").caseRef,{
  id:caseId,reporterUid:"fictional_reporter",
  status:"assigned",verificationStatus:"validated",
  incidentBarangay:"Bagong Buhay I",
  requiredSkills:["First Aid"],dispatchBlocked:false,...casePatch
 });
 const uids=[];
 for(const suffix of volunteers){
  const uid="qa_"+suffix+"_"+tag;
  uids.push(uid);
  const r=ids(caseId,uid);
  bat.set(r.userRef,{uid,status:"approved",role:"resident",
    volunteerAccess:true,volunteerStatus:"approved",identityVerified:true,
    skills:["First Aid"],barangay:"Bagong Buhay I"});
  bat.set(r.applicationRef,{uid,status:"approved",skills:["First Aid"]});
  bat.set(r.offerRef,{id:r.aid,caseId,volunteerId:uid,
    offerMode:ASSIGNMENT_MODE,status:"offered",expiresAtMs:now+3600000,
    volunteerName:"FICTIONAL volunteer"});
  bat.set(r.reservationRef,{caseId,uid,assignmentId:r.aid});
 }
 await bat.commit();
 return {caseId,uids};
}
const decide=(caseId,uid,decision="accepted",extra={})=>
  decideEmulatedAutomaticOffer({db,authenticatedUid:uid,
    caseId,decision,now,...extra});
function routeFixture(){
 let route=null;
 const trustedAuth=function requireFirebaseUser(_req,_res,_next){};
 registerEmulatorOnlyDecisionRoute({post(path,...handlers){
   route={path,handlers};
 }},{db,requireFirebaseUser:trustedAuth,clock:()=>now});
 assert.ok(route);
 assert.equal(route.handlers[0],trustedAuth);
 assert.equal(route.path,"/api/volunteer/emergency-auto/offers/:caseId/decision");
 return async({caseId,uid,decision="accepted",bodyPatch={},paramsPatch={}})=>{
  const response={code:200,body:null,headers:{}};
  const res={
   set(k,v){response.headers[k.toLowerCase()]=v;return this;},
   status(n){response.code=n;return this;},
   json(value){response.body=value;return this;}
  };
  const req={
   firebaseUser:uid?{uid,email_verified:true}:null,
   params:{caseId,...paramsPatch},
   body:{decision,...bodyPatch},
   query:{volunteerUid:"forged_query_should_be_ignored"}
  };
  await route.handlers[1](req,res);
  return response;
 };
}
test("local emulator gate refuses fabricated env, missing flag, prod credential and live project",()=>{
 assert.equal(emulatorReady(),true);
 assert.equal(emulatorReady({...process.env}),false);
 assert.equal(emulatorReady({}),false);
 assert.equal(emulatorReady({
  ...process.env,FIRESTORE_EMULATOR_HOST:"volunserve-prod.firebaseio.com"
 }),false);
});
test("parallel two Volunteer Accept requests commit exactly ONE case winner, lock, notice, audit",async()=>{
 const {caseId,uids}=await seedCase("two_volunteers");
 const results=await Promise.all(uids.map(uid=>decide(caseId,uid)));
 assert.equal(results.filter(x=>x.status==="committed_accepted").length,1,
  JSON.stringify(results));
 const c=(await ids(caseId,uids[0]).caseRef.get()).data();
 const winner=uids.find(x=>x===c.activeVolunteerSupportUid);
 assert.ok(winner);
 assert.equal(c.autoVolunteerAcceptedAssignmentId,caseId+"_"+winner);
 assert.equal(c.activeVolunteerSupportAssignmentId,caseId+"_"+winner);
 const records=await Promise.all(uids.map(async uid=>{
  const r=ids(caseId,uid);
  const [offer,lock,notice,audit]=await Promise.all([
   r.offerRef.get(),r.lockRef.get(),r.notificationRef.get(),r.auditRef.get()
  ]);
  return {uid,offer:offer.data().status,locked:lock.exists,
    notice:notice.exists,audit:audit.exists};
 }));
 assert.equal(records.filter(x=>x.offer==="accepted").length,1);
 assert.equal(records.filter(x=>x.locked).length,1);
 assert.equal(records.filter(x=>x.notice).length,1);
 assert.equal(records.filter(x=>x.audit).length,1);
 assert.equal(records.find(x=>x.locked).uid,winner);
});
test("two same-Volunteer concurrent Accept requests are idempotent with one audit+notice",async()=>{
 const {caseId,uids:[uid]}=await seedCase("double_accept",["a"]);
 const outcomes=await Promise.all([decide(caseId,uid),decide(caseId,uid)]);
 assert.equal(outcomes.filter(x=>x.status==="committed_accepted").length,1);
 assert.equal(outcomes.filter(x=>x.status==="already_accepted").length,1);
 const r=ids(caseId,uid);
 const [a,l,n,au]=await Promise.all([
  r.offerRef.get(),r.lockRef.get(),r.notificationRef.get(),r.auditRef.get()
 ]);
 assert.equal(a.data().status,"accepted");
 assert.equal(l.exists,true);
 assert.equal(n.exists,true);
 assert.equal(au.exists,true);
 const before=String(a.data().updatedAt.toMillis());
 const replay=await decide(caseId,uid);
 assert.equal(replay.status,"already_accepted");
 const after=(await r.offerRef.get()).data().updatedAt.toMillis().toString();
 assert.equal(after,before,"replay never updates accepted offer");
});
test("Decline releases exactly matching reservation, no winner/lock/notification, one audit",async()=>{
 const {caseId,uids:[uid]}=await seedCase("decline",["a"]);
 const r=ids(caseId,uid);
 assert.equal((await decide(caseId,uid,"declined")).status,"committed_declined");
 assert.equal((await decide(caseId,uid,"declined")).status,"already_declined");
 const [offer,reserve,lock,notice,audit,c]=await Promise.all([
  r.offerRef.get(),r.reservationRef.get(),r.lockRef.get(),
  r.notificationRef.get(),r.auditRef.get(),r.caseRef.get()
 ]);
 assert.equal(offer.data().status,"declined");
 assert.equal(reserve.exists,false);
 assert.equal(lock.exists,false);
 assert.equal(notice.exists,false);
 assert.equal(audit.exists,true);
 assert.equal(c.data().autoVolunteerAcceptedAssignmentId,undefined);
});
test("expired/invalid offer or rejected identity blocks without writes",async()=>{
 const {caseId,uids:[uid]}=await seedCase("expiry",["a"]);
 const r=ids(caseId,uid);
 await r.offerRef.update({expiresAtMs:now-10});
 assert.equal((await decide(caseId,uid)).reason,"offer_expired_or_unknown");
 assert.equal((await r.lockRef.get()).exists,false);
 const {caseId:other,uids:[revoked]}=await seedCase("suspended",["a"]);
 const o=ids(other,revoked);
 await o.userRef.update({status:"suspended"});
 assert.equal((await decide(other,revoked)).reason,
  "volunteer_approval_or_identity_missing");
 assert.equal((await o.lockRef.get()).exists,false);
});
test("manual Admin already selected responder blocks automatic Accept",async()=>{
 const {caseId,uids:[uid]}=await seedCase("manual_first",["a"],{
  activeVolunteerSupportAssignmentId:"manual_external_assignment",
  activeVolunteerSupportUid:"manual_external_volunteer"
 });
 const result=await decide(caseId,uid);
 assert.equal(result.reason,"case_has_manual_or_accepted_responder");
 assert.equal((await ids(caseId,uid).lockRef.get()).exists,false);
});
test("existing cross-case reservation means no second accepted Volunteer mission",async()=>{
 const {caseId,uids:[uid]}=await seedCase("reservation_conflict",["a"]);
 const r=ids(caseId,uid);
 await r.reservationRef.update({
  caseId:"other_case",assignmentId:"other_case_"+uid
 });
 const result=await decide(caseId,uid);
 assert.equal(result.reason,"reservation_not_owned");
 assert.equal((await r.lockRef.get()).exists,false);
});
test("other active assignment denies new cross-case acceptance, but completed one does not",async()=>{
 const {caseId,uids:[uid]}=await seedCase("busy_elsewhere",["a"]);
 const id="another_case_"+uid;
 await db.collection("responseAssignments").doc(id).set({
  caseId:"another_case",volunteerId:uid,status:"responding"
 });
 assert.equal((await decide(caseId,uid)).reason,"active_assignment_scan_not_proven");
 await db.collection("responseAssignments").doc(id).update({status:"completed"});
 assert.equal((await decide(caseId,uid)).status,"committed_accepted");
});
test("HTTP handler uses only verified middleware UID, rejects forged client-supplied IDs",async()=>{
 const {caseId,uids:[uid]}=await seedCase("api_uid",["a"]);
 const invoke=routeFixture();
 const bad=await invoke({caseId,uid,bodyPatch:{volunteerUid:"other_person"}});
 assert.equal(bad.code,400);
 assert.equal(bad.body.reason,"unexpected_request_fields");
 const unauth=await invoke({caseId,uid:""});
 assert.equal(unauth.code,401);
 const good=await invoke({caseId,uid,paramsPatch:{volunteerUid:"other_person"}});
 assert.equal(good.code,200);
 assert.equal(good.body.status,"committed_accepted");
 assert.ok(good.headers["cache-control"].includes("no-store"));
 const raw=JSON.stringify(good.body);
 for(const secret of [uid,caseId,"FICTIONAL volunteer","fictional_reporter",
   "assignmentId","volunteerUid","email","userId"])
  assert.ok(!raw.includes(secret),"Private data leaked: "+secret);
});
test("registered route remains OFF outside emulator; live backend must never import it",()=>{
 const source=fs.readFileSync(path.join(__dirname,
  "autoVolunteerPhase6EmulatorDecisionServer.js"),"utf8");
 const live=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
 assert.ok(!live.includes("autoVolunteerPhase6EmulatorDecisionServer"));
 assert.ok(!live.includes("autoVolunteerAtomicDecisionPolicy"));
 assert.ok(!source.includes("staging002.qa.volunteer"));
 assert.ok(!source.includes("FIREBASE_PRIVATE_KEY"));
});
test.after(async()=>{await deleteApp(app)});
