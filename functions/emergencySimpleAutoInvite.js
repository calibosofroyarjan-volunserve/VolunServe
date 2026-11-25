"use strict";
// OFF-by-default. Listens to the existing Admin Firestore validation update.
// Every approved, identity-verified, available Volunteer gets their own
// responseAssignments offer and notifications inbox item, no barangay filter.
// Server-side transaction rejects conflicting reservations and past assignments.
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const ACTIVE=["offered","accepted","responding","on_site"];
const ORIGIN="automatic_all_volunteers_no_barangay";
const LIMIT=40,POOL_LIMIT=200;
const ref=(db,col,id)=>db.collection(col).doc(id);
const result=(status,reason,extra={})=>({status,reason:reason||null,...extra});

function dispatchEnabled(env=process.env){
  const project=String(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||"");
  const approved=env.VOLUNSERVE_SIMPLE_AUTO_INVITES_PRODUCTION_APPROVED==="true";
  return env.VOLUNSERVE_SIMPLE_AUTO_INVITES_ENABLED==="true" &&
    project!=="" && project===env.VOLUNSERVE_SIMPLE_AUTO_INVITES_PROJECT_ID &&
    (project==="demo-volunserve-simple-invites" ||
      (project==="volunserve-3aa5b"&&approved));
}
function approvedTransition(before,after){
  return before?.verificationStatus!=="validated" &&
    after?.verificationStatus==="validated" &&
    after?.status==="validated" && after?.dispatchBlocked===false &&
    UID.test(String(after?.validatedBy||"")) &&
    !after?.closedAt && !after?.resolvedAt;
}
function volunteerAllowed(c,uid,app,user,busy=[]){
  return UID.test(uid) && uid!==String(c.reporterUid||"") &&
    app?.status==="approved" &&
    String(app.uid||app.userId||app.volunteerId||"")===uid &&
    ["resident","volunteer"].includes(String(user?.role||"")) &&
    user?.status==="approved" && user?.volunteerAccess===true &&
    user?.volunteerStatus==="approved" &&
    (user?.identityVerified===true||user?.identityStatus==="verified") &&
    !busy.some(a=>a.volunteerId===uid&&ACTIVE.includes(a.status));
}
function makeApprovedCaseAutoInviteHandler({db,FieldValue,env=process.env,clock=()=>Date.now()}={}){
  if(!db||!FieldValue?.serverTimestamp)throw Error("Firestore dependencies required");
  return async event=>{
    // Production is MANUAL Admin-assignment-only during Emergency Response QA.
    // Enforce independently of legacy production enable flags and before ANY
    // Firestore reads/notifications/writes. Keep the separate decision handler
    // unchanged for invitations that already existed before this policy.
    const project=String(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||"");
    if(project==="volunserve-3aa5b")
      return result("disabled","production_manual_assignment_only");
    if(!dispatchEnabled(env))return result("disabled","explicit_feature_gate_off");
    const caseId=String(event?.params?.caseId||"");
    const before=event?.data?.before?.data?.();
    const after=event?.data?.after?.data?.();
    if(!UID.test(caseId)||!approvedTransition(before,after))
      return result("ignored","not_admin_validation_transition");
    const cRef=ref(db,"disasterCases",caseId);
    const batchRef=ref(db,"emergencyAutoDispatchBatches",caseId);
    const singleRef=ref(db,"emergencyAutoDispatch",caseId);
    const adminRef=ref(db,"users",after.validatedBy);
    const appsQ=db.collection("volunteerApplications").where("status","==","approved").limit(POOL_LIMIT+1);
    const caseOffersQ=db.collection("responseAssignments").where("caseId","==",caseId).limit(POOL_LIMIT+1);
    const busyQ=db.collection("responseAssignments").where("status","in",ACTIVE).limit(POOL_LIMIT+1);
    return db.runTransaction(async tx=>{
      const [cs,admin,batch,legacy,apps,existing,active]=await Promise.all(
        [cRef,adminRef,batchRef,singleRef,appsQ,caseOffersQ,busyQ].map(r=>tx.get(r)));
      if(!cs.exists||!admin.exists)return result("blocked","missing_case_or_admin");
      const c=cs.data()||{},a=admin.data()||{};
      const now=clock(),validatedAt=c.validatedAt?.toMillis?.();
      if(!Number.isFinite(validatedAt)||!Number.isFinite(now)||
        now-validatedAt>15*60*1000||validatedAt-now>120000)
        return result("blocked","validation_not_recent");
      if(c.verificationStatus!=="validated"||
        !["validated","assigned"].includes(c.status)||
        c.dispatchBlocked!==false||c.validatedBy!==after.validatedBy||
        c.activeVolunteerSupportAssignmentId||c.activeVolunteerSupportUid||
        c.closedAt||c.resolvedAt)
        return result("blocked","case_no_longer_dispatchable");
      if(a.role!=="admin"||(a.status!=null&&a.status!=="approved")||
        a.adminStatus==="suspended")
        return result("blocked","unauthorized_validator");
      if(batch.exists||legacy.exists||existing.docs.length||c.autoVolunteerDispatch?.state)
        return result("already_started","existing_case_dispatch");
      if(apps.size>POOL_LIMIT||active.size>POOL_LIMIT||existing.size>POOL_LIMIT)
        return result("blocked","audited_pool_limit");
      const busy=active.docs.map(d=>d.data()||{});
      const seen=new Set(),roster=[];
      for(const snap of apps.docs){
        const application=snap.data()||{};
        const uid=String(application.uid||application.userId||application.volunteerId||snap.id);
        if(!UID.test(uid)||seen.has(uid))
          return result("blocked","invalid_duplicate_application_uid");
        seen.add(uid);
        roster.push({uid,application,userRef:ref(db,"users",uid)});
      }
      const users=await Promise.all(roster.map(x=>tx.get(x.userRef)));
      const eligible=roster.filter((r,i)=>
        users[i].exists&&volunteerAllowed(c,r.uid,r.application,users[i].data(),busy));
      if(!eligible.length)return result("no_available_volunteers");
      if(eligible.length>LIMIT)return result("blocked","over_40_eligible_volunteers",
        {eligible:eligible.length});
      const targets=eligible.map(v=>({
        ...v,assignmentId:caseId+"_"+v.uid,
        assignmentRef:ref(db,"responseAssignments",caseId+"_"+v.uid),
        reserveRef:ref(db,"autoVolunteerReservations",v.uid),
        lockRef:ref(db,"responderLocks",v.uid),
        notificationRef:ref(db,"notifications","auto_response_"+caseId+"_"+v.uid)
      }));
      const checked=await Promise.all(targets.flatMap(t=>
        [t.assignmentRef,t.reserveRef,t.lockRef,t.notificationRef]).map(r=>tx.get(r)));
      if(checked.some(s=>s.exists))
        return result("blocked","existing_assignment_or_reservation");
      const stamp=FieldValue.serverTimestamp();
      tx.create(batchRef,{caseId,status:"waiting",origin:ORIGIN,
        wave:1,volunteerCount:targets.length,startedBy:after.validatedBy,createdAt:stamp});
      for(const t of targets){
        const user=users[roster.findIndex(x=>x.uid===t.uid)].data()||{};
        tx.create(t.reserveRef,{caseId,uid:t.uid,assignmentId:t.assignmentId,
          origin:ORIGIN,createdAt:stamp});
        tx.create(t.assignmentRef,{caseId,volunteerId:t.uid,
          volunteerName:String(user.fullName||"Volunteer").trim().slice(0,120)||"Volunteer",
          caseTitle:String(c.title||"Emergency Report").trim().slice(0,120),
          status:"offered",offerMode:ORIGIN,createdBy:after.validatedBy,
          createdAt:stamp,updatedAt:stamp});
        tx.create(t.notificationRef,{
          userId:t.uid,audience:"volunteer",type:"response_assignment",
          caseId,assignmentId:t.assignmentId,title:"Emergency Volunteer invitation",
          message:"An approved emergency report needs Volunteer support. Open VolunServe to Accept or Decline.",
          read:false,createdAt:stamp});
      }
      tx.update(cRef,{status:"assigned",
        autoVolunteerDispatch:{state:"waiting",wave:1,origin:ORIGIN,
          attemptedCount:targets.length,updatedAt:stamp},
        updatedAt:stamp});
      return result("offered",null,{offered:targets.length});
    },{maxAttempts:5});
  };
}

