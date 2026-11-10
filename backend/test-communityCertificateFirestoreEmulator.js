"use strict";

// Real Firebase Admin SDK + Firestore emulator integration checks.
// This script refuses to run against any live Firebase project.
const assert = require("node:assert/strict");
const {Timestamp} = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !String(process.env.GOOGLE_CLOUD_PROJECT || "").startsWith("demo-")) {
  throw new Error("Refusing to run: isolated Firestore emulator and demo project required.");
}

process.env.VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED = "true";
process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS =
    "demo-test-59s,demo-test-1m,demo-test-6m,demo-test-revoked";
process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = "demo-test-volunteer";

const {db} = require("./firebaseAdmin");
const {reconcileCommunityEventCertificates, issueCommunityEventCertificate,
  communityCertificateId} = require("./communityCertificates");

async function seed(eventId, uid, seconds) {
  const participantId = eventId + "_" + uid;
  const base = Date.now() - (seconds + 300) * 1000;
  await Promise.all([
    db.collection("communityEvents").doc(eventId).set({
      publicationStatus: "published", status: "completed",
      proposedBy: "demo-proposer", completedBy: "demo-admin",
      title: "Emulator Only Community Cleanup", date: "2026-11-10",
      time: "09:00", location: "San Jose del Monte", barangay: "Demo",
    }),
    db.collection("communityEventParticipants").doc(participantId).set({
      uid, eventId, status: "joined", attendanceVerified: true,
      attendanceVerifiedBy: "demo-admin",
      checkedInAt: Timestamp.fromMillis(base),
      checkedOutAt: Timestamp.fromMillis(base + seconds * 1000),
    }),
    db.collection("users").doc(uid).set({fullName: "Emulator Test Volunteer"}),
  ]);
  return participantId;
}

