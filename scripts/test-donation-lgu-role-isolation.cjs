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
   await db.doc("users/financial-admin").set({email:"admin@city.gov.ph",role:"admin",status:"approved"});
   await db.doc("users/system-programmer").set({email:"superadmin@city.gov.ph",role:"superadmin",status:"approved"});
   await db.doc("users/financial-donor").set({
    email:"donor@yahoo.com",role:"resident",status:"approved",residentAccess:true,activeMode:"resident"});
   await db.doc("users/other-financial-donor").set({
    email:"other@yahoo.com",role:"resident",status:"approved",
    residentAccess:true,activeMode:"resident"});
   await db.doc("donationCampaigns/test-campaign").set({title:"Test Campaign",status:"published"});
   await db.doc("donations/test-receipt").set({
     donorUid:"financial-donor",campaignId:"test-campaign",status:"received"});
   await db.doc("donations/test-receipt/logs/test-audit").set({type:"verified",amount:1});
  });
  // Real approved() requires verified-email claims; Residents also require
  // exact email equality with their own approved profile.
  const verified=(uid,email)=>env.authenticatedContext(uid,
    {email,email_verified:true}).firestore();
  const admin=verified("financial-admin","admin@city.gov.ph");
  const superadmin=verified("system-programmer","superadmin@city.gov.ph");
  const donor=verified("financial-donor","donor@yahoo.com");
  const outsider=verified("other-financial-donor","other@yahoo.com");
  const campaign="donationCampaigns/test-campaign",receipt="donations/test-receipt";
  const unverifiedAdmin=env.authenticatedContext("financial-admin",
    {email:"admin@city.gov.ph",email_verified:false}).firestore();
  await assertFails(unverifiedAdmin.doc(receipt).get());
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
