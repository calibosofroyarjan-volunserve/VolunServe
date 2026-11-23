"use strict";
/**
 * DEMO-ONLY automatic Resident-created Emergency Report fanout.
 * Real emergency dispatch MUST NOT be activated by this function.
 * It is OFF by default and refuses the production Firebase project.
 *
 * Small batches and deterministic document IDs avoid the previous 40-volunteer
 * all-or-nothing limit. Each candidate is independently checked and invited in
 * a transaction, allowing retries to resume without duplicate notifications.
 */
const {volunteerAllowed}=require("./emergencySimpleAutoInvite");
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const ORIGIN="automatic_resident_submission_demo";
const PAGE_SIZE=25;
const ref=(db,c,id)=>db.collection(c).doc(id);
const active=["offered","accepted","responding","on_site"];
const response=(status,details={})=>({status,...details});

function demoEnabled(env=process.env){
  const project=String(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||"");
  if(env.VOLUNSERVE_RESIDENT_SUBMISSION_DEMO_ENABLED!=="true"||
     env.VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID!==project||
     env.VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED!=="true")return false;
  return project==="demo-volunserve-simple-invites"||
    (project==="volunserve-volunteer-staging"&&
     env.VOLUNSERVE_RESIDENT_DEMO_STAGING_APPROVED==="true");
}

function demoIncidentAllowed(data,env=process.env){
  if(!data||data.status!=="reported"||
     !["pending_verification","pending"].includes(data.verificationStatus)||
     data.dispatchBlocked!==true||
     !UID.test(String(data.reporterUid||""))||
     typeof data.title!=="string"||!data.title.trim()||
     data.resolvedAt||data.closedAt)return false;
  const project=String(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||"");
  // Staging requires an explicit non-real synthetic fixture; the emulator
  // itself is entirely fictional and can use the normal Resident create form.
  return project==="demo-volunserve-simple-invites" ||
    (project==="volunserve-volunteer-staging"&&
     data.testOnly===true&&
     data.source==="staging_synthetic_e2e"&&
     data.title.startsWith("TEST ONLY"));
}

