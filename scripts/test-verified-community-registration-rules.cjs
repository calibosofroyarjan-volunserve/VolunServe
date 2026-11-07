"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const {initializeTestEnvironment, assertSucceeds, assertFails} = require("@firebase/rules-unit-testing");
const {doc, setDoc, getDoc, Timestamp} = require("firebase/firestore");

async function main() {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve-verified-signup",
    firestore: {rules: fs.readFileSync("firestore.rules", "utf8")},
  });
  try {
    const validProfile = {
      uid: "new-resident", email: "real@gmail.com", fullName: "Test, Resident",
      firstName: "Resident", lastName: "Test", middleName: "",
      age: 23, phoneNumber: "+639171234567",
      region: "Region III – Central Luzon", province: "Bulacan",
      city: "City of San Jose del Monte", barangay: "Muzon",
      address: "Muzon, City of San Jose del Monte, Bulacan",
      occupationCategory: "Student", occupationSpecialization: "",
      occupationOther: "", occupation: "Student", skills: [],
      skillOther: "", availability: [], role: "resident",
      requestedRole: "resident", primaryRole: "resident",
      residentAccess: true, volunteerAccess: false,
      volunteerStatus: "not_applied", activeMode: "resident",
      status: "approved", identityStatus: "basic", identityVerified: false,
      profilePictureUrl: "", createdAt: Timestamp.now(),
    };
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, "users", "existing-resident"), {
        uid: "existing-resident", email: "existing@gmail.com",
        role: "resident", status: "approved", residentAccess: true,
        activeMode: "resident",
      });
      await setDoc(doc(db, "announcements", "published"), {
        title: "Public safety update", publishAt: Timestamp.fromMillis(1000),
      });
    });
    const as = (uid, email, verified) =>
      env.authenticatedContext(uid, {email, email_verified: verified}).firestore();
    await assertFails(getDoc(doc(as("existing-resident","existing@gmail.com",false),"announcements","published")));
    await assertFails(getDoc(doc(as("existing-resident","other@gmail.com",true),"announcements","published")));
    await assertSucceeds(getDoc(doc(as("existing-resident","existing@gmail.com",true),"announcements","published")));

    await assertFails(setDoc(doc(as("new-resident","real@gmail.com",false),"users","new-resident"),validProfile));
    await assertFails(setDoc(doc(as("new-resident","other@gmail.com",true),"users","new-resident"),validProfile));
    await assertSucceeds(setDoc(doc(as("new-resident","real@gmail.com",true),"users","new-resident"),validProfile));
    assert.ok(true);
    console.log("PASS Firestore: unverified/mismatched community emails denied, verified complete Resident permitted.");
  } finally {
    await env.cleanup();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
