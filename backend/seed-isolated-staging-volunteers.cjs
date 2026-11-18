"use strict";

/**
 * VolunServe isolated staging-only terminal QA fixture creator.
 * NEVER use against production. Default is --plan (no credentials/network).
 * --inspect is read-only. --apply requires explicit project confirmation.
 * Creates ONLY new synthetic Auth + users + volunteerApplications fixtures.
 * Never resets or edits existing accounts, incidents, tasks or assignments.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");

const STAGING_PROJECT="volunserve-volunteer-staging";
const CASE_ID="STAGING_E2E_002";
const TESTS=Object.freeze([1,2,3].map(n=>Object.freeze({
  uid:"stg_auto_qa_20261118_"+n,
  email:"vs.auto.qa."+n+"@volunserve.test",
  name:"Staging QA Volunteer "+n,
  barangay:"Bagong Buhay I",
  skills:["First Aid"]
})));

function modeFrom(argv){
  const flags=argv.filter(x=>x.startsWith("--"));
  const modes=flags.filter(x=>["--plan","--inspect","--apply"].includes(x));
  if(modes.length>1)throw new Error("Choose only one: --plan, --inspect, or --apply");
  const mode=modes[0]||"--plan";
  if(flags.some(x=>!["--plan","--inspect","--apply","--confirm="+STAGING_PROJECT].includes(x)))
    throw new Error("Unknown flag; refusing to continue");
  if(mode==="--apply"&&!flags.includes("--confirm="+STAGING_PROJECT))
    throw new Error("Refusing writes without --confirm="+STAGING_PROJECT);
  return mode;
}
function readStagingCredential(filePath){
  if(!filePath||typeof filePath!=="string")
    throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS to a staging-only JSON key file first");
  const location=path.resolve(filePath);
  const json=JSON.parse(fs.readFileSync(location,"utf8"));
  if(json.type!=="service_account"||json.project_id!==STAGING_PROJECT||
      !String(json.client_email||"").endsWith("@"+STAGING_PROJECT+".iam.gserviceaccount.com")||
      !String(json.private_key||"").includes("BEGIN PRIVATE KEY"))
    throw new Error("Credential is NOT for the isolated "+STAGING_PROJECT+" project. No request sent.");
  return json;
}
function printPlan(){
  console.log("MODE: plan ONLY (no Firebase calls or mutations)");
  console.log("Isolated project: "+STAGING_PROJECT);
  console.log("Fictional test report: "+CASE_ID);
  console.log("New synthetic users: "+TESTS.length+" (no existing accounts modified)");
  for(const t of TESTS)console.log(" - "+t.uid+" | "+t.email+" | "+t.barangay+" | "+t.skills.join(", "));
  console.log("No emergency case, responder assignment, rule, or production deploy changes.");
}
async function run(argv=process.argv.slice(2),environment=process.env){
  const mode=modeFrom(argv);
  if(mode==="--plan"){printPlan();return;}
  const credential=readStagingCredential(environment.GOOGLE_APPLICATION_CREDENTIALS);
  if(environment.GCLOUD_PROJECT&&environment.GCLOUD_PROJECT!==STAGING_PROJECT)
    throw new Error("GCLOUD_PROJECT is not the staging project");
  const {initializeApp,cert,deleteApp}=require("firebase-admin/app");
  const {getAuth}=require("firebase-admin/auth");
  const {getFirestore,FieldValue}=require("firebase-admin/firestore");
  const app=initializeApp({credential:cert(credential),projectId:STAGING_PROJECT},
    "volunserve-isolated-volunteer-terminal-qa");
  try{
    if(app.options.projectId!==STAGING_PROJECT)throw new Error("Wrong Firebase project");
    const auth=getAuth(app),db=getFirestore(app);
    const before=[];
    for(const t of TESTS){
      let existingAuth=null;
      try{existingAuth=await auth.getUser(t.uid);}
      catch(e){if(e?.code!=="auth/user-not-found")throw e;}
      const [user,application]=await Promise.all([
        db.collection("users").doc(t.uid).get(),
        db.collection("volunteerApplications").doc(t.uid).get()
      ]);
      before.push({fixture:t,auth:!!existingAuth,user:user.exists,application:application.exists});
    }
    for(const s of before){
      console.log(s.fixture.uid+": Auth="+s.auth+", profile="+s.user+", application="+s.application);
    }
    if(mode==="--inspect"){
      const incidentSnap=await db.collection("disasterCases").doc(CASE_ID).get();
      if(incidentSnap.exists){
        const d=incidentSnap.data()||{};
        const recognized=d.testOnly===true&&
          d.testCategory==="staging_synthetic_volunteer_e2e_002"&&
          d.source==="staging_synthetic_e2e";
        if(!recognized)throw new Error("Case 002 is NOT the authorized synthetic staging fixture");
        const [active,existing]=await Promise.all([
          db.collection("responseAssignments")
            .where("status","in",["offered","accepted","responding","on_site"])
            .limit(201).get(),
          db.collection("responseAssignments")
            .where("caseId","==",CASE_ID).limit(201).get()
        ]);
        if(active.size>200||existing.size>200)throw new Error("Audit limit exceeded");
        const {planVolunteerWaves}=require("../functions/emergencyVolunteerWavePlanner");
        const known=require("../functions/sjdmBarangays.json");
        const roster=await Promise.all(TESTS.map(async t=>{
          const [user,application]=await Promise.all([
            db.collection("users").doc(t.uid).get(),
            db.collection("volunteerApplications").doc(t.uid).get()
          ]);
          return {uid:t.uid,user:user.exists?user.data():{},
            application:application.exists?application.data():{}};
        }));
        const plan=planVolunteerWaves({id:CASE_ID,...d},roster,{
          knownBarangays:known,neighborsByBarangay:{},
          activeAssignments:active.docs.map(s=>s.data())
        });
        console.log("Case 002 stage: "+String(d.status||"unknown"));
        console.log("Existing Case 002 assignment count: "+existing.size);
        console.log("Eligible among these 3 fixture IDs: "+plan.counts.eligible);
        console.log("Eligible Wave 1 among fixture IDs: "+plan.counts.wave1);
        console.log("Case 002 auto-trigger is NOT retroactive after an earlier validation.");
        console.log("Never reset an accepted task to repeat a test.");
      }else console.log("Case 002 is not created yet.");
      console.log("Read-only staging inspection complete. No writes.");
      return;
    }
    if(before.some(s=>s.auth||s.user||s.application))
      throw new Error("One or more test IDs already exist. Nothing overwritten. Use --inspect; review before any rerun.");
    // Check the 002 ID is fictional if it exists: do not mutate its state.
    const caseDoc=await db.collection("disasterCases").doc(CASE_ID).get();
    if(caseDoc.exists){
      const d=caseDoc.data()||{};
      if(d.testOnly!==true||d.testCategory!=="staging_synthetic_volunteer_e2e_002"||
         d.source!=="staging_synthetic_e2e")
        throw new Error("Staging 002 case does not have the approved fictional test markers");
    }
    console.log("All 3 fixed IDs are unused in isolated staging. Creating new QA accounts.");
    for(const t of TESTS){
      const password=crypto.randomBytes(20).toString("base64url")+"aA9!";
      const account=await auth.createUser({
        uid:t.uid,email:t.email,password,emailVerified:true,
        displayName:t.name,disabled:false
      });
      if(account.uid!==t.uid)throw new Error("Unexpected Auth UID");
      const batch=db.batch();
      batch.create(db.collection("users").doc(t.uid),{
        uid:t.uid,email:t.email,fullName:t.name,role:"volunteer",status:"approved",
        volunteerAccess:true,volunteerStatus:"approved",
        identityVerified:true,identityStatus:"verified",
        barangay:t.barangay,skills:t.skills,
        testOnly:true,source:"isolated_staging_qa_fixture",
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp()
      });
      batch.create(db.collection("volunteerApplications").doc(t.uid),{
        uid:t.uid,status:"approved",skills:t.skills,
        fullName:t.name,testOnly:true,source:"isolated_staging_qa_fixture",
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp()
      });
      await batch.commit();
      console.log("CREATED "+t.email+" | password: "+password);
    }
    console.log("3 staging-only Volunteers created. Store credentials privately; do NOT screenshot passwords.");
    console.log("Return to staging Admin > Check 002 readiness; existing accepted 001 must not be reset.");
    console.log("No incident, emergency task, assignment, notification, or production records modified by this script.");
  }finally{await deleteApp(app);}
}
if(require.main===module)run().catch(err=>{
  console.error("STOP: "+String(err?.message||err));
  process.exitCode=1;
});
module.exports={STAGING_PROJECT,CASE_ID,TESTS,modeFrom,readStagingCredential};
