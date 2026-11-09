#!/usr/bin/env node
"use strict";
/**
 * Production READ ONLY: census of pre-existing Gmail/Googlemail Resident and
 * Volunteer mailbox aliases and their proposed gmailAliasClaims documents.
 * No emails, UIDs, canonical mailboxes, tokens or private records in logs.
 * No Auth/Firestore writes. Existing accounts are never disabled or deleted.
 */
const assert=require("node:assert/strict");
const path=require("node:path");
const {createRequire}=require("node:module");

const PROJECT="volunserve-3aa5b";
const REPO="calibosofroyarjan-volunserve/VolunServe";
const PAGE=200;
const MAX_PROFILES=20000;
const BATCH=100;
const ROLES=["resident","volunteer"];

function gmailKey(value) {
  const email=String(value||"").trim().toLowerCase();
  const parts=email.split("@");
  if(parts.length!==2 || !parts[0] ||
    !["gmail.com","googlemail.com"].includes(parts[1])) return null;
  const local=parts[0].split("+")[0].replace(/\./g,"");
  return local && local.length<=64 ? local+"@gmail.com" : null;
}
function groupsFor(profiles) {
  const groups=new Map();
  for (const profile of profiles) {
    const key=gmailKey(profile.email);
    if(!key)continue;
    const group=groups.get(key)||[];
    group.push(profile);
    groups.set(key,group);
  }
  return groups;
}
function selfTest(){
  for(const [input,expect] of [
    ["first.last@gmail.com","firstlast@gmail.com"],
    ["FIRSTLAST@GOOGLEMAIL.COM","firstlast@gmail.com"],
    ["f.i.r.s.t.l.a.s.t+promo@gmail.com","firstlast@gmail.com"],
    ["first.last@outlook.com",null],
    ["first.last@yahoo.com",null],
    ["someone@gmail.com.bad.example",null],
    ["@gmail.com",null],
  ])assert.equal(gmailKey(input),expect);
  const g=groupsFor([
    {uid:"a",email:"s.a.m.p.l.e@gmail.com"},
    {uid:"b",email:"sample@googlemail.com"},
    {uid:"c",email:"sample@yahoo.com"},
    {uid:"d",email:"other@gmail.com"},
  ]);
  assert.equal(g.get("sample@gmail.com").length,2);
  assert.equal(g.get("other@gmail.com").length,1);
  assert.equal(g.has("sample@yahoo.com"),false);
  console.log("PASS: Gmail/Googlemail alias collision detection, non-Gmail preservation, no production access");
}
if(process.argv.includes("--self-test")){
  selfTest();
} else {
  main().catch(error=>{
    // Do NOT print raw SDK errors: exceptions may include user identifiers or PII.
    const code=String(error?.code||"unclassified").replace(/[^a-z0-9_/-]/gi,"").slice(0,60);
    console.error("BLOCKED: read-only census incomplete or unauthorized; error code="+code);
    process.exitCode=1;
  });
}

