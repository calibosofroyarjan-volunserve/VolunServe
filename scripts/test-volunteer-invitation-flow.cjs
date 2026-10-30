"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp } = require("firebase/firestore");

async function main() {
  const admin = fs.readFileSync("app/(admin)/admin-cases.tsx", "utf8");
  const native = fs.readFileSync("app/(tabs)/volunteer.tsx", "utf8");
  const web = fs.readFileSync("app/(tabs)/volunteer.web.tsx", "utf8");
  const inbox = fs.readFileSync("components/volunteer/VolunteerInvitationInbox.tsx", "utf8");
  assert(admin.includes('collection(db, "volunteerInvitations")'));
  assert(admin.includes("inviteVolunteerToCase(incident, volunteer)"));
  assert(admin.includes("Invite Volunteer"));
  assert(admin.includes("Invite Again"));
  assert(!admin.includes('"Validate case first"'));
  assert(native.includes("<VolunteerInvitationInbox />") && web.includes("<VolunteerInvitationInbox />"));
  assert(inbox.includes('status: "invited" | "accepted" | "declined"'));
  assert(inbox.includes('onPress={() => respond(item, "accepted")}'));
  assert(inbox.includes('onPress={() => respond(item, "declined")}'));
  const projectId = "demo-volunserve-invitations";
  const env = await initializeTestEnvironment({projectId,
    firestore: {rules: fs.readFileSync("firestore.rules", "utf8")}});
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      const users = {
        admin: {role:"admin",status:"approved",adminStatus:"active"},
        vol1: {role:"resident",status:"approved",volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer"},
        vol2: {role:"resident",status:"approved",volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer"},
        resident: {role:"resident",status:"approved",residentAccess:true,activeMode:"resident"},
        pending: {role:"resident",status:"approved",volunteerAccess:true,volunteerStatus:"pending",activeMode:"volunteer"},
        blocked: {role:"resident",status:"suspended",volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer"},
      };
      await Promise.all(Object.entries(users).map(([uid,data]) =>
        setDoc(doc(db,"users",uid),{uid,...data})));
      await setDoc(doc(db,"disasterCases","pending-case"),{
        reporterUid:"resident",status:"reported",verificationStatus:"pending_verification"
      });
      // Volunteer already has an active response; invite must remain allowed
      // because it is a non-dispatch consent prompt.
      await setDoc(doc(db,"responseAssignments","busy-vol1"),{
        caseId:"other-case", volunteerId:"vol1",status:"responding"
      });
    });
    const dbFor = uid => env.authenticatedContext(uid).firestore();
    const path = "pending-case_vol1";
    const invite = {caseId:"pending-case",caseTitle:"Emergency review",
      volunteerId:"vol1",volunteerName:"Approved Volunteer",status:"invited",
      createdBy:"admin",createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
    await assertSucceeds(setDoc(doc(dbFor("admin"),"volunteerInvitations",path),invite));
    const getOwn = () => getDocs(query(collection(dbFor("vol1"),"volunteerInvitations"),where("volunteerId","==","vol1")));
    await assertSucceeds(getOwn());
    await assertSucceeds(getDoc(doc(dbFor("admin"),"volunteerInvitations",path)));
    await assertFails(getDoc(doc(dbFor("vol2"),"volunteerInvitations",path)));
    await assertFails(getDocs(collection(dbFor("vol1"),"volunteerInvitations")));
    await assertFails(updateDoc(doc(dbFor("vol2"),"volunteerInvitations",path),{status:"accepted",updatedAt:serverTimestamp()}));
    await assertFails(updateDoc(doc(dbFor("pending"),"volunteerInvitations",path),{status:"accepted",updatedAt:serverTimestamp()}));
    await assertFails(updateDoc(doc(dbFor("blocked"),"volunteerInvitations",path),{status:"accepted",updatedAt:serverTimestamp()}));
    await assertSucceeds(updateDoc(doc(dbFor("vol1"),"volunteerInvitations",path),{status:"declined",updatedAt:serverTimestamp()}));
    await assertFails(updateDoc(doc(dbFor("vol1"),"volunteerInvitations",path),{status:"accepted",updatedAt:serverTimestamp()}));
    await assertSucceeds(updateDoc(doc(dbFor("admin"),"volunteerInvitations",path),{status:"invited",updatedAt:serverTimestamp()}));
    await assertSucceeds(updateDoc(doc(dbFor("vol1"),"volunteerInvitations",path),{status:"accepted",updatedAt:serverTimestamp()}));
    await assertFails(updateDoc(doc(dbFor("vol1"),"volunteerInvitations",path),{status:"invited",updatedAt:serverTimestamp()}));
    await assertFails(setDoc(doc(dbFor("vol1"),"volunteerInvitations","pending-case_vol2"),{
      ...invite,volunteerId:"vol2",createdBy:"vol1"
    }));
    await assertFails(setDoc(doc(dbFor("admin"),"volunteerInvitations","pending-case_resident"),{
      ...invite,volunteerId:"resident"
    }));
    console.log("PASS: pending-case and busy Volunteer invitations; real ownership-protected Accept/Decline; Admin re-invite; unauthorized writes denied");
  } finally { await env.cleanup(); }
}
main().catch(e => {console.error(e);process.exitCode=1;});
