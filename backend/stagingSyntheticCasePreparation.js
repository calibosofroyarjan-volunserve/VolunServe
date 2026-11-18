"use strict";

/**
 * Deliberately narrow staging QA utility. An authenticated staging Admin may
 * correct ONLY the inconsistent status of ONE pre-existing fictional case.
 * It never creates users/cases, validates evidence, offers tasks, or accesses
 * production. The service checks the isolated Firebase project separately.
 */
const {TEST_CASE_ID} = require("./emergencyStagingReadiness");
const knownBarangays=require("../functions/sjdmBarangays.json");
const {FieldValue}=require("./firebaseAdmin");

const blocked=(reason)=>({status:"blocked",reason});

async function prepareSyntheticCaseForTest(db) {
  const caseRef=db.collection("disasterCases").doc(TEST_CASE_ID);
  const stateRef=db.collection("emergencyAutoDispatch").doc(TEST_CASE_ID);
  const existingAssignments=db.collection("responseAssignments")
    .where("caseId","==",TEST_CASE_ID).limit(1);
  return db.runTransaction(async tx=>{
    // All reads first, and only the fixed test case/its assignment gate.
    const [caseSnap,stateSnap,assignmentSnap]=await Promise.all([
      tx.get(caseRef),tx.get(stateRef),tx.get(existingAssignments)
    ]);
    if(!caseSnap.exists)return blocked("test_case_missing");
    const d=caseSnap.data()||{};
    if(d.title!=="TEST ONLY - Dummy Emergency")
      return blocked("not_a_recognized_dummy_case");
    if(d.verificationStatus!=="validated" || d.dispatchBlocked===true ||
       !Array.isArray(d.requiredSkills) ||
       !d.validatedBy || !d.reporterUid || d.validatedBy===d.reporterUid ||
       !knownBarangays.includes(d.incidentBarangay))
      return blocked("other_test_case_fields_invalid");
    // Never mutate a case with any matching state or task, even if expired.
    if(stateSnap.exists || !assignmentSnap.empty ||
       d.activeVolunteerSupportAssignmentId ||
       d.activeVolunteerSupportUid || d.autoVolunteerDispatch?.state)
      return blocked("test_case_has_existing_assignment_state");
    if(d.status==="validated")return {status:"already_validated"};
    if(d.status!=="reported")return blocked("unsafe_case_status");
    tx.update(caseRef,{
      status:"validated",updatedAt:FieldValue.serverTimestamp()
    });
    return {status:"prepared",caseId:TEST_CASE_ID};
  });
}

module.exports={prepareSyntheticCaseForTest};
