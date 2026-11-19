"use strict";
/**
 * Secure, individual Accept/Decline decisions for a FICTIONAL Firestore
 * Functions + Auth Emulator demonstration. NO production registration.
 *
 * Only a verified callable Firebase Auth UID is permitted to act on its own
 * deterministic invitation. A decision never takes a client-provided UID,
 * role, assignment document ID, notification ID, or reporter identity.
 *
 * All-eligible Volunteers receive offers and can independently Accept or
 * Decline while their own three-minute offer is valid. A first acceptance
 * stops further geographic escalation, but does not silently decline the
 * other already-invited fictional Volunteers. This preserves staging's
 * multi-Volunteer acceptance behavior without changing live production's
 * manual one-active-Volunteer code.
 */
const {
  explicitDemoGate,recognizedCase
}=require("./emergencyAutoInviteOnApproval");
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const ORIGIN="fictional_emulator_auto_volunteer_only";
const MODE="fictional_emulator_auto_invitation";
const VALID_DECISIONS=new Set(["accepted","declined"]);
const ref=(db,col,id)=>db.collection(col).doc(id);
const fail=reason=>({
  status:"blocked",reason,emulatorOnly:true,productionDispatchEnabled:false
});
const ok=(status,caseId)=>({
  status,caseId,emulatorOnly:true,productionDispatchEnabled:false
});