// Server-authoritative Accept/Decline exclusively for the NEW automatic offers.
// Existing manual tasks keep their exact old Firebase client workflow.
function makeAutoVolunteerDecisionHandler({db,FieldValue,env=process.env}={}){
  if(!db||!FieldValue?.serverTimestamp)throw Error("Firestore dependencies required");
  return async ({uid,caseId,decision}={})=>{
    if(!dispatchEnabled(env))return result("disabled","explicit_feature_gate_off");
    if(!UID.test(String(uid||""))||!UID.test(String(caseId||""))||
      !["accepted","declined"].includes(decision))
      return result("blocked","invalid_volunteer_case_or_decision");
    const assignmentId=caseId+"_"+uid;
    const cRef=ref(db,"disasterCases",caseId);
    const taskRef=ref(db,"responseAssignments",assignmentId);
    const reserveRef=ref(db,"autoVolunteerReservations",uid);
    const lockRef=ref(db,"responderLocks",uid);
    const batchRef=ref(db,"emergencyAutoDispatchBatches",caseId);
    const userRef=ref(db,"users",uid);
    const appRef=ref(db,"volunteerApplications",uid);
    const originalRef=ref(db,"notifications","auto_response_"+assignmentId);
    const outcomeRef=ref(db,"notifications","auto_decision_"+assignmentId);
    const auditRef=ref(db,"adminActivityLogs","auto_decision_"+assignmentId);
    return db.runTransaction(async tx=>{
      const [cSnap,task,reserve,lock,batch,user,app,original,outcome,audit]=
        await Promise.all([cRef,taskRef,reserveRef,lockRef,batchRef,
          userRef,appRef,originalRef,outcomeRef,auditRef].map(r=>tx.get(r)));
      const c=cSnap.data()||{},t=task.data()||{},b=batch.data()||{};
      if(!cSnap.exists||!task.exists||!batch.exists||
        b.origin!==ORIGIN||c.autoVolunteerDispatch?.origin!==ORIGIN||
        t.offerMode!==ORIGIN||t.caseId!==caseId||t.volunteerId!==uid)
        return result("blocked","not_owned_automatic_invitation");
      if(t.status===decision)return result("already_"+decision);
      if(t.status!=="offered"||!["waiting","supported"].includes(b.status)||
        !["validated","assigned","in_progress"].includes(c.status)||
        c.dispatchBlocked===true||c.closedAt||c.resolvedAt)
        return result("blocked","offer_no_longer_pending");
      if(!user.exists||!app.exists||
        !volunteerAllowed(c,uid,app.data(),user.data(),[]))
        return result("blocked","volunteer_access_revoked");
      if(!reserve.exists||reserve.data()?.assignmentId!==assignmentId||
        reserve.data()?.caseId!==caseId||lock.exists||
        !original.exists||original.data()?.userId!==uid||
        outcome.exists||audit.exists)
        return result("blocked","reservation_or_notification_conflict");
      const recipient=decision==="accepted"?c.reporterUid:c.validatedBy;
      if(!UID.test(String(recipient||""))||recipient===uid)
        return result("blocked","invalid_notification_recipient");
      const stamp=FieldValue.serverTimestamp();
      tx.update(taskRef,{status:decision,updatedAt:stamp});
      if(decision==="accepted"){
        tx.create(lockRef,{responderUid:uid,assignmentId,caseId,
          status:"accepted",updatedAt:stamp});
        tx.update(batchRef,{status:"supported",updatedAt:stamp});
        tx.update(cRef,{"autoVolunteerDispatch.state":"supported",
          "autoVolunteerDispatch.updatedAt":stamp,updatedAt:stamp});
      }else{
        tx.delete(reserveRef);
      }
      tx.create(outcomeRef,{userId:recipient,
        audience:decision==="accepted"?"resident":"admin",
        type:decision==="accepted"?"resident_response_update":
          "emergency_dispatch_escalation",
        caseId,assignmentId,responderId:uid,
        title:decision==="accepted"?"Volunteer accepted":"Volunteer declined",
        message:decision==="accepted"?
          "A Volunteer accepted the emergency support request.":
          "One Volunteer declined an emergency support request.",
        status:decision,read:false,createdAt:stamp});
      tx.create(auditRef,{action:decision==="accepted"?
        "Automatic Volunteer Accepted":"Automatic Volunteer Declined",
        caseId,volunteerUid:uid,performedBy:uid,timestamp:stamp});
      return result(decision,null,{caseId});
    },{maxAttempts:5});
  };
}

module.exports={dispatchEnabled,approvedTransition,volunteerAllowed,makeApprovedCaseAutoInviteHandler,makeAutoVolunteerDecisionHandler};
