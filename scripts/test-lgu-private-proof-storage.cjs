"use strict";
const fs=require("node:fs");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {doc,setDoc}=require("firebase/firestore");
const {ref,uploadBytes,getBytes,getMetadata,deleteObject}=require("firebase/storage");

if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST)
  throw Error("LGU credential security tests must run on Firestore AND Storage emulators only.");

async function main(){
  const env=await initializeTestEnvironment({
    projectId:"demo-volunserve",
    firestore:{rules:fs.readFileSync("firestore.rules","utf8")},
    storage:{rules:fs.readFileSync("storage.rules","utf8")},
  });
  try{
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      for(const [uid,role,status] of [
        ["lgu-applicant-photo-01","applicant","pending_review"],
        ["programmer-superadmin-01","superadmin","approved"],
        ["ordinary-lgu-admin-01","admin","approved"],
        ["ordinary-resident-01","resident","approved"],
      ]) await setDoc(doc(db,"users",uid),{uid,role,status});
    });
    const applicant=env.authenticatedContext("lgu-applicant-photo-01").storage();
    const reviewer=env.authenticatedContext("programmer-superadmin-01").storage();
    const ordinary=env.authenticatedContext("ordinary-lgu-admin-01").storage();
    const resident=env.authenticatedContext("ordinary-resident-01").storage();
    const stranger=env.unauthenticatedContext().storage();
    const path="lguStaffProof/lgu-applicant-photo-01/staff-id";
    const letter="lguStaffProof/lgu-applicant-photo-01/appointment-letter";
    const bytes=new Uint8Array([255,216,255,217]);
    await assertSucceeds(uploadBytes(ref(applicant,path),bytes,{contentType:"image/jpeg"}));
    await assertSucceeds(uploadBytes(ref(applicant,letter),bytes,{contentType:"image/jpeg"}));
    console.log("PASS pending applicant can upload ONLY own two credential images");
    await assertFails(uploadBytes(ref(applicant,"lguStaffProof/other-user-uid-01/staff-id"),bytes,{contentType:"image/jpeg"}));
    await assertFails(uploadBytes(ref(applicant,"lguStaffProof/lgu-applicant-photo-01/other"),bytes,{contentType:"image/jpeg"}));
    await assertFails(uploadBytes(ref(applicant,path),bytes,{contentType:"text/plain"}));
    console.log("PASS unauthorized paths and non-image MIME writes are denied");
    await assertSucceeds(getMetadata(ref(reviewer,path)));
    await assertSucceeds(getBytes(ref(reviewer,letter)));
    await assertFails(getMetadata(ref(ordinary,path)));
    await assertFails(getMetadata(ref(resident,path)));
    await assertFails(getMetadata(ref(stranger,path)));
    await assertFails(getMetadata(ref(applicant,path)));
    await assertFails(deleteObject(ref(reviewer,path)));
    console.log("PASS only programmer Super Admin can view ID / appointment evidence; deletion denied");
  }finally{await env.cleanup()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