function createDemoVolunteerDecision({
  db,FieldValue,env=process.env,clock=()=>Date.now()
}={}){
  if(!db||!FieldValue?.serverTimestamp||!FieldValue?.increment||
     typeof clock!=="function")
    throw Error("Real Firestore Emulator Admin dependencies required");

  return async function decide({uid,caseId,decision}={}){
    if(!explicitDemoGate(env))return fail("requires_local_emulators");
    if(typeof uid!=="string"||!UID.test(uid)||
       typeof caseId!=="string"||!caseId.startsWith("DEMO_AUTO_CASE_")||
       !UID.test(caseId)||!VALID_DECISIONS.has(decision))
      return fail("invalid_authenticated_volunteer_case_or_decision");

    const assignmentId=caseId+"_"+uid;
    const taskRef=ref(db,"responseAssignments",assignmentId);
    const caseRef=ref(db,"disasterCases",caseId);
    const batchRef=ref(db,"emergencyAutoDispatchBatches",caseId);
    const resRef=ref(db,"autoVolunteerReservations",uid);
    const lockRef=ref(db,"responderLocks",uid);
    const personRef=ref(db,"users",uid);
    const appRef=ref(db,"volunteerApplications",uid);
    const originalNoteRef=ref(db,"notifications","auto_response_"+assignmentId);
    const outcomeNoteRef=ref(db,"notifications",
      "emulator_auto_"+decision+"_"+assignmentId);
    const auditRef=ref(db,"adminActivityLogs",
      "emulator_auto_decision_"+assignmentId);

    return db.runTransaction(async tx=>{
      // Reads precede writes so Firestore retries competing decisions and
      // collisions against assignment state/responder locks atomically.
      const [caseSnap,batchSnap,task,reservation,lock,person,application,
        originalNote,outcomeNote,audit]=await Promise.all([
        caseRef,batchRef,taskRef,resRef,lockRef,personRef,appRef,
        originalNoteRef,outcomeNoteRef,auditRef
      ].map(r=>tx.get(r)));
      if(!caseSnap.exists||!recognizedCase(caseId,caseSnap.data())||
         !batchSnap.exists||batchSnap.data()?.testOnly!==true||
         batchSnap.data()?.origin!==ORIGIN)
        return fail("not_a_recognized_fictional_batch");
      const c=caseSnap.data()||{},batch=batchSnap.data()||{};
      if(!task.exists)return fail("volunteer_not_invited");
      const a=task.data()||{};
      if(a.caseId!==caseId||a.volunteerId!==uid||
         a.offerMode!==MODE||a.testOnly!==true||
         a.createdBy!=="automatic_matching_engine")
        return fail("offer_does_not_belong_to_authenticated_volunteer");

      // Idempotence: a repeated identical decision never sends a second
      // notification or audit. A corrupted accepted responder lock is
      // reported for review rather than treated as successful acceptance.
      if(a.status===decision){
        if(decision==="accepted" &&
           (!lock.exists||lock.data()?.caseId!==caseId||
            lock.data()?.responderUid!==uid||
            lock.data()?.assignmentId!==assignmentId))
          return fail("accepted_responder_lock_requires_review");
        return ok("already_"+decision,caseId);
      }
      if(a.status!=="offered")return fail("offer_already_decided");
      if(!["waiting","supported"].includes(batch.status)||
         !["validated","assigned","in_progress"].includes(c.status)||
         c.verificationStatus!=="validated"||c.dispatchBlocked===true||
         c.resolvedAt||c.closedAt||
         c.autoVolunteerDispatch?.state==="cancelled")
        return fail("incident_or_batch_no_longer_open");
      const now=clock();
      if(!Number.isSafeInteger(now)||!Number.isSafeInteger(a.expiresAtMs)||
         a.expiresAtMs<=now)
        return fail("volunteer_offer_expired");
      if(c.reporterUid===uid)
        return fail("reporter_cannot_respond_to_own_emergency");
      if(!person.exists||!application.exists||
         !["volunteer","resident"].includes(person.data()?.role)||
         person.data()?.status!=="approved"||
         person.data()?.volunteerAccess!==true||
         person.data()?.volunteerStatus!=="approved"||
         (person.data()?.identityVerified!==true&&
           person.data()?.identityStatus!=="verified")||
         application.data()?.uid!==uid||
         application.data()?.status!=="approved")
        return fail("volunteer_is_no_longer_authorized");
      if(!reservation.exists||reservation.data()?.caseId!==caseId||
         reservation.data()?.assignmentId!==assignmentId||
         reservation.data()?.uid!==uid||lock.exists)
        return fail("reservation_or_responder_lock_conflict");
      if(!originalNote.exists||
         originalNote.data()?.userId!==uid||
         originalNote.data()?.caseId!==caseId||
         originalNote.data()?.assignmentId!==assignmentId||
         outcomeNote.exists||audit.exists)
        return fail("invitation_or_decision_audit_conflict");
      if(decision==="accepted"){
        const reporter=String(c.reporterUid||"");
        if(!UID.test(reporter)||reporter===uid)
          return fail("invalid_fictional_reporter");
      }
      if(decision==="declined"){
        const approver=String(c.validatedBy||"");
        if(!UID.test(approver)||approver===uid)
          return fail("invalid_fictional_admin");
      }

      const stamp=FieldValue.serverTimestamp();
      tx.update(taskRef,{status:decision,updatedAt:stamp});
      tx.create(auditRef,{
        caseId,assignmentId,volunteerUid:uid,decision,
        action:decision==="accepted"?
          "Fictional Automatic Volunteer Accepted":
          "Fictional Automatic Volunteer Declined",
        testOnly:true,createdAt:stamp
      });
      if(decision==="accepted"){
        tx.create(lockRef,{
          caseId,assignmentId,responderUid:uid,
          status:"accepted",testOnly:true,updatedAt:stamp
        });
        tx.create(outcomeNoteRef,{
          userId:c.reporterUid,audience:"resident",
          type:"resident_response_update",caseId,
          assignmentId,responderId:uid,
          title:"Fictional Volunteer accepted",
          message:"One fictional Volunteer accepted a demo emergency invite.",
          status:"accepted",read:false,testOnly:true,createdAt:stamp
        });
        tx.update(batchRef,{
          status:"supported",acceptedCount:FieldValue.increment(1),
          updatedAt:stamp
        });
        tx.update(caseRef,{
          "autoVolunteerDispatch.state":"supported",
          "autoVolunteerDispatch.updatedAt":stamp,
          updatedAt:stamp
        });
      }else{
        tx.delete(resRef);
        tx.create(outcomeNoteRef,{
          userId:c.validatedBy,audience:"admin",
          type:"emergency_dispatch_escalation",caseId,
          assignmentId,volunteerUid:uid,
          title:"Fictional Volunteer declined",
          message:"One fictional Volunteer declined the demo emergency invite.",
          read:false,testOnly:true,createdAt:stamp
        });
        tx.update(batchRef,{
          declinedCount:FieldValue.increment(1),updatedAt:stamp
        });
      }
      return ok(decision,caseId);
    },{maxAttempts:5});
  };
}
module.exports={
  createDemoVolunteerDecision,VALID_DECISIONS
};
