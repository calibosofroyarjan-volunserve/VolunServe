/**
 * Emulator-only financial role isolation:
 * approved LGU Admin can inspect receipts, approved donor can read own receipt,
 * Super Admin programmer cannot access confidential LGU Donation records.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require("@firebase/rules-unit-testing");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw Error("Firestore emulator required; refusing production Firestore access");
const projectId="demo-volunserve";
async function main() {
 const env=await initializeTestEnvironment({projectId,firestore:{
  rules:fs.readFileSync(path.join(__dirname,"../firestore.rules"),"utf8")}});
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
   const db=context.firestore();
   await db.doc("users/financial-admin").set({role:"admin",status:"approved"});
   await db.doc("users/system-programmer").set({role:"superadmin",status:"approved"});
   await db.doc("users/financial-donor").set({
    role:"resident",status:"approved",residentAccess:true,activeMode:"resident"});
   await db.doc("users/other-financial-donor").set({
    role:"resident",status:"approved",residentAccess:true,activeMode:"resident"});
   await db.doc("donationCampaigns/test-campaign").set({title:"Test Campaign",status:"published"});
   await db.doc("donations/test-receipt").set({
     donorUid:"financial-donor",campaignId:"test-campaign",status:"received"});
   await db.doc("donations/test-receipt/logs/test-audit").set({type:"verified",amount:1});
  });
  const admin=env.authenticatedContext("financial-admin").firestore();
  const superadmin=env.authenticatedContext("system-programmer").firestore();
  const donor=env.authenticatedContext("financial-donor").firestore();
  const outsider=env.authenticatedContext("other-financial-donor").firestore();
  const campaign="donationCampaigns/test-campaign",receipt="donations/test-receipt";
  await assertSucceeds(admin.doc(campaign).get());
  await assertSucceeds(admin.doc(receipt).get());
  await assertSucceeds(admin.doc(receipt+"/logs/test-audit").get());
  console.log("PASS approved LGU Admin reads campaign, donation, and audit");
  await assertFails(superadmin.doc(campaign).get());
  await assertFails(superadmin.doc(receipt).get());
  await assertFails(superadmin.doc(receipt+"/logs/test-audit").get());
  console.log("PASS programmer Super Admin cannot access LGU financial records");
  await assertSucceeds(donor.doc(campaign).get());
  await assertSucceeds(donor.doc(receipt).get());
  await assertFails(donor.doc(receipt+"/logs/test-audit").get());
  await assertFails(outsider.doc(receipt).get());
  console.log("PASS Resident campaign browsing and donor-only receipt privacy");
 } finally {await env.cleanup();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
