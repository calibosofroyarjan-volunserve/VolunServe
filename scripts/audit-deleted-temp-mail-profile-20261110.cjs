#!/usr/bin/env node
"use strict";
/** Read-only, exact-match post-deletion audit. NO data changes. */
const assert=require("node:assert/strict");
const path=require("node:path");
const {createRequire}=require("node:module");
const sdk=createRequire(path.resolve(__dirname,"../functions/package.json"));
const PROJECT="volunserve-3aa5b";
const TARGETS=[
 "lowobes106@digeros.com",
 "lidab34794@emailkeep.com",
 "demoj73936@en2ch.co",
];
function expectedDomains(){
 assert.equal(new Set(TARGETS).size,3);
 assert(TARGETS.every(x=>/^[a-z0-9]+@(digeros[.]com|emailkeep[.]com|en2ch[.]co)$/.test(x)));
 console.log("PASS: narrow exact target emails; Gmail and all other user profiles excluded");
}
async function main(){
 expectedDomains();
 if(process.argv.includes("--self-test"))return;
 assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
 assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
 assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST&&!process.env.FIRESTORE_EMULATOR_HOST);
 const cred=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_AUDIT_CREDENTIAL||"null");
 assert.equal(cred?.project_id,PROJECT,"BLOCKED: missing/wrong read-only project credentials");
 const {initializeApp,cert}=sdk("firebase-admin/app");
 const {getAuth}=sdk("firebase-admin/auth");
 const {getFirestore}=sdk("firebase-admin/firestore");
 const app=initializeApp({projectId:PROJECT,credential:cert(cred)});
 const auth=getAuth(app),db=getFirestore(app);
 const results=[];
 for(const email of TARGETS){
   let existsInAuth=false;
   try{await auth.getUserByEmail(email);existsInAuth=true;}
   catch(err){if(err.code!=="auth/user-not-found")throw err;}
   const snapshot=await db.collection("users").where("email","==",email).limit(10).get();
   assert(snapshot.docs.length<=1,"BLOCKED: unexpected duplicate profile email; manual review necessary");
   let profile=null;
   for(const doc of snapshot.docs){
     const children=await doc.ref.listCollections();
     const d=doc.data();
     profile={
       exists:true,role:d.role||null,status:d.status||null,
       subcollectionCount:children.length,
       cleanupSafe:"NOT DETERMINED — cross-collection history not scanned",
     };
   }
   results.push({email,existsInAuth,profile:profile||{exists:false}});
 }
 console.log(JSON.stringify({
  mode:"READ_ONLY_POST_DELETION_PROFILE_AUDIT",
  project:PROJECT,accounts:results,
  note:"No Auth/Firestore deletion, disable, profile writes or cross-collection scans. Existing historical profiles must be archived only after references reviewed.",
  productionWrites:"NONE"
 },null,2));
 assert(results.every(x=>!x.existsInAuth),
   "BLOCKED: one screenshot identity was recreated; investigate before any orphan cleanup");
}
main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1;});
