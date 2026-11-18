"use strict";
/**
 * Three non-human volunteer accounts for the fixed fictional 002 test.
 * Authenticated staging Admin only; Firebase Auth passwords supplied only by
 * the Admin's browser (never hardcoded, logged, or stored in Firestore).
 *
 * DOES NOT backfill or modify existing user accounts, STAGING_TEST_001,
 * production data, actual volunteer identities, or any emergency assignment.
 */
const {FieldValue}=require("./firebaseAdmin");
const {verifiedStagingProject}=require("./emergencyAutoDispatchWorker");
const {E2E_CASE_ID,E2E_CASE_TITLE}=require("./stagingVolunteerTask");
const {recognized}=require("./stagingFreshCase002");

const PROJECT="volunserve-volunteer-staging";
const FEATURE="VOLUNSERVE_STAGING_E2E_002_TEST_VOLUNTEERS";
const FIXTURES=Object.freeze([1,2,3].map(n=>Object.freeze({
  slot:n,
  uid:"staging002_qa_volunteer_0"+n,
  email:"staging002.qa.volunteer"+n+"@example.com",
  name:"FICTIONAL Staging QA Volunteer "+n,
})));
const validUid=uid=>/^[a-zA-Z0-9_-]{1,160}$/.test(uid||"");
function allowed(env) {
  return env?.[FEATURE]==="enabled" &&
    env?.VOLUNSERVE_AUTO_VOLUNTEER_STAGING_PROJECT_ID===PROJECT &&
    verifiedStagingProject(env);
}
function validPasswords(passwords) {
  return Array.isArray(passwords) && passwords.length===3 &&
    passwords.every(p=>typeof p==="string" && p.length>=16 && p.length<=70 &&
      /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p)) &&
    new Set(passwords).size===3;
}
function isOurs(user,app,fixture) {
  return user?.testOnly===true && user?.testFixture==="STAGING_E2E_002" &&
    user?.testFixtureSlot===fixture.slot && user?.role==="volunteer" &&
    app?.testOnly===true && app?.testFixture==="STAGING_E2E_002" &&
    app?.uid===fixture.uid && app?.status==="approved";
}
const blocked=reason=>({status:"blocked",reason,created:0});
async function fixtureSummary({db,authClient,env}) {
  if(!allowed(env))return blocked("staging_test_user_setup_disabled");
  const caseSnap=await db.collection("disasterCases").doc(E2E_CASE_ID).get();
  if(!caseSnap.exists||!recognized(caseSnap.data()))
    return blocked("fictional_002_missing_or_unrecognized");
  const state=caseSnap.data()||{};
  if(state.title!==E2E_CASE_TITLE || state.status!=="validated" ||
     state.verificationStatus!=="validated" || state.dispatchBlocked===true)
    return blocked("fictional_002_must_be_validated");
  const batch=await db.collection("emergencyAutoDispatchBatches").doc(E2E_CASE_ID).get();
  if(batch.exists)return blocked("fictional_002_batch_already_started");
  const legacy=await db.collection("emergencyAutoDispatch").doc(E2E_CASE_ID).get();
  if(legacy.exists)return blocked("fictional_002_legacy_offer_exists");
  const slots=[];
  for(const f of FIXTURES){
    const [u,a]=await Promise.all([
      db.collection("users").doc(f.uid).get(),
      db.collection("volunteerApplications").doc(f.uid).get()
    ]);
    let authExists=false;
    try{
      await authClient.getUser(f.uid);
      authExists=true;
    }catch(error){
      if(error?.code!=="auth/user-not-found")throw error;
    }
    const owned=u.exists&&a.exists&&isOurs(u.data(),a.data(),f);
    const unused=!u.exists&&!a.exists&&!authExists;
    slots.push({slot:f.slot,email:f.email,
      state:owned&&authExists?"existing":unused?"available":"blocked"});
  }
  return {status:slots.some(s=>s.state==="blocked")?"blocked":"ready",
    reason:slots.some(s=>s.state==="blocked")?"fixture_slot_conflict":"none",
    slots,willWrite:false,noCredentialsReturned:true};
}
async function provisionFixtures({db,authClient,env,adminUid,passwords}) {
  if(!validUid(adminUid))return blocked("approved_staging_admin_required");
  if(!allowed(env))return blocked("staging_test_user_setup_disabled");
  if(!validPasswords(passwords))return blocked("three_unique_strong_passwords_required");
  const preflight=await fixtureSummary({db,authClient,env});
  if(preflight.status!=="ready")
    return blocked(preflight.reason||"staging_fixture_not_ready");
  const created=[],preserved=[];
  for(let i=0;i<FIXTURES.length;i++){
    const f=FIXTURES[i],slot=preflight.slots[i];
    if(slot.state==="existing"){preserved.push(f.slot);continue;}
    // Exact deterministic staging fixture only. No arbitrary UID or email.
    let authCreated=false;
    try{
      await authClient.createUser({
        uid:f.uid,email:f.email,password:passwords[i],
        emailVerified:false,disabled:false,displayName:f.name,
      });
      authCreated=true;
      await db.runTransaction(async tx=>{
        const userRef=db.collection("users").doc(f.uid);
        const applicationRef=db.collection("volunteerApplications").doc(f.uid);
        const [u,a]=await Promise.all([tx.get(userRef),tx.get(applicationRef)]);
        if(u.exists||a.exists)throw Error("test_fixture_occupied");
        const stamp=FieldValue.serverTimestamp();
        tx.create(userRef,{
          role:"volunteer",status:"approved",
          volunteerAccess:true,volunteerStatus:"approved",
          identityVerified:true, identityVerificationSource:"fictional_staging_fixture_not_real_id",
          barangay:"Bagong Buhay I",skills:["First Aid"],
          fullName:f.name,
          testOnly:true,testFixture:"STAGING_E2E_002",testFixtureSlot:f.slot,
          testCreatedBy:adminUid,createdAt:stamp,updatedAt:stamp
        });
        tx.create(applicationRef,{
          uid:f.uid,status:"approved",skills:["First Aid"],
          testOnly:true,testFixture:"STAGING_E2E_002",
          testFixtureSlot:f.slot,reviewOrigin:"isolated_fictional_qa_only",
          createdAt:stamp,approvedAt:stamp
        });
      });
      created.push(f.slot);
    }catch(error){
      // Roll back only a newly-created Auth user if its Firestore write fails.
      // NEVER delete or modify previously existing accounts.
      if(authCreated){
        try{await authClient.deleteUser(f.uid);}
        catch{return blocked("new_test_auth_rollback_needs_manual_review");}
      }
      return {...blocked("staging_test_slot_provision_failed"),created:created.length};
    }
  }
  return {status:"ready",created:created.length,alreadyExisting:preserved.length,
    slots:FIXTURES.map(f=>({slot:f.slot,email:f.email})),
    passwordsReturned:false,productionUntouched:true};
}
module.exports={FIXTURES,PROJECT,FEATURE,allowed,validPasswords,
  fixtureSummary,provisionFixtures};