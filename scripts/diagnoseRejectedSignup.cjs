"use strict";

/**
 * Isolate the Firebase emulator's generic evaluation-error diagnostics during
 * rejected Resident profile creation (not a production deployment test).
 *
 * Run: npx firebase-tools emulators:exec --only firestore --project demo-volunserve "node scripts/diagnoseRejectedSignup.cjs"
 *
 * It uses only a demo project and validates that denied client writes leave
 * no document behind. Distinguishes 403 with no mutation from accidental
 * authorization. The emulator can report a generic "evaluation error" even
 * for a valid false predicate; see firebase/firebase-tools issue #11283.
 */
const fs = require("fs");
const {initializeTestEnvironment, assertSucceeds, assertFails} =
  require("@firebase/rules-unit-testing");

const PROJECT_ID = "demo-volunserve";
const rules = fs.readFileSync("firestore.rules", "utf8");

function profile(uid, email, overrides = {}) {
  return {
    uid,
    fullName: "Test Resident",
    firstName: "Test",
    lastName: "Resident",
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
    ...overrides,
  };
}

async function run() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {host: "127.0.0.1", port: 8080, rules},
  });
  try {
    await env.clearFirestore();
    let inspected = 0;
    const cases = [
      {
        label: "known-temp-mail",
        uid: "probe-temp",
        tokenEmail: "probe@yopmail.com",
        profileEmail: "probe@yopmail.com",
        changes: {},
      },
      {
        label: "spoofed-email",
        uid: "probe-spoof",
        tokenEmail: "real-owner@gmail.com",
        profileEmail: "someone-else@gmail.com",
        changes: {},
      },
      {
        label: "verification-flag-bypass",
        uid: "probe-flag",
        tokenEmail: "probe-flag@gmail.com",
        profileEmail: "probe-flag@gmail.com",
        changes: {emailVerificationRequired: false},
      },
      {
        label: "policy-version-bypass",
        uid: "probe-policy",
        tokenEmail: "probe-policy@gmail.com",
        profileEmail: "probe-policy@gmail.com",
        changes: {emailPolicyVersion: 0},
      },
    ];
    for (const test of cases) {
      const client = env.authenticatedContext(test.uid, {
        email: test.tokenEmail, email_verified: false,
      }).firestore();
      const ref = client.doc("users/" + test.uid);
      console.log("PROBE START " + test.label);
      await assertFails(ref.set(profile(test.uid, test.profileEmail, test.changes)));

      // Authorized bypass read is diagnostic only, never a write.
      // withSecurityRulesDisabled returns Promise<void>, not the callback
      // result; capture the snapshot's existence inside its callback.
      let exists = null;
      await env.withSecurityRulesDisabled(async (context) => {
        const snapshot = await context.firestore().doc("users/" + test.uid).get();
        exists = snapshot.exists;
      });
      if (typeof exists !== "boolean") {
        throw new Error("Diagnostic could not read profile existence");
      }
      if (exists) {
        throw new Error(
          "SECURITY FAILURE: denied " + test.label + " wrote a profile!"
        );
      }
      inspected++;
      console.log("PROBE PASS " + test.label + ": denied, document absent");
    }

    // Positive control ensures we aren't "passing" just by denying all writes.
    const uid = "probe-normal";
    const email = "probe-normal@gmail.com";
    const client = env.authenticatedContext(uid, {
      email, email_verified: false,
    }).firestore();
    console.log("PROBE START allowed-normal-resident");
    await assertSucceeds(client.doc("users/" + uid).set(profile(uid, email)));
    let exists = null;
    await env.withSecurityRulesDisabled(async (context) => {
      const snapshot = await context.firestore().doc("users/" + uid).get();
      exists = snapshot.exists;
    });
    if (typeof exists !== "boolean") {
      throw new Error("Diagnostic could not read valid profile existence");
    }
    if (!exists) throw new Error("Valid profile was not created");
    console.log("PROBE PASS allowed-normal-resident: created and present");
    console.log("DIAGNOSTIC COMPLETE: " + inspected +
      " rejected profiles absent; valid profile present.");
    console.log("Note: generic emulator evaluation warnings are still " +
      "reported separately; do NOT treat this as production authorization.");
  } finally {
    await env.cleanup();
  }
}

run().catch((error) => {
  console.error("DIAGNOSTIC FAILED:", error);
  process.exitCode = 1;
});
