"use strict";

/**
 * Local-only Firebase Storage + Firestore rules integration test.
 * Run with:
 *   npx firebase-tools emulators:exec --only firestore,storage --project demo-volunserve \
 *      "node scripts/qa-storage-emulator-only-20261107.cjs"
 * This file has NO connection to Firebase production, Blaze, Cloudinary, Render, or real files.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {initializeTestEnvironment, assertSucceeds, assertFails}=
  require("@firebase/rules-unit-testing");

const LOCAL_PROJECT="demo-volunserve";
const localHost=v=>v==="127.0.0.1"||v==="localhost";
const requireLocal=(key,port)=>{
  const value=process.env[key]||"";
  const match=/^([^:]+):(\d+)$/.exec(value);
  assert.ok(match&&localHost(match[1])&&Number(match[2])===port,
    "STOP: ONLY local emulator "+key+" at port "+port+" is allowed");
};
assert.equal(process.env.CI,"true","STOP: synthetic test must run in isolated CI");
assert.equal(process.env.VOLUNSERVE_EMULATOR_PROJECT,LOCAL_PROJECT);
requireLocal("FIRESTORE_EMULATOR_HOST",8080);
requireLocal("FIREBASE_STORAGE_EMULATOR_HOST",9199);
for(const key of [
  "GOOGLE_APPLICATION_CREDENTIALS","FIREBASE_TOKEN",
  "FIREBASE_SERVICE_ACCOUNT","FIREBASE_SERVICE_ACCOUNT_JSON",
  "PAYMONGO_SECRET_KEY","CLOUDINARY_API_SECRET",
]) assert.ok(!process.env[key],"STOP: cloud credential detected: "+key);
for(const key of ["GCLOUD_PROJECT","GOOGLE_CLOUD_PROJECT","FIREBASE_PROJECT_ID"]){
 const value=process.env[key]||"";
 assert.ok(!value||value.startsWith("demo-"),"STOP: not a demo project: "+key);
}
const rules=fs.readFileSync("storage.rules","utf8");
const firestoreRules=fs.readFileSync("firestore.rules","utf8");
const uid="fake-volunteer-qa";
const admin="fake-admin-qa";
const outsider="fake-unverified-qa";
const syntheticJpeg=new Uint8Array([255,216,255,224,0,16,74,70,73,70,0,1,255,217]);
(async()=>{
 const env=await initializeTestEnvironment({
   projectId:LOCAL_PROJECT,
   firestore:{rules:firestoreRules},
   storage:{rules},
 });
 try{
   await env.withSecurityRulesDisabled(async ctx=>{
     const db=ctx.firestore();
     await db.doc("users/"+uid).set({role:"resident",status:"approved",volunteerAccess:true,volunteerStatus:"approved"});
     await db.doc("users/"+admin).set({role:"admin",status:"approved"});
     await db.doc("users/"+outsider).set({role:"resident",status:"pending",volunteerAccess:false});
   });
   const bucket="gs://demo-volunserve.appspot.com";
   const residentStore=env.authenticatedContext(uid).storage(bucket);
   const adminStore=env.authenticatedContext(admin).storage(bucket);
   const unverifiedStore=env.authenticatedContext(outsider).storage(bucket);
   const anonymous=env.unauthenticatedContext().storage(bucket);
   const casePath="disasterCases/test-case/"+uid+"-incident.jpg";
   await assertSucceeds(residentStore.ref(casePath).put(syntheticJpeg,{contentType:"image/jpeg"}));
   await assertSucceeds(residentStore.ref(casePath).getMetadata());
   await assertSucceeds(adminStore.ref(casePath).getMetadata());
   await assertFails(unverifiedStore.ref(casePath).getMetadata());
   await assertFails(anonymous.ref(casePath).getMetadata());
   await assertFails(residentStore.ref("disasterCases/test-case/someone-else-incident.jpg")
     .put(syntheticJpeg,{contentType:"image/jpeg"}));
   await assertFails(residentStore.ref("disasterCases/test-case/"+uid+"-not-image.txt")
     .put(new Uint8Array([1,2,3]),{contentType:"text/plain"}));
   await assertFails(residentStore.ref("announcements/test-announcement/photo.jpg")
     .put(syntheticJpeg,{contentType:"image/jpeg"}));
   const announcement="announcements/test-announcement/admin-test-image.jpg";
   await assertSucceeds(adminStore.ref(announcement).put(syntheticJpeg,{contentType:"image/jpeg"}));
   await assertSucceeds(anonymous.ref(announcement).getMetadata());
   await assertFails(anonymous.ref(announcement).put(syntheticJpeg,{contentType:"image/jpeg"}));
   await assertFails(adminStore.ref("private/admin-photo.jpg")
     .put(syntheticJpeg,{contentType:"image/jpeg"}));
   console.log("PASS 11 local-only Firebase Storage scenarios: authorized incident uploads/reads, anonymous and unverified denials, file ownership, content type, Admin announcement uploads, public announcement reads, default private write denial.");
 }finally{
   await env.cleanup();
 }
})().catch(e=>{console.error("FAIL LOCAL STORAGE TEST:",e?.stack||e);process.exitCode=1});
