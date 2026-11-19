"use strict";

/**
 * Isolated, fixed-ID, explicitly Admin-controlled fresh staging E2E fixture.
 * No API accepts reporter or Volunteer IDs from the client. No real emergency
 * cases, production Firebase project, or existing 001 records are modified.
 */
const {FieldValue}=require("./firebaseAdmin");
const {E2E_CASE_ID,E2E_CASE_TITLE,CASE_ID,CASE_TITLE}
  =require("./stagingVolunteerTask");
const {planVolunteerWaves,recommendNextWave}
  =require("../functions/emergencyVolunteerWavePlanner");
const barangays=require("../functions/sjdmBarangays.json");

const BLOCKED=reason=>({status:"blocked",reason});
const UID=x=>typeof x==="string" && /^[A-Za-z0-9_-]{1,160}$/.test(x);
const E2E_MARKER="staging_synthetic_volunteer_e2e_002";
const E2E_ORIGIN="staging_admin_qa_002";
function recognized(d){
  return !!d && d.title===E2E_CASE_TITLE &&
    d.testOnly===true && d.testCategory===E2E_MARKER &&
    d.source==="staging_synthetic_e2e";
}
function refs(db){
  return {
    fresh:db.collection("disasterCases").doc(E2E_CASE_ID),
    prior:db.collection("disasterCases").doc(CASE_ID),
    state:db.collection("emergencyAutoDispatch").doc(E2E_CASE_ID),
    assignments:db.collection("responseAssignments")
      .where("caseId","==",E2E_CASE_ID).limit(1),
  };
}
async function createFreshTestCase(db,adminUid){
  if(!UID(adminUid))return BLOCKED("approved_staging_admin_required");
  const r=refs(db);
  return db.runTransaction(async tx=>{
    const [prior,fresh,state,assignments]=await Promise.all([
      tx.get(r.prior),tx.get(r.fresh),tx.get(r.state),tx.get(r.assignments)
    ]);
    if(fresh.exists)return recognized(fresh.data())?
      {status:"already_exists"}:BLOCKED("different_document_uses_test_case_id");
    if(state.exists||!assignments.empty)
      return BLOCKED("orphan_test_002_assignment_state");
    if(!prior.exists || prior.data()?.title!==CASE_TITLE)
      return BLOCKED("trusted_staging_reference_missing");
    const reporterUid=prior.data()?.reporterUid;
    if(!UID(reporterUid)||reporterUid===adminUid)
      return BLOCKED("staging_test_reporter_unavailable");
    const residentRef=db.collection("users").doc(reporterUid);
    const resident=await tx.get(residentRef);
    if(!resident.exists||resident.data()?.role!=="resident"||
       resident.data()?.status!=="approved")
      return BLOCKED("staging_test_resident_not_approved");
    // Never copy descriptions, coordinates, contact data or real evidence.
    // This uses only the existing approved *staging* Resident's UID.
    const stamp=FieldValue.serverTimestamp();
    tx.create(r.fresh,{
      title:E2E_CASE_TITLE,
      description:"FICTIONAL STAGING QA - no real incident. Test offer only.",
      testOnly:true,testCategory:E2E_MARKER,source:"staging_synthetic_e2e",
      status:"reported",verificationStatus:"pending_verification",
      dispatchBlocked:true,requiredSkills:["First Aid"],
      reporterUid,incidentBarangay:"Bagong Buhay I",severity:"low",
      createdAt:stamp,updatedAt:stamp,
    });
    return {status:"created",caseId:E2E_CASE_ID};
  });
}
async function validateFreshTestCase(db,adminUid){
  if(!UID(adminUid))return BLOCKED("approved_staging_admin_required");
  const r=refs(db);
  const log=db.collection("adminActivityLogs").doc("auto_test_002_validated");
  return db.runTransaction(async tx=>{
    const [fresh,state,assignments]=await Promise.all([
      tx.get(r.fresh),tx.get(r.state),tx.get(r.assignments)
    ]);
    if(!fresh.exists||!recognized(fresh.data()))
      return BLOCKED("staging_002_not_created");
    if(state.exists||!assignments.empty ||
       fresh.data()?.activeVolunteerSupportAssignmentId ||
       fresh.data()?.autoVolunteerDispatch?.state)
      return BLOCKED("staging_002_already_has_assignment");
    const d=fresh.data();
    if(d.status==="validated" && d.verificationStatus==="validated")
      return {status:"already_validated",caseId:E2E_CASE_ID};
    if(d.status!=="reported"||d.verificationStatus!=="pending_verification"||
       d.dispatchBlocked!==true||!UID(d.reporterUid)||
       d.reporterUid===adminUid)
      return BLOCKED("invalid_fictional_report_review_state");
    const reporter=await tx.get(db.collection("users").doc(d.reporterUid));
    if(!reporter.exists||reporter.data()?.role!=="resident"||
       reporter.data()?.status!=="approved")
      return BLOCKED("test_resident_not_approved");
    const stamp=FieldValue.serverTimestamp();
    tx.update(r.fresh,{
      status:"validated",verificationStatus:"validated",
      dispatchBlocked:false,validatedAt:stamp,
      validatedBy:adminUid,updatedAt:stamp,
    });
    tx.create(log,{
      caseId:E2E_CASE_ID,action:"Synthetic Staging 002 Test Report Validated",
      performedBy:adminUid,origin:E2E_ORIGIN,timestamp:stamp,
    });
    return {status:"validated",caseId:E2E_CASE_ID};
  });
}
async function inspectFreshTestCase(db){
  const r=refs(db),snap=await r.fresh.get();
  if(!snap.exists)return {status:"not_created",eligible:0,wave:0};
  const d=snap.data()||{};
  if(!recognized(d))return BLOCKED("not_a_recognized_002_test_case");
  const [state,assignments]=await Promise.all([r.state.get(),r.assignments.get()]);
  if(state.exists || !assignments.empty ||
     d.activeVolunteerSupportAssignmentId || d.autoVolunteerDispatch?.state)
    return {status:"existing_assignment",reason:"verify_existing_002_task",
      eligible:0,wave:0};
  if(d.status==="reported"&&d.verificationStatus==="pending_verification")
    return {status:"reported",reason:"requires_explicit_staging_admin_validation",
      eligible:0,wave:0};
  if(d.status!=="validated"||d.verificationStatus!=="validated"||
     d.dispatchBlocked===true||!UID(d.reporterUid)||!UID(d.validatedBy))
    return BLOCKED("test_002_invalid_fields");
  const [admin,resident,apps,busy]=await Promise.all([
    db.collection("users").doc(d.validatedBy).get(),
    db.collection("users").doc(d.reporterUid).get(),
    db.collection("volunteerApplications").where("status","==","approved")
      .limit(201).get(),
    db.collection("responseAssignments")
      .where("status","in",["offered","accepted","responding","on_site"])
      .limit(201).get(),
  ]);
  if(!admin.exists||admin.data()?.role!=="admin"||
     admin.data()?.status!=="approved")
    return BLOCKED("test_admin_not_approved");
  if(!resident.exists||resident.data()?.role!=="resident"||
     resident.data()?.status!=="approved")
    return BLOCKED("test_resident_not_approved");
  if(apps.size>200||busy.size>200)return BLOCKED("staging_pool_limit");
  const roster=await Promise.all(apps.docs.map(async snap=>{
    const app=snap.data()||{};
    const uid=String(app.uid||app.userId||app.volunteerId||snap.id).trim();
    if(!UID(uid))return {uid:"",application:app,user:{}};
    const person=await db.collection("users").doc(uid).get();
    return {uid,application:app,user:person.exists?person.data()||{}:{}};
  }));
  const plan=planVolunteerWaves({id:E2E_CASE_ID,...d},roster,{
    knownBarangays:barangays,neighborsByBarangay:{},
    activeAssignments:busy.docs.map(doc=>doc.data())
  });
  const next=recommendNextWave(plan);
  if(next.action!=="offer")return BLOCKED("no_free_approved_test_volunteer");
  return {status:"ready",reason:"approved_test_volunteer_available",
    eligible:plan.counts.eligible,wave:next.wave};
}
module.exports={createFreshTestCase,validateFreshTestCase,
  inspectFreshTestCase,recognized,E2E_MARKER};
