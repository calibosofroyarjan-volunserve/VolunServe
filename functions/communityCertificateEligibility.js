"use strict";

const PRODUCTION_MINUTES = 30;
const TEST_MINUTES = 1;

// These server-only allowlists are NOT read from Firestore or user input.
// Both the event and the volunteer UID must match to opt into testing.
function allowlist(name) {
  return new Set(String(process.env[name] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean));
}

function minimumCommunityCertificateMinutes(eventId, volunteerId) {
  const testEvents = allowlist("VOLUNSERVE_CERT_TEST_EVENT_IDS");
  const testVolunteers = allowlist("VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS");
  return testEvents.has(eventId) && testVolunteers.has(volunteerId) ?
    TEST_MINUTES : PRODUCTION_MINUTES;
}

module.exports = {
  minimumCommunityCertificateMinutes,
};
