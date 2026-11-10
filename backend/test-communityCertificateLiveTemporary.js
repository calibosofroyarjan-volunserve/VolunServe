"use strict";
// Existing test filename retained to avoid unnecessary production test churn.
// Now verifies the permanent, no-expiry policy and its safety controls.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  minimumCommunityCertificateMinutes: minimum,
  isEligibleCommunityAttendance: eligible,
} = require("./communityCertificateEligibility");

const CUTOFF = Date.parse("2026-11-10T14:55:00Z");
const AFTER = Date.parse("2026-11-11T16:00:00Z");
const keys = [
  "VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED",
  "VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED",
  "VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC",
  "VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC",
  "VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED",
  "VOLUNSERVE_CERT_TEST_EVENT_IDS",
  "VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS",
];
const stamp = ms => ({toMillis: () => ms});
function withEnv(values, callback) {
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const originalClock = Date.now;
  try {
    Date.now = () => AFTER;
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, values);
    callback();
  } finally {
    Date.now = originalClock;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
function fixture({
  duration = 60, checkIn = AFTER - 5 * 60000,
  completed = AFTER - 10000, verified = true,
  publicationStatus = "published", status = "completed",
  proposedBy = "another-resident", checkedOutOverride,
} = {}) {
  const eventId = "sample-new-event";
  const uid = "sample-other-volunteer";
  const attendance = {
    uid, eventId, status: "joined", attendanceVerified: verified,
    attendanceVerifiedBy: "test-admin",
    checkedInAt: stamp(checkIn),
    checkedOutAt: stamp(checkedOutOverride ?? checkIn + duration * 1000),
  };
  const event = {
    publicationStatus, status, proposedBy, completedBy: "test-admin",
    completedAt: stamp(completed),
  };
  return { eventId, uid, attendance, event, participantId: eventId + "_" + uid };
}
const minutes = f => minimum(f.eventId, f.uid, f.attendance, f.event);
const isEligible = f => eligible(f.eventId, f.event, f.participantId, f.attendance);

test("permanent enable allows 1 minute for new, verified, completed events", () => {
  withEnv({VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED: "true"}, () => {
    const f = fixture();
    assert.equal(minutes(f), 1);
    assert.equal(isEligible(f), true);
    assert.equal(isEligible(fixture({duration: 59})), false);
  });
});
test("historical attendance and historical completed events keep 30m threshold", () => {
  withEnv({VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED: "true"}, () => {
    const oldCheckIn = CUTOFF - 900000;
    assert.equal(minutes(fixture({checkIn:oldCheckIn})), 30);
    assert.equal(isEligible(fixture({checkIn:oldCheckIn})), false);
    assert.equal(minutes(fixture({completed:CUTOFF - 1000})), 30);
    assert.equal(isEligible(fixture({completed:CUTOFF - 1000})), false);
    assert.equal(isEligible(fixture({checkIn:oldCheckIn,duration:1800})), true);
  });
});
test("unverified attendance, active event, proposer, future completion remain blocked", () => {
  withEnv({VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED: "true"}, () => {
    assert.equal(isEligible(fixture({verified:false})), false);
    assert.equal(isEligible(fixture({status:"active"})), false);
    assert.equal(isEligible(fixture({publicationStatus:"draft"})), false);
    assert.equal(isEligible(fixture({proposedBy:"sample-other-volunteer"})), false);
    assert.equal(isEligible(fixture({completed:Date.now()+3600000})), false);
    assert.equal(isEligible(fixture({checkedOutOverride:AFTER - 6*60000})), false);
  });
});
test("old temporary flag alone cannot enable permanent mode; rollback to 30m", () => {
  withEnv({
    VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED:"true",
    VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC:"2026-11-10T14:55:00Z",
    VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC:"2026-11-17T14:55:00Z"
  }, () => {
    assert.equal(minutes(fixture()), 30);
  });
  withEnv({VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED:"false"}, () => {
    assert.equal(minutes(fixture()),30);
    assert.equal(isEligible(fixture()),false);
    assert.equal(isEligible(fixture({duration:1800})),true);
  });
  withEnv({VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED:"TRUE"}, () => {
    assert.equal(minutes(fixture()),30);
  });
});
test("permanent policy remains enabled long after old seven-day end date", () => {
  withEnv({VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED:"true"}, () => {
    const futureNow = Date.parse("2028-11-10T17:00:00Z");
    Date.now = () => futureNow;
    const future = fixture({
      checkIn: futureNow - 120000,
      completed: futureNow - 10000,
    });
    assert.equal(minutes(future),1);
    assert.equal(isEligible(future),true);
  });
});
test("separate exact-ID test-only exception remains independent", () => {
  withEnv({
    VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED:"true",
    VOLUNSERVE_CERT_TEST_EVENT_IDS:"sample-new-event",
    VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS:"sample-other-volunteer",
  }, () => assert.equal(minutes(fixture({completed:CUTOFF-1000})),1));
});
