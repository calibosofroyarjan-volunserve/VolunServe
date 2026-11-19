"use strict";
/**
 * Phase 10: real LOCAL Firebase Auth + Firestore Emulator HTTP E2E.
 * Runs the isolated Admin/Volunteer QA HTTP app with real signed demo tokens.
 * NO production account, staging project, or existing accepted task touched.
 */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {initializeApp:adminInit,deleteApp:deleteAdminApp}=
  require("firebase-admin/app");
const {getAuth:getAdminAuth}=require("firebase-admin/auth");
const {getFirestore}=require("firebase-admin/firestore");
const {initializeApp:clientInit,deleteApp:deleteClientApp}=
  require("firebase/app");
const {getAuth:clientAuth,connectAuthEmulator,
  signInWithEmailAndPassword,getIdToken}=require("firebase/auth");
const {createPhase10LocalApp}=require("./autoVolunteerPhase10LocalApp");
const {persistentBatchRef}=require("./autoVolunteerPhase7WaveWorkerEmulator");

const PROJECT="demo-volunserve-auto-phase4",NOW=Date.now(),OFFER_MS=180000;
const uidAdmin="phase10_admin",uidPending="phase10_pending",
  uidVolunteerA="phase10_volunteer_a",uidVolunteerB="phase10_volunteer_b",
  uidVolunteerC="phase10_volunteer_c",uidResident="phase10_resident",
  uidUnverified="phase10_unverified";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
  process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
  process.env.GCLOUD_PROJECT!==PROJECT||
  (process.env.GOOGLE_CLOUD_PROJECT&&
   process.env.GOOGLE_CLOUD_PROJECT!==PROJECT)||
  process.env.VOLUNSERVE_AUTO_VOLUNTEER_PHASE6_EMULATOR_WRITE!=="enabled"||
  process.env.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH==="enabled"||
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON||
  process.env.GOOGLE_APPLICATION_CREDENTIALS)
  throw Error("PHASE 10: ABSOLUTELY LOCAL DEMO AUTH+FIRESTORE EMULATORS ONLY");
const adminApp=adminInit({projectId:PROJECT},"phase10_local_app");
const db=getFirestore(adminApp),auth=getAdminAuth(adminApp);
const clients=[],tokens={};
let server,base;
let now=NOW;
const ar=cid=>db.collection("responseAssignments").doc(cid+"_"+uidVolunteerA);
function id(name){return "phase10_"+name}
function caseDoc(cid){return db.collection("disasterCases").doc(cid)}
async function initUser(uid,verified=true){
  const email=uid+"@phase10.example",password="LocalDemoOnlyPassword!2026";
  await auth.createUser({uid,email,password,emailVerified:verified});
  const client=clientInit({
    apiKey:"demo-not-a-real-key",authDomain:"localhost",projectId:PROJECT
  },"phase10_client_"+uid);
  clients.push(client);
  const local=clientAuth(client);
  connectAuthEmulator(local,"http://127.0.0.1:9099",{disableWarnings:true});
  const signed=await signInWithEmailAndPassword(local,email,password);
  return getIdToken(signed.user);
}
async function clearFirestore(){
  const resp=await fetch(
    "http://127.0.0.1:8080/emulator/v1/projects/"+PROJECT+
    "/databases/(default)/documents",{method:"DELETE"}
  );
  assert.equal(resp.ok,true,"refuse failed local emulator cleanup");
  const writes=db.batch();
  for(const [uid,role,status] of [
    [uidAdmin,"admin","approved"],
    [uidPending,"admin","pending"],
    [uidResident,"resident","approved"],
    [uidUnverified,"admin","approved"]
  ]){
    writes.set(db.collection("users").doc(uid),{
      uid,role,status,adminStatus:status==="approved"?"active":"pending"
    });
  }
  for(const uid of [uidVolunteerA,uidVolunteerB,uidVolunteerC]){
    writes.set(db.collection("users").doc(uid),{
      uid,role:"resident",status:"approved",volunteerAccess:true,
      volunteerStatus:"approved",identityVerified:true,
      skills:["First Aid"],barangay:uid===uidVolunteerC?
        "Citrus":"Bagong Buhay I"
    });
    writes.set(db.collection("volunteerApplications").doc(uid),{
      uid,status:"approved",skills:["First Aid"]
    });
  }
  await writes.commit();
  now=NOW;
}
async function seedCase(name){
  const cid=id(name);
  await caseDoc(cid).set({
    id:cid,reporterUid:uidResident,title:"FICTIONAL integrated incident",
    status:"validated",verificationStatus:"validated",
    incidentBarangay:"Bagong Buhay I",requiredSkills:["First Aid"],
    dispatchBlocked:false
  });
  return cid;
}
async function request({token="",path:target,method="GET",body}){
  const opts={method,headers:{
    ...(token?{Authorization:"Bearer "+token}:{}),
    ...(body!==undefined?{"Content-Type":"application/json"}:{})
  }};
  if(body!==undefined)opts.body=JSON.stringify(body);
  const r=await fetch(base+target,opts);
  const contentType=r.headers.get("content-type")||"";
  const text=await r.text();
  return {code:r.status,data:contentType.includes("application/json")?
    JSON.parse(text):text,headers:r.headers};
}
const adminCase=cid=>"/api/phase10/admin/cases/"+cid;
const volunteerCase=cid=>"/api/phase10/volunteer/cases/"+cid;
const start=(cid,token=tokens.admin)=>request({
  token,method:"POST",path:adminCase(cid)+"/start",body:{}
});
const cancel=(cid,token=tokens.admin,reason="safety_pause")=>request({
  token,method:"POST",path:adminCase(cid)+"/cancel",body:{reason}
});
const decide=(cid,uid="a",decision="accepted")=>request({
  token:tokens[uid],method:"POST",path:volunteerCase(cid)+"/decision",
  body:{decision}
});
const tick=(token=tokens.admin)=>request({
  token,method:"POST",path:"/api/phase10/admin/due-scan",body:{}
});
const view=cid=>request({token:tokens.admin,path:adminCase(cid)});

