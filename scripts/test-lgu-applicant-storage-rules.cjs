/**
 * Integration test: run only with Firebase Firestore + Storage emulators.
 * No real government IDs, faces, or production Firebase resources are accessed.
 * npx firebase emulators:exec --only firestore,storage --project demo-volunserve
 *   "node scripts/test-lgu-applicant-storage-rules.cjs"
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
require("firebase/compat/storage");
if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error("Both Storage and Firestore emulators required. Refusing to use production.");
  process.exit(1);
}
const projectId="demo-volunserve";
const BUCKET=projectId+".appspot.com";
const staff="storage-evidence-applicant", superAdmin="storage-evidence-superadmin";
const lguAdmin="storage-evidence-lgu-admin", stranger="storage-evidence-resident";
const media=new Uint8Array(1400).fill(0x55);
const meta={contentType:"image/jpeg",customMetadata:{purpose:"lgu_staff_manual_review",idType:"ph_national_id"}};
const FILE="lguStaffEvidence/"+staff+"/front.jpg";
let pass=0, fail=0;
async function verify(name, operation, denied=false) {
  try {
    if(denied) await assertFails(operation()); else await assertSucceeds(operation());
    pass++;console.log("PASS "+name);
  } catch(err) {fail++;console.error("FAIL "+name+": "+(err?.message||err));}
}
async function main(){
  const env=await initializeTestEnvironment({
    projectId,
    firestore:{rules:fs.readFileSync(path.resolve(__dirname,"../firestore.rules"),"utf8")},
    storage:{rules:fs.readFileSync(path.resolve(__dirname,"../storage.rules"),"utf8")},
  });
  try {
    await env.clearFirestore();
    await env.clearStorage();
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await db.doc("users/"+staff).set({uid:staff,role:"applicant",status:"pending_review"});
      await db.doc("users/"+superAdmin).set({uid:superAdmin,role:"superadmin",status:"approved"});
      await db.doc("users/"+lguAdmin).set({uid:lguAdmin,role:"admin",status:"approved"});
      await db.doc("users/"+stranger).set({uid:stranger,role:"resident",status:"approved"});
    });
    const get=(uid)=>env.authenticatedContext(uid).storage(BUCKET);
    const owner=get(staff), privileged=get(superAdmin), admin=get(lguAdmin);
    const another=get(stranger), anonymous=env.unauthenticatedContext().storage(BUCKET);
    const ownerFile=owner.ref(FILE);
    // No config exists on first deployment: deny all direct SDK intake.
    await verify("Without server release even pending applicants cannot create ID photos",
      ()=>ownerFile.put(media,meta),true);
    await env.withSecurityRulesDisabled(async ctx=>{
      await ctx.firestore().doc("lguIdentityIntake/release").set({enabled:false});
    });
    await verify("Explicitly disabled release blocks direct Storage SDK uploads",
      ()=>ownerFile.put(media,meta),true);
    await verify("Applicant cannot enable evidence release",
      ()=>env.authenticatedContext(staff).firestore().doc("lguIdentityIntake/release").set({enabled:true}),true);
    await verify("LGU Admin cannot enable evidence release",
      ()=>env.authenticatedContext(lguAdmin).firestore().doc("lguIdentityIntake/release").set({enabled:true}),true);
    await verify("Super Admin browser cannot enable evidence release",
      ()=>env.authenticatedContext(superAdmin).firestore().doc("lguIdentityIntake/release").set({enabled:true}),true);
    await env.withSecurityRulesDisabled(async ctx=>{
      await ctx.firestore().doc("lguIdentityIntake/release").set({enabled:true});
    });
    await verify("Random resident cannot create someone else's ID",()=>another.ref(FILE).put(media,meta),true);
    await verify("LGU Admin cannot create applicant ID",()=>admin.ref(FILE).put(media,meta),true);
    await verify("Applicant cannot write in somebody else's directory",
      ()=>owner.ref("lguStaffEvidence/"+stranger+"/front.jpg").put(media,meta),true);
    await verify("Applicant cannot upload arbitrary file slot",
      ()=>owner.ref("lguStaffEvidence/"+staff+"/school_id.jpg").put(media,meta),true);
    await verify("Applicant cannot upload disguised extension with MIME mismatch",
      ()=>ownerFile.put(media,{...meta,contentType:"image/png"}),true);
    await verify("Applicant cannot omit official private-evidence purpose",
      ()=>ownerFile.put(media,{contentType:"image/jpeg"}),true);
    await verify("Applicant cannot omit immutable declared government ID type",
      ()=>ownerFile.put(media,{contentType:"image/jpeg",customMetadata:{purpose:"lgu_staff_manual_review"}}),true);
    await verify("School IDs cannot be falsely declared in Storage metadata",
      ()=>ownerFile.put(media,{contentType:"image/jpeg",customMetadata:{purpose:"lgu_staff_manual_review",idType:"school_id"}}),true);
    await verify("Applicant cannot upload empty file",
      ()=>ownerFile.put(new Uint8Array(20),meta),true);
    await verify("Private government ID created only by its pending applicant",
      ()=>ownerFile.put(media,meta));
    await verify("Applicant may read their own evidence metadata",()=>ownerFile.getMetadata());
    await verify("Only programmer Super Admin may inspect other applicant evidence",
      ()=>privileged.ref(FILE).getMetadata());
    await verify("LGU operational Admin cannot access applicant ID metadata",
      ()=>admin.ref(FILE).getMetadata(),true);
    await verify("Resident cannot access applicant ID metadata",
      ()=>another.ref(FILE).getMetadata(),true);
    await verify("Anonymous cannot access applicant ID metadata",
      ()=>anonymous.ref(FILE).getMetadata(),true);
    await verify("No applicant overwrite after initial upload",
      ()=>ownerFile.put(media,meta),true);
    await verify("No applicant deletion of identity photo",
      ()=>ownerFile.delete(),true);
    await verify("No regular LGU Admin can delete biometric evidence",
      ()=>admin.ref(FILE).delete(),true);
    await verify("Owner cannot list entire evidence collection",
      ()=>owner.ref("lguStaffEvidence").listAll(),true);
  } finally {await env.cleanup();}
  console.log("LGU private Storage rules: "+pass+" passed / "+fail+" failed.");
  if(fail)process.exitCode=1;
}
main().catch(err=>{console.error(err);process.exitCode=1;});
