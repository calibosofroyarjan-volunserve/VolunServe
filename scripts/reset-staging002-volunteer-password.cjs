"use strict";
/**
 * Password recovery for EXACTLY one existing fictional staging Volunteer.
 * Local terminal only; no Firestore writes, data reset, production or Render calls.
 * Requires the user's private staging service-account JSON on their own machine.
 */
const fs=require("node:fs");
const crypto=require("node:crypto");
const path=require("node:path");
const readline=require("node:readline/promises");
const PROJECT="volunserve-volunteer-staging";
const FIXTURE="STAGING_E2E_002";

function parse(argv){
  const a={apply:false};
  for(let i=0;i<argv.length;i++){
    const v=argv[i];
    if(v==="--help")return {help:true};
    if(v==="--apply"){a.apply=true;continue;}
    if((v==="--slot"||v==="--key-file")&&argv[i+1]){
      const key=v==="--slot"?"slot":"keyFile";
      if(a[key]!==undefined)throw Error("Duplicate argument: "+v);
      a[key]=argv[++i];continue;
    }
    throw Error("Invalid or missing argument: "+v);
  }
  if(!/^[123]$/.test(String(a.slot||"")))throw Error("--slot must be 1, 2 or 3");
  if(!a.keyFile)throw Error("--key-file must point to a LOCAL staging service-account JSON");
  return a;
}
function fixture(slot){
  return {slot:Number(slot),uid:"staging002_qa_volunteer_0"+slot,
    email:"staging002.qa.volunteer"+slot+"@example.com"};
}
function isOurs(user,app,f){
  return user?.testOnly===true&&app?.testOnly===true&&
    user?.testFixture===FIXTURE&&app?.testFixture===FIXTURE&&
    user?.testFixtureSlot===f.slot&&app?.testFixtureSlot===f.slot&&
    app?.uid===f.uid&&user?.role==="volunteer"&&
    user?.status==="approved"&&user?.volunteerAccess===true&&
    user?.volunteerStatus==="approved"&&user?.identityVerified===true&&
    app?.status==="approved";
}
async function main(){
  const args=parse(process.argv.slice(2));
  if(args.help){
    console.log('Usage: node scripts/reset-staging002-volunteer-password.cjs --slot 2 --key-file "C:\\path\\staging-only-service-account.json" [--apply]');
    console.log("Default is read-only. --apply requires typed confirmation.");
    return;
  }
  const f=fixture(args.slot);
  const file=path.resolve(args.keyFile);
  if(!fs.statSync(file).isFile())throw Error("Credential path is not a file");
  const creds=JSON.parse(fs.readFileSync(file,"utf8"));
  if(creds.project_id!==PROJECT||creds.type!=="service_account"||
    !String(creds.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
    !creds.private_key)throw Error("BLOCKED: not an isolated staging credential");
  // Node package subpath exports require a package-aware resolver, not a direct
  // ../node_modules/firebase-admin/app filesystem path.
  const {createRequire}=require("node:module");
  const backendRequire=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,cert,deleteApp}=backendRequire("firebase-admin/app");
  const {getAuth}=backendRequire("firebase-admin/auth");
  const {getFirestore}=backendRequire("firebase-admin/firestore");
  const sdk=initializeApp({credential:cert(creds),projectId:PROJECT},"staging002-test-reset");
  try{
    const [record,u,v]=await Promise.all([
      getAuth(sdk).getUser(f.uid),
      getFirestore(sdk).collection("users").doc(f.uid).get(),
      getFirestore(sdk).collection("volunteerApplications").doc(f.uid).get()
    ]);
    if(!u.exists||!v.exists||!isOurs(u.data(),v.data(),f)||
      record.uid!==f.uid||record.email!==f.email||record.disabled)
      throw Error("BLOCKED: existing Auth and Firestore records are not the exact fictional fixture");
    console.log("PASS: isolated Firebase staging project verified");
    console.log("PASS: fictional Volunteer slot "+f.slot+" verified in Auth and Firestore");
    console.log("No assignments, notifications, cases, responder locks or Firestore documents will change.");
    if(!args.apply){console.log("READ ONLY. Rerun with --apply to change Auth password.");return;}
    if(!process.stdin.isTTY)throw Error("BLOCKED: interactive confirmation required");
    const prompt=readline.createInterface({input:process.stdin,output:process.stdout});
    let value="";
    try{value=await prompt.question("Type RESET-STAGING-002-"+f.slot+" to rotate ONLY this test password: ");}
    finally{prompt.close();}
    if(value!=="RESET-STAGING-002-"+f.slot){
      console.log("CANCELLED: no changes.");return;
    }
    const password="QA002aA9-"+crypto.randomBytes(24).toString("base64url");
    await getAuth(sdk).updateUser(f.uid,{password});
    console.log("SUCCESS: rotated Auth password for fictional Volunteer slot "+f.slot+" only.");
    console.log("TEST EMAIL: "+f.email);
    console.log("NEW TEST PASSWORD (SAVE PRIVATELY; PRINTED ONCE): "+password);
    console.log("Do not share passwords, service account JSON or tokens in screenshots/chats/Git.");
  }finally{await deleteApp(sdk);}
}
main().catch(e=>{console.error("STAGING RESET STOPPED:",e.message||"unknown");process.exitCode=1;});
