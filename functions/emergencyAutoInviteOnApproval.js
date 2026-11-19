"use strict";
/**
 * REAL Firestore transactional writes under a strictly FICTIONAL EMULATOR gate.
 *
 * This is a Firebase onDocumentUpdated-compatible server handler which is
 * registered ONLY inside an explicitly opted-in local Firebase Emulator.
 * Do not activate or deploy for actual emergency operations. A future
 * production release requires independent protected geodata, reservations,
 * Cloud Tasks/queue and live Rules/notification/volunteer acceptance QA.
 */
const {planApprovedEmergencyVolunteerInvites}=require("./emergencyAutoInviteCompatibility");
const DEMO_PROJECT="demo-volunserve-auto-phase4";
const CASE_PREFIX="DEMO_AUTO_CASE_";
const TEST_CATEGORY="fictional_emergency_auto_invite_emulator";
const UID=/^[A-Za-z0-9_-]{1,160}$/;
const ACTIVE=["offered","accepted","responding","on_site"];
const result=(status,reason)=>({status,reason:reason||null,
  emulatorOnly:true,productionDispatchEnabled:false});
function explicitDemoGate(env=process.env){
  return env?.GCLOUD_PROJECT===DEMO_PROJECT &&
    env?.FIRESTORE_EMULATOR_HOST==="127.0.0.1:8080" &&
    env?.VOLUNSERVE_AUTO_VOLUNTEER_TEST_TRIGGER==="enabled" &&
    env?.VOLUNSERVE_AUTO_VOLUNTEER_DISPATCH!=="enabled" &&
    !env?.FIREBASE_SERVICE_ACCOUNT_JSON &&
    !env?.GOOGLE_APPLICATION_CREDENTIALS &&
    !env?.GOOGLE_CLOUD_KEYFILE_JSON;
}
function recognizedCase(id,data){
  return typeof id==="string" && id.startsWith(CASE_PREFIX) &&
    UID.test(id) && data?.testOnly===true &&
    data?.testCategory===TEST_CATEGORY;
}
function approvalTransition(before,after){
  return before?.verificationStatus!=="validated" &&
    after?.verificationStatus==="validated" &&
    after?.status==="validated" &&
    after?.dispatchBlocked===false &&
    UID.test(String(after?.validatedBy||""));
}
const ref=(db,coll,id)=>db.collection(coll).doc(id);
function createDemoApprovedCaseInviteHandler({
  db,FieldValue,env=process.env,knownBarangays=["Bagong Buhay I"]
}={}){
  if(!db||!FieldValue?.serverTimestamp||!Array.isArray(knownBarangays))
    throw Error("Demo Firestore transaction dependencies are required");
  return async function handleApprovedCase(event){
    if(!explicitDemoGate(env))return result("disabled","requires_local_emulators");
    const id=String(event?.params?.caseId||"");
    const before=event?.data?.before?.data?.();
    const after=event?.data?.after?.data?.();
    if(!recognizedCase(id,after)||!approvalTransition(before,after))
      return result("ignored","not_new_fictional_admin_approval");
    const caseDoc=ref(db,"disasterCases",id);
    const adminDoc=ref(db,"users",after.validatedBy);
    const batchDoc=ref(db,"emergencyAutoDispatchBatches",id);
    const legacyDoc=ref(db,"emergencyAutoDispatch",id);
    const appQuery=db.collection("volunteerApplications")
      .where("status","==","approved").limit(201);
    const caseQuery=db.collection("responseAssignments")
      .where("caseId","==",id).limit(201);
    const activeQuery=db.collection("responseAssignments")
      .where("status","in",ACTIVE).limit(201);
    // First-read is a bounded candidate discovery. Transactional re-reads
    // of users, applications, assignments, reservations, and incident below
    // are authoritative. The 201 sentinel prevents silent truncation.
    const [apps,existing,active]=await Promise.all([
      appQuery.get(),caseQuery.get(),activeQuery.get()
    ]);
    if(apps.size>200||existing.size>200||active.size>200)
      return result("blocked","audited_roster_or_assignment_limit");
    const applicationDocs=new Map();
    for(const snap of apps.docs){
      const d=snap.data()||{};
      const uid=String(d.uid||d.userId||d.volunteerId||snap.id);
      if(!UID.test(uid))return result("blocked","invalid_approved_application_uid");
      if(applicationDocs.has(uid))
        return result("blocked","duplicate_approved_application");
      applicationDocs.set(uid,snap);
    }
    const roster=await Promise.all([...applicationDocs].map(async ([uid,snap])=>{
      const u=await ref(db,"users",uid).get();
      return {uid,application:snap.data()||{},user:u.exists?u.data()||{}:{}};
    }));
    const first=planApprovedEmergencyVolunteerInvites({
      incident:{...after,id},roster,knownBarangays,
      caseAssignments:existing.docs.map(x=>x.data()||{}),
      activeAssignments:active.docs.map(x=>x.data()||{})
    });
    if(first.status!=="ready")
      return result(first.status,first.reason);
    return db.runTransaction(async tx=>{
      // READ ALL RECORDS before any write. Firestore will retry conflicting
      // concurrent case approvals and reservation claims atomically.
      const [current,admin,batch,legacy,manual,activeNow]=await Promise.all([
        tx.get(caseDoc),tx.get(adminDoc),tx.get(batchDoc),tx.get(legacyDoc),
        tx.get(caseQuery),tx.get(activeQuery)
      ]);
      if(!current.exists||!recognizedCase(id,current.data()))
        return result("blocked","case_not_recognized");
      const c=current.data()||{};
      if(c.verificationStatus!=="validated"||
        !["validated","assigned","in_progress"].includes(c.status)||
        c.validatedBy!==after.validatedBy||c.dispatchBlocked===true||
        c.resolvedAt||c.closedAt)
        return result("blocked","case_status_changed");
      if(!admin.exists||admin.data()?.role!=="admin"||
        admin.data()?.status!=="approved"||
        admin.data()?.adminStatus==="suspended")
        return result("blocked","admin_approval_not_authorized");
      if(batch.exists||legacy.exists||
         manual.docs.length||c.activeVolunteerSupportAssignmentId||
         c.activeVolunteerSupportUid||c.autoVolunteerDispatch?.state)
        return result("already_started","existing_assignment_or_dispatch");
      if(manual.size>200||activeNow.size>200)
        return result("blocked","active_assignment_pool_limit");

      // We deliberately re-read ALL candidates in one transaction because a
      // Volunteer may have been suspended or accepted another task since the
      // first approval snapshot. Reservations serialize competing engines.
      const refs=[...applicationDocs].flatMap(([uid,snap])=>[
        ref(db,"users",uid),snap.ref
      ]);
      const documents=await Promise.all(refs.map(r=>tx.get(r)));
      const checkedRoster=[...applicationDocs].map(([uid],i)=>({
        uid,user:documents[i*2].exists?documents[i*2].data()||{}:{},
        application:documents[i*2+1].exists?documents[i*2+1].data()||{}:{}
      }));
      const second=planApprovedEmergencyVolunteerInvites({
        incident:{...c,id},roster:checkedRoster,knownBarangays,
        caseAssignments:manual.docs.map(x=>x.data()||{}),
        activeAssignments:activeNow.docs.map(x=>x.data()||{})
      });
      if(second.status!=="ready")
        return result("blocked",second.reason||"no_eligible_candidates");
      // If the eligible roster has changed, a later event retry with fresh
      // discovery is needed; no partial invitations are ever committed.
      if(second.offers.map(o=>o.volunteerUid).join(",")!==
         first.offers.map(o=>o.volunteerUid).join(","))
        return result("blocked","eligible_candidate_roster_changed");
      const targetRefs=second.offers.flatMap(o=>[
        ref(db,"responseAssignments",o.assignmentId),
        ref(db,"autoVolunteerReservations",o.volunteerUid),
        ref(db,"responderLocks",o.volunteerUid),
        ref(db,"notifications",o.notificationId)
      ]);
      const targetStates=await Promise.all(targetRefs.map(r=>tx.get(r)));
      if(targetStates.some(s=>s.exists))
        return result("blocked","candidate_or_notification_conflict");

      const stamp=FieldValue.serverTimestamp();
      const expiresAtMs=Date.now()+180000;
      tx.create(batchDoc,{
        caseId:id,status:"waiting",wave:1,volunteerCount:second.offers.length,
        expiresAtMs,createdAt:stamp,testOnly:true,
        origin:"fictional_emulator_auto_volunteer_only"
      });
      for(const o of second.offers){
        const idAssignment=o.assignmentId;
        tx.create(ref(db,"autoVolunteerReservations",o.volunteerUid),{
          caseId:id,assignmentId:idAssignment,uid:o.volunteerUid,
          expiresAtMs,createdAt:stamp,testOnly:true
        });
        tx.create(ref(db,"responseAssignments",idAssignment),{
          caseId:id,volunteerId:o.volunteerUid,
          volunteerName:String(checkedRoster.find(x=>x.uid===o.volunteerUid)
            ?.user?.fullName||"Fictional Volunteer").slice(0,120),
          caseTitle:String(c.title||"FICTIONAL Emergency").slice(0,120),
          status:"offered",createdBy:"automatic_matching_engine",
          offerMode:"fictional_emulator_auto_invitation",wave:1,
          expiresAtMs,createdAt:stamp,updatedAt:stamp,testOnly:true
        });
        tx.create(ref(db,"notifications",o.notificationId),{
          userId:o.volunteerUid,audience:"volunteer",
          type:"response_assignment",caseId:id,
          assignmentId:idAssignment,
          title:"FICTIONAL Volunteer invitation",
          message:"Emulator-only simulated emergency task: Accept or Decline.",
          read:false,createdAt:stamp,testOnly:true
        });
      }
      tx.update(caseDoc,{
        status:"assigned",
        autoVolunteerDispatch:{state:"waiting",wave:1,
          attemptedCount:second.offers.length,
          note:"Fictional emulator automatic Volunteer invitation only",
          updatedAt:stamp},updatedAt:stamp
      });
      return {
        status:"offered",count:second.offers.length,wave:1,
        emulatorOnly:true,productionDispatchEnabled:false
      };
    },{maxAttempts:5});
  };
}
module.exports={
  explicitDemoGate,recognizedCase,approvalTransition,
  createDemoApprovedCaseInviteHandler,
  DEMO_PROJECT,TEST_CATEGORY
};
