"use strict";
/**
 * Additive, exact isolated Firebase STAGING Rules release for fictional
 * Resident-submission Volunteer UI. Never overwrite/deploy repo Firestore Rules.
 * - self-profile GET for an authenticated verified account
 * - approved Volunteers can GET/LIST only own assignments & notifications
 * - exact invited Volunteer can GET synthetic low-severity TEST ONLY case
 * - no writes or access to unrelated cases
 * --apply required; rollback ID printed.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging",CASE="STAGING_E2E_002";
const ANCHOR="match /databases/{database}/documents {";
const MARKER="QA_STAGING_ONLY_RESIDENT_AUTO_DEMO_OWN_READ_20261123";
const fail=s=>{throw Error("STAGING BLOCKED: "+s);};
const grant=[
 "    // "+MARKER,
 "    function qaDemoVolunteer() {",
 "      return request.auth != null",
 "        && request.auth.token.email_verified == true",
 "        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('volunteerAccess',false) == true",
 "        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('volunteerStatus','') == 'approved'",
 "        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('status','approved') == 'approved';",
 "    }",
 "    match /users/{uid} {",
 "      allow get: if request.auth != null && request.auth.uid == uid",
 "        && request.auth.token.email_verified == true;",
 "    }",
 "    match /responseAssignments/{assignmentId} {",
 "      allow get, list: if qaDemoVolunteer() && resource.data.volunteerId == request.auth.uid;",
 "    }",
 "    match /notifications/{notificationId} {",
 "      allow get, list: if qaDemoVolunteer() && resource.data.userId == request.auth.uid;",
 "    }",
 "    match /disasterCases/{caseId} {",
 "      allow get: if qaDemoVolunteer()",
 "        && resource.data.get('autoVolunteerDispatch',{}).get('origin','') == 'automatic_resident_submission_demo'",
 "        && resource.data.get('source','') == 'resident_emergency_assistance'",
 "        && resource.data.get('severity','') == 'low'",
 "        && resource.data.get('title','').matches('^TEST ONLY - .*')",
 "        && exists(/databases/$(database)/documents/responseAssignments/$(caseId + '_' + request.auth.uid))",
 "        && get(/databases/$(database)/documents/responseAssignments/$(caseId + '_' + request.auth.uid)).data.volunteerId == request.auth.uid",
 "        && get(/databases/$(database)/documents/responseAssignments/$(caseId + '_' + request.auth.uid)).data.caseId == caseId",
 "        && get(/databases/$(database)/documents/responseAssignments/$(caseId + '_' + request.auth.uid)).data.get('offerMode','') == 'automatic_resident_submission_demo'",
 "        && get(/databases/$(database)/documents/responseAssignments/$(caseId + '_' + request.auth.uid)).data.status in",
 "             ['offered','accepted','responding','on_site','completed'];",
 "    }"
].join("\n")+"\n";
function patch(source){
 if(typeof source!=="string"||source.length<100||source.length>245000||
    !source.includes("service cloud.firestore")||source.split(ANCHOR).length!==2)
   fail("Cannot preserve active STAGING Rules exactly");
 if(source.includes(MARKER))return {source,already:true};
 const newSource=source.replace(ANCHOR,ANCHOR+"\n"+grant);
 if(newSource.replace("\n"+grant,"")!==source||Buffer.byteLength(newSource)>256*1024)
   fail("Unexpected Rules diff or size");
 return {source:newSource,already:false};
}
function parse(argv){
 let file="",apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==="--key-file" && argv[i+1]&&!file){file=argv[++i];continue;}
  if(argv[i]==="--apply"){apply=true;continue;}
  fail("Unexpected input (use --key-file and optional --apply)");
 }
 if(!file)fail('Usage: node scripts/qa-stage-resident-demo-own-notification-task-rules-20261123.cjs --key-file "STAGING_JSON" --apply');
 return {file:path.resolve(file),apply};
}
async function main(){
 const args=parse(process.argv.slice(2));
 if(!fs.existsSync(args.file)||!fs.statSync(args.file).isFile())fail("Staging JSON file missing");
 const credential=JSON.parse(fs.readFileSync(args.file,"utf8"));
 if(credential.type!=="service_account"||credential.project_id!==PROJECT||
    !String(credential.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
    !String(credential.private_key||"").includes("BEGIN PRIVATE KEY"))
   fail("Only the exact isolated staging Firebase project is allowed");
 const req=createRequire(path.resolve(__dirname,"../backend/package.json"));
 const {initializeApp,deleteApp,cert}=req("firebase-admin/app");
 const {getAuth}=req("firebase-admin/auth");
 const {getFirestore}=req("firebase-admin/firestore");
 const {getSecurityRules}=req("firebase-admin/security-rules");
 const app=initializeApp({projectId:PROJECT,credential:cert(credential)},
   "qa-stage-resident-rule-only-"+process.pid);
 try {
  const db=getFirestore(app),auth=getAuth(app),rules=getSecurityRules(app);
  const caseSnap=await db.collection("disasterCases").doc(CASE).get();
  const c=caseSnap.data()||{};
  if(!caseSnap.exists||c.testOnly!==true||c.source!=="staging_synthetic_e2e"||
      c.testCategory!=="staging_synthetic_volunteer_e2e_002")
   fail("Original synthetic test report missing from isolated staging");
  const uid=String(c.validatedBy||"");
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(uid))fail("Synthetic report validator missing");
  const [admin,adminSnap]=await Promise.all([auth.getUser(uid),db.collection("users").doc(uid).get()]);
  if(!adminSnap.exists||admin.email?.toLowerCase()!=="calibosofroyarjan@gmail.com"||
     !admin.emailVerified||admin.disabled||adminSnap.data()?.role!=="admin")
   fail("Original approved staging validator missing");
  const before=await rules.getFirestoreRuleset();
  if(!before?.name||!Array.isArray(before.source)||before.source.length!==1||
     typeof before.source[0].content!=="string")
   fail("Cannot preserve all ACTIVE staging rules");
  const old=before.source[0].content,p=patch(old);
  console.log("PASS: exact isolated Firebase stage, approved fictional case, current Rules read");
  console.log("Active STAGING Rules checksum "+crypto.createHash("sha256").update(old).digest("hex").slice(0,12));
  if(p.already)return console.log("ALREADY APPLIED: own-notifications and task-read Rules exist in staging");
  if(!args.apply)return console.log("READ ONLY: add --apply to release exact additive staging Rules");
  const current=await rules.getFirestoreRuleset();
  if(current.name!==before.name||current.source?.[0]?.content!==old)
   fail("Staging Rules changed since preflight; no update attempted");
  const compiled=await rules.createRuleset(
    rules.createRulesFileFromSource(before.source[0].name||"firestore.rules",p.source));
  if(!compiled?.name||compiled.name===before.name)fail("Rules compiler did not confirm new staging source");
  await rules.releaseFirestoreRuleset(compiled);
  const active=await rules.getFirestoreRuleset();
  if(active.name!==compiled.name||active.source?.[0]?.content!==p.source)
   fail("Staging Rules release verification failed");
  console.log("PASS: staging approved Volunteer own profile, own notifications/tasks and invited TEST ONLY case READ grants released");
  console.log("Previous Ruleset for rollback: "+before.name);
  console.log("NO WRITE grants, no broad incident read, no production change");
 }finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{console.error(String(e?.message||"unknown").slice(0,230));process.exitCode=1;});
module.exports={patch,grant,MARKER};
