"use strict";
/**
 * Exact staging Admin self-profile READ fix for a fixed fictional case.
 * It does NOT grant writes, emergency dispatch, or general Admin access.
 * It preserves CURRENT staging Firestore rules byte-for-byte except for the
 * single new exact-user grant. Never use production Firebase credentials.
 *
 * --apply must be explicitly provided to publish to STAGING only.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging";
const CASE="STAGING_E2E_002";
const EMAIL="calibosofroyarjan@gmail.com";
const MARKER="STAGING_E2E_002_APPROVED_ADMIN_SELF_PROFILE_READ_20261123";
const ANCHOR="match /databases/{database}/documents {";
const fail=m=>{throw Error("STAGING BLOCKED: "+m)};
function parse(args){
  let file="",apply=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--key-file"&&args[i+1]&&!file){file=args[++i];continue;}
    if(args[i]==="--apply"){apply=true;continue;}
    fail("Unexpected argument. Only --key-file and --apply allowed");
  }
  if(!file)fail('Usage: node scripts/qa-fix-staging002-admin-self-profile-read-20261123.cjs --key-file "STAGING_JSON_PATH" --apply');
  return {file:path.resolve(file),apply};
}
function patchRules(source,uid){
  if(typeof uid!=="string"||!/^[A-Za-z0-9_-]{1,160}$/.test(uid))
    fail("Invalid exact staging Admin validator UID");
  if(typeof source!=="string"||source.length<100||source.length>240000||
     !source.includes("service cloud.firestore")||
     source.split(ANCHOR).length!==2)
    fail("Unknown deployed staging Rules format; refusing any change");
  if(source.includes(MARKER))return {source,alreadyApplied:true};
  const grant=[
    "    // "+MARKER,
    "    // Only the original approved Admin validator of fixed FICTIONAL case 002.",
    "    // Exact UID+email+verified mailbox and existing profile role/status.",
    "    // Own user-profile GET only; never create, update, delete, or list.",
    "    match /users/"+uid+" {",
    "      allow get: if request.auth != null",
    "        && request.auth.uid == '"+uid+"'",
    "        && request.auth.token.email == '"+EMAIL+"'",
    "        && request.auth.token.email_verified == true",
    "        && resource.data.role == 'admin'",
    "        && resource.data.get('status', 'approved') == 'approved'",
    "        && resource.data.get('adminStatus', 'active') != 'suspended';",
    "    }"
  ].join("\n")+"\n";
  const patched=source.replace(ANCHOR,ANCHOR+"\n"+grant);
  if(patched.replace("\n"+grant,"")!==source)
    fail("Staging Rules must be preserved byte-for-byte except exact additional grant");
  if(Buffer.byteLength(patched,"utf8")>=256*1024)
    fail("Rules size limit exceeded");
  return {source:patched,grant,alreadyApplied:false};
}
const hash=s=>crypto.createHash("sha256").update(s).digest("hex").slice(0,14);
async function main(){
  const {file,apply}=parse(process.argv.slice(2));
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())
    fail("Isolated staging JSON not found");
  const credential=JSON.parse(fs.readFileSync(file,"utf8"));
  if(credential.type!=="service_account"||credential.project_id!==PROJECT||
     !String(credential.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
     !String(credential.private_key||"").includes("BEGIN PRIVATE KEY"))
    fail("Credential is not the exact isolated staging project");
  const req=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,deleteApp,cert}=req("firebase-admin/app");
  const {getAuth}=req("firebase-admin/auth");
  const {getFirestore}=req("firebase-admin/firestore");
  const {getSecurityRules}=req("firebase-admin/security-rules");
  const app=initializeApp({credential:cert(credential),projectId:PROJECT},
    "qa-staging-admin-own-profile-"+process.pid);
  try {
    const auth=getAuth(app),db=getFirestore(app),rules=getSecurityRules(app);
    const snap=await db.collection("disasterCases").doc(CASE).get();
    const c=snap.data()||{};
    if(!snap.exists||c.testOnly!==true||
       c.testCategory!=="staging_synthetic_volunteer_e2e_002"||
       c.source!=="staging_synthetic_e2e")
      fail("Exact original fictional staging case not found");
    const uid=String(c.validatedBy||"");
    if(!/^[A-Za-z0-9_-]{1,160}$/.test(uid))fail("Missing original Admin validator");
    const [account,profileSnap]=await Promise.all([
      auth.getUser(uid),db.collection("users").doc(uid).get()
    ]);
    const p=profileSnap.data()||{};
    if(!profileSnap.exists||account.uid!==uid||account.email?.toLowerCase()!==EMAIL||
       !account.emailVerified||account.disabled||
       p.role!=="admin"||(p.status!=null&&p.status!=="approved")||
       p.adminStatus==="suspended")
      fail("Exact previously approved & email-verified staging Admin required");
    const before=await rules.getFirestoreRuleset();
    if(!before?.name||!Array.isArray(before.source)||before.source.length!==1||
       typeof before.source[0].content!=="string")
      fail("Could not preserve the current deployed staging Ruleset");
    const original=before.source[0].content;
    const update=patchRules(original,uid);
    console.log("PASS: original fictional staging-case validator: approved and email verified");
    console.log("Current STAGING Rules checksum: "+hash(original));
    if(update.alreadyApplied){
      console.log("ALREADY PRESENT: exact Admin self-profile read grant in staging Rules");
      console.log("Re-run the postverification read-only check to confirm API access");
      return;
    }
    if(!apply){
      console.log("READ ONLY: exact additive grant prepared. Add --apply to publish to staging only.");
      return;
    }
    const still=await rules.getFirestoreRuleset();
    if(still.name!==before.name||still.source?.[0]?.content!==original)
      fail("Staging Rules changed while checking; aborting without writing");
    const file=rules.createRulesFileFromSource(before.source[0].name||"firestore.rules",update.source);
    const released=await rules.createRuleset(file);
    if(!released?.name||released.name===before.name)
      fail("New isolated staging Rules failed to compile");
    await rules.releaseFirestoreRuleset(released);
    const active=await rules.getFirestoreRuleset();
    if(active.name!==released.name||active.source?.[0]?.content!==update.source)
      fail("Staging Rules release could not be confirmed");
    console.log("PASS: EXACT staging Admin own-profile GET grant released.");
    console.log("Previous STAGING Ruleset for rollback: "+before.name.slice(0,160));
    console.log("No Admin role change, password change, general read/list or write added.");
    console.log("Next: rerun read-only postverification test, then Admin web login.");
  }finally{await deleteApp(app);}
}
if(require.main===module){
  main().catch(e=>{console.error("STAGING FIX STOPPED: "+String(e.code||e.message||"unknown").slice(0,220));process.exitCode=1;});
}
module.exports={patchRules,MARKER,ANCHOR};
