"use strict";

// Keep this backend-only policy aligned with the Firebase Functions policy.
// Both exact IDs must be server-allowlisted; client metadata cannot grant exceptions.
const MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES = 30;
const TEST_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES = 1;

function allowlist(name) {
  return new Set(String(process.env[name] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));
}

function minimumCommunityCertificateMinutes(eventId, volunteerId) {
  return allowlist("VOLUNSERVE_CERT_TEST_EVENT_IDS").has(eventId) &&
    allowlist("VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS").has(volunteerId) ?
    TEST_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES :
    MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES;
}

function cleanText(value, maximumLength = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function timestampMillis(value) {
  if (!value || typeof value.toMillis !== "function") return 0;
  const millis = value.toMillis();
  return Number.isFinite(millis) ? millis : 0;
}

function isEligibleCommunityAttendance(eventId, eventData, participantId, attendance) {
  const volunteerId = cleanText(attendance?.uid, 160);
  const timeIn = timestampMillis(attendance?.checkedInAt);
  const timeOut = timestampMillis(attendance?.checkedOutAt);
  return Boolean(
    eventData?.publicationStatus === "published" &&
    eventData?.status === "completed" &&
    attendance?.status === "joined" &&
    attendance?.attendanceVerified === true &&
    volunteerId &&
    attendance?.eventId === eventId &&
    participantId === `${eventId}_${volunteerId}` &&
    eventData?.proposedBy !== volunteerId &&
    cleanText(eventData?.completedBy, 160) &&
    cleanText(attendance?.attendanceVerifiedBy, 160) &&
    timeIn > 0 && timeOut >= timeIn &&
    timeOut - timeIn <= 24 * 60 * 60 * 1000 &&
    timeOut - timeIn >= minimumCommunityCertificateMinutes(eventId, volunteerId) * 60000
  );
}

module.exports = {
  MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES,
  minimumCommunityCertificateMinutes,
  isEligibleCommunityAttendance,
};
