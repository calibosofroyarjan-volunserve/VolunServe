"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict");
const {initializeTestEnvironment, assertFails, assertSucceeds}=require("@firebase/rules-unit-testing");
if(!process.env.FIREBASE_STORAGE_EMULATOR_HOST||!process.env.FIRESTORE_EMULATOR_HOST){
  throw Error("Storage and Firestore emulators required; refusing production access");
}
async function main(){
  const env=await initializeTestEnvironment({
    projectId:"demo-volunserve",
    firestore:{rules:fs.readFileSync("firestore.rules","utf8")},
    storage:{rules:fs.readFileSync("storage.rules","utf8")}
  });
  try{
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c=>{
      const db=c.firestore();
      await db.doc("users/pending-lgu-applicant").set({uid:"pending-lgu-applicant",role:"applicant",status:"pending_review"});
      await db.doc("users/second-pending-applicant").set({uid:"second-pending-applicant",role:"applicant",status:"pending_review"});
      await db.doc("users/super-admin-reviewer").set({uid:"super-admin-reviewer",role:"superadmin",status:"approved"});
      await db.doc("users/lgu-admin").set({uid:"lgu-admin",role:"admin",status:"approved",adminStatus:"active"});
      await db.doc("users/normal-resident").set({uid:"normal-resident",role:"resident",status:"approved"});
      await db.doc("users/suspended-superadmin").set({uid:"suspended-superadmin",role:"superadmin",status:"suspended"});
      await db.doc("users/approved-applicant").set({uid:"approved-applicant",role:"admin",status:"approved"});
    });
    const storageFor=uid=>env.authenticatedContext(uid).storage("gs://demo-volunserve.appspot.com");
    const path=(uid,kind)=>"lguApplicantProofs/"+uid+"/"+kind;
    const upload=(uid,owner,kind,mime="image/png",body="safe-dummy-image")=>
      storageFor(uid).ref(path(owner,kind)).putString(body,"raw",{contentType:mime});
    const meta=(uid,owner,kind)=>storageFor(uid).ref(path(owner,kind)).getMetadata();

    await assertSucceeds(upload("pending-lgu-applicant","pending-lgu-applicant","employee-id"));
    await assertSucceeds(upload("pending-lgu-applicant","pending-lgu-applicant","supporting-document","application/pdf","%PDF-1.4 fake-test"));
    console.log("PASS owner pending applicant can upload only two proof kinds");
    await assertFails(upload("second-pending-applicant","pending-lgu-applicant","employee-id"));
    await assertFails(upload("normal-resident","normal-resident","employee-id"));
    await assertFails(upload("approved-applicant","approved-applicant","employee-id"));
    await assertFails(upload("pending-lgu-applicant","pending-lgu-applicant","other-document"));
    await assertFails(upload("pending-lgu-applicant","pending-lgu-applicant","employee-id","text/plain"));
    await assertFails(upload("pending-lgu-applicant","pending-lgu-applicant","employee-id","image/png","x".repeat(5*1024*1024+1)));
    console.log("PASS reject unauthorized owner, wrong role, unexpected paths, content type and size");

    await assertSucceeds(meta("pending-lgu-applicant","pending-lgu-applicant","employee-id"));
    await assertSucceeds(meta("super-admin-reviewer","pending-lgu-applicant","employee-id"));
    await assertSucceeds(meta("super-admin-reviewer","pending-lgu-applicant","supporting-document"));
    await assertFails(meta("second-pending-applicant","pending-lgu-applicant","employee-id"));
    await assertFails(meta("normal-resident","pending-lgu-applicant","employee-id"));
    await assertFails(meta("lgu-admin","pending-lgu-applicant","employee-id"));
    await assertFails(meta("suspended-superadmin","pending-lgu-applicant","employee-id"));
    await assertFails(env.unauthenticatedContext().storage("gs://demo-volunserve.appspot.com").ref(path("pending-lgu-applicant","employee-id")).getMetadata());
    console.log("PASS only approved Super Admin and current applicant may read confidential ID");

    await assertFails(storageFor("pending-lgu-applicant").ref("lguApplicantProofs/pending-lgu-applicant").listAll());
    await assertFails(storageFor("pending-lgu-applicant").ref(path("pending-lgu-applicant","employee-id")).delete());
    await assertSucceeds(storageFor("super-admin-reviewer").ref(path("pending-lgu-applicant","employee-id")).delete());
    console.log("PASS listing blocked, deletion restricted to Super Admin");
  } finally {await env.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
