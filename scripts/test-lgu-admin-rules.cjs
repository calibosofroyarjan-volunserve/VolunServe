/**
 * Run only against the local Firestore emulator:
 * npx firebase emulators:exec --only firestore --project demo-volunserve "node scripts/test-lgu-admin-rules.cjs"
 * Synthetic credentials and test profiles only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } =
  require("@firebase/rules-unit-testing");
const firebase = require("firebase/compat/app");
require("firebase/compat/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Firestore Emulator required; refusing to contact production.");
  process.exit(1);
}
const projectId = "demo-volunserve";
const SU = "security-test-superadmin";
const ADMIN = "security-test-admin";
const TARGET = "security-test-staff";
const OTHER = "security-test-resident";
const STALE = "security-test-stale";
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
let pass = 0;
let fail = 0;

async function check(label, promiseFactory, mustFail = false) {
  try {
    if (mustFail) await assertFails(promiseFactory());
    else await assertSucceeds(promiseFactory());
    pass += 1;
    console.log("PASS " + label);
  } catch (e) {
    fail += 1;
    console.error("FAIL " + label + ": " + (e?.message || e));
  }
}

const baseResident = (uid, email) => ({
  uid, email, role: "resident", primaryRole: "resident",
  status: "approved", residentAccess: true, volunteerAccess: false,
  activeMode: "resident", identityVerified: true,
  identityStatus: "verified", volunteerStatus: "not_applied",
  fullName: "Example Account",
});
const newReview = (uid, email) => ({
  targetUid: uid, accountEmail: email, reviewStatus: "verified",
  office: "City Public Safety Office", position: "LGU Response Officer",
  credentialReference: "PUBLIC-OFFICE-REFERENCE-TEST",
  verificationMethod: "Confirmed directly with the official LGU office",
  verifiedBy: SU, verifiedAt: stamp(),
});
const promotion = () => ({
  previousRole: "resident",
  previousPrimaryRole: "resident",
  role: "admin", adminStatus: "active", status: "approved",
  adminCreatedAt: stamp(), adminCreatedBy: SU,
  adminUpdatedAt: stamp(), adminUpdatedBy: SU,
});

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.resolve(__dirname, "..", "firestore.rules"), "utf8") },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await db.doc("users/" + SU).set({uid: SU, email:"superadmin@example.test",role:"superadmin",status:"approved",fullName:"Test Super Admin"});
      await db.doc("users/" + ADMIN).set({uid: ADMIN, email:"admin@example.test",role:"admin",status:"approved",adminStatus:"active"});
      await db.doc("users/" + TARGET).set(baseResident(TARGET, "staff@example.test"));
      await db.doc("users/" + OTHER).set(baseResident(OTHER, "resident@example.test"));
      await db.doc("users/" + STALE).set(baseResident(STALE, "stale@example.test"));
      await db.doc("lguAdminCredentialReviews/" + STALE).set({
        ...newReview(STALE, "stale@example.test"),
        verifiedAt: firebase.firestore.Timestamp.fromDate(new Date("2025-01-01T00:00:00Z")),
      });
    });
    const superDb = env.authenticatedContext(SU).firestore();
    const adminDb = env.authenticatedContext(ADMIN).firestore();
    const residentDb = env.authenticatedContext(TARGET).firestore();
    const unrelatedDb = env.authenticatedContext(OTHER).firestore();
    const unauthDb = env.unauthenticatedContext().firestore();

    await check("Anonymous cannot read private LGU reviews",
      () => unauthDb.doc("lguAdminCredentialReviews/" + STALE).get(), true);
    await check("Resident cannot read private LGU reviews",
      () => residentDb.doc("lguAdminCredentialReviews/" + STALE).get(), true);
    await check("Admin cannot read Super Admin credential reviews",
      () => adminDb.doc("lguAdminCredentialReviews/" + STALE).get(), true);
    await check("Super Admin can review credential reference",
      () => superDb.doc("lguAdminCredentialReviews/" + STALE).get());

    await check("Resident cannot forge a verified credential review",
      () => residentDb.doc("lguAdminCredentialReviews/" + TARGET)
        .set(newReview(TARGET, "staff@example.test")), true);
    await check("Admin cannot forge an LGU credential review",
      () => adminDb.doc("lguAdminCredentialReviews/" + TARGET)
        .set(newReview(TARGET, "staff@example.test")), true);
    await check("Resident cannot self-promote",
      () => residentDb.doc("users/" + TARGET).update({role:"admin",adminStatus:"active"}), true);
    await check("Existing Admin cannot promote Resident",
      () => adminDb.doc("users/" + TARGET).update(promotion()), true);
    await check("Super Admin cannot promote without a fresh review",
      () => superDb.doc("users/" + TARGET).update(promotion()), true);
    await check("Old LGU review cannot be reused",
      () => superDb.doc("users/" + STALE).update(promotion()), true);

    await check("Mismatched staff email cannot pass credential review", () => {
      const batch = superDb.batch();
      batch.set(superDb.doc("lguAdminCredentialReviews/" + TARGET),
        newReview(TARGET, "someone-else@example.test"));
      batch.update(superDb.doc("users/" + TARGET), promotion());
      return batch.commit();
    }, true);

    await check("Valid batch: fresh LGU review and Admin promotion together", () => {
      const batch = superDb.batch();
      batch.set(superDb.doc("lguAdminCredentialReviews/" + TARGET),
        newReview(TARGET, "staff@example.test"));
      batch.update(superDb.doc("users/" + TARGET), promotion());
      return batch.commit();
    });
    await check("Newly promoted LGU Admin can access own profile",
      () => residentDb.doc("users/" + TARGET).get());

    await check("Resident cannot read other staff private credential record",
      () => unrelatedDb.doc("lguAdminCredentialReviews/" + TARGET).get(), true);

    await check("Super Admin cannot create an Admin profile without fresh review", () =>
      superDb.doc("users/direct-create-admin-test").set({
        uid:"direct-create-admin-test",email:"another@example.test",
        role:"admin",status:"approved",createdBy:SU,reviewedBy:SU,
      }), true);

    console.log("\nLGU Admin Firestore rules: "+pass+" passed, "+fail+" failed.");
    if (fail) process.exitCode = 1;
  } finally {
    await env.cleanup();
  }
}
main().catch(e => {
  console.error("Emulator test setup failure:", e?.stack || e);
  process.exitCode = 1;
});
