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

// Permanent 1-minute live minimum for NEW verified attendance and Community
// Events completed after the originally approved rollout start.
// Keep old 1–29 minute records at 30 minutes to prevent retroactive awards
// through the background certificate reconciliation job.
// Opt-in switch stays server-only for emergency rollback; no expiry date.
const LIVE_ONE_MINUTE_START_MS = Date.parse("2026-11-10T14:55:00Z");
function livePermanentOneMinuteApplies(attendance, eventData) {
  if (process.env.VOLUNSERVE_CERT_LIVE_ONE_MIN_PERMANENT_ENABLED !== "true" ||
      !attendance || !eventData) return false;
  const checkIn = timestampMillis(attendance.checkedInAt);
  const checkOut = timestampMillis(attendance.checkedOutAt);
  const completed = timestampMillis(eventData.completedAt);
  return checkIn >= LIVE_ONE_MINUTE_START_MS &&
    checkOut >= LIVE_ONE_MINUTE_START_MS &&
    completed >= LIVE_ONE_MINUTE_START_MS && completed <= Date.now();
}

function minimumCommunityCertificateMinutes(eventId, volunteerId, attendance, eventData) {
  if (livePermanentOneMinuteApplies(attendance, eventData)) {
    return TEST_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES;
  }
  // Fail closed in live: exact allowlists alone never switch on 1-minute issuance.
  if (process.env.VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED !== "true") {
    return MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES;
  }
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
    timeOut - timeIn >= minimumCommunityCertificateMinutes(eventId, volunteerId, attendance, eventData) * 60000
  );
}

module.exports = {
  MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES,
  minimumCommunityCertificateMinutes,
  livePermanentOneMinuteApplies,
  isEligibleCommunityAttendance,
};
