"use strict";
/**
 * Fixed FICTIONAL case STAGING_E2E_002 only.
 *
 * Admin-authorized, explicit reissue of an expired bulk offer to the SAME
 * three non-human staging test users. No resetting accepted/declined offers,
 * no overwriting prior audit, no touching STAGING_TEST_001 or production.
 */
const {FieldValue}=require("./firebaseAdmin");
const {Timestamp}=require("firebase-admin/firestore");
const {deadlineMs}=require("./staging002OfferDeadline");
const {E2E_CASE_ID,recognizedStagingCase}=require("./stagingVolunteerTask");
const {FIXTURES}=require("./staging002TestVolunteerProvisioning");
const ID=E2E_CASE_ID;
const MAX_RETRIES=2;
const TTL_MS=3*60*1000;
const blocked=reason=>({status:"blocked",reason});
const fixtureUids=FIXTURES.map(x=>x.uid).sort();
const getRef=(db,collection,id)=>db.collection(collection).doc(id);
const validAdmin=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,160}$/.test(x);

async function retryExpiredBatch002(db,adminUid,now=Date.now()){
  if(!validAdmin(adminUid))return blocked("approved_staging_admin_required");
  if(!Number.isSafeInteger(now)||now<0)return blocked("invalid_clock");
  const [caseSnap,sessionSnap,legacySnap,assignments,busy]=await Promise.all([
    getRef(db,"disasterCases",ID).get(),
    getRef(db,"emergencyAutoDispatchBatches",ID).get(),
    getRef(db,"emergencyAutoDispatch",ID).get(),
    db.collection("responseAssignments").where("caseId","==",ID).limit(201).get(),
    db.collection("responseAssignments").where(
      "status","in",["offered","accepted","responding","on_site"]).limit(201).get(),
  ]);
  if(!caseSnap.exists||!recognizedStagingCase(caseSnap.data(),ID)||
    caseSnap.data()?.verificationStatus!=="validated"||
    caseSnap.data()?.status!=="assigned"||
    caseSnap.data()?.dispatchBlocked===true||
    caseSnap.data()?.activeVolunteerSupportAssignmentId||
    legacySnap.exists)return blocked("fictional_case_not_reissuable");
  if(!sessionSnap.exists||sessionSnap.data()?.testOnly!==true||
    sessionSnap.data()?.origin!=="staging_bulk_all_eligible_002"||
    sessionSnap.data()?.status!=="waiting"||
    sessionSnap.data()?.wave!==1||
    sessionSnap.data()?.volunteerCount!==3)
    return blocked("not_waiting_fictional_wave_one");
  const retries=Number(sessionSnap.data()?.retryCount||0);
  if(!Number.isSafeInteger(retries)||retries<0||retries>=MAX_RETRIES)
    return blocked("fictional_bulk_retry_limit_reached");
  if(assignments.size!==3||busy.size>200)
    return blocked("batch_assignment_count_mismatch");
  const offers=assignments.docs.map(x=>({ref:x.ref,data:x.data()||{}}));
  const actualUids=offers.map(x=>x.data.volunteerId).sort();
  if(actualUids.some((x,i)=>x!==fixtureUids[i])||
     offers.some(x=>x.data.caseId!==ID||
       x.data.offerMode!=="staging_bulk_all_eligible"||
       x.data.wave!==1||
       x.data.status!=="offered"||
       deadlineMs(x.data.expiresAtMs)===null))
    return blocked("not_all_pending_fictional_test_offers");
  if(offers.some(x=>deadlineMs(x.data.expiresAtMs)>now))
    return blocked("some_fictional_offers_still_active");
  if(busy.docs.some(x=>x.data()?.caseId!==ID &&
      fixtureUids.includes(x.data()?.volunteerId)))
    return blocked("test_volunteer_busy_elsewhere");
  const retryNumber=retries+1;
  const logRef=getRef(db,"adminActivityLogs",
    "auto_batch_reissue_"+ID+"_"+retryNumber);
  const cRef=getRef(db,"disasterCases",ID);
  const bRef=getRef(db,"emergencyAutoDispatchBatches",ID);
  const lRef=getRef(db,"emergencyAutoDispatch",ID);
  const refs=[cRef,bRef,lRef,logRef];
  const itemRefs=fixtureUids.map(uid=>({
    uid,
    assignment:getRef(db,"responseAssignments",ID+"_"+uid),
    reservation:getRef(db,"autoVolunteerReservations",uid),
    lock:getRef(db,"responderLocks",uid),
    user:getRef(db,"users",uid),
    application:getRef(db,"volunteerApplications",uid),
    notice:getRef(db,"notifications",
      "auto_batch_reissue_"+ID+"_"+retryNumber+"_"+uid),
  }));
  const allRefs=[...refs,...itemRefs.flatMap(
    x=>[x.assignment,x.reservation,x.lock,x.user,x.application,x.notice])];
  return db.runTransaction(async tx=>{
    const all=await Promise.all(allRefs.map(x=>tx.get(x)));
    const [c,b,l,log]=all;
    if(!c.exists||!recognizedStagingCase(c.data(),ID)||
      c.data()?.status!=="assigned"||
      c.data()?.verificationStatus!=="validated"||
      c.data()?.dispatchBlocked===true||
      c.data()?.activeVolunteerSupportAssignmentId||
      !b.exists||b.data()?.status!=="waiting"||
      b.data()?.testOnly!==true||
      b.data()?.origin!=="staging_bulk_all_eligible_002"||
      b.data()?.wave!==1||b.data()?.volunteerCount!==3||
      Number(b.data()?.retryCount||0)!==retries||l.exists||log.exists)
      return blocked("case_or_batch_changed");
    const records=itemRefs.map((x,i)=>({
      ...x,
      a:all[4+i*6],r:all[5+i*6],lockSnap:all[6+i*6],
      userSnap:all[7+i*6],appSnap:all[8+i*6],noteSnap:all[9+i*6],
    }));
    for(const x of records){
      const a=x.a.exists?x.a.data()||{}:{};
      const reservation=x.r.exists?x.r.data()||{}:{};
      const user=x.userSnap.exists?x.userSnap.data()||{}:{};
      const application=x.appSnap.exists?x.appSnap.data()||{}:{};
      if(!x.a.exists||a.volunteerId!==x.uid||a.caseId!==ID||
        a.offerMode!=="staging_bulk_all_eligible"||
        a.wave!==1||a.status!=="offered"||
        deadlineMs(a.expiresAtMs)===null||
        deadlineMs(a.expiresAtMs)>now||
        !x.r.exists||reservation.caseId!==ID||
        reservation.assignmentId!==ID+"_"+x.uid||
        x.lockSnap.exists||x.noteSnap.exists||
        !x.userSnap.exists||!x.appSnap.exists||
        user.testOnly!==true||user.testFixture!==ID||
        user.role!=="volunteer"||user.status!=="approved"||
        user.volunteerAccess!==true||user.volunteerStatus!=="approved"||
        user.identityVerified!==true||
        user.barangay!=="Bagong Buhay I"||
        !Array.isArray(user.skills)||!user.skills.includes("First Aid")||
        application.testOnly!==true||application.testFixture!==ID||
        application.uid!==x.uid||application.status!=="approved")
        return blocked("fictional_volunteer_no_longer_eligible");
    }
    const expiresAtMs=now+TTL_MS;
    const stamp=FieldValue.serverTimestamp();
    const expiry=Timestamp.fromMillis(expiresAtMs);
    for(const x of records){
      tx.update(x.assignment,{expiresAtMs,updatedAt:stamp});
      tx.update(x.reservation,{expiresAt:expiry,updatedAt:stamp});
      tx.create(x.notice,{
        userId:x.uid,audience:"volunteer",
        type:"response_assignment",caseId:ID,assignmentId:ID+"_"+x.uid,
        title:"FICTIONAL staging task offer reissued",
        message:"TEST ONLY. Your fictional Volunteer offer has a new 3-minute deadline.",
        testOnly:true,read:false,createdAt:stamp,
      });
    }
    tx.create(logRef,{
      caseId:ID,action:"Fictional Staging Batch Offers Reissued",
      attempt:retryNumber,volunteerCount:3,
      performedBy:adminUid,testOnly:true,timestamp:stamp,
    });
    tx.update(bRef,{status:"waiting",retryCount:retryNumber,
      expiresAtMs,updatedAt:stamp});
    tx.update(cRef,{
      autoVolunteerDispatch:{
        state:"waiting",wave:1,attemptedCount:3,
        retryCount:retryNumber,
        note:"Fictional bulk test deadline extended for same three test accounts",
        updatedAt:stamp,
      },
      updatedAt:stamp,
    });
    return {status:"reissued",wave:1,offered:3,
      retryNumber,retriesRemaining:MAX_RETRIES-retryNumber,
      expiresAtMs,fictionalOnly:true};
  });
}
module.exports={retryExpiredBatch002,MAX_RETRIES};
