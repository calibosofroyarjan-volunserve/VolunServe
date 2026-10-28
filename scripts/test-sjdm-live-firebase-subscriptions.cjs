"use strict";
/** Firebase emulator only. No production writes, no real evacuation sites. */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds } = require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run without Firestore emulator");
  process.exit(1);
}
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(40);
  }
  throw new Error("Missing realtime event: " + label);
}
async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve",
    firestore: { rules: fs.readFileSync(path.join(__dirname,"../firestore.rules"),"utf8") },
  });
  const adminUid = "sjdm-watch-admin";
  const residentUid = "sjdm-watch-resident";
  let stoppedShelters = () => {};
  let stoppedFacilities = () => {};
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc("users/" + adminUid)
        .set({ role: "admin", status: "approved", adminStatus: "active" });
      await context.firestore().doc("users/" + residentUid)
        .set({ role: "resident", status: "approved", residentAccess: true });
    });
    const admin = env.authenticatedContext(adminUid).firestore();
    const resident = env.authenticatedContext(residentUid).firestore();
    const shelter = admin.doc("evacuation_centers/synthetic-watch");
    const office = admin.doc("lguMapFacilities/synthetic-office");
    const shelterEvents = [];
    const facilityEvents = [];
    const listenerErrors = [];
    stoppedShelters = resident.collection("evacuation_centers").onSnapshot(snapshot => {
      shelterEvents.push(snapshot.docs.map(entry => ({id:entry.id,...entry.data()}))
        .filter(v => v.status === "active" && v.verificationStatus === "verified"));
    }, error => listenerErrors.push("shelter: " + error.message));
    stoppedFacilities = resident.collection("lguMapFacilities").onSnapshot(snapshot => {
      facilityEvents.push(snapshot.docs.map(entry => ({id:entry.id,...entry.data()}))
        .filter(v => v.status === "active" && v.verificationStatus === "verified"));
    }, error => listenerErrors.push("office: " + error.message));
    await until(() => shelterEvents.length > 0 && facilityEvents.length > 0,
      "initial 2 collection snapshots");
    await assertSucceeds(shelter.set({
      name:"Synthetic SJDM Evacuation Centre",
      address:"Synthetic test-only address in SJDM",
      barangay:"Dulong Bayan",latitude:14.81,longitude:121.04,
      capacity:100,occupied:25,status:"active",verificationStatus:"verified",
      verificationSource:"Synthetic emulator record; not an operational site",
      lastVerifiedAt:stamp(),updatedAt:stamp(),updatedBy:adminUid,
    }));
    await until(() => shelterEvents.some(rows =>
      rows.some(center => center.id === "synthetic-watch" && center.occupied === 25)),
      "published shelter appears to resident in real time");
    await assertSucceeds(shelter.update({occupied:40,updatedAt:stamp(),updatedBy:adminUid}));
    await until(() => shelterEvents.some(rows =>
      rows.some(center => center.id === "synthetic-watch" && center.occupied === 40)),
      "resident receives updated shelter occupancy");
    await assertSucceeds(office.set({
      name:"Synthetic LGU Facility",address:"Synthetic office address in SJDM",
      barangay:"Dulong Bayan",facilityType:"cdrrmo",
      latitude:14.81,longitude:121.04,status:"active",
      verificationStatus:"verified",verificationSource:"Synthetic-only office fixture",
      updatedAt:stamp(),updatedBy:adminUid,
    }));
    await until(() => facilityEvents.some(rows => rows.some(v => v.id === "synthetic-office")),
      "resident receives verified LGU office");
    await assertSucceeds(shelter.update({status:"closed",updatedAt:stamp(),updatedBy:adminUid}));
    await until(() => shelterEvents.some(rows => rows.length === 0) &&
      shelterEvents.at(-1).length === 0,"closed shelter disappears from active map feed");
    await assertSucceeds(office.update({status:"inactive",updatedAt:stamp(),updatedBy:adminUid}));
    await until(() => facilityEvents.length >= 3 && facilityEvents.at(-1).length === 0,
      "inactive office disappears from active map feed");
    if (listenerErrors.length) throw new Error(listenerErrors.join("; "));
    console.log("PASS: Firestore resident-side live shelter + LGU facility onSnapshot updates");
    console.log("PASS: Active→closed shelter and active→inactive facility disappear from active pins");
  } finally {
    stoppedShelters();
    stoppedFacilities();
    await env.cleanup();
  }
}
main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
