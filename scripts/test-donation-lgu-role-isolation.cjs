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
   await db.doc("users/financial-admin").set({role:"admin",status:"approved",
    email:"financial-admin@example.org"});
   await db.doc("users/system-programmer").set({role:"superadmin",status:"approved",
    email:"system-programmer@example.org"});
   await db.doc("users/financial-donor").set({
    role:"resident",status:"approved",residentAccess:true,activeMode:"resident",
    email:"financial-donor@example.org"});
   await db.doc("users/other-financial-donor").set({
    role:"resident",status:"approved",residentAccess:true,activeMode:"resident",
    email:"other-financial-donor@example.org"});
   await db.doc("donationCampaigns/test-campaign").set({title:"Test Campaign",status:"published"});
   await db.doc("donations/test-receipt").set({
     donorUid:"financial-donor",campaignId:"test-campaign",status:"received"});
   await db.doc("donations/test-receipt/logs/test-audit").set({type:"verified",amount:1});
  });
  const admin=env.authenticatedContext("financial-admin",{
    email:"financial-admin@example.org",email_verified:true}).firestore();
  const superadmin=env.authenticatedContext("system-programmer",{
    email:"system-programmer@example.org",email_verified:true}).firestore();
  const donor=env.authenticatedContext("financial-donor",{
    email:"financial-donor@example.org",email_verified:true}).firestore();
  const outsider=env.authenticatedContext("other-financial-donor",{
    email:"other-financial-donor@example.org",email_verified:true}).firestore();
  const unverifiedAdmin=env.authenticatedContext("financial-admin",{
    email:"financial-admin@example.org",email_verified:false}).firestore();
  const campaign="donationCampaigns/test-campaign",receipt="donations/test-receipt";
  await assertSucceeds(admin.doc(campaign).get());
  await assertSucceeds(admin.doc(receipt).get());
  await assertSucceeds(admin.doc(receipt+"/logs/test-audit").get());
  await assertFails(unverifiedAdmin.doc(receipt).get());
  console.log("PASS verified approved LGU Admin reads campaign/receipt/audit; unverified email denied");
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
