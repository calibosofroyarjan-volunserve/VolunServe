"use strict";
/**
 * Fixed FICTIONAL E2E 002 Admin status READ ONLY, no password needed.
 * Verifies actual isolated staging Firebase Auth + Firestore + Render Admin API.
 * No rules writes, account changes, invite responses, mutations or deployment.
 * Not a substitute for actual Admin UI/browser testing.
 */
const fs=require("node:fs");
const path=require("node:path");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging";
const CASE="STAGING_E2E_002";
const API="https://volunserve-emergency-match-staging-free.onrender.com";
const API_KEY="AIzaSyCGS-VySgPPEcqgKH0tBqQCZX_YYhJFuuM";
const UIDS=[1,2,3].map(n=>"staging002_qa_volunteer_0"+n);
const EXPECTED=["accepted","accepted","declined"];
function stop(why){throw Error("STAGING QA STOPPED: "+why);}
function args(argv){
  let keyFile="";
  for(let i=0;i<argv.length;i++){
    if(argv[i]==="--key-file"&&argv[i+1]&&!keyFile){keyFile=argv[++i];continue;}
    stop("Unknown argument. Only --key-file PATH is accepted. No --apply.");
  }
  if(!keyFile)stop('Usage: node scripts/qa-staging002-admin-final-readonly-20261123.cjs --key-file "STAGING_JSON"');
  return path.resolve(keyFile);
}
async function json(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
  const obj=await response.json().catch(()=>null);
  if(!obj||!response.ok||obj.ok===false)
    stop("Isolated staging HTTP "+response.status+" "+String(obj?.error||obj?.reason||"response unavailable").slice(0,75));
  return obj;
}
function exactAssignment(obj,i){
  return obj?.caseId===CASE&&obj?.volunteerId===UIDS[i]&&
    obj?.offerMode==="staging_bulk_all_eligible"&&
    obj?.createdBy==="automatic_matching_engine"&&
    obj?.status===EXPECTED[i];
}
async function main(){
  const keyFile=args(process.argv.slice(2));
  if(!fs.existsSync(keyFile)||!fs.statSync(keyFile).isFile())stop("Staging JSON not found");
  const credential=JSON.parse(fs.readFileSync(keyFile,"utf8"));
  if(credential.type!=="service_account"||credential.project_id!==PROJECT||
     !String(credential.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
     !String(credential.private_key||"").includes("BEGIN PRIVATE KEY"))
    stop("Service account must belong to the isolated staging Firebase project");
  const req=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,deleteApp,cert}=req("firebase-admin/app");
  const {getAuth}=req("firebase-admin/auth");
  const {getFirestore}=req("firebase-admin/firestore");
  const app=initializeApp({credential:cert(credential),projectId:PROJECT},
    "qa-readonly-admin-final-"+process.pid);
  try{
    const db=getFirestore(app),auth=getAuth(app);
    const [caseSnap,batchSnap,...assignmentSnaps]=await Promise.all([
      db.collection("disasterCases").doc(CASE).get(),
      db.collection("emergencyAutoDispatchBatches").doc(CASE).get(),
      ...UIDS.map(uid=>db.collection("responseAssignments").doc(CASE+"_"+uid).get())
    ]);
    if(!caseSnap.exists||!batchSnap.exists||assignmentSnaps.some(s=>!s.exists))
      stop("Fixed fictional staging case/three invitations are incomplete");
    const c=caseSnap.data()||{},b=batchSnap.data()||{};
    if(c.testOnly!==true||
       c.testCategory!=="staging_synthetic_volunteer_e2e_002"||
       c.source!=="staging_synthetic_e2e"||c.verificationStatus!=="validated"||
       b.testOnly!==true||b.origin!=="staging_bulk_all_eligible_002"||
       b.volunteerCount!==3)
      stop("Case is not the original isolated fictional 002 batch");
    if(!assignmentSnaps.every((s,i)=>exactAssignment(s.data(),i)))
      stop("A fictional Volunteer assignment status changed from expected final result");
    const locks=await Promise.all(UIDS.map(uid=>db.collection("responderLocks").doc(uid).get()));
    if(locks.some((s,i)=>i<2?(!s.exists||s.data()?.caseId!==CASE||
         s.data()?.assignmentId!==CASE+"_"+UIDS[i]):s.exists&&s.data()?.caseId===CASE))
      stop("Responder locks do not match 2 accepted + 1 declined");
    console.log("PASS: isolated Firestore staging has 3 fixed fictional assignments and 2 accepted locks");
    const adminUid=String(c.validatedBy||"");
    if(!/^[a-zA-Z0-9_-]{1,160}$/.test(adminUid))
      stop("Fixed synthetic case has no Admin validator");
    const [adminSnap,adminAuth]=await Promise.all([
      db.collection("users").doc(adminUid).get(),auth.getUser(adminUid)
    ]);
    const admin=adminSnap.data()||{};
    if(!adminSnap.exists||admin.role!=="admin"||
       (admin.status!=null&&admin.status!=="approved")||
       admin.adminStatus==="suspended"||adminAuth.disabled)
      stop("Case validator is not a currently active staging Admin");
    const health=await json(API+"/health");
    if(health.service!=="volunserve-emergency-matching-staging"||
       health.stagingServiceAccountMatches!==true||
       health.officialEmergencyDispatch!==false)
      stop("Render endpoint is not the isolated staging service");
    const custom=await auth.createCustomToken(adminUid);
    const signed=await json("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+API_KEY,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({token:custom,returnSecureToken:true})
    });
    if(!signed.idToken)stop("Staging Admin short-lived ID token not issued");
    const verified=await auth.verifyIdToken(signed.idToken,true);
    if(verified.uid!==adminUid||verified.aud!==PROJECT||
       verified.iss!=="https://securetoken.google.com/"+PROJECT)
      stop("Admin Auth session does not match isolated staging validator");
    const status=await json(API+"/api/admin/emergency-auto/e2e-002/bulk-status",{
      headers:{Authorization:"Bearer "+signed.idToken,"Cache-Control":"no-store"}
    });
    if(status.offered!==3||status.accepted!==2||status.declined!==1||status.pending!==0)
      stop("Actual authenticated Admin staging API totals disagree with Firestore");
    console.log("PASS: actual authenticated staging Admin status API matches Firestore");
    console.log("VOLUNTEER 1: ACCEPTED");
    console.log("VOLUNTEER 2: ACCEPTED");
    console.log("VOLUNTEER 3: DECLINED");
    console.log("FINAL: invited=3, accepted=2, declined=1, pending=0");
    console.log("READ ONLY: no Volunteer decisions, Rules, identities, or live VolunServe changed.");
    console.log("Next browser-only QA: Admin Emergency Reports displays same summary.");
  }finally{await deleteApp(app);}
}
main().catch(e=>{
  console.error(String(e?.message||"unknown").slice(0,200));
  process.exitCode=1;
});
