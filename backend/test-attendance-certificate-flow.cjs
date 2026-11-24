"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("geofenced attendance, automatic verification and idempotent certificate issuance", async () => {
  const eventId = "qa-unified-attendance";
  const uid = "qa-unified-volunteer";
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, "demo-volunserve");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.ok(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS);
  process.env.VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED = "true";
  process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS = eventId;
  process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = uid;
  const { db, FieldValue } = require("./firebaseAdmin");
  const { recordGeofencedAttendance } = require("./communityAttendanceGeofence");
  const { verifyCommunityEventAttendance } = require("./communityAttendanceAutoVerify");
  const { reconcileCommunityEventCertificates } = require("./communityCertificates");
  const venue = { latitude: 14.81, longitude: 121.04 };
  const email = uid + "@example.invalid";
  const stamp = FieldValue.serverTimestamp();
  const event = db.collection("communityEvents").doc(eventId);
  await event.set({ publicationStatus: "published", status: "active", proposedBy: "organizer",
    coordinates: venue, title: "Staging attendance", location: "Park", barangay: "Demo",
    date: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), time: "00:00" });
  await db.collection("users").doc(uid).set({ email, fullName: "Test Volunteer", role: "resident",
    status: "approved", volunteerAccess: true, volunteerStatus: "approved", activeMode: "volunteer" });
  await db.collection("communityEventParticipants").doc(eventId + "_" + uid).set({
    uid, eventId, joinedAt: stamp, status: "joined" });
  const record = (action, position) => recordGeofencedAttendance({ db, FieldValue, eventId, uid, email, action,
    location: { ...position, accuracy: 5, timestamp: Date.now() } });
  await record("check-in", venue);
  await assert.rejects(record("check-out", { ...venue, latitude: 14.82 }), { code: "outside_event_area" });
  await new Promise(resolve => setTimeout(resolve, 61000));
  await record("check-out", venue);
  const verification = await verifyCommunityEventAttendance({ db, FieldValue, eventId, volunteerId: uid, enabled: true });
  assert.equal(verification.status, "verified");
  await event.update({ status: "completed", completedAt: stamp, completedBy: "admin" });
  const sync = () => reconcileCommunityEventCertificates({ eventId, execute: true });
  assert.equal((await sync()).issuedCount, 1);
  assert.equal((await sync()).alreadyExistingCount, 1);
});
