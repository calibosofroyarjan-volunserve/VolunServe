"use strict";
const fs = require("node:fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { collection, doc, setDoc, getDocs, getDoc, query, where } = require("firebase/firestore");

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve-authorization-tests",
    firestore: { rules: fs.readFileSync("firestore.rules","utf8") },
  });
  try {
    const seedUsers = [
      ["admin", {role:"admin",status:"approved",primaryRole:"resident"}],
      ["legacy-admin", {role:"admin",primaryRole:"resident"}],
      ["suspended-admin", {role:"admin",status:"approved",adminStatus:"suspended"}],
      ["pending-admin", {role:"admin",status:"pending"}],
      ["resident-with-primary-admin", {role:"resident",status:"approved",primaryRole:"admin",residentAccess:true,activeMode:"resident"}],
      ["vol-a", {role:"resident",status:"approved",volunteerStatus:"approved",volunteerAccess:true,activeMode:"resident"}],
      ["vol-b", {role:"resident",status:"approved",volunteerStatus:"approved",volunteerAccess:true,activeMode:"volunteer"}],
      ["vol-pending", {role:"resident",status:"approved",volunteerStatus:"pending",volunteerAccess:true,activeMode:"volunteer"}],
    ];
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      for (const [uid,data] of seedUsers) {
        await setDoc(doc(db,"users",uid),{uid,...data});
      }
      await setDoc(doc(db,"disasterCases","case-a"),{reporterUid:"resident-with-primary-admin",status:"validated"});
      await setDoc(doc(db,"disasterCases","case-b"),{reporterUid:"resident-with-primary-admin",status:"validated"});
      await setDoc(doc(db,"responseAssignments","assign-a"),{caseId:"case-a",volunteerId:"vol-a",status:"offered"});
      await setDoc(doc(db,"responseAssignments","assign-b"),{caseId:"case-b",volunteerId:"vol-b",status:"offered"});
    });
    const dbFor = uid => env.authenticatedContext(uid).firestore();
    const assignments = uid => collection(dbFor(uid),"responseAssignments");
    const own = uid => getDocs(query(assignments(uid),where("volunteerId","==",uid)));
    await assertSucceeds(own("vol-a")); // approved volunteer, active resident mode
    await assertSucceeds(own("vol-b")); // approved volunteer, active volunteer mode
    await assertFails(getDocs(assignments("vol-a"))); // no unscoped list
    await assertFails(getDoc(doc(dbFor("vol-a"),"responseAssignments","assign-b")));
    await assertFails(own("vol-pending")); // not yet volunteer-approved
    await assertSucceeds(getDocs(assignments("admin")));
    await assertSucceeds(getDocs(assignments("legacy-admin")));
    await assertFails(getDocs(assignments("suspended-admin")));
    await assertFails(getDocs(assignments("pending-admin")));
    await assertFails(getDocs(assignments("resident-with-primary-admin")));
    await assertSucceeds(getDoc(doc(dbFor("resident-with-primary-admin"),"responseAssignments","assign-a")));
    console.log("PASS Firestore: Admin read, legacy-provisioned Admin, Volunteer-owned assignments, active-mode independence, and explicit denials.");
  } finally {
    await env.cleanup();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