async function main(){
  assert.equal(process.env.GITHUB_REPOSITORY,REPO);
  assert.equal(process.env.GITHUB_REF,"refs/heads/live-protected");
  assert(!process.env.FIREBASE_AUTH_EMULATOR_HOST&&!process.env.FIRESTORE_EMULATOR_HOST);
  const raw=process.env.VOLUNSERVE_PRODUCTION_AUDIT_CREDENTIAL;
  assert(raw && raw.length>30, "Missing production read-only credential");
  const creds=JSON.parse(raw);
  assert.equal(creds.project_id,PROJECT);
  // Imports occur only after environment guards, never in self-test.
  const sdk=createRequire(path.resolve(__dirname,"../functions/package.json"));
  const {initializeApp,cert,deleteApp}=sdk("firebase-admin/app");
  const {getAuth}=sdk("firebase-admin/auth");
  const {getFirestore,FieldPath}=sdk("firebase-admin/firestore");
  const app=initializeApp({projectId:PROJECT,credential:cert(creds)});
  try {
    const db=getFirestore(app),auth=getAuth(app);
    const profiles=[];
    let last=null;
    // Limited-scope role query; explicitly exclude staff and applicants.
    while(true){
      let query=db.collection("users")
        .where("role","in",ROLES)
        .orderBy(FieldPath.documentId())
        .select("email","role","status")
        .limit(PAGE);
      if(last)query=query.startAfter(last);
      const page=await query.get();
      for(const doc of page.docs){
        const p=doc.data();
        if(!ROLES.includes(p.role))throw new Error("Unexpected community role");
        profiles.push({
          uid:doc.id,email:String(p.email||""),
          approved:p.status==="approved",
        });
        if(profiles.length>MAX_PROFILES)throw new Error("Audit profile cap reached");
      }
      if(page.empty||page.size<PAGE)break;
      last=page.docs[page.docs.length-1];
    }
    const groups=groupsFor(profiles);
    const gmailProfiles=[...groups.values()].flat();
    const collisionGroups=[...groups.values()].filter(g=>new Set(g.map(p=>p.uid)).size>1);
    const distinctUids=new Set(gmailProfiles.map(p=>p.uid));
    assert.equal(distinctUids.size,gmailProfiles.length,"Duplicate query UID");
    const authInfo=new Map();
    const gmailUids=[...distinctUids];
    // Read Firebase Auth state (no create/update/disable/delete APIs).
    for(let i=0;i<gmailUids.length;i+=BATCH){
      const ids=gmailUids.slice(i,i+BATCH);
      const result=await auth.getUsers(ids.map(uid=>({uid})));
      for(const record of result.users){
        authInfo.set(record.uid,{
          emailKey:gmailKey(record.email),
          verified:record.emailVerified===true,
          disabled:record.disabled===true,
        });
      }
    }

    const claimInfo=new Map();
    const mailboxKeys=[...groups.keys()];
    for(let i=0;i<mailboxKeys.length;i+=BATCH){
      const keys=mailboxKeys.slice(i,i+BATCH);
      const docs=await db.getAll(
        ...keys.map(key=>db.collection("gmailAliasClaims").doc(key)),
        {fieldMask:["uid"]}
      );
      docs.forEach((snapshot,j)=>{
        if(snapshot.exists)claimInfo.set(keys[j],String(snapshot.data()?.uid||""));
      });
    }
    const summary={
      mode:"READ_ONLY_EXISTING_GMAIL_RESIDENT_AUDIT",
      project:PROJECT,
      reviewedCommunityProfiles:profiles.length,
      gmailOrGooglemailProfiles:gmailProfiles.length,
      distinctGmailMailboxes:groups.size,
      duplicateMailboxGroups:collisionGroups.length,
      duplicateMailboxAffectedProfiles:collisionGroups.reduce((n,g)=>n+g.length,0),
      claimDocumentsAlreadyPresent:claimInfo.size,
      claimDocumentsMissing:mailboxKeys.length-claimInfo.size,
      claimOwnershipConflicts:0,
      authUidMissing:0,
      authEmailMismatch:0,
      authEmailUnverified:0,
      authAccountDisabled:0,
      eligibleForManualClaimBackfill:0,
      blockedProfilesNotEligibleForBackfill:0,
      profileDataLogged:false,
      productionWrites:"NONE",
    };
    for(const [key,group] of groups){
      const stored=claimInfo.get(key);
      if(stored && !group.some(p=>p.uid===stored))summary.claimOwnershipConflicts++;
      const collided=group.length!==1;
      for(const p of group){
        const authRecord=authInfo.get(p.uid);
        if(!authRecord)summary.authUidMissing++;
        else {
          if(authRecord.emailKey!==key)summary.authEmailMismatch++;
          if(!authRecord.verified)summary.authEmailUnverified++;
          if(authRecord.disabled)summary.authAccountDisabled++;
        }
        const ready=!collided && p.approved && authRecord &&
          authRecord.emailKey===key && authRecord.verified &&
          !authRecord.disabled && !stored;
        if(ready)summary.eligibleForManualClaimBackfill++;
        else summary.blockedProfilesNotEligibleForBackfill++;
      }
    }
    const blocked=summary.duplicateMailboxGroups>0 ||
      summary.claimOwnershipConflicts>0 ||
      summary.authUidMissing>0 ||
      summary.authEmailMismatch>0 ||
      summary.authEmailUnverified>0 ||
      summary.authAccountDisabled>0;
    summary.auditDisposition=blocked ?
      "STOP_AND_MANUALLY_REVIEW_BEFORE_MIGRATION":
      "NO_COLLISIONS_FOUND_BUT_HUMAN_BACKFILL_AND_ROLLOUT_REVIEW_REQUIRED";
    console.log(JSON.stringify(summary,null,2));
    if(blocked)process.exitCode=2;
  } finally {
    await deleteApp(app);
  }
}
