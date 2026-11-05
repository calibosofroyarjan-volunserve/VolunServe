"use strict";
// Runs only against a local Firestore emulator and a snapshot of the CURRENT
// published Cloud Rules. Never creates real Firebase user accounts or documents.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.LIVE_ANNOUNCEMENTS_RULES_FILE)
  throw Error("STOP: Firebase emulator and read-only live Rules snapshot are REQUIRED");
const rulesFile = process.env.LIVE_ANNOUNCEMENTS_RULES_FILE;
const rules = fs.readFileSync(rulesFile, "utf8");
if (!rules.includes("match /announcements/{announcementId}") ||
    !rules.includes("request.resource.data.audience == profile().barangay"))
  throw Error("STOP: published announcement authorization differs from expected live baseline");
const beginning=rules.indexOf("match /announcements/{announcementId}");
const ending=rules.indexOf("    match /",beginning+16);
if(beginning<0 || ending<0)throw Error("Published announcement rule block missing");
console.log("ACTIVE FIRESTORE ANNOUNCEMENT RULE (read-only snapshot):");
console.log(rules.slice(beginning,ending).slice(0,5000));
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const announcement = (creator, area, title = "Community Event Reminder") => ({
  title,
  message: "Official reminder: check your barangay activities and schedule.",
  audience: area, priority: "normal",
  publishAt: stamp(), createdAt: stamp(), updatedAt: stamp(),
  createdBy: creator, linkUrl: "", imageUrl: "",
});

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: { rules }
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      const users = {
        "lgu-admin": {role:"admin",status:"approved",adminStatus:"active",barangay:"Francisco Homes-Narra"},
        "blocked-admin": {role:"admin",status:"approved",adminStatus:"suspended",barangay:"Francisco Homes-Narra"},
        "resident": {role:"resident",status:"approved",barangay:"Francisco Homes-Narra"},
        "volunteer": {role:"volunteer",status:"approved",barangay:"Francisco Homes-Narra"},
        "pending": {role:"resident",status:"pending",barangay:"Francisco Homes-Narra"},
      };
      for(const [uid, data] of Object.entries(users))
        await db.doc("users/" + uid).set({ uid, ...data });
    });

    const admin=env.authenticatedContext("lgu-admin").firestore();
    const blocked=env.authenticatedContext("blocked-admin").firestore();
    const resident=env.authenticatedContext("resident").firestore();
    const volunteer=env.authenticatedContext("volunteer").firestore();
    const pending=env.authenticatedContext("pending").firestore();
    const guest=env.unauthenticatedContext().firestore();

    // Actual live write payload and cross-barangay safeguards.
    const created=await assertSucceeds(admin.collection("announcements")
      .add(announcement("lgu-admin","Francisco Homes-Narra")));
    await assertFails(admin.collection("announcements")
      .add(announcement("lgu-admin","Muzon East")));
    await assertFails(admin.collection("announcements")
      .add(announcement("lgu-admin","all")));
    await assertFails(blocked.collection("announcements")
      .add(announcement("blocked-admin","Francisco Homes-Narra")));
    await assertFails(resident.collection("announcements")
      .add(announcement("resident","Francisco Homes-Narra")));

    // Exact query used by the resident/volunteer feed, including published-time
    // bound and matching orderBy (single-field index only).
    const publishedOnly=db => db.collection("announcements")
      .where("publishAt","<=",firebase.firestore.Timestamp.now())
      .orderBy("publishAt","desc");
    const residentSnapshot=await assertSucceeds(publishedOnly(resident).get());
    const volunteerSnapshot=await assertSucceeds(publishedOnly(volunteer).get());
    assert(residentSnapshot.docs.some(x=>x.id===created.id),"Resident cannot see published notice");
    assert(volunteerSnapshot.docs.some(x=>x.id===created.id),"Volunteer cannot see published notice");
    await assertFails(publishedOnly(guest).get());
    await assertFails(publishedOnly(pending).get());
    console.log("PASS exact live Firestore rules: Admin create, local-only audience, resident/volunteer published feed, denied unauthorized access.");
    console.log("NO production Firebase write was attempted.");
  } finally {
    await env.cleanup();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
