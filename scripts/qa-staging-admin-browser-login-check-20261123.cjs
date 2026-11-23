"use strict";
/**
 * READ ONLY staging Admin browser login preflight for fixed fictional case.
 * Validates the isolated Firebase service account, actual case validator,
 * the validator's Firebase Auth account, and its Firestore Admin profile.
 * Never logs Firebase secrets/tokens, never changes passwords or rules.
 */
const fs=require("node:fs");
const path=require("node:path");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging";
const CASE="STAGING_E2E_002";
const ATTEMPTED_EMAIL="calibosofroyarjan@gmail.com";
function fail(message){throw Error("STAGING CHECK STOPPED: "+message);}
function parse(args){
  let file="";
  for(let i=0;i<args.length;i++){
    if(args[i]==="--key-file"&&args[i+1]&&!file){file=args[++i];continue;}
    fail("Unrecognized argument; this check is read-only and takes --key-file only");
  }
  if(!file)fail('Usage: node scripts/qa-staging-admin-browser-login-check-20261123.cjs --key-file "STAGING_JSON_PATH"');
  return path.resolve(file);
}
function profileAdminAllowed(p){
  return p?.role==="admin"&&(p.status==null||p.status==="approved")&&
    p.adminStatus!=="suspended";
}
async function main(){
  const keyFile=parse(process.argv.slice(2));
  if(!fs.existsSync(keyFile)||!fs.statSync(keyFile).isFile())
    fail("Isolated staging service-account file not found");
  const secret=JSON.parse(fs.readFileSync(keyFile,"utf8"));
  if(secret.type!=="service_account"||secret.project_id!==PROJECT||
    !String(secret.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
    !String(secret.private_key||"").includes("BEGIN PRIVATE KEY"))
    fail("Wrong Firebase project, no production operations allowed");
  const req=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,cert,deleteApp}=req("firebase-admin/app");
  const {getAuth}=req("firebase-admin/auth");
  const {getFirestore}=req("firebase-admin/firestore");
  const app=initializeApp({credential:cert(secret),projectId:PROJECT},
    "qa-staging-admin-browser-"+process.pid);
  try{
    const db=getFirestore(app),auth=getAuth(app);
    const caseSnap=await db.collection("disasterCases").doc(CASE).get();
    if(!caseSnap.exists||caseSnap.data()?.testOnly!==true||
       caseSnap.data()?.source!=="staging_synthetic_e2e"||
       caseSnap.data()?.testCategory!=="staging_synthetic_volunteer_e2e_002")
       fail("Original fixed fictional staging case not found");
    const validator=String(caseSnap.data().validatedBy||"");
    if(!/^[A-Za-z0-9_-]{1,160}$/.test(validator))
      fail("Original fixed fictional case validator missing");
    const [authUser,profileSnap]=await Promise.all([
      auth.getUser(validator),db.collection("users").doc(validator).get()
    ]);
    if(!profileSnap.exists)fail("Validator's staging Firestore Admin profile missing");
    const profile=profileSnap.data()||{};
    console.log("PASS: isolated staging Firebase project and fictional-case validator authenticated");
    console.log("Staging Admin profile: "+(profileAdminAllowed(profile)?"APPROVED":"NOT APPROVED"));
    console.log("Staging Admin Firebase Auth: "+(authUser.disabled?"DISABLED":"ENABLED"));
    console.log("Staging Admin Auth email verified: "+(authUser.emailVerified?"YES":"NO"));
    const actualEmail=String(authUser.email||"").trim().toLowerCase();
    if(!actualEmail)fail("Validator has no Firebase Auth email; cannot use ordinary email login");
    const matches=actualEmail===ATTEMPTED_EMAIL;
    console.log("Entered screenshot email matches staging validator: "+(matches?"YES":"NO"));
    if(!matches){
      // Account info shown ONLY to the operator already holding the staging service key.
      console.log("Actual staging Admin email for this fictional case: "+actualEmail);
      console.log("RESULT: WRONG STAGING ADMIN EMAIL. The screenshot account is not the validated case Admin.");
    } else if(authUser.disabled){
      console.log("RESULT: ADMIN DISABLED. Cannot sign in until staging account access is properly reviewed.");
    } else if(!profileAdminAllowed(profile)){
      console.log("RESULT: ADMIN PROFILE NOT APPROVED. Do not bypass approval.");
    } else if(!authUser.emailVerified){
      console.log("RESULT: STAGING ADMIN EMAIL NOT VERIFIED. Ordinary VolunServe login blocks it.");
    } else{
      console.log("RESULT: email matches, verified and approved. Check STAGING Admin password with the normal login.");
      console.log("Password cannot be recovered from Firebase Auth; no change was performed.");
    }
    console.log("READ ONLY. No production Firebase, rules, identity or password changes.");
  }finally{await deleteApp(app);}
}
main().catch(e=>{console.error(String(e.message||"unknown").slice(0,250));process.exitCode=1;});
