"use strict";

/**
 * VolunServe Firebase Spark — offline safety checks for a production Rules
 * release. Requires the Firestore emulator and @firebase/rules-unit-testing.
 * Uses ONLY "demo-volunserve" project; never points at production.
 */
const fs = require("fs");
const {initializeTestEnvironment, assertSucceeds, assertFails} =
  require("@firebase/rules-unit-testing");

const projectId = "demo-volunserve";
const rules = fs.readFileSync("firestore.rules", "utf8");
let testEnv;
let passed = 0;

function residentProfile(uid, email, extra = {}) {
  return {
    uid,
    fullName: "Test Resident",
    lastName: "Resident",
    firstName: "Test",
    middleName: "",
    age: 23,
    email,
    phoneNumber: "+639123456789",
    region: "Region III",
    province: "Bulacan",
    city: "City of San Jose del Monte",
    barangay: "Poblacion",
    occupationCategory: "",
    occupationSpecialization: "",
    occupationOther: "",
    skills: [],
    skillOther: "",
    availability: [],
    role: "resident",
    requestedRole: "resident",
    primaryRole: "resident",
    residentAccess: true,
    volunteerAccess: false,
    volunteerStatus: "not_applied",
    activeMode: "resident",
    status: "approved",
    identityStatus: "basic",
    identityVerified: false,
    emailVerificationRequired: true,
    emailPolicyVersion: 1,
    createdAt: new Date(),
    ...extra,
  };
}

async function allowed(label, operation) {
  await assertSucceeds(operation);
  console.log("PASS " + label);
  passed++;
}
async function denied(label, operation) {
  await assertFails(operation);
  console.log("PASS " + label);
  passed++;
}

async function run() {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {host: "127.0.0.1", port: 8080, rules},
  });
  await testEnv.clearFirestore();

  const valid = testEnv.authenticatedContext("resident-valid", {
    email: "valid.resident@gmail.com", email_verified: false,
  }).firestore();
  await allowed(
    "Normal Gmail can create an unverified Basic Resident profile",
    valid.doc("users/resident-valid").set(
      residentProfile("resident-valid", "valid.resident@gmail.com")
    )
  );

  await allowed(
    "Normal Resident can update own basic profile name",
    valid.doc("users/resident-valid").update({firstName: "Updated"})
  );

  await denied(
    "Resident cannot promote their own role to Admin",
    valid.doc("users/resident-valid").update({role: "admin"})
  );

  await denied(
    "Resident cannot disable the email verification requirement",
    valid.doc("users/resident-valid").update({emailVerificationRequired: false})
  );

  await denied(
    "Unverified Resident cannot read protected volunteer events",
    valid.doc("volunteerEvents/secret-event").get()
  );

  const verified = testEnv.authenticatedContext("resident-valid", {
    email: "valid.resident@gmail.com", email_verified: true,
  }).firestore();
  await allowed(
    "Verified Resident can access protected volunteer events",
    verified.doc("volunteerEvents/secret-event").get()
  );

  const temporary = testEnv.authenticatedContext("temp-user", {
    email: "temp-user@yopmail.com", email_verified: false,
  }).firestore();
  await denied(
    "Known disposable email cannot create a Resident profile",
    temporary.doc("users/temp-user").set(
      residentProfile("temp-user", "temp-user@yopmail.com")
    )
  );

  const spoofed = testEnv.authenticatedContext("spoof-user", {
    email: "real-owner@gmail.com", email_verified: false,
  }).firestore();
  await denied(
    "Client cannot create profile for different email address",
    spoofed.doc("users/spoof-user").set(
      residentProfile("spoof-user", "someone-else@gmail.com")
    )
  );

  const noGate = testEnv.authenticatedContext("no-gate", {
    email: "no-gate@gmail.com", email_verified: false,
  }).firestore();
  await denied(
    "Client cannot disable email verification marker",
    noGate.doc("users/no-gate").set(
      residentProfile("no-gate", "no-gate@gmail.com", {
        emailVerificationRequired: false,
      })
    )
  );

  const noVersion = testEnv.authenticatedContext("no-version", {
    email: "no-version@gmail.com", email_verified: false,
  }).firestore();
  await denied(
    "New Resident profile requires current email policy version",
    noVersion.doc("users/no-version").set(
      residentProfile("no-version", "no-version@gmail.com", {
        emailPolicyVersion: 0,
      })
    )
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc("users/legacy-resident").set({
      uid: "legacy-resident", role: "resident", status: "approved",
      residentAccess: true, activeMode: "resident",
    });
    await db.doc("users/legacy-admin").set({
      uid: "legacy-admin", role: "admin", status: "approved",
      adminStatus: "active",
    });
  });

  const legacyResident = testEnv.authenticatedContext("legacy-resident", {
    email: "legacy@gmail.com", email_verified: false,
  }).firestore();
  await denied(
    "Legacy unverified Resident is blocked from approved-only data",
    legacyResident.doc("volunteerEvents/event-1").get()
  );

  const legacyAdmin = testEnv.authenticatedContext("legacy-admin", {
    email: "admin@sjdm.gov.ph", email_verified: false,
  }).firestore();
  await allowed(
    "Existing Admin without a Resident verification flag retains access",
    legacyAdmin.doc("volunteerEvents/event-1").get()
  );

  console.log("\n" + passed + "/12 authentication security rules checks passed.");
  console.log(
    "These tests cover known blocked domains only. They do not prove every " +
    "temporary mail provider is blocked or that the live app works."
  );
}

run().catch((error) => {
  console.error("AUTH RULES TEST FAILED:", error);
  process.exitCode = 1;
}).finally(async () => {
  if (testEnv) await testEnv.cleanup();
});
