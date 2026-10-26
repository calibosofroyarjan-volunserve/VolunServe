/**
 * Production-safe: refuses to run without local Firestore emulator.
 * Synthetic users/cases only; no real responder or resident GPS is generated.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Firestore emulator required; refusing production testing");
}
const TS = () => firebase.firestore.FieldValue.serverTimestamp();
const projectId = "demo-volunserve";
const ADMIN = "map-ci-admin";
const RESIDENT = "map-ci-resident";
const CASE = "map-ci-case";
let passed = 0, failed = 0;
async function check(name, action, denied = false) {
  try {
    if (denied) await assertFails(action()); else await assertSucceeds(action());
    passed++;
    console.log("PASS " + name);
  } catch (err) {
    failed++;
    console.error("FAIL " + name + ": " + err.message);
  }
}
const center = (status, verificationStatus, source) => ({
  name: "Test Designated Facility", barangay: "Sapang Palay Proper",
  address: "Synthetic CI shelter test address", latitude: 14.82, longitude: 121.04,
  capacity: 100, occupied: 5, status, verificationStatus,
  verificationSource: source, updatedBy: ADMIN, updatedAt: TS(),
  lastVerifiedAt: TS(),
});
async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "..", "firestore.rules"), "utf8"),
    },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc("users/" + ADMIN).set({ uid: ADMIN, role: "admin", status: "approved" });
      await db.doc("users/" + RESIDENT).set({
        uid: RESIDENT, role: "resident", status: "approved",
        residentAccess: true, activeMode: "resident", identityVerified: true,
      });
      await db.doc("disasterCases/" + CASE).set({
        status: "assigned", reporterUid: RESIDENT, title: "Synthetic Fire",
        activeLguResponderUid: "assigned-lgu-test", latitude: 14.82,
        longitude: 121.04,
      });
    });
    const adm = env.authenticatedContext(ADMIN).firestore();
    const res = env.authenticatedContext(RESIDENT).firestore();
    const anon = env.unauthenticatedContext().firestore();
    await check("Admin can select ambulance dispatch", () =>
      adm.doc("disasterCases/" + CASE).update({
        responseVehicleType: "ambulance", responseVehicleUpdatedAt: TS(),
      }));
    await check("Resident can read vehicle type on own case", () =>
      res.doc("disasterCases/" + CASE).get());
    await check("Resident cannot change response vehicle", () =>
      res.doc("disasterCases/" + CASE).update({ responseVehicleType: "fire_truck" }), true);
    await check("Invalid response vehicle rejected", () =>
      adm.doc("disasterCases/" + CASE).update({ responseVehicleType: "police_helicopter" }), true);
    await check("Admin can save unverified center as pending", () =>
      adm.doc("evacuation_centers/pending").set(center("pending_verification", "pending", "")));
    await check("Cannot label unverified center active", () =>
      adm.doc("evacuation_centers/unverified").set(center("active", "pending", "")), true);
    await check("Active center requires official source", () =>
      adm.doc("evacuation_centers/no-source").set(center("active", "verified", "x")), true);
    await check("Admin can publish verified center", () =>
      adm.doc("evacuation_centers/verified").set(center("active", "verified", "LGU office record reference")));
    await check("Resident cannot alter a verified center", () =>
      res.doc("evacuation_centers/verified").update({occupied: 77}), true);
    await check("Public can read verified center metadata", () =>
      anon.doc("evacuation_centers/verified").get());
    await check("Admin cannot exceed declared occupancy capacity", () =>
      adm.doc("evacuation_centers/overflow").set({
        ...center("active", "verified", "Official confirmed"), occupied: 120,
      }), true);
    console.log("Emergency maps rules: " + passed + " passed, " + failed + " failed");
    if (failed) process.exitCode = 1;
  } finally {
    await env.cleanup();
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
