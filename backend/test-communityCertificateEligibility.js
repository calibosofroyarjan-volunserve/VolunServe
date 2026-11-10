"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const {
  MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES,
  minimumCommunityCertificateMinutes: minimum,
  isEligibleCommunityAttendance: eligible,
} = require("./communityCertificateEligibility");

function withAllowlists(events, volunteers, run) {
  const originalEvents = process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
  const originalVolunteers = process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
  try {
    if (events === undefined) delete process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
    else process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS = events;
    if (volunteers === undefined) delete process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
    else process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = volunteers;
    run();
  } finally {
    if (originalEvents === undefined) delete process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
    else process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS = originalEvents;
    if (originalVolunteers === undefined) delete process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
    else process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = originalVolunteers;
  }
}

function fixture(durationSeconds, overrides = {}) {
  const eventId = "test-event-A";
  const uid = "test-volunteer-A";
  const timeIn = 1000000000;
  const event = {
    publicationStatus: "published", status: "completed",
    completedBy: "admin-A", proposedBy: "resident-A",
    ...overrides.event,
  };
  const attendance = {
    uid, eventId, status: "joined", attendanceVerified: true,
    attendanceVerifiedBy: "admin-A",
    checkedInAt: {toMillis: () => timeIn},
    checkedOutAt: {toMillis: () => timeIn + durationSeconds * 1000},
    ...overrides.attendance,
  };
  return {eventId, event, attendance, participantId: `${eventId}_${uid}`};
}

function check(seconds, overrides = {}) {
  const {eventId, event, attendance, participantId} = fixture(seconds, overrides);
  return eligible(eventId, event, participantId, attendance);
}

test("production default is exactly 30 minutes", () => {
  withAllowlists(undefined, undefined, () => {
    assert.equal(MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES, 30);
    assert.equal(minimum("test-event-A", "test-volunteer-A"), 30);
    assert.equal(check(29 * 60 + 59), false);
    assert.equal(check(30 * 60), true);
  });
});

test("1-minute test exemption requires event AND volunteer exact match", () => {
  withAllowlists("test-event-A", "test-volunteer-A", () => {
    assert.equal(minimum("test-event-A", "test-volunteer-A"), 1);
    assert.equal(check(59), false);
    assert.equal(check(60), true);
    assert.equal(check(6 * 60), true);
    assert.equal(minimum("another-event", "test-volunteer-A"), 30);
    assert.equal(minimum("test-event-A", "another-volunteer"), 30);
  });
});

test("only one allowlist configured is insufficient", () => {
  withAllowlists("test-event-A", undefined, () => assert.equal(check(60), false));
  withAllowlists(undefined, "test-volunteer-A", () => assert.equal(check(60), false));
});

test("whitespace and comma separated IDs are exact; wildcards never match", () => {
  withAllowlists(" another, test-event-A ", " other, test-volunteer-A ", () =>
    assert.equal(check(60), true));
  withAllowlists("*", "*", () => assert.equal(check(60), false));
});

test("all other integrity gates still apply in test mode", () => {
  withAllowlists("test-event-A", "test-volunteer-A", () => {
    assert.equal(check(60, {event: {status: "active"}}), false);
    assert.equal(check(60, {event: {publicationStatus: "draft"}}), false);
    assert.equal(check(60, {event: {proposedBy: "test-volunteer-A"}}), false);
    assert.equal(check(60, {event: {completedBy: ""}}), false);
    assert.equal(check(60, {attendance: {attendanceVerified: false}}), false);
    assert.equal(check(60, {attendance: {attendanceVerifiedBy: ""}}), false);
    assert.equal(check(60, {attendance: {status: "declined"}}), false);
    assert.equal(check(60, {attendance: {eventId: "different"}}), false);
    assert.equal(check(60, {attendance: {uid: "other-user"}}), false);
    assert.equal(check(-30), false);
    assert.equal(check(24 * 3600 + 1), false);
  });
});