function makeResidentSubmissionDemoHandler({db,FieldValue,env=process.env}={}){
  if(!db||!FieldValue?.serverTimestamp)throw Error("Firestore dependencies missing");
  return async event=>{
    if(!demoEnabled(env))return response("disabled");
    const caseId=String(event?.params?.caseId||"");
    const submitted=event?.data?.data?.();
    if(!UID.test(caseId)||!demoIncidentAllowed(submitted,env))
      return response("ignored");
    const caseRef=ref(db,"disasterCases",caseId);
    const batchRef=ref(db,"emergencyAutoDispatchBatches",caseId);
    const legacyRef=ref(db,"emergencyAutoDispatch",caseId);
    const roster=[];
    // Iterate ALL approved application pages; no 40-person hard cut-off.
    let cursor=null;
    do{
      let q=db.collection("volunteerApplications")
        .where("status","==","approved").orderBy("__name__").limit(PAGE_SIZE);
      if(cursor)q=q.startAfter(cursor);
      const page=await q.get();
      for(const s of page.docs){
        const candidate=s.data()||{};
        const uid=String(candidate.uid||candidate.userId||candidate.volunteerId||s.id);
        if(UID.test(uid)&&uid!==submitted.reporterUid)
          roster.push({uid});
      }
      cursor=page.size===PAGE_SIZE?page.docs[page.docs.length-1]:null;
    }while(cursor);
    const unique=[...new Set(roster.map(x=>x.uid))];
    if(!unique.length)return response("no_eligible_volunteers");
    const start=await db.runTransaction(async tx=>{
      const [c,b,legacy]=await Promise.all([caseRef,batchRef,legacyRef].map(x=>tx.get(x)));
      if(!c.exists)return response("blocked",{reason:"case_removed"});
      const data=c.data()||{};
      if(b.exists){
        return b.data()?.origin===ORIGIN&&
          ["dispatching","waiting","supported"].includes(b.data()?.status)?
          response("resume"):response("blocked",{reason:"conflicting_dispatch"});
      }
      if(legacy.exists||data.autoVolunteerDispatch?.state||
         !demoIncidentAllowed(data,env))
        return response("blocked",{reason:"case_changed_or_previously_dispatched"});
      const stamp=FieldValue.serverTimestamp();
      tx.create(batchRef,{caseId,status:"dispatching",origin:ORIGIN,
        wave:1,volunteerCount:0,createdAt:stamp});
      tx.update(caseRef,{
        status:"assigned",dispatchBlocked:false,
        autoVolunteerDispatch:{state:"dispatching",origin:ORIGIN,
          attemptedCount:0,updatedAt:stamp},updatedAt:stamp
      });
      return response("started");
    });
    if(!["started","resume"].includes(start.status))return start;
    let issued=0;
    for(const uid of unique){
      const assignmentId=caseId+"_"+uid;
      const aRef=ref(db,"responseAssignments",assignmentId);
      const nRef=ref(db,"notifications","auto_response_"+assignmentId);
      const rRef=ref(db,"autoVolunteerReservations",uid);
      const lRef=ref(db,"responderLocks",uid);
      const uRef=ref(db,"users",uid);
      const vRef=ref(db,"volunteerApplications",uid);
      const outcome=await db.runTransaction(async tx=>{
        const busyQuery=db.collection("responseAssignments")
          .where("volunteerId","==",uid);
        const [c,b,u,v,a,n,r,l,busy]=await Promise.all([
          caseRef,batchRef,uRef,vRef,aRef,nRef,rRef,lRef,busyQuery
        ].map(x=>tx.get(x)));
        const cd=c.data()||{},bd=b.data()||{},ud=u.data()||{};
        if(!c.exists||!b.exists||bd.origin!==ORIGIN||
           cd.autoVolunteerDispatch?.origin!==ORIGIN||
           !["dispatching","waiting","supported"].includes(bd.status))
          return "skipped";
        if(a.exists)return a.data()?.offerMode===ORIGIN?"existing":"skipped";
        if(n.exists||r.exists||l.exists||!u.exists||!v.exists)
          return "skipped";
        const busyTasks=busy.docs.map(s=>s.data()||{});
        if(!volunteerAllowed(cd,uid,v.data(),ud,busyTasks))
          return "skipped";
        if(busyTasks.some(x=>x.volunteerId===uid&&active.includes(x.status)))
          return "skipped";
        const stamp=FieldValue.serverTimestamp();
        tx.create(rRef,{caseId,uid,assignmentId,origin:ORIGIN,createdAt:stamp});
        tx.create(aRef,{caseId,volunteerId:uid,
          volunteerName:String(ud.fullName||"Volunteer").trim().slice(0,120)||"Volunteer",
          caseTitle:String(cd.title||"Emergency Report").trim().slice(0,120),
          status:"offered",offerMode:ORIGIN,createdBy:"automatic_resident_demo",
          createdAt:stamp,updatedAt:stamp});
        tx.create(nRef,{userId:uid,audience:"volunteer",
          type:"response_assignment",caseId,assignmentId,
          title:"TEST ONLY - Emergency Volunteer invitation",
          message:"A fictional Resident emergency report was submitted. Accept or Decline in Notifications or Volunteer Tasks.",
          read:false,createdAt:stamp});
        return "created";
      },{maxAttempts:5});
      if(outcome==="created")issued++;
    }
    const existing=await db.collection("responseAssignments")
      .where("caseId","==",caseId).get();
    const total=existing.docs.filter(s=>s.data()?.offerMode===ORIGIN).length;
    await db.runTransaction(async tx=>{
      const [c,b]=await Promise.all([caseRef,batchRef].map(x=>tx.get(x)));
      if(!c.exists||!b.exists||b.data()?.origin!==ORIGIN)return;
      const stamp=FieldValue.serverTimestamp();
      // Never downgrade supported state if a Volunteer accepted quickly.
      const state=b.data()?.status==="supported"?"supported":
        total?"waiting":"no_eligible_volunteers";
      tx.update(batchRef,{status:state,volunteerCount:total,updatedAt:stamp});
      tx.update(caseRef,{
        "autoVolunteerDispatch.state":state,
        "autoVolunteerDispatch.attemptedCount":total,
        "autoVolunteerDispatch.updatedAt":stamp,
        updatedAt:stamp
      });
    });
    return response(total?"offered":"no_eligible_volunteers",
      {total,createdThisAttempt:issued});
  };
}

module.exports={ORIGIN,PAGE_SIZE,demoEnabled,demoIncidentAllowed,makeResidentSubmissionDemoHandler};
