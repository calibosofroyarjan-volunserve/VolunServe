#!/usr/bin/env node
"use strict";
/**
 * Narrow READ-ONLY review of three user-confirmed disposable domains in
 * VolunServe Firebase Authentication. Never logs tokens or entire UIDs.
 * Does not delete Auth identities, Firestore profiles, or historical records.
 */
const assert=require("node:assert/strict");
const path=require("node:path");
const {createRequire}=require("node:module");
const req=createRequire(path.resolve(__dirname,"../functions/package.json"));
const PROJECT="volunserve-3aa5b";
const TARGETS=new Set(["digeros.com","emailkeep.com","en2ch.co"]);
const PREFIXES=new Set(["lowobes106","lidab34794","demoj73936"]);
const domainOf=email=>String(email||"").trim().toLowerCase().split("@")[1]||"";
const userCandidate=u=>{
 const email=String(u.email||"").trim().toLowerCase();
 const [local,domain]=email.split("@");
 // Restrict to exactly the screenshot's named identities; no wildcard deletion.
 return TARGETS.has(domain)&&PREFIXES.has(local);
};
function test(){
 assert(userCandidate({email:"lowobes106@digeros.com"}));
 assert(userCandidate({email:"LIDAB34794@EMAILKEEP.COM"}));
 assert(userCandidate({email:"demoj73936@en2ch.co"}));
 for(const email of ["schoolramya18@gmail.com","devinbooker739@gmail.com",
   "marilyn.caliboso@deped.gov.ph","other@emailkeep.com",
   "lowobes106@gmail.com","lowobes106@sub.digeros.com"]){
   assert(!userCandidate({email}),"Must never select unknown account "+email);
 }
 console.log("PASS: exactly three screenshot identities selected; regular Gmail and unrelated users preserved");
}
async function main(){
 if(process.argv.includes("--self-test"))return test();
 assert.equal(process.env.GITHUB_REPOSITORY,"calibosofroyarjan-volunserve/VolunServe");
 assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
 assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST&&!process.env.FIRESTORE_EMULATOR_HOST);
 const cred=JSON.parse(process.env.VOLUNSERVE_PRODUCTION_AUDIT_CREDENTIAL||"null");
 assert.equal(cred?.project_id,PROJECT,"BLOCKED: missing matching read-only credential");
 const {initializeApp,cert}=req("firebase-admin/app");
 const {getAuth}=req("firebase-admin/auth");
 const {getFirestore}=req("firebase-admin/firestore");
 const app=initializeApp({credential:cert(cred),projectId:PROJECT});
 const auth=getAuth(app),db=getFirestore(app);
 const match=[];
 let pageToken;
 do{
  const page=await auth.listUsers(1000,pageToken);
  for(const u of page.users)if(userCandidate(u))match.push(u);
  pageToken=page.pageToken;
 }while(pageToken);
 assert(match.length<=3,"BLOCKED: more than three screenshot identities found");
 const results=[];
 for(const user of match){
   const doc=await db.collection("users").doc(user.uid).get();
   const data=doc.exists?doc.data():null;
   results.push({
     email:user.email,
     emailVerified:user.emailVerified===true,
     providerTypes:user.providerData.map(p=>p.providerId).sort(),
     profileExists:doc.exists,
     profileRole:data?.role||null,
     profileStatus:data?.status||null,
     protectedRole:["admin","superadmin","lgu_personnel"].includes(data?.role),
     authDeletionPerformed:false,
     firestoreDeletionPerformed:false
   });
 }
 console.log(JSON.stringify({
   mode:"READ_ONLY_DISPOSABLE_AUTH_ACCOUNT_REVIEW",
   project:PROJECT,expectedMatches:3,foundMatches:match.length,
   accounts:results,
   nextAction:"Manual delete in Firebase Authentication after reviewing matches and Firestore dependencies",
   productionWrites:"NONE"
 },null,2));
}
main().catch(e=>{console.error(String(e?.message||e));process.exitCode=1;});