"use strict";

// In-memory Firestore contract test for the real Render issuer and sync helper.
// No Firebase credentials, production data, or network calls are used.
const {test} = require("node:test");
const assert = require("node:assert/strict");

const store = new Map();
const key = (collection, id) => `${collection}/${id}`;
const snapshot = (collection, id) => {
  const record = store.get(key(collection, id));
  return {id, exists: !!record, data: () => record || undefined};
};
const document = (collection, id) => ({
  collection, id,
  get: async () => snapshot(collection, id),
});
const database = {
  collection(collection) {
    return {
      doc(id) {return document(collection, id);},
      where(field, operator, expected) {
        assert.equal(operator, "==");
        return {
          limit(size) {
            return {
              async get() {
                const docs = [...store.entries()]
                  .filter(([documentKey, data]) =>
                    documentKey.startsWith(`${collection}/`) && data[field] === expected)
                  .slice(0, size)
                  .map(([documentKey]) => snapshot(collection, documentKey.slice(collection.length + 1)));
                return {size: docs.length, docs};
              },
            };
          },
        };
      },
    };
  },
  async runTransaction(work) {
    const writes = [];
    const result = await work({
      get: async (ref) => snapshot(ref.collection, ref.id),
      create(ref, data) {
        const documentKey = key(ref.collection, ref.id);
        if (store.has(documentKey)) throw new Error("duplicate create");
        writes.push([documentKey, data]);
      },
      set(ref, data) {writes.push([key(ref.collection, ref.id), data]);},
    });
    for (const [documentKey, data] of writes) store.set(documentKey, data);
    return result;
  },
};

// Intercept only the Firebase Admin module; exercise real issuer code unchanged.
const firebasePath = require.resolve("./firebaseAdmin");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: database,
    FieldValue: {serverTimestamp: () => ({mockServerTimestamp: true})},
  },
};
const {
  communityCertificateId,
  issueCommunityEventCertificate,
  reconcileCommunityEventCertificates,
} = require("./communityCertificates");

function fixture(minutes, uid = "test-uid", eventId = "test-event") {
  store.clear();
  const timestamp = (ms) => ({toMillis: () => ms});
  store.set(key("communityEvents", eventId), {
    publicationStatus: "published", status: "completed",
    proposedBy: "another-resident", completedBy: "verified-admin",
    date: "2026-11-10", title: "Test Community Event",
    location: "SJDM", barangay: "Sample", time: "08:00",
  });
  store.set(key("users", uid), {fullName: "Test Volunteer"});
  store.set(key("communityEventParticipants", `${eventId}_${uid}`), {
    uid, eventId, status: "joined", attendanceVerified: true,
    attendanceVerifiedBy: "verified-admin",
    checkedInAt: timestamp(1000000000),
    checkedOutAt: timestamp(1000000000 + minutes * 60000),
  });
  return {uid, eventId, participantId: `${eventId}_${uid}`};
}
function allowTest(fn) {
  const previousEvents = process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
  const previousVolunteers = process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
  process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS = "test-event";
  process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = "test-uid";
  return Promise.resolve().then(fn).finally(() => {
    if (previousEvents === undefined) delete process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
    else process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS = previousEvents;
    if (previousVolunteers === undefined) delete process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
    else process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = previousVolunteers;
  });
}

test("allowed 1-minute test event creates private + public certificate and notification once", async () => {
  await allowTest(async () => {
    const {uid, eventId, participantId} = fixture(6);
    const first = await issueCommunityEventCertificate(eventId, participantId);
    assert.equal(first.issued, true);
    const id = communityCertificateId(eventId, uid, "2026-11-10");
    assert.equal(first.certificateId, id);
    assert.equal(store.get(key("certificates", id)).verifiedServiceMinutes, 6);
    assert.equal(store.get(key("certificates", id)).userId, uid);
    assert.equal(store.get(key("publicCertificateVerifications", id)).certificateId, id);
    assert.equal(store.get(key("notifications", `community_certificate_${id}`)).userId, uid);
    const count = store.size;
    const again = await issueCommunityEventCertificate(eventId, participantId);
    assert.equal(again.issued, false);
    assert.equal(again.reason, "already_exists");
    assert.equal(store.size, count);
  });
});

test("Render retry reports issued and already-existing without duplication", async () => {
  await allowTest(async () => {
    const {eventId} = fixture(6);
    const first = await reconcileCommunityEventCertificates({eventId, execute: true});
    assert.equal(first.ok, true);
    assert.equal(first.dryRun, false);
    assert.equal(first.eligibleCount, 1);
    assert.equal(first.issuedCount, 1);
    const second = await reconcileCommunityEventCertificates({eventId, execute: true});
    assert.equal(second.eligibleCount, 1);
    assert.equal(second.issuedCount, 0);
    assert.equal(second.alreadyExistingCount, 1);
  });
});

test("normal 6-minute participant never receives a certificate", async () => {
  await allowTest(async () => {
    const {eventId} = fixture(6, "other-uid");
    const summary = await reconcileCommunityEventCertificates({eventId, execute: true});
    assert.equal(summary.ok, true);
    assert.equal(summary.eligibleCount, 0);
    assert.equal(summary.issuedCount, 0);
    assert.equal([...store.keys()].some((item) => item.startsWith("certificates/")), false);
  });
});

test("production 30-minute participant qualifies; less than 30 does not", async () => {
  await allowTest(async () => {
    let {eventId, participantId} = fixture(29, "other-uid");
    assert.equal((await issueCommunityEventCertificate(eventId, participantId)).issued, false);
    ({eventId, participantId} = fixture(30, "other-uid"));
    assert.equal((await issueCommunityEventCertificate(eventId, participantId)).issued, true);
  });
});

test("revoked certificates remain untouched on retry", async () => {
  await allowTest(async () => {
    const {eventId, uid, participantId} = fixture(1);
    const id = communityCertificateId(eventId, uid, "2026-11-10");
    store.set(key("certificates", id), {
      certificateType: "community_event_participation",
      eventId, volunteerId: uid, verificationStatus: "revoked",
    });
    const result = await issueCommunityEventCertificate(eventId, participantId);
    assert.equal(result.issued, false);
    assert.equal(result.reason, "already_exists");
    assert.equal(store.get(key("certificates", id)).verificationStatus, "revoked");
  });
});
