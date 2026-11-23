"use strict";
/**
 * VolunServe fixed-fictional E2E 002: one-command authenticated CLOUD decline.
 * Local operator must hold the isolated staging service-account credential.
 * No password reset, no production access, no direct Firestore mutation.
 *
 * The service account mints short-lived Firebase custom sign-ins for the
 * EXISTING operational staging Admin who validated this fictional case and
 * the exact already-existing test-only Volunteer 3. It calls actual Render
 * Admin/Volunteer endpoints for all writes and checks final cloud state.
 * NOT proof of ordinary email+password login or production functionality.
 */
const fs=require("node:fs");
const path=require("node:path");
const {createRequire}=require("node:module");
const assert=require("node:assert/strict");
const PROJECT="volunserve-volunteer-staging";
const CASE="STAGING_E2E_002";
const UID="staging002_qa_volunteer_03";
const EMAIL="staging002.qa.volunteer3@example.com";
const API="https://volunserve-emergency-match-staging-free.onrender.com";
const FIREBASE_WEB_KEY="AIzaSyCGS-VySgPPEcqgKH0tBqQCZX_YYhJFuuM";
const FIXTURE_UIDS=[1,2,3].map(x=>"staging002_qa_volunteer_0"+x);
function fail(message){throw Error("BLOCKED: "+message)}
function parse(args){
  let keyFile="",apply=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--key-file"&&args[i+1]&&!keyFile){keyFile=args[++i];continue;}
    if(args[i]==="--apply"){apply=true;continue;}
    fail("Unknown or missing parameter");
  }
  if(!keyFile||!apply)fail('Usage: node scripts/qa-staging002-volunteer3-decline.cjs --key-file "C:\\path\\staging-service-account.json" --apply');
  return keyFile;
}
function ownedProfile(user,application,slot){
  const uid=FIXTURE_UIDS[slot-1];
  return user?.role==="volunteer"&&user?.status==="approved"&&
    user?.volunteerStatus==="approved"&&user?.volunteerAccess===true&&
    user?.identityVerified===true&&user?.testOnly===true&&
    user?.testFixture===CASE&&user?.testFixtureSlot===slot&&
    application?.status==="approved"&&application?.uid===uid&&
    application?.testOnly===true&&application?.testFixture===CASE&&
    application?.testFixtureSlot===slot;
}
function adminProfile(user){
  return user?.role==="admin"&&
    (user.status==="approved"||!Object.hasOwn(user,"status"))&&
    String(user.adminStatus||"").toLowerCase()!=="suspended";
}
function header(token){return {Authorization:"Bearer "+token,"Cache-Control":"no-store"}}
async function request(url,options){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
  let data;try{data=await response.json()}catch{fail("Unexpected response format from isolated staging service");}
  if(!response.ok||data.ok===false)
    fail("Staging API "+response.status+" "+String(data.error||data.reason||data.status||"rejected").slice(0,120));
  return data;
}
async function signIn(auth,uid){
  const ticket=await auth.createCustomToken(uid);
  const response=await request("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+FIREBASE_WEB_KEY,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token:ticket,returnSecureToken:true})
  });
  // signInWithCustomToken may omit localId. Verify the returned ID token
  // cryptographically with the SAME isolated staging Firebase Admin client.
  if(!response.idToken)fail("Staging custom sign-in did not return an ID token");
  const decoded=await auth.verifyIdToken(response.idToken,true);
  if(decoded?.uid!==uid||decoded?.aud!==PROJECT||
     decoded?.iss!=="https://securetoken.google.com/"+PROJECT)
    fail("Verified isolated staging Firebase session does not match expected UID/project");
  return response.idToken;
}
async function snapshot(db){
  const [c,b,...assignments]=await Promise.all([
    db.collection("disasterCases").doc(CASE).get(),
    db.collection("emergencyAutoDispatchBatches").doc(CASE).get(),
    ...FIXTURE_UIDS.map(uid=>db.collection("responseAssignments").doc(CASE+"_"+uid).get())
  ]);
  if(!c.exists||!b.exists||assignments.some(s=>!s.exists))
    fail("Incomplete fixed fictional staging case/batch");
  const incident=c.data(),batch=b.data(),offers=assignments.map(s=>s.data());
  if(incident?.testOnly!==true||incident.testCategory!=="staging_synthetic_volunteer_e2e_002"||
    incident.source!=="staging_synthetic_e2e"||incident.status!=="assigned"||
    incident.verificationStatus!=="validated"||incident.dispatchBlocked===true||
    batch?.testOnly!==true||batch.origin!=="staging_bulk_all_eligible_002"||
    batch.status!=="waiting"||batch.volunteerCount!==3)
    fail("Unexpected fictional case or batch state");
  if(offers.some((a,i)=>a.caseId!==CASE||a.volunteerId!==FIXTURE_UIDS[i]||
    a.offerMode!=="staging_bulk_all_eligible"||
    a.createdBy!=="automatic_matching_engine"))
    fail("Existing fixed fictional assignments do not match");
  return {incident,offers};
}
async function main(){
  const keyFile=path.resolve(parse(process.argv.slice(2)));
  if(!fs.existsSync(keyFile)||!fs.statSync(keyFile).isFile())fail("Staging service-account JSON path not found");
  const credential=JSON.parse(fs.readFileSync(keyFile,"utf8"));
  if(credential.type!=="service_account"||credential.project_id!==PROJECT||
     !String(credential.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
     !credential.private_key)fail("Credential does not belong to isolated Volunteer staging");
  const backendRequire=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,cert,deleteApp}=backendRequire("firebase-admin/app");
  const {getAuth}=backendRequire("firebase-admin/auth");
  const {getFirestore}=backendRequire("firebase-admin/firestore");
  const app=initializeApp({credential:cert(credential),projectId:PROJECT},"qa-volunteer3-decline");
  try {
    const auth=getAuth(app),db=getFirestore(app);
    let health=await request(API+"/health");
    for(let attempt=0;attempt<12&&health.stagingFirestoreReadStatus==="checking";attempt++){
      await new Promise(resolve=>setTimeout(resolve,1500));
      health=await request(API+"/health");
    }
    if(health.service!=="volunserve-emergency-matching-staging"||
       health.stagingServiceAccountMatches!==true||
       health.stagingFirestoreReadStatus!=="verified"||
       health.matchingEnabled!==true||health.officialEmergencyDispatch!==false)
      fail("Render is not connected to the verified isolated staging project");
    const initial=await snapshot(db);
    const validatedBy=initial.incident.validatedBy;
    if(!validatedBy||!/^[A-Za-z0-9_-]{1,160}$/.test(validatedBy))
      fail("Fixed fictional case has no valid staging Admin UID");
    const [adminUser,adminAuth,volAuth,...fixtures]=await Promise.all([
      db.collection("users").doc(validatedBy).get(),
      auth.getUser(validatedBy),auth.getUser(UID),
      ...FIXTURE_UIDS.flatMap(uid=>[
        db.collection("users").doc(uid).get(),
        db.collection("volunteerApplications").doc(uid).get()
      ])
    ]);
    if(!adminUser.exists||!adminProfile(adminUser.data())||adminAuth.disabled)
      fail("Fictional case validating Admin is not a currently approved staging Admin");
    if(volAuth.disabled||volAuth.email!==EMAIL)
      fail("Volunteer 3 is not the exact existing staging test Auth account");
    for(let i=0;i<3;i++){
      const u=fixtures[2*i],a=fixtures[2*i+1];
      if(!u.exists||!a.exists||!ownedProfile(u.data(),a.data(),i+1))
        fail("Volunteer slot "+(i+1)+" is not an exact approved fictional fixture");
    }
    if(initial.offers[0].status!=="accepted"||initial.offers[1].status!=="accepted"||
       initial.offers[2].status!=="offered")
      fail("Expected 2 accepted + 1 pending in exact slots; current data differs");
    const existingLocks=await Promise.all([1,2].map(slot=>
      db.collection("responderLocks").doc(FIXTURE_UIDS[slot-1]).get()));
    if(existingLocks.some((s,i)=>!s.exists||
      s.data().caseId!==CASE||
      s.data().assignmentId!==CASE+"_"+FIXTURE_UIDS[i]))
      fail("Accepted Volunteer lock not verified; refusing changes");
    console.log("PASS: isolated staging + 3 fictional Volunteers + existing 2 accepted assignments/locks");
    const [adminToken,volunteerToken]=await Promise.all([
      signIn(auth,validatedBy),signIn(auth,UID)
    ]);
    const statusBefore=await request(API+"/api/admin/emergency-auto/e2e-002/bulk-status",{
      headers:header(adminToken)
    });
    if(statusBefore.offered!==3||statusBefore.accepted!==2||
       statusBefore.pending!==1||statusBefore.declined!==0)
      fail("Cloud batch totals changed; refusing write");
    const volEndpoint=API+"/api/staging/volunteer/e2e-002/bulk-task";
    let task=await request(volEndpoint,{headers:header(volunteerToken)});
    if(task.status==="expired"){
      const renewed=await request(API+"/api/admin/emergency-auto/e2e-002/renew-pending",{
        method:"POST",headers:{...header(adminToken),"Content-Type":"application/json"},
        body:JSON.stringify({caseId:CASE,volunteerSlot:3,confirmPendingRenewal:true})
      });
      if(renewed.status!=="renewed"||renewed.volunteerSlot!==3||
         renewed.acceptedFixturesPreserved!==true)
        fail("Staging Admin pending-only renewal was not confirmed");
      console.log("PASS: Volunteer 3 expired test invitation renewed (accepted 1/2 untouched)");
      task=await request(volEndpoint,{headers:header(volunteerToken)});
    }
    if(task.status!=="offered"||task.canRespond!==true)
      fail("Volunteer 3 invitation not actionable: "+String(task.status));
    const decline=await request(API+"/api/staging/volunteer/e2e-002/bulk-respond",{
      method:"POST",headers:{...header(volunteerToken),"Content-Type":"application/json"},
      body:JSON.stringify({caseId:CASE,decision:"declined"})
    });
    if(decline.status!=="declined")fail("Authenticated staging Volunteer 3 decline not confirmed");
    const [final,taskAfter,records,locks]=await Promise.all([
      request(API+"/api/admin/emergency-auto/e2e-002/bulk-status",{headers:header(adminToken)}),
      request(volEndpoint,{headers:header(volunteerToken)}),
      snapshot(db),
      Promise.all([1,2].map(slot=>
        db.collection("responderLocks").doc(FIXTURE_UIDS[slot-1]).get()))
    ]);
    if(final.offered!==3||final.accepted!==2||final.declined!==1||final.pending!==0||
       taskAfter.status!=="declined"||records.offers[0].status!=="accepted"||
       records.offers[1].status!=="accepted"||records.offers[2].status!=="declined"||
       locks.some((s,i)=>!s.exists||s.data().assignmentId!==CASE+"_"+FIXTURE_UIDS[i]))
      fail("Decline persisted, but final invariant check did not pass");
    console.log("SUCCESS: actual authenticated staging cloud Volunteer 3 DECLINED");
    console.log("FINAL: invitations=3 accepted=2 declined=1 pending=0");
    console.log("Existing Volunteer 1 and 2 accepted tasks/locks verified unchanged in status.");
    console.log("This does NOT deploy or prove production volunserve.com functionality.");
  } finally {await deleteApp(app);}
}
main().catch(e=>{console.error("STAGING QA STOPPED:",String(e.message||"unknown").slice(0,200));process.exitCode=1;});
