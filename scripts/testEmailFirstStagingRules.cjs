"use strict";
/** Test that an Auth-only UID cannot create a Resident profile until verified. */
const fs = require("fs");
const {initializeTestEnvironment, assertFails, assertSucceeds} =
  require("@firebase/rules-unit-testing");

function profile(uid, email, overrides = {}) {
  return {
    uid, email, fullName: "New, Resident", firstName: "New", lastName: "Resident",
    middleName: "", age: 22, phoneNumber: "+639123456789",
    region: "Region III – Central Luzon", province: "Bulacan",
    city: "City of San Jose del Monte", barangay: "Poblacion",
    occupationCategory: "Student", occupationSpecialization: "College",
    occupationOther: "", occupation: "College", skills: [],
    skillOther: "", availability: [], requestedRole: "resident",
    primaryRole: "resident", role: "resident", residentAccess: true,
    volunteerAccess: false, volunteerStatus: "not_applied",
    activeMode: "resident", status: "approved", identityStatus: "basic",
    identityVerified: false, emailVerificationRequired: true,
    emailPolicyVersion: 1, createdAt: new Date(),
    ...overrides,
  };
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-volunserve", firestore: {
      host: "127.0.0.1", port: 8080,
      rules: fs.readFileSync("firestore.auth-staging.rules", "utf8"),
    },
  });
  try {
    await env.clearFirestore();
    let pass = 0;
    const make = (uid, email, verified) => env.authenticatedContext(uid, {
      email, email_verified: verified,
    }).firestore();

    const unverified = make("new-resident", "new-resident@gmail.com", false);
    await assertFails(unverified.doc("users/new-resident").set(
      profile("new-resident", "new-resident@gmail.com")));
    pass++;
    console.log("PASS: Unverified user cannot create Basic Resident profile");

    // Confirm denial is not an accidental write.
    let exists = null;
    await env.withSecurityRulesDisabled(async context => {
      exists = (await context.firestore().doc("users/new-resident").get()).exists;
    });
    if (exists !== false) throw new Error("Unverified profile unexpectedly exists");
    pass++;

    const verified = make("new-resident", "new-resident@gmail.com", true);
    await assertSucceeds(verified.doc("users/new-resident").set(
      profile("new-resident", "new-resident@gmail.com")));
    pass++;
    console.log("PASS: Same UID creates a profile AFTER email verification");

    await assertFails(verified.doc("users/new-resident").update({role: "admin"}));
    pass++;
    console.log("PASS: Verified Resident cannot promote self to Admin");

    await assertFails(make("disposable", "temp@yopmail.com", true)
      .doc("users/disposable").set(profile("disposable", "temp@yopmail.com")));
    pass++;
    console.log("PASS: Verified known temp-mail still cannot create profile");

    await assertFails(make("typo", "user@gmail.co", true)
      .doc("users/typo").set(profile("typo", "user@gmail.co")));
    pass++;
    console.log("PASS: Verified mistyped Gmail cannot create profile");

    const knownProviderTypos = [
      ["yahoo-typo", "test@yahoo.co"],
      ["outlook-typo", "test@outlook.co"],
      ["hotmail-typo", "test@hotmail.con"],
      ["icloud-typo", "test@icloud.co"],
    ];
    for (const [uid, email] of knownProviderTypos) {
      await assertFails(make(uid, email, true)
        .doc("users/" + uid).set(profile(uid, email)));
      pass++;
    }
    console.log("PASS: Known Yahoo, Outlook, Hotmail and iCloud typos blocked in Firestore");

    const validProviders = [
      ["yahoo-user", "resident@yahoo.com"],
      ["outlook-user", "resident@outlook.com"],
      ["yahoo-uk-user", "resident@yahoo.co.uk"],
      ["legitimate-co", "resident@legitimate.co"],
    ];
    for (const [uid, email] of validProviders) {
      await assertSucceeds(make(uid, email, true)
        .doc("users/" + uid).set(profile(uid, email)));
      pass++;
    }
    console.log("PASS: Verified Yahoo, Outlook, Yahoo regional and independent .co domains accepted");

    await assertFails(make("other", "other@gmail.com", true)
      .doc("users/new-resident").update({firstName: "Hacker"}));
    pass++;
    console.log("PASS: Other users cannot edit Resident profile");

    await assertSucceeds(verified.doc("users/new-resident")
      .update({firstName: "Updated"}));
    pass++;
    console.log("PASS: Verified owner can safely edit profile");

    console.log(pass + "/16 email-first staging rules checks passed.");
  } finally {
    await env.cleanup();
  }
})().catch(error => {
  console.error("STAGING RULE TEST FAILED", error);
  process.exitCode = 1;
});
