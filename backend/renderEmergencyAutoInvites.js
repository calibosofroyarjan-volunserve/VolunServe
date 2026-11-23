"use strict";
/**
 * Explicit, authenticated Render alternative to Firebase Cloud Functions.
 * OFF by default; no cron polling. Called after a Resident has saved a report.
 *
 * Only the owner may request a fan-out. A separate, project-scoped flag is
 * required, with an additional explicit production approval. Each Volunteer
 * receives an independent deterministic assignment and notification.
 * No manual Admin Assign click, no barangay/skill-based recipient filtering.
 *
 * Reports remain verificationStatus=pending_verification; this module never
 * impersonates an Admin or verifies a real emergency. Do not enable for live
 * emergencies before operational review and end-to-end field tests.
 */
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const ORIGIN="render_resident_created_all_volunteers";
const ACTIVE=new Set(["offered","accepted","responding","on_site"]);
const PAGE=25;
const {volunteerAllowed}=require("../functions/emergencySimpleAutoInvite");
const result=(status,reason=null,more={})=>({status,reason,...more});
const ref=(db,c,id)=>db.collection(c).doc(id);

function config(env=process.env){
  let project="";
  try {project=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON||"{}").project_id||"";}
  catch {return {enabled:false,project:""};}
  const approvedProject=env.VOLUNSERVE_RENDER_AUTO_PROJECT_ID===project;
  const isStage=project==="volunserve-volunteer-staging";
  const isProduction=project==="volunserve-3aa5b"&&
    env.VOLUNSERVE_RENDER_AUTO_PRODUCTION_APPROVED==="true";
  const emulator=project==="demo-volunserve-simple-invites"&&
    env.FIRESTORE_EMULATOR_HOST==="127.0.0.1:8080"&&
    env.FIREBASE_AUTH_EMULATOR_HOST==="127.0.0.1:9099"&&
    env.VOLUNSERVE_RENDER_AUTO_EMULATOR_APPROVED==="true";
  return {enabled:env.VOLUNSERVE_RENDER_AUTO_ENABLED==="true"&&
    approvedProject&&(isStage||isProduction||emulator),
    project,isStage,isProduction,emulator};
}
function isRecentSubmission(c,uid,now,{staging=false}={}){
  const created=c?.createdAt?.toMillis?.();
  if(!UID.test(String(uid||""))||c?.reporterUid!==uid||
     c?.source!=="resident_emergency_assistance"||
     c?.requestKind!=="emergency_assistance"||
     c?.verificationStatus!=="pending_verification"||
     c?.status!=="reported"||
     c?.closedAt||c?.resolvedAt||c?.dispatchBlocked===true||
     !Array.isArray(c?.attachments)||
     !c.attachments.some(x=>x?.type==="image"&&typeof x.url==="string"&&
       x.url.startsWith("https://"))||
     !Number.isFinite(created)||now-created< -120000||
     now-created>10*60*1000)return false;
  if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||
     c.latitude<14.65||c.latitude>14.95||
     c.longitude<120.94||c.longitude>121.19)return false;
  if(staging&&(c.testOnly!==true||!String(c.title||"").startsWith("TEST ONLY - ")))
    return false;
  return true;
}
async function approvedRoster(db){
  const out=[],seen=new Set();
  let cursor;
  for(;;){
    let q=db.collection("volunteerApplications").orderBy("__name__").limit(PAGE);
    if(cursor)q=q.startAfter(cursor);
    const page=await q.get();
    for(const doc of page.docs){
      const data=doc.data()||{};
      if(data.status!=="approved")continue;
      const uid=String(data.uid||data.userId||data.volunteerId||doc.id);
      // Bad or duplicate applications should not prevent other eligible users.
      if(!UID.test(uid)||uid!==doc.id||seen.has(uid))continue;
      seen.add(uid);out.push(uid);
    }
    if(page.size<PAGE)break;
    cursor=page.docs[page.docs.length-1];
  }
  return out;
}
function makeEngine({db,FieldValue,env=process.env,clock=()=>Date.now()}={}){
  if(!db||!FieldValue?.serverTimestamp)throw Error("Firestore dependencies unavailable");
  const gate=config(env);
  const stamp=()=>FieldValue.serverTimestamp();
  async function submitted({uid,caseId,profile}={}){
    if(!gate.enabled)return result("disabled","explicit_render_gate_off");
    if(!UID.test(String(uid||""))||!UID.test(String(caseId||"")))
      return result("blocked","invalid_account_or_case");
    if(!profile||profile.status!=="approved"||
       profile.residentAccess!==true||["admin","superadmin"].includes(profile.role))
      return result("blocked","resident_access_required");
    const caseRef=ref(db,"disasterCases",caseId);
    const batchRef=ref(db,"emergencyAutoDispatchBatches",caseId);
    const legacyRef=ref(db,"emergencyAutoDispatch",caseId);
    const initial=await caseRef.get();
    const initialData=initial.data()||{};
    const canResume=initial.exists &&
      initialData.reporterUid===uid &&
      initialData.autoVolunteerDispatch?.origin===ORIGIN &&
      !initialData.closedAt && !initialData.resolvedAt;
    if(!initial.exists||
       (!canResume&&!isRecentSubmission(initialData,uid,clock(),{staging:gate.isStage})))
      return result("blocked","report_not_eligible");
    const roster=await approvedRoster(db);
    // Claim once; a repeated request on a completed batch is a safe no-op.
    const claim=await db.runTransaction(async tx=>{
      const [c,b,legacy]=await Promise.all(
        [caseRef,batchRef,legacyRef].map(x=>tx.get(x)));
      const data=c.data()||{};
      if(!c.exists)return result("blocked","case_not_found");
      if(b.exists){
        if(b.data()?.origin!==ORIGIN)return result("blocked","conflicting_dispatch");
        if(b.data()?.completed===true)return result("already_completed");
        const started=b.data()?.leaseAt?.toMillis?.()||0;
        if(clock()-started<60000)return result("in_progress");
        tx.update(batchRef,{leaseAt:stamp()});
        return result("resume");
      }
      if(legacy.exists||data.autoVolunteerDispatch?.state||
         !isRecentSubmission(data,uid,clock(),{staging:gate.isStage}))
        return result("blocked","previously_dispatched_or_changed");
      tx.create(batchRef,{caseId,origin:ORIGIN,status:"dispatching",
        completed:false,volunteerCount:0,reporterUid:uid,leaseAt:stamp(),
        createdAt:stamp()});
      // Keep report.status="reported" and verificationStatus pending so
      // existing Admin Validate Report workflow and security rules still work.
      tx.update(caseRef,{
        autoVolunteerDispatch:{origin:ORIGIN,state:"dispatching",
          attemptedCount:0,updatedAt:stamp()},updatedAt:stamp()});
      return result("claimed");
    },{maxAttempts:5});
    if(!["claimed","resume"].includes(claim.status))return claim;

    let newlyCreated=0;
    // One transaction per candidate keeps transaction write counts bounded and
    // makes a replay safe if Render sleeps/restarts halfway through a fan-out.
    for(const volunteerUid of roster){
      const appRef=ref(db,"volunteerApplications",volunteerUid);
      const userRef=ref(db,"users",volunteerUid);
      const taskId=caseId+"_"+volunteerUid;
      const taskRef=ref(db,"responseAssignments",taskId);
      const notifRef=ref(db,"notifications","auto_response_"+taskId);
      const reserveRef=ref(db,"autoVolunteerReservations",volunteerUid);
      const lockRef=ref(db,"responderLocks",volunteerUid);
      const busyQuery=db.collection("responseAssignments")
        .where("volunteerId","==",volunteerUid).limit(200);
      const outcome=await db.runTransaction(async tx=>{
        const [c,b,u,a,t,n,r,l,busy]=await Promise.all([
          caseRef,batchRef,userRef,appRef,taskRef,notifRef,
          reserveRef,lockRef,busyQuery].map(x=>tx.get(x)));
        const report=c.data()||{},batch=b.data()||{};
        if(!c.exists||!b.exists||batch.origin!==ORIGIN||
           batch.completed===true||
           report.autoVolunteerDispatch?.origin!==ORIGIN||
           report.closedAt||report.resolvedAt||
           ["rejected","needs_more_evidence"].includes(report.verificationStatus))
          return "skipped";
        if(t.exists)return t.data()?.offerMode===ORIGIN?"existing":"skipped";
        if(n.exists||r.exists||l.exists||!u.exists||!a.exists)
          return "skipped";
        const busyDocs=busy.docs.map(s=>s.data()||{});
        if(busy.size===200||!volunteerAllowed(
          report,volunteerUid,a.data(),u.data(),busyDocs))
          return "skipped";
        if(busyDocs.some(x=>ACTIVE.has(x.status)))return "skipped";
        const when=stamp(),name=String(u.data()?.fullName||"Volunteer").slice(0,120);
        tx.create(reserveRef,{uid:volunteerUid,caseId,
          assignmentId:taskId,origin:ORIGIN,createdAt:when});
        tx.create(taskRef,{caseId,volunteerId:volunteerUid,
          volunteerName:name,caseTitle:String(report.title||"Emergency Report").slice(0,120),
          status:"offered",offerMode:ORIGIN,createdBy:"render_server",
          createdAt:when,updatedAt:when});
        tx.create(notifRef,{userId:volunteerUid,audience:"volunteer",
          type:"response_assignment",caseId,assignmentId:taskId,
          title:"Emergency Volunteer invitation",
          message:"A new Resident emergency report requests Volunteer assistance. Accept or Decline in Volunteer Tasks.",
          read:false,createdAt:when});
        return "created";
      },{maxAttempts:5});
      if(outcome==="created")newlyCreated++;
    }
    const list=await db.collection("responseAssignments")
      .where("caseId","==",caseId).get();
    const count=list.docs.filter(x=>x.data()?.offerMode===ORIGIN).length;
    await db.runTransaction(async tx=>{
      const [c,b]=await Promise.all([caseRef,batchRef].map(x=>tx.get(x)));
      if(!c.exists||!b.exists||b.data()?.origin!==ORIGIN)return;
      const state=b.data()?.status==="supported"?"supported":
        count>0?"waiting":"no_eligible_volunteers";
      tx.update(batchRef,{status:state,volunteerCount:count,
        completed:true,updatedAt:stamp()});
      tx.update(caseRef,{"autoVolunteerDispatch.state":state,
        "autoVolunteerDispatch.attemptedCount":count,
        "autoVolunteerDispatch.updatedAt":stamp(),updatedAt:stamp()});
    });
    return result("completed",null,{offered:count,newlyCreated});
  }
  async function respond({uid,caseId,decision}={}){
    if(!gate.enabled)return result("disabled","explicit_render_gate_off");
    if(!UID.test(String(uid||""))||!UID.test(String(caseId||""))||
       !["accepted","declined"].includes(decision))
      return result("blocked","invalid_request");
    const taskId=caseId+"_"+uid, cRef=ref(db,"disasterCases",caseId);
    const tRef=ref(db,"responseAssignments",taskId);
    const rRef=ref(db,"autoVolunteerReservations",uid);
    const lRef=ref(db,"responderLocks",uid);
    const bRef=ref(db,"emergencyAutoDispatchBatches",caseId);
    const uRef=ref(db,"users",uid);
    const aRef=ref(db,"volunteerApplications",uid);
    const nRef=ref(db,"notifications","auto_response_"+taskId);
    const resultRef=ref(db,"notifications","render_decision_"+taskId);
    const auditRef=ref(db,"adminActivityLogs","render_decision_"+taskId);
    return db.runTransaction(async tx=>{
      const [c,t,r,l,b,u,a,n,oldResult,oldAudit]=await Promise.all([
        cRef,tRef,rRef,lRef,bRef,uRef,aRef,nRef,resultRef,auditRef
      ].map(x=>tx.get(x)));
      const caseData=c.data()||{},task=t.data()||{},batch=b.data()||{};
      if(!c.exists||!t.exists||!b.exists||
         caseData.autoVolunteerDispatch?.origin!==ORIGIN||
         task.offerMode!==ORIGIN||batch.origin!==ORIGIN||
         task.volunteerId!==uid||task.caseId!==caseId)
        return result("blocked","not_owned_invitation");
      if(task.status===decision)return result("already_"+decision);
      if(task.status!=="offered"||!["waiting","dispatching","supported"].includes(batch.status)||
         caseData.closedAt||caseData.resolvedAt||
         ["rejected","needs_more_evidence"].includes(caseData.verificationStatus))
        return result("blocked","not_pending");
      if(!u.exists||!a.exists||
         !volunteerAllowed(caseData,uid,a.data(),u.data(),[]))
        return result("blocked","volunteer_not_eligible");
      if(!r.exists||r.data()?.assignmentId!==taskId||l.exists||
         !n.exists||n.data()?.userId!==uid||oldResult.exists||oldAudit.exists)
        return result("blocked","reservation_conflict");
      const when=stamp();
      tx.update(tRef,{status:decision,updatedAt:when});
      if(decision==="accepted"){
        tx.create(lRef,{responderUid:uid,assignmentId:taskId,caseId,
          status:"accepted",updatedAt:when});
        tx.update(bRef,{status:"supported",updatedAt:when});
        tx.update(cRef,{"autoVolunteerDispatch.state":"supported",
          "autoVolunteerDispatch.updatedAt":when,updatedAt:when});
      }else tx.delete(rRef);
      tx.create(resultRef,{userId:caseData.reporterUid,audience:"resident",
        type:"resident_response_update",caseId,assignmentId:taskId,
        title:decision==="accepted"?"Volunteer accepted":"Volunteer declined",
        message:decision==="accepted"?
          "A Volunteer accepted the emergency request.":
          "A Volunteer declined the emergency request.",
        status:decision,read:false,createdAt:when});
      tx.create(auditRef,{action:"Render Volunteer "+decision,
        caseId,volunteerUid:uid,performedBy:uid,timestamp:when});
      return result(decision,null,{caseId});
    },{maxAttempts:5});
  }
  return {gate,submitted,respond};
}
function installRoutes({app,db,FieldValue,requireFirebaseUser,loadUserProfile,env=process.env}={}){
  const engine=makeEngine({db,FieldValue,env});
  const guarded=handler=>async(request,response)=>{
    try{
      const uid=request.firebaseUser?.uid;
      const caseId=String(request.body?.caseId||"");
      const input={uid,caseId};
      if(handler==="submit")input.profile=await loadUserProfile(uid);
      else input.decision=request.body?.decision;
      const result=await (handler==="submit"?engine.submitted(input):engine.respond(input));
      const status=result.status==="blocked"?409:result.status==="disabled"?503:200;
      response.set("Cache-Control","no-store");
      response.status(status).json({ok:status===200,...result});
    }catch(error){
      console.error("Render emergency auto invitations failed:",
        String(error?.code||error?.name||"unknown").slice(0,60));
      response.status(503).json({ok:false,status:"unavailable",
        message:"Automatic invitation service is currently unavailable. The emergency report remains saved."});
    }
  };
  app.post("/api/emergency-auto/report-submitted",
    requireFirebaseUser,guarded("submit"));
  app.post("/api/emergency-auto/respond",
    requireFirebaseUser,guarded("respond"));
  return engine;
}
module.exports={ORIGIN,config,isRecentSubmission,approvedRoster,makeEngine,installRoutes};
