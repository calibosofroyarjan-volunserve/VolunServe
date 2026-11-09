/** Ensure opt-in organizer GPS can be stopped after Resident -> Volunteer mode switch.
 * Emulator only; synthetic coordinates only; NEVER contacts production. */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw Error("FIRESTORE_EMULATOR_HOST required; refusing production writes");
}
const projectId = "demo-volunserve";
const owner = "gps-cleanup-owner", other = "gps-cleanup-other";
const superUid = "gps-cleanup-programmer", adminUid = "gps-cleanup-lgu-admin";
const event = "gps-cleanup-event", pathFor = "communityEventLiveLocations/" + event;
async function main() {
  const env = await initializeTestEnvironment({
    projectId, firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "..", "firestore.rules"), "utf8"),
    },
  });
  try {
    await env.clearFirestore();
    const now = firebase.firestore.Timestamp.now();
    const inTwoMinutes = firebase.firestore.Timestamp.fromMillis(now.toMillis() + 120000);
    const seed = async () => env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc("users/" + owner).set({uid:owner,email:"organizer@example.com",role:"volunteer",
        status:"approved",activeMode:"volunteer",residentAccess:true,volunteerAccess:true,
        identityVerified:true});
      await db.doc("users/" + superUid).set({uid:superUid,email:"super@example.com",role:"superadmin",status:"approved"});
      await db.doc("users/" + adminUid).set({uid:adminUid,email:"admin@example.com",role:"admin",status:"approved",adminStatus:"active"});
      await db.doc("users/" + other).set({uid:other,email:"other@example.com",role:"resident",
        status:"approved",activeMode:"resident",residentAccess:true});
      await db.doc("communityEvents/" + event).set({
        proposedBy:owner,status:"upcoming",publicationStatus:"published",
      });
      await db.doc(pathFor).set({
        eventId:event,residentId:owner,latitude:14.813,longitude:121.045,
        accuracyMeters:25,updatedAt:now,expiresAt:inTwoMinutes,
      });
    });
    // Production-approved sessions require email_verified; keep synthetic test
    // identities compatible with the hardened role permissions.
    const as = (uid,email) => env.authenticatedContext(uid,{email,email_verified:true}).firestore();
    const organizer = as(owner,"organizer@example.com");
    const outsider = as(other,"other@example.com");
    const superDb = as(superUid,"super@example.com");
    const adminDb = as(adminUid,"admin@example.com");
    const anonymous = env.unauthenticatedContext().firestore();
    await seed();
    await assertFails(superDb.doc(pathFor).get());
    await assertFails(superDb.doc(pathFor).delete());
    console.log("PASS programmer Super Admin cannot read or remove temporary organizer GPS");
    await assertSucceeds(adminDb.doc(pathFor).get());
    console.log("PASS operational LGU Admin can read temporary event GPS");
    await assertFails(outsider.doc(pathFor).delete());
    console.log("PASS unrelated Resident cannot delete organizer GPS");
    await assertFails(anonymous.doc(pathFor).delete());
    console.log("PASS unauthenticated client cannot delete organizer GPS");
    await assertSucceeds(organizer.doc(pathFor).delete());
    console.log("PASS organizer can stop location sharing in Volunteer active mode");
    await seed();
    await env.withSecurityRulesDisabled(async ctx =>
      ctx.firestore().doc("users/" + owner).update({residentAccess:false}));
    await assertFails(organizer.doc(pathFor).delete());
    console.log("PASS loss of Resident entitlement blocks GPS cleanup");
  } finally { await env.cleanup(); }
}
main().catch(err => {console.error(err);process.exitCode=1;});
