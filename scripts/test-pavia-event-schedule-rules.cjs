"use strict";
/**
 * Synthetic-only Firestore test for expired Community Event enrollment.
 * Requires FIRESTORE_EMULATOR_HOST; never connects to a real Firebase project.
 */
const { initializeTestEnvironment, assertFails, assertSucceeds } = require("@firebase/rules-unit-testing");
const fs = require("node:fs");
const path = require("node:path");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Refusing to run without the Firestore emulator.");
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const uid = "pavia-time-volunteer";
const owner = "pavia-time-organizer";
async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8") },
  });
  try {
    await env.clearFirestore();
    const now = Date.now();
    const future = now + 2 * 60 * 60 * 1000;
    const past = now - 2 * 60 * 60 * 1000;
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc("users/" + uid).set({
        uid, role:"resident",status:"approved", residentAccess:true, activeMode:"volunteer",
        volunteerAccess:true,volunteerStatus:"approved",fullName:"Event Test Volunteer",
      });
      for (const [id, startsAt, endsAt, status] of [
        ["expired", past-3600000, past, "upcoming"],
        ["future", future, future+3600000, "upcoming"],
        ["active-valid", past, future, "active"],
        ["active-expired", past-3600000, past, "active"],
      ]) {
        await db.doc("communityEvents/pavia-" + id).set({
          title:"Synthetic Test",description:"Only in Firestore emulator",
          status,publicationStatus:"published",date:"2026-11-15",time:"13:00",endTime:"15:00",
          startsAt:firebase.firestore.Timestamp.fromMillis(startsAt),
          endsAt:firebase.firestore.Timestamp.fromMillis(endsAt),
          proposedBy:owner,capacity:5,participantsCount:0,
        });
      }
    });
    const volunteer = env.authenticatedContext(uid).firestore();
    async function join(id) {
      const eventId = "pavia-" + id;
      await volunteer.runTransaction(async tx => {
        const eventRef = volunteer.doc("communityEvents/" + eventId);
        const participationRef = volunteer.doc("communityEventParticipants/" + eventId + "_" + uid);
        const eventSnap = await tx.get(eventRef);
        const previous = await tx.get(participationRef);
        if (!eventSnap.exists || previous.exists) throw Error("Fixture state mismatch");
        tx.set(participationRef, {
          eventId, uid, fullName:"Event Test Volunteer", status:"joined",
          joinedAt:stamp(),declinedAt:null,checkedInAt:null,checkedOutAt:null,
          attendanceVerified:false,attendanceVerifiedAt:null,updatedAt:stamp(),
        });
        tx.update(eventRef, {
          participantsCount: Number(eventSnap.data().participantsCount) + 1,
          updatedAt: stamp(),
        });
      });
    }
    await assertFails(join("expired"));
    await assertFails(join("active-expired"));
    await assertSucceeds(join("future"));
    await assertSucceeds(join("active-valid"));
    console.log("PASS: Firestore blocks expired or ended event Join, permits valid future and ongoing enrollment");
  } finally { await env.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
