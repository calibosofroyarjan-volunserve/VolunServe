"use strict";
/**
 * ONLY FIXED ISOLATED STAGING: diagnose and optionally allow authenticated
 * approved fictional-case Admin to LIST disasterCases / responseAssignments
 * (which the existing Admin UI queries), never mutate case data or decisions.
 *
 * --apply explicit. Before any write requires: exact staging service account,
 * exact synthetic 002 case + Admin validator, approved/verified Auth identity,
 * current ruleset preservation, and a confirmed 403 for existing list query.
 * Any unexpected response means no rules update. No production deployment.
 */
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging";
const CASE="STAGING_E2E_002";
const EMAIL="calibosofroyarjan@gmail.com";
const API_KEY="AIzaSyCGS-VySgPPEcqgKH0tBqQCZX_YYhJFuuM";
const ANCHOR="match /databases/{database}/documents {";
const MARKER="STAGING_E2E_002_VERIFIED_ADMIN_CASES_LIST_READ_20261123";
function fail(why){throw Error("STAGING QA STOPPED: "+why);}
function parse(argv){
 let keyFile="",apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==="--key-file"&&argv[i+1]&&!keyFile){keyFile=argv[++i];continue;}
  if(argv[i]==="--apply"){apply=true;continue;}
  fail("Only --key-file PATH and --apply arguments supported");
 }
 if(!keyFile)fail('Usage: node scripts/qa-fix-staging002-admin-cases-list-20261123.cjs --key-file "STAGING_JSON" --apply');
 return {keyFile:path.resolve(keyFile),apply};
}
function grantFor(uid){
 if(!/^[a-zA-Z0-9_-]{1,160}$/.test(uid))fail("Unexpected original staging Admin UID");
 const ident=[
  "      return request.auth != null",
  "        && request.auth.uid == '"+uid+"'",
  "        && request.auth.token.email == '"+EMAIL+"'",
  "        && request.auth.token.email_verified == true",
  "        && get(/databases/$(database)/documents/users/"+uid+").data.get('role','') == 'admin'",
  "        && get(/databases/$(database)/documents/users/"+uid+").data.get('status','approved') == 'approved'",
  "        && get(/databases/$(database)/documents/users/"+uid+").data.get('adminStatus','active') != 'suspended';"
 ];
 return [
   "    // "+MARKER,
   "    // ONLY isolated staging, EXACT approved email-verified Admin case validator.",
   "    // Existing Emergency Reports UI performs collection list listeners.",
   "    // Grants LIST, never mutations; no production user or permissions changes.",
   "    function staging002ApprovedAdminCaseViewer() {",
   ...ident,
   "    }",
   "    match /disasterCases/{caseId} {",
   "      allow list: if staging002ApprovedAdminCaseViewer();",
   "    }",
   "    match /responseAssignments/{assignmentId} {",
   "      allow list: if staging002ApprovedAdminCaseViewer();",
   "    }"
 ].join("\n")+"\n";
}
function addSource(source,uid){
 if(typeof source!=="string"||source.length<100||source.length>245000||
    !source.includes("service cloud.firestore")||source.split(ANCHOR).length!==2)
   fail("Cannot safely patch unknown deployed staging rules source");
 if(source.includes(MARKER))return {source,alreadyApplied:true};
 const grant=grantFor(uid);
 const next=source.replace(ANCHOR,ANCHOR+"\n"+grant);
 if(next.replace("\n"+grant,"")!==source)fail("Original staging rules must remain byte-for-byte preserved");
 if(Buffer.byteLength(next,"utf8")>=256*1024)fail("Staging rules source length limit");
 return {source:next,grant,alreadyApplied:false};
}
function digest(s){return crypto.createHash("sha256").update(s).digest("hex").slice(0,14);}
async function call(url,opts={}){
 const response=await fetch(url,{...opts,signal:AbortSignal.timeout(45000)});
 const data=await response.json().catch(()=>null);
 return {ok:response.ok,status:response.status,data};
}
async function adminToken(auth,uid){
 const ticket=await auth.createCustomToken(uid);
 const r=await call("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+API_KEY,{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({token:ticket,returnSecureToken:true})
 });
 if(!r.ok||!r.data?.idToken)fail("Isolated staging Admin custom sign-in unavailable: HTTP "+r.status);
 const verified=await auth.verifyIdToken(r.data.idToken,true);
 if(verified.uid!==uid||verified.aud!==PROJECT||
    verified.iss!=="https://securetoken.google.com/"+PROJECT||
    verified.email_verified!==true)
   fail("Admin staging ID token missing verified identity constraints");
 return r.data.idToken;
}
async function queryAdminCollection(token,collection){
 const r=await call("https://firestore.googleapis.com/v1/projects/"+PROJECT+"/databases/(default)/documents:runQuery",{
  method:"POST",
  headers:{"Content-Type":"application/json","Authorization":"Bearer "+token,"Cache-Control":"no-store"},
  body:JSON.stringify({structuredQuery:{
   from:[{collectionId:collection}],
   orderBy:[{field:{fieldPath:"createdAt"},direction:"DESCENDING"}]
  }})
 });
 if(r.ok&&Array.isArray(r.data))return {status:200,items:r.data.filter(v=>v.document).map(v=>v.document.name.split("/").pop())};
 return {status:r.status,items:[]};
}
async function main(){
 const {keyFile,apply}=parse(process.argv.slice(2));
 if(!fs.existsSync(keyFile)||!fs.statSync(keyFile).isFile())fail("Staging service account JSON not found");
 const credential=JSON.parse(fs.readFileSync(keyFile,"utf8"));
 if(credential.type!=="service_account"||credential.project_id!==PROJECT||
    !String(credential.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
    !String(credential.private_key||"").includes("BEGIN PRIVATE KEY"))
   fail("Only isolated staging service-account credentials accepted");
 const req=createRequire(path.resolve(__dirname,"../backend/package.json"));
 const {initializeApp,deleteApp,cert}=req("firebase-admin/app");
 const {getFirestore}=req("firebase-admin/firestore");
 const {getAuth}=req("firebase-admin/auth");
 const {getSecurityRules}=req("firebase-admin/security-rules");
 const app=initializeApp({credential:cert(credential),projectId:PROJECT},"qa-staging-admin-cases-list-"+process.pid);
 try{
  const db=getFirestore(app),auth=getAuth(app),rules=getSecurityRules(app);
  const incident=await db.collection("disasterCases").doc(CASE).get();
  const c=incident.data()||{};
  if(!incident.exists||c.testOnly!==true||
     c.testCategory!=="staging_synthetic_volunteer_e2e_002"||
     c.source!=="staging_synthetic_e2e"||
     c.verificationStatus!=="validated"||!c.createdAt)
    fail("Fictional staging report and createdAt not safely confirmed");
  const uid=String(c.validatedBy||"");
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(uid))fail("Missing original staging-case Admin validator");
  const [account,profile]=await Promise.all([
    auth.getUser(uid),db.collection("users").doc(uid).get()
  ]);
  const p=profile.data()||{};
  if(!profile.exists||account.uid!==uid||account.email?.toLowerCase()!==EMAIL||
     !account.emailVerified||account.disabled||p.role!=="admin"||
     (p.status!=null&&p.status!=="approved")||p.adminStatus==="suspended")
    fail("Only approved, verified original staging-case Admin may be checked");
  const token=await adminToken(auth,uid);
  const original=await queryAdminCollection(token,"disasterCases");
  console.log("PASS: fictional incident exists in isolated staging, with createdAt");
  console.log("Admin disasterCases collection query HTTP "+original.status);
  if(original.status===200){
    if(!original.items.includes(CASE))
      fail("Admin query succeeded but test case missing. Not a Rules permission issue; no change.");
    console.log("PASS: Admin case list already contains STAGING_E2E_002; no Rules fix needed.");
    const assignments=await queryAdminCollection(token,"responseAssignments");
    console.log("Admin responseAssignments collection query HTTP "+assignments.status);
    if(assignments.status===200)return console.log("RESULT: Both staging Admin collection queries readable. Diagnose browser cache/filters.");
    if(assignments.status!==403)fail("Unexpected assignment-list status. No Rules changes.");
  } else if(original.status!==403) fail("Unexpected Admin case-list response. No Rules changes.");
  const previous=await rules.getFirestoreRuleset();
  if(!previous?.name||!Array.isArray(previous.source)||previous.source.length!==1||
      typeof previous.source[0].content!=="string")
    fail("Unable to preserve current deployed staging Rules source");
  const source=previous.source[0].content;
  const patch=addSource(source,uid);
  if(patch.alreadyApplied)
    return console.log("Staging Admin list grant already exists. Rules may be propagating; check browser.");
  if(!apply){
   return console.log("READ ONLY: restricted Admin LIST permissions needed. Re-run with --apply.");
  }
  const latest=await rules.getFirestoreRuleset();
  if(latest.name!==previous.name||latest.source?.[0]?.content!==source)
    fail("Staging Rules changed concurrently; no update attempted");
  const file=rules.createRulesFileFromSource(previous.source[0].name||"firestore.rules",patch.source);
  const created=await rules.createRuleset(file);
  if(!created?.name||created.name===previous.name)
    fail("Staging Rules compilation not confirmed");
  await rules.releaseFirestoreRuleset(created);
  const active=await rules.getFirestoreRuleset();
  if(active.name!==created.name||active.source?.[0]?.content!==patch.source)
    fail("Staging Rules release did not match exact additive patch");
  console.log("PASS: restricted isolated staging Admin disasterCases + responseAssignments LIST released");
  console.log("Previous staging ruleset retained for rollback: "+previous.name);
  console.log("New staging rules checksum "+digest(active.source[0].content));
  const [casesAfter,assignmentsAfter]=await Promise.all([
    queryAdminCollection(token,"disasterCases"),
    queryAdminCollection(token,"responseAssignments")
  ]);
  if(casesAfter.status!==200||assignmentsAfter.status!==200||!casesAfter.items.includes(CASE)){
    console.log("NOTICE: Rules released, but a fresh collection read has not passed yet. Recheck after propagation.");
    return;
  }
  console.log("SUCCESS: Staging Admin can read the fictional Emergency Report and assignments.");
  console.log("Refresh staging Admin Emergency Reports screen. No production change.");
 }finally{await deleteApp(app);}
}
if(require.main===module)main().catch(e=>{
 console.error(String(e?.message||"STAGING_FAILURE").slice(0,250));process.exitCode=1;
});
module.exports={addSource,grantFor,ANCHOR,MARKER};
