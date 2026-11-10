"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const {minimumCommunityCertificateMinutes: minimum} =
    require("../communityCertificateEligibility");

function withAllowlists(events, volunteers, verify) {
  const oldEvents = process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
  const oldVolunteers = process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
  try {
    if (events === undefined) delete process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
    else process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS = events;
    if (volunteers === undefined) delete process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
    else process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = volunteers;
    verify();
  } finally {
    if (oldEvents === undefined) delete process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS;
    else process.env.VOLUNSERVE_CERT_TEST_EVENT_IDS = oldEvents;
    if (oldVolunteers === undefined) delete process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS;
    else process.env.VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS = oldVolunteers;
  }
}

test("defaults to 30 minutes when no allowlists are configured", () => {
  withAllowlists(undefined, undefined, () =>
    assert.equal(minimum("event-A", "uid-A"), 30));
});

test("requires BOTH event and volunteer to be allowlisted", () => {
  withAllowlists("event-A", undefined, () =>
    assert.equal(minimum("event-A", "uid-A"), 30));
  withAllowlists(undefined, "uid-A", () =>
    assert.equal(minimum("event-A", "uid-A"), 30));
  withAllowlists("event-A", "uid-A", () => {
    assert.equal(minimum("event-A", "uid-A"), 1);
    assert.equal(minimum("event-B", "uid-A"), 30);
    assert.equal(minimum("event-A", "uid-B"), 30);
  });
});

test("parses multiple explicit IDs and ignores whitespace / blank entries", () => {
  withAllowlists(" event-A, ,event-B ", " uid-A,uid-B ", () => {
    assert.equal(minimum("event-B", "uid-B"), 1);
    assert.equal(minimum("event-B", "uid-C"), 30);
  });
});

test("no wildcard or fuzzy matching", () => {
  withAllowlists("*", "*", () => {
    assert.equal(minimum("event-A", "uid-A"), 30);
  });
});
