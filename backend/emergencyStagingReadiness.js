"use strict";

/**
 * Read-only preflight for the single hand-created synthetic staging case.
 * This NEVER writes to Firestore or offers a task. No UIDs or personal data
 * are emitted; only public-safe diagnostics about a fictional test fixture.
 */
const {planVolunteerWaves,recommendNextWave} = require("../functions/emergencyVolunteerWavePlanner");
const knownBarangays = require("../functions/sjdmBarangays.json");

const TEST_CASE_ID = "STAGING_TEST_001";
const BLOCKED = (reason) => ({status:"blocked",reason,eligible:0,wave:0});
async function inspectStagingTestCase(db) {
  const snap=await db.collection("disasterCases").doc(TEST_CASE_ID).get();
  if(!snap.exists) return BLOCKED("test_case_missing");
  const incident=snap.data() || {};
  if(incident.title !== "TEST ONLY - Dummy Emergency")
    return BLOCKED("not_a_recognized_dummy_case");
  if(incident.status !== "validated" || incident.verificationStatus !== "validated" ||
    incident.dispatchBlocked === true || !Array.isArray(incident.requiredSkills))
    return BLOCKED("invalid_test_case_fields");
  if(!incident.validatedBy || !incident.reporterUid ||
    incident.validatedBy === incident.reporterUid)
    return BLOCKED("test_case_roles_missing");
  const [admin, reporter, apps]=await Promise.all([
    db.collection("users").doc(incident.validatedBy).get(),
    db.collection("users").doc(incident.reporterUid).get(),
    db.collection("volunteerApplications").where("status","==","approved").limit(201).get()
  ]);
  if(!admin.exists || admin.data()?.role !== "admin" ||
     admin.data()?.status !== "approved")
    return BLOCKED("test_admin_not_approved");
  if(!reporter.exists || reporter.data()?.role !== "resident" ||
     reporter.data()?.status !== "approved")
    return BLOCKED("test_resident_not_approved");
  if(apps.size > 200) return BLOCKED("test_volunteer_pool_limit");
  const roster=await Promise.all(apps.docs.map(async appSnap=>{
    const application=appSnap.data()||{};
    const uid=String(application.uid||application.userId||application.volunteerId||appSnap.id).trim();
    // Read only users already found in the isolated staging pool.
    if(!uid || !/^[a-zA-Z0-9_-]{1,160}$/.test(uid)) return {uid:"",application,user:{}};
    const userSnap=await db.collection("users").doc(uid).get();
    return {uid,application,user:userSnap.exists?(userSnap.data()||{}):{}};
  }));
  const plan=planVolunteerWaves({id:TEST_CASE_ID,...incident},roster,{
    knownBarangays,neighborsByBarangay:{},activeAssignments:[]
  });
  const recommendation=recommendNextWave(plan);
  if(recommendation.action !== "offer") return BLOCKED("no_eligible_test_volunteer");
  return {status:"ready",reason:"eligible_synthetic_case_no_write",
    eligible:plan.counts.eligible,wave:recommendation.wave};
}
module.exports={inspectStagingTestCase,TEST_CASE_ID};
