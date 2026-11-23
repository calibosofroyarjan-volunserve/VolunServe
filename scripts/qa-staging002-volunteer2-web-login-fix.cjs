"use strict";
/**
 * Isolated FIXED FICTIONAL Volunteer 2: make existing email/password QA account
 * compatible with the ordinary VolunServe web login + Volunteer tab.
 * - No passwords changed/read/generated
 * - No new accounts
 * - No real email identity asserted: fixed example.com test fixture only
 * - Strict service-account project and Auth + Firestore fixture checks
 * - No production, no official incident, no deployment or rules changes
 * - --apply required for the two targeted staging-only fields
 */
const fs=require("node:fs");
const path=require("node:path");
const {createRequire}=require("node:module");
const PROJECT="volunserve-volunteer-staging";
const FIXTURE="STAGING_E2E_002";
const SLOT=2;
const UID="staging002_qa_volunteer_02";
const EMAIL="staging002.qa.volunteer2@example.com";
const fail=reason=>{throw new Error("STAGING BLOCKED: "+reason)};
function parse(args){
  let keyFile="",apply=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==="--key-file"&&args[i+1]&&!keyFile){keyFile=args[++i];continue;}
    if(args[i]==="--apply"){apply=true;continue;}
    fail("Unknown argument (accepted: --key-file FILE and --apply)");
  }
  if(!keyFile)fail('Usage: node scripts/qa-staging002-volunteer2-web-login-fix.cjs --key-file "PATH_TO_STAGING_JSON" --apply');
  return {keyFile:path.resolve(keyFile),apply};
}
function exactFixtureProfile(profile,application){
  return profile?.testOnly===true&&
    profile?.testFixture===FIXTURE&&profile?.testFixtureSlot===SLOT&&
    profile?.role==="volunteer"&&profile?.status==="approved"&&
    profile?.volunteerAccess===true&&profile?.volunteerStatus==="approved"&&
    profile?.identityVerified===true&&
    application?.testOnly===true&&
    application?.testFixture===FIXTURE&&application?.testFixtureSlot===SLOT&&
    application?.uid===UID&&application?.status==="approved";
}
async function main(){
  const {keyFile,apply}=parse(process.argv.slice(2));
  if(!fs.existsSync(keyFile)||!fs.statSync(keyFile).isFile())
    fail("Staging service-account file not found");
  const serviceAccount=JSON.parse(fs.readFileSync(keyFile,"utf8"));
  if(serviceAccount.type!=="service_account"||
     serviceAccount.project_id!==PROJECT||
     !String(serviceAccount.client_email||"").endsWith("@"+PROJECT+".iam.gserviceaccount.com")||
     typeof serviceAccount.private_key!=="string"||
     !serviceAccount.private_key.includes("BEGIN PRIVATE KEY"))
    fail("Credential is not the exact isolated staging Firebase project");
  const backendRequire=createRequire(path.resolve(__dirname,"../backend/package.json"));
  const {initializeApp,cert,deleteApp}=backendRequire("firebase-admin/app");
  const {getAuth}=backendRequire("firebase-admin/auth");
  const {getFirestore,FieldValue}=backendRequire("firebase-admin/firestore");
  const app=initializeApp({credential:cert(serviceAccount),projectId:PROJECT},"qa-staging002-web-login-"+process.pid);
  try{
    const auth=getAuth(app),db=getFirestore(app);
    const userRef=db.collection("users").doc(UID);
    const applicationRef=db.collection("volunteerApplications").doc(UID);
    const [authUser,userSnap,applicationSnap]=await Promise.all([
      auth.getUser(UID),userRef.get(),applicationRef.get()
    ]);
    if(!userSnap.exists||!applicationSnap.exists||
       !exactFixtureProfile(userSnap.data(),applicationSnap.data()))
      fail("Volunteer 2 does not match the exact approved fictional staging fixture");
    if(authUser.uid!==UID||authUser.email!==EMAIL||authUser.disabled)
      fail("Firebase Auth user is not the expected enabled Volunteer 2 fixture");
    if(userSnap.data().activeMode &&
       !["resident","volunteer"].includes(userSnap.data().activeMode))
      fail("Unexpected Volunteer 2 activeMode; refusing to overwrite");
    console.log("PASS: isolated Firebase staging project and exact approved fictional Volunteer 2 verified");
    console.log("BEFORE: emailVerified="+String(authUser.emailVerified)+
      ", activeMode="+String(userSnap.data().activeMode||"unset"));
    if(!apply){
      console.log("READ ONLY: add --apply to enable normal web login for this fictional test account");
      return;
    }
    // Admin SDK only, never enable email-verification bypass in application code.
    if(userSnap.data().activeMode!=="volunteer"){
      await db.runTransaction(async tx=>{
        const [user,application]=await Promise.all([
          tx.get(userRef),tx.get(applicationRef)
        ]);
        if(!user.exists||!application.exists||
           !exactFixtureProfile(user.data(),application.data()))
          fail("Fixed fictional fixture changed during update");
        tx.update(userRef,{
          activeMode:"volunteer",
          updatedAt:FieldValue.serverTimestamp()
        });
      });
    }
    if(!authUser.emailVerified){
      await auth.updateUser(UID,{emailVerified:true});
    }
    const [updatedAuth,updatedProfile]=await Promise.all([
      auth.getUser(UID),userRef.get()
    ]);
    if(updatedAuth.email!==EMAIL||updatedAuth.emailVerified!==true||
       !updatedProfile.exists||updatedProfile.data().activeMode!=="volunteer"||
       !exactFixtureProfile(updatedProfile.data(),applicationSnap.data()))
      fail("Verification after apply did not match the protected test fixture");
    console.log("PASS: normal web email verification and Volunteer mode now compatible");
    console.log("FINAL: staging Volunteer 2 emailVerified=true, activeMode=volunteer");
    console.log("Password unchanged; accepted emergency test assignment untouched.");
    console.log("Only this fixed fictional staging account was updated. No live deployment.");
  }finally{
    await deleteApp(app);
  }
}
main().catch(error=>{
  console.error(String(error?.message||error).slice(0,250));
  process.exitCode=1;
});