async function main() {
  let n = 0;
  const pass = (description) => {n++; console.log("PASS " + n + ": " + description);};
  try {
    const uid = "demo-test-volunteer";
    const shortEvent = "demo-test-59s";
    await seed(shortEvent, uid, 59);
    let result = await reconcileCommunityEventCertificates({
      eventId: shortEvent, execute: true,
    });
    assert.equal(result.eligibleCount, 0);
    assert.equal(result.issuedCount, 0);
    pass("59-second test is ineligible");

    const minuteEvent = "demo-test-1m";
    await seed(minuteEvent, uid, 60);
    result = await reconcileCommunityEventCertificates({eventId: minuteEvent});
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.eligibleCount, 1);
    const first = await reconcileCommunityEventCertificates({
      eventId: minuteEvent, execute: true,
    });
    assert.equal(first.issuedCount, 1);
    const minuteId = communityCertificateId(minuteEvent, uid, "2026-11-10");
    const issued = await db.collection("certificates").doc(minuteId).get();
    const publicRecord = await db.collection("publicCertificateVerifications")
        .doc(minuteId).get();
    const notification = await db.collection("notifications")
        .doc("community_certificate_" + minuteId).get();
    assert.equal(issued.exists, true);
    assert.equal(issued.data().verifiedServiceMinutes, 1);
    assert.equal(issued.data().userId, uid);
    assert.equal(publicRecord.exists, true);
    assert.equal(notification.exists, true);
    pass("one minute creates private/public certificate and notification");

    const repeat = await reconcileCommunityEventCertificates({
      eventId: minuteEvent, execute: true,
    });
    assert.equal(repeat.issuedCount, 0);
    assert.equal(repeat.alreadyExistingCount, 1);
    assert.equal((await db.collection("certificates").doc(minuteId).get())
        .data().certificateId, minuteId);
    pass("repeat reconciliation is idempotent");

    const sixMinuteEvent = "demo-test-6m";
    await seed(sixMinuteEvent, uid, 6 * 60);
    const sixMinuteResult = await reconcileCommunityEventCertificates({
      eventId: sixMinuteEvent, execute: true,
    });
    assert.equal(sixMinuteResult.issuedCount, 1);
    pass("six-minute approved test attendance is eligible");

    const prodEvent = "demo-normal-6m";
    await seed(prodEvent, uid, 6 * 60);
    const normalResult = await reconcileCommunityEventCertificates({
      eventId: prodEvent, execute: true,
    });
    assert.equal(normalResult.eligibleCount, 0);
    assert.equal(normalResult.issuedCount, 0);
    pass("ordinary event keeps thirty-minute minimum");

    const prodShortEvent = "demo-normal-29m";
    await seed(prodShortEvent, "demo-ordinary-volunteer", 29 * 60);
    const shortResult = await reconcileCommunityEventCertificates({
      eventId: prodShortEvent, execute: true,
    });
    assert.equal(shortResult.issuedCount, 0);
    pass("twenty-nine-minute ordinary event is not eligible");

    const prodThirtyEvent = "demo-normal-30m";
    await seed(prodThirtyEvent, "demo-ordinary-volunteer", 30 * 60);
    const thirty = await reconcileCommunityEventCertificates({
      eventId: prodThirtyEvent, execute: true,
    });
    assert.equal(thirty.issuedCount, 1);
    pass("thirty-minute ordinary event generates certificate");

    const revokedEvent = "demo-test-revoked";
    const revokedParticipant = await seed(revokedEvent, uid, 60);
    const revokedId = communityCertificateId(revokedEvent, uid, "2026-11-10");
    await db.collection("certificates").doc(revokedId).set({
      certificateId: revokedId, certificateType: "community_event_participation",
      eventId: revokedEvent, volunteerId: uid, verificationStatus: "revoked",
    });
    const blocked = await issueCommunityEventCertificate(revokedEvent, revokedParticipant);
    assert.equal(blocked.issued, false);
    assert.equal(blocked.reason, "already_exists");
    assert.equal((await db.collection("certificates").doc(revokedId).get())
        .data().verificationStatus, "revoked");
    pass("revoked certificate is not reissued");

    // New temporary live policy: real Firestore transaction integration,
    // still strictly isolated to the demo- project and emulator.
    const startMs = Date.now() - 30 * 60 * 1000;
    process.env.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED = "true";
    process.env.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC =
      new Date(startMs).toISOString().slice(0, 19) + "Z";
    process.env.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC =
      new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 19) + "Z";

    const newUid = "demo-live-temporary-unlisted-uid";
    const newEvent = "demo-live-temporary-new-one-minute";
    await seed(newEvent, newUid, 60);
    await db.collection("communityEvents").doc(newEvent).update({
      completedAt: Timestamp.now(),
    });
    const newResult = await reconcileCommunityEventCertificates({
      eventId: newEvent, execute: true,
    });
    assert.equal(newResult.issuedCount, 1);
    const newCertId = communityCertificateId(newEvent, newUid, "2026-11-10");
    assert.equal((await db.collection("certificates").doc(newCertId).get())
      .data().verifiedServiceMinutes, 1);
    pass("temporary live 1m rule issues a real certificate to a new attendee without an allowlist");

    const oldEvent = "demo-live-temporary-old-one-minute";
    await seed(oldEvent, newUid, 60);
    await db.collection("communityEvents").doc(oldEvent).update({
      completedAt: Timestamp.now(),
    });
    await db.collection("communityEventParticipants")
      .doc(oldEvent + "_" + newUid).update({
        checkedInAt: Timestamp.fromMillis(startMs - 600000),
        checkedOutAt: Timestamp.fromMillis(startMs - 540000),
      });
    const oldResult = await reconcileCommunityEventCertificates({
      eventId: oldEvent, execute: true,
    });
    assert.equal(oldResult.issuedCount, 0);
    assert.equal(oldResult.eligibleCount, 0);
    pass("old one-minute attendance remains ineligible even after a new completion");

    const shortNewEvent = "demo-live-temporary-short";
    await seed(shortNewEvent, newUid, 59);
    await db.collection("communityEvents").doc(shortNewEvent).update({
      completedAt: Timestamp.now(),
    });
    const shortNew = await reconcileCommunityEventCertificates({
      eventId: shortNewEvent, execute: true,
    });
    assert.equal(shortNew.issuedCount, 0);
    pass("live temporary policy still blocks 59 seconds");

    process.env.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED = "false";
    const disabledEvent = "demo-live-temporary-disabled";
    await seed(disabledEvent, newUid, 60);
    await db.collection("communityEvents").doc(disabledEvent).update({
      completedAt: Timestamp.now(),
    });
    const disabledResult = await reconcileCommunityEventCertificates({
      eventId: disabledEvent, execute: true,
    });
    assert.equal(disabledResult.issuedCount, 0);
    pass("turning off temporary live flag immediately restores the 30m threshold");

    console.log("PASS: all " + n + " isolated Firebase emulator checks succeeded.");
  } finally {
    await db.terminate();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
