"use strict";
/**
 * STAGING ONLY: append exact fictional Volunteer2 READ grants to the active
 * Firestore Rules source, preserving the existing deployed source byte-for-byte.
 * No production project, deployment, real emergency, password or account changes.
 *
 * Explicit --apply is required. Previous staging ruleset is printed for rollback.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging";
const UID="staging002_qa_volunteer_02";
const EMAIL="staging002.qa.volunteer2@example.com";
const CASE="STAGING_E2E_002";
const MARKER="STAGING_E2E_002_VOLUNTEER02_EXACT_READ_FIX_20261123";
const ANCHOR="match /databases/{database}/documents {";
const scope=[
  "    // "+MARKER,
  "    // Single approved fictional staging Auth user only; READ, never WRITE.",
  "    function staging002Volunteer02OwnRead() {",
  "      return request.auth != null",
  "        && request.auth.uid == '"+UID+"'",
  "        && request.auth.token.email == '"+EMAIL+"'",
  "        && request.auth.token.email_verified == true;",
  "    }",
  "    match /users/"+UID+" {",
  "      allow get: if staging002Volunteer02OwnRead();",
  "    }",
  "    match /volunteerApplications/"+UID+" {",
  "      allow get: if staging002Volunteer02OwnRead();",
  "    }",
  "    match /responseAssignments/{assignmentId} {",
  "      allow get, list: if staging002Volunteer02OwnRead()",
  "        && resource.data.volunteerId == '"+UID+"';",
  "    }",
  "    match /disasterCases/"+CASE+" {",
  "      allow get: if staging002Volunteer02OwnRead();",
  "    }",
  "    match /notifications/{notificationId} {",
  "      allow get, list: if staging002Volunteer02OwnRead()",
  "        && resource.data.userId == '"+UID+"';",
  "    }",
].join("\n")+"\n";
function fail(message){throw Error("STAGING BLOCKED: "+message)}
function input(args){
  let file="",apply=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--key-file"&&args[i+1]&&!file){file=args[++i];continue;}
    if(args[i]==="--apply"){apply=true;continue;}
    fail("Unexpected argument");
  }
  if(!file)fail('Usage: node scripts/qa-fix-staging002-volunteer2-firestore-read-20261123.cjs --key-file "PATH_TO_STAGING_JSON" --apply');
  return {file:path.resolve(file),apply};
}
function addExactGrant(current){
  if(typeof current!=="string"||current.length<100||
     !current.includes("service cloud.firestore")||
     !current.includes(ANCHOR)||current.split(ANCHOR).length!==2)
    fail("Existing deployed Firestore Rules format is not safe to extend");
  if(current.includes(MARKER))return {source:current,alreadyApplied:true};
  const patched=current.replace(ANCHOR,ANCHOR+"\n"+scope);
  if(patched.replace("\n"+scope,"")!==current)
    fail("Deployed Rules source was not preserved exactly");
  if(Buffer.byteLength(patched,"utf8")>=256*1024)
    fail("Firestore Rules 256KiB text limit exceeded");
  return {source:patched,alreadyApplied:false};
}
const digest=s=>crypto.createHash("sha256").update(s).digest("hex").slice(0,12);
async function main(){
  const opts=input(process.argv.slice(2));
  if(!fs.existsSync(opts.file)||!fs.statSync(opts.file).isFile())
    fail("Isolated staging Firebase service account file missing");
  const credential=JSON.parse(fs.readFileSync(opts.file,"utf8"));
  if(credential.type!=="service_account"||credential.project_id!==PROJECT||
     !String(credential.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
     !String(credential.private_key||"").includes("BEGIN PRIVATE KEY"))
    fail("Credential must belong only to isolated staging Firebase");
  const req=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,deleteApp,cert}=req("firebase-admin/app");
  const {getAuth}=req("firebase-admin/auth");
  const {getFirestore}=req("firebase-admin/firestore");
  const {getSecurityRules}=req("firebase-admin/security-rules");
  const app=initializeApp({credential:cert(credential),projectId:PROJECT},
    "qa-staging-only-volunteer2-rules-"+process.pid);
  try{
    const auth=getAuth(app),db=getFirestore(app),rules=getSecurityRules(app);
    const [user,profile,application]=await Promise.all([
      auth.getUser(UID),db.collection("users").doc(UID).get(),
      db.collection("volunteerApplications").doc(UID).get()
    ]);
    if(user.uid!==UID||user.email!==EMAIL||!user.emailVerified||user.disabled||
       !profile.exists||!application.exists)
      fail("Exact fictional Auth, profile or Volunteer application missing");
    const p=profile.data()||{},a=application.data()||{};
    if(p.testOnly!==true||p.testFixture!==CASE||p.testFixtureSlot!==2||
       p.role!=="volunteer"||p.status!=="approved"||
       p.volunteerAccess!==true||p.volunteerStatus!=="approved"||
       p.activeMode!=="volunteer"||
       a.testOnly!==true||a.testFixture!==CASE||a.testFixtureSlot!==2||
       a.uid!==UID||a.status!=="approved")
      fail("Only the approved fixed fictional Volunteer 2 is authorized");
    const before=await rules.getFirestoreRuleset();
    if(!before?.name||!Array.isArray(before.source)||before.source.length!==1||
       typeof before.source[0].content!=="string")
      fail("Active staging rules could not be preserved");
    const source=before.source[0].content,patch=addExactGrant(source);
    console.log("PASS: isolated staging and approved fictional Volunteer 2");
    console.log("Deployed active Rules source checksum: "+digest(source));
    if(patch.alreadyApplied){
      console.log("ALREADY APPLIED: narrowly-scoped Volunteer 2 staging READ rules present");
      return;
    }
    if(!opts.apply){
      console.log("READ-ONLY: Safe incremental rule patch prepared; rerun with --apply");
      return;
    }
    // Fail closed on a detected concurrent rules change.
    const latest=await rules.getFirestoreRuleset();
    if(latest.name!==before.name||latest.source?.[0]?.content!==source)
      fail("Active staging rules changed concurrently; refusing deployment");
    const file=rules.createRulesFileFromSource(before.source[0].name||"firestore.rules",patch.source);
    const created=await rules.createRuleset(file);
    if(!created?.name||created.name===before.name)
      fail("New staging ruleset compilation was not verified");
    await rules.releaseFirestoreRuleset(created);
    const active=await rules.getFirestoreRuleset();
    if(active.name!==created.name||active.source?.[0]?.content!==patch.source)
      fail("Staging rules release verification failed");
    console.log("PASS: exact fictional Volunteer 2 own-profile and own-assignments READ grants deployed to isolated staging only");
    console.log("Previous staging ruleset retained for rollback: "+String(before.name).slice(0,128));
    console.log("No WRITE permissions were added, existing rule source preserved.");
    console.log("Refresh staging web after Rules propagation; no production deployment.");
  }finally{await deleteApp(app);}
}
if(require.main===module){
  main().catch(e=>{console.error("STAGING FIX STOPPED: "+String(e.code||e.message||"unknown").slice(0,250));process.exitCode=1;});
}
module.exports={addExactGrant,scope,MARKER,ANCHOR};
