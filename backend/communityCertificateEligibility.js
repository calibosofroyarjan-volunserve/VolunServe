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

// Temporary live rollout: applies ONLY to new, completed and Admin-verified
// attendance after the rollout starts. Old completed events stay at 30 minutes.
// All settings are server-only; a missing/invalid flag/window fails closed.
const LIVE_TEMP_MINUTE_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
function liveTemporaryOneMinuteWindow() {
  if (process.env.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED !== "true") return null;
  const startText = String(process.env.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC || "");
  const endText = String(process.env.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(startText) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(endText)) return null;
  const start = Date.parse(startText);
  const end = Date.parse(endText);
  if (!Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || end - start > LIVE_TEMP_MINUTE_MAX_WINDOW_MS) return null;
  const now = Date.now();
  if (now < start || now >= end) return null;
  return {start, end};
}

function liveTemporaryOneMinuteApplies(attendance, eventData) {
  const window = liveTemporaryOneMinuteWindow();
  if (!window || !attendance || !eventData) return false;
  // Require completed event AND recorded attendance to be after activation.
  // Avoid accidentally awarding previously completed 1–29 minute attendance
  // when the auto-sync reviews old events.
  const start = timestampMillis(attendance.checkedInAt);
  const end = timestampMillis(attendance.checkedOutAt);
  const completed = timestampMillis(eventData.completedAt);
  return start >= window.start && end >= window.start &&
    completed >= window.start && completed <= Date.now();
}

function minimumCommunityCertificateMinutes(eventId, volunteerId, attendance, eventData) {
  if (liveTemporaryOneMinuteApplies(attendance, eventData)) {
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
  liveTemporaryOneMinuteApplies,
  isEligibleCommunityAttendance,
};