test.before(async()=>{
  const uids=[uidAdmin,uidPending,uidVolunteerA,uidVolunteerB,
    uidVolunteerC,uidResident,uidUnverified];
  for(const uid of uids)tokens[uid]=await initUser(uid,uid!==uidUnverified);
  tokens.admin=tokens[uidAdmin];
  tokens.pending=tokens[uidPending];
  tokens.a=tokens[uidVolunteerA];
  tokens.b=tokens[uidVolunteerB];
  tokens.c=tokens[uidVolunteerC];
  tokens.resident=tokens[uidResident];
  tokens.unverified=tokens[uidUnverified];
  // Preserve legacy explicit-tick regression scenarios; the new automatic
  // scheduled path is tested separately below with an injected fake timer.
  const app=createPhase10LocalApp({
    db,authClient:auth,clock:()=>now,autoDueWorkerEnabled:false
  });
  server=await new Promise(resolve=>{
    const instance=app.listen(0,"127.0.0.1",()=>resolve(instance));
  });
  base="http://127.0.0.1:"+server.address().port;
});
test.beforeEach(clearFirestore);

test("local app pages are served, contain all controls and NEVER point to production",async()=>{
  const admin=await request({path:"/phase10-admin"});
  const vol=await request({path:"/phase10-volunteer"});
  assert.equal(admin.code,200);
  assert.equal(vol.code,200);
  for(const fragment of [
    'id="inspect"','id="start"','id="tick"','id="cancel"',
    'connectAuthEmulator','/phase10-volunteer','Phase 10'
  ])assert.ok(admin.data.includes(fragment),"Admin missing "+fragment);
  for(const fragment of [
    'id="inspect"','id="accept"','id="decline"',
    'connectAuthEmulator','/phase10-admin'
  ])assert.ok(vol.data.includes(fragment),"Volunteer missing "+fragment);
  for(const source of [admin.data,vol.data]){
    assert.ok(!source.includes("volunserve.com"));
    assert.ok(!source.includes("volunserve-3aa5b"));
    assert.ok(source.includes("demo-volunserve-auto-phase4"));
  }
  const health=await request({path:"/api/phase10/health"});
  assert.equal(health.data.workerMode,"explicit_admin_demo_tick");
  assert.equal(health.data.schedulerAlwaysOn,false);
});
test("signed-in approved Admin starts ALL eligible local Wave 1 offers once",async()=>{
  const cid=await seedCase("all_eligible");
  const pre=await view(cid);
  assert.equal(pre.code,200);
  assert.equal(pre.data.batchStatus,"not_started");
  const r=await start(cid);
  assert.equal(r.code,200,JSON.stringify(r.data));
  assert.equal(r.data.status,"offered");
  assert.equal(r.data.wave,1);
  assert.equal(r.data.offered,2);
  const repeated=await start(cid);
  assert.equal(repeated.data.status,"waiting");
  const status=await view(cid);
  assert.equal(status.data.batchStatus,"waiting");
  assert.equal(status.data.counts.offered,2);
  const noOutside=await request({
    token:tokens.c,path:volunteerCase(cid)+"/offer"
  });
  assert.equal(noOutside.data.status,"no_offer");
  for(const uid of [uidVolunteerA,uidVolunteerB]){
    assert.equal((await db.collection("responseAssignments")
      .doc(cid+"_"+uid).get()).data().status,"offered");
    assert.equal((await db.collection("notifications")
      .doc("phase7_offer_"+cid+"_"+uid).get()).exists,true);
  }
  const resultText=JSON.stringify(status.data);
  for(const secret of [uidVolunteerA,uidVolunteerB,"FICTIONAL integrated incident",
    "assignmentId","email","fullName"])
    assert.equal(resultText.includes(secret),false,secret);
});
test("approved Admin verifies a pending report and AUTOMATICALLY sends Volunteer offers",async()=>{
  const cid=await seedCase("approval_auto_dispatch");
  await caseDoc(cid).update({status:"pending_review",verificationStatus:"pending"});
  const approvalPath=adminCase(cid)+"/approve";
  const noPermission=await request({
    token:tokens.resident,method:"POST",path:approvalPath,body:{}
  });
  assert.equal(noPermission.code,403);
  const unauthenticated=await request({
    token:"",method:"POST",path:approvalPath,body:{}
  });
  assert.equal(unauthenticated.code,401);
  const forged=await request({
    token:tokens.admin,method:"POST",path:approvalPath,
    body:{volunteerUid:uidVolunteerA}
  });
  assert.equal(forged.code,400);
  assert.equal((await caseDoc(cid).get()).data().status,"pending_review");
  assert.equal((await persistentBatchRef(db,cid).get()).exists,false);

  // No separate /start request: approving the report writes the wave.
  const approved=await request({
    token:tokens.admin,method:"POST",path:approvalPath,body:{}
  });
  assert.equal(approved.code,200,JSON.stringify(approved.data));
  assert.equal(approved.data.approvalStatus,"approved");
  assert.equal(approved.data.status,"offered");
  assert.equal(approved.data.offered,2);
  assert.equal(approved.data.wave,1);
  assert.equal((await caseDoc(cid).get()).data().verificationStatus,"validated");
  const offer=await request({token:tokens.a,path:volunteerCase(cid)+"/offer"});
  assert.equal(offer.data.status,"offered");

  // Duplicate requests preserve original offers and notices; no extra dispatch.
  const again=await request({
    token:tokens.admin,method:"POST",path:approvalPath,body:{}
  });
  assert.equal(again.code,200,JSON.stringify(again.data));
  assert.equal(again.data.approvalStatus,"already_approved");
  assert.equal(again.data.status,"waiting");
  const a=await db.collection("responseAssignments")
    .where("caseId","==",cid).get();
  assert.equal(a.size,2);
  const notifications=await db.collection("notifications")
    .where("caseId","==",cid).get();
  assert.equal(notifications.size,2);

  const accepted=await decide(cid,"a","accepted");
  assert.equal(accepted.code,200);
  assert.equal(accepted.data.status,"committed_accepted");
  const other=await decide(cid,"b","accepted");
  assert.equal(other.code,409);
  const state=await caseDoc(cid).get();
  assert.equal(state.data().activeVolunteerSupportUid,uidVolunteerA);
});
test("AUTOMATIC scheduled follow-up after approval: no manual Start or Due Scan",async()=>{
  const cid=await seedCase("automatic_due_followup");
  await caseDoc(cid).update({status:"pending_review",verificationStatus:"pending"});
  const approved=await request({
    token:tokens.admin,method:"POST",path:adminCase(cid)+"/approve",body:{}
  });
  assert.equal(approved.code,200,JSON.stringify(approved.data));
  assert.equal(approved.data.status,"offered");
  assert.equal(approved.data.offered,2);
  assert.equal((await persistentBatchRef(db,cid).get()).data().wave,1);

  // Isolated scheduler has its own automatic interval. No HTTP /due-scan or
  // /start request drives the follow-up wave.
  let onInterval,clearCount=0,scheduledMs=0;
  const processLocal=createPhase10LocalApp({
    db,authClient:auth,clock:()=>now,
    autoDueWorkerEnabled:true,autoDuePollMs:1000,
    autoDueSchedule:(fn,ms)=>{
      onInterval=fn;scheduledMs=ms;return {unref(){}};
    },
    autoDueUnschedule:()=>{clearCount++;}
  });
  try{
    assert.equal(scheduledMs,1000);
    assert.equal(typeof onInterval,"function");
    now=NOW+OFFER_MS+15;
    const advanced=await onInterval();
    assert.equal(advanced.status,"scanned",JSON.stringify(advanced));
    assert.equal(advanced.executed,1);
    const state=await view(cid);
    assert.equal(state.data.wave,3);
    assert.equal(state.data.counts.expired,2);
    assert.equal(state.data.counts.offered,1);
    const distant=await request({
      token:tokens.c,path:volunteerCase(cid)+"/offer"
    });
    assert.equal(distant.data.status,"offered");
    assert.equal(distant.data.wave,3);
    const repeat=await onInterval();
    assert.equal(repeat.status,"scanned");
    const offers=await db.collection("responseAssignments")
      .where("caseId","==",cid).get();
    assert.equal(offers.size,3,"Never duplicate offered Volunteer tasks");
  }finally{
    processLocal.locals.stopAutoDueWorker();
  }
  assert.equal(clearCount,1,"Scheduler must clean up its timer");
  const stopped=await onInterval();
  assert.equal(stopped.status,"stopped");
});
test("AUTOMATIC due worker stops offers after Volunteer Accept or Admin Cancel",async()=>{
  let onInterval;
  const processLocal=createPhase10LocalApp({
    db,authClient:auth,clock:()=>now,
    autoDueWorkerEnabled:true,autoDuePollMs:1000,
    autoDueSchedule:(fn)=>{onInterval=fn;return {unref(){}};},
    autoDueUnschedule:()=>{}
  });
  try{
    const acceptedCase=await seedCase("autodue_accepted");
    await start(acceptedCase);
    assert.equal((await decide(acceptedCase,"a","accepted")).code,200);
    now=NOW+OFFER_MS+15;
    const acceptedScan=await onInterval();
    assert.equal(acceptedScan.status,"scanned");
    assert.equal((await persistentBatchRef(db,acceptedCase).get()).data().status,"supported");
    assert.equal((await db.collection("responseAssignments")
      .doc(acceptedCase+"_"+uidVolunteerC).get()).exists,false);

    const cancelledCase=await seedCase("autodue_cancelled");
    now=NOW;
    await start(cancelledCase);
    assert.equal((await cancel(cancelledCase)).code,200);
    now=NOW+OFFER_MS+15;
    const cancelledScan=await onInterval();
    assert.equal(cancelledScan.status,"scanned");
    assert.equal((await persistentBatchRef(db,cancelledCase).get()).data().status,"cancelled");
    assert.equal((await db.collection("responseAssignments")
      .doc(cancelledCase+"_"+uidVolunteerC).get()).exists,false);
  }finally{processLocal.locals.stopAutoDueWorker()}
});
test("blocked or unapproved incident never auto-offers Volunteers",async()=>{
  const cid=await seedCase("approval_blocked");
  await caseDoc(cid).update({
    status:"pending_review",verificationStatus:"pending",dispatchBlocked:true
  });
  const response=await request({
    token:tokens.admin,method:"POST",path:adminCase(cid)+"/approve",body:{}
  });
  assert.equal(response.code,409);
  assert.equal((await caseDoc(cid).get()).data().status,"pending_review");
  assert.equal((await persistentBatchRef(db,cid).get()).exists,false);
  assert.equal((await db.collection("responseAssignments")
    .where("caseId","==",cid).get()).size,0);
});
test("real Auth token Volunteer Accept picks ONE winner; later due-scan stops waves",async()=>{
  const cid=await seedCase("accept_and_stop");
  await start(cid);
  const offerA=await request({
    token:tokens.a,path:volunteerCase(cid)+"/offer"
  });
  assert.equal(offerA.data.status,"offered");
  const responseA=await decide(cid,"a");
  assert.equal(responseA.code,200,JSON.stringify(responseA.data));
  assert.equal(responseA.data.status,"committed_accepted");
  const replay=await decide(cid,"a");
  assert.equal(replay.data.status,"already_accepted");
  const second=await decide(cid,"b");
  assert.equal(second.code,409);
  const preview=await view(cid);
  assert.equal(preview.data.acceptedResponderPresent,true);
  assert.equal(preview.data.counts.accepted,1);
  const scan=await tick();
  assert.equal(scan.code,200,JSON.stringify(scan.data));
  assert.equal(scan.data.executed,1);
  assert.equal((await persistentBatchRef(db,cid).get()).data().status,
    "supported");
  const caseData=(await caseDoc(cid).get()).data();
  assert.equal(caseData.activeVolunteerSupportUid,uidVolunteerA);
  assert.equal((await db.collection("responderLocks")
    .doc(uidVolunteerA).get()).exists,true);
  assert.equal((await db.collection("responseAssignments")
    .doc(cid+"_"+uidVolunteerC).get()).exists,false);
  const refusedCancel=await cancel(cid);
  assert.equal(refusedCancel.code,409);
  assert.equal((await db.collection("responderLocks")
    .doc(uidVolunteerA).get()).exists,true);
});
test("approved Admin cancellation preserves declined history and cancels only pending",async()=>{
  const cid=await seedCase("decline_then_cancel");
  await start(cid);
  const decline=await decide(cid,"a","declined");
  assert.equal(decline.code,200);
  const cancelled=await cancel(cid);
  assert.equal(cancelled.code,200,JSON.stringify(cancelled.data));
  assert.equal(cancelled.data.cancelledOffers,1);
  const state=await view(cid);
  assert.equal(state.data.batchStatus,"cancelled");
  assert.equal(state.data.counts.declined,1);
  assert.equal(state.data.counts.cancelled,1);
  assert.equal((await db.collection("autoVolunteerReservations")
    .doc(uidVolunteerA).get()).exists,false);
  assert.equal((await db.collection("autoVolunteerReservations")
    .doc(uidVolunteerB).get()).exists,false);
  assert.equal((await db.collection("notifications")
    .doc("phase7_offer_"+cid+"_"+uidVolunteerB).get()).exists,true);
  const repeat=await cancel(cid);
  assert.equal(repeat.data.status,"already_cancelled");
  const lateAccept=await decide(cid,"b");
  assert.equal(lateAccept.code,409);
  const restart=await start(cid);
  assert.equal(restart.code,409);
});
test("due-scan is explicit; deadline expiry offers distant SJDM Wave 3 after Wave 1",async()=>{
  const cid=await seedCase("due_progression");
  await start(cid);
  const firstTick=await tick();
  assert.equal(firstTick.data.executed,0);
  now=NOW+OFFER_MS+15;
  const secondTick=await tick();
  assert.equal(secondTick.code,200,JSON.stringify(secondTick.data));
  assert.equal(secondTick.data.executed,1);
  const state=await view(cid);
  assert.equal(state.data.wave,3);
  assert.equal(state.data.counts.expired,2);
  assert.equal(state.data.counts.offered,1);
  const distant=await request({
    token:tokens.c,path:volunteerCase(cid)+"/offer"
  });
  assert.equal(distant.data.status,"offered");
  assert.equal(distant.data.wave,3);
});
test("pending Admin, Resident, unverified email and absent bearer cannot operate",async()=>{
  const cid=await seedCase("role_denial");
  for(const t of [tokens.pending,tokens.resident,tokens.unverified,""]){
    const startDenied=await start(cid,t);
    assert.notEqual(startDenied.code,200);
    const inspectDenied=await request({token:t,path:adminCase(cid)});
    assert.notEqual(inspectDenied.code,200);
    const cancelDenied=await cancel(cid,t);
    assert.notEqual(cancelDenied.code,200);
    const dueDenied=await tick(t);
    assert.notEqual(dueDenied.code,200);
  }
  assert.equal((await persistentBatchRef(db,cid).get()).exists,false);
});
test("UI API rejects forged UIDs, non-phase10 cases and invalid request fields",async()=>{
  const cid=await seedCase("spoof_rejection");
  const invalid=await request({
    token:tokens.admin,method:"POST",
    path:"/api/phase10/admin/cases/STAGING_E2E_002/start",body:{}
  });
  assert.equal(invalid.code,400);
  const spoofed=await request({
    token:tokens.admin,method:"POST",path:adminCase(cid)+"/start",
    body:{volunteerUid:uidVolunteerA}
  });
  assert.equal(spoofed.code,400);
  await start(cid);
  const forgedDecision=await request({
    token:tokens.b,method:"POST",path:volunteerCase(cid)+"/decision",
    body:{decision:"accepted",volunteerUid:uidVolunteerA}
  });
  assert.equal(forgedDecision.code,400);
  const userA=await request({
    token:tokens.a,path:volunteerCase(cid)+"/offer"
  });
  assert.equal(userA.data.status,"offered");
  const nonVolunteer=await request({
    token:tokens.resident,path:volunteerCase(cid)+"/offer"
  });
  assert.equal(nonVolunteer.code,403);
  const revoked=uidVolunteerA;
  await db.collection("users").doc(revoked).update({status:"suspended"});
  const revokedResult=await decide(cid,"a");
  assert.equal(revokedResult.code,403);
});
test("concurrent real Firebase Auth requests Cancel vs Volunteer Accept cannot both win",async()=>{
  const cid=await seedCase("cancel_vs_accept");
  await start(cid);
  const [c,a]=await Promise.all([cancel(cid),decide(cid,"a")]);
  const caseData=(await caseDoc(cid).get()).data();
  const offer=(await ar(cid).get()).data();
  if(c.code===200&&c.data.status==="cancelled"){
    assert.equal(offer.status,"cancelled");
    assert.notEqual(a.data.status,"committed_accepted");
    assert.equal((await db.collection("responderLocks")
      .doc(uidVolunteerA).get()).exists,false);
  }else{
    assert.equal(a.data.status,"committed_accepted",JSON.stringify([c.data,a.data]));
    assert.equal(caseData.autoVolunteerAcceptedAssignmentId,cid+"_"+uidVolunteerA);
    assert.equal(offer.status,"accepted");
    assert.equal((await db.collection("responderLocks")
      .doc(uidVolunteerA).get()).exists,true);
    assert.notEqual(c.data.status,"cancelled");
  }
});
test("no server import / no deploy / no real staging fixture access",()=>{
  const serverSource=fs.readFileSync(path.join(__dirname,"server.js"),"utf8");
  const local=fs.readFileSync(path.join(__dirname,
    "autoVolunteerPhase10LocalApp.js"),"utf8");
  assert.equal(serverSource.includes("autoVolunteerPhase10LocalApp"),false);
  assert.equal(local.includes("setInterval("),false);
  assert.equal(local.includes("app.listen("),false);
  assert.ok(local.includes("env===process.env"));
  assert.throws(()=>createPhase10LocalApp({
    db,authClient:auth,env:{...process.env}
  }),/refuses non-demo/);
});
test.after(async()=>{
  if(server)await new Promise((resolve,reject)=>
    server.close(e=>e?reject(e):resolve()));
  await Promise.all(clients.map(c=>deleteClientApp(c)));
  await deleteAdminApp(adminApp);
});
