"use strict";
const fs = require("node:fs");
const {initializeTestEnvironment, assertSucceeds, assertFails} = require("@firebase/rules-unit-testing");
const {doc, setDoc} = require("firebase/firestore");
const {ref, uploadBytes, getMetadata} = require("firebase/storage");

async function main() {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Run only with isolated Firebase Storage + Firestore emulators.");
  }
  const projectId = "demo-volunserve-storage-verified";
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync("firestore.rules", "utf8")},
    storage: {rules: fs.readFileSync("storage.rules", "utf8")},
  });
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(),"users","legacy-guest"),{
        uid:"legacy-guest",email:"guest@gmail.com",role:"guest",
        status:"approved",residentAccess:true,
      });
      await setDoc(doc(ctx.firestore(),"users","resident-storage"),{
        uid:"resident-storage",email:"resident@gmail.com",
        status:"approved",role:"resident",residentAccess:true,
      });
    });
    const bucket = "gs://" + projectId + ".appspot.com";
    const as = verified => env.authenticatedContext("resident-storage",{
      email: "resident@gmail.com",email_verified:verified,
    }).storage(bucket);
    const file = "disasterCases/test-case/resident-storage-photo.jpg";
    const bytes = new Uint8Array([1,2,3,4]);
    const metadata = {contentType:"image/jpeg"};
    await assertFails(uploadBytes(ref(as(false),file),bytes,metadata));
    const guest = env.authenticatedContext("legacy-guest",{
      email:"guest@gmail.com",email_verified:true,
    }).storage(bucket);
    await assertFails(uploadBytes(ref(guest,"disasterCases/test-case/legacy-guest-photo.jpg"),bytes,metadata));
    await assertSucceeds(uploadBytes(ref(as(true),file),bytes,metadata));
    await assertFails(getMetadata(ref(as(false),file)));
    await assertSucceeds(getMetadata(ref(as(true),file)));
    console.log("PASS Storage: unverified direct authenticated uploads/reads denied; verified Resident preserved.");
  } finally {
    await env.cleanup();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
