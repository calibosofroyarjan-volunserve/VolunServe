"use strict";

// Automatic attendance is a SERVER decision, never a volunteer Firestore write.
// Schedule mismatches and other uncertain records remain for the existing Admin Verify action.
const AUTOMATIC_VERIFIER = "system:auto_attendance_v1";
const MIN_AUTO_ATTENDANCE_MS = 60 * 1000;
const MAX_ATTENDANCE_MS = 24 * 60 * 60 * 1000;
const MAX_EVENT_PARTICIPANTS = 500;

function timestampMs(value) {
  if (!value || typeof value.toMillis !== "function") return 0;
  const ms = value.toMillis();
  return Number.isFinite(ms) ? ms : 0;
}

function eventWindow(event) {
  const date = String(event?.date || "");
  const time = String(event?.time || "");
  const endTime = String(event?.endTime || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const start = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(start)) return null;
  let end = Date.parse(`${date}T23:59:59+08:00`);
  if (endTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= time) return null;
    end = Date.parse(`${date}T${endTime}:00+08:00`);
  }
  if (!Number.isFinite(end) || end <= start) return null;
  return {earliest: start - 60 * 60 * 1000, latest: end + 2 * 60 * 60 * 1000};
}

function automaticAttendanceDecision({eventId, participantId, event, attendance, volunteer, nowMs = Date.now()}) {
  const uid = String(attendance?.uid || "");
  if (event?.publicationStatus !== "published" ||
      !["active", "completed"].includes(event?.status)) return "event_not_active_or_completed";
  if (!uid || participantId !== `${eventId}_${uid}` ||
      attendance?.eventId !== eventId || attendance?.status !== "joined" ||
      event?.proposedBy === uid) return "not_joined_eligible_volunteer";
  if (!volunteer || !["resident", "volunteer"].includes(volunteer.role) ||
      volunteer.status !== "approved" || volunteer.volunteerAccess !== true ||
      volunteer.volunteerStatus !== "approved" || volunteer.adminStatus === "suspended") {
    return "volunteer_approval_required";
  }
  if (attendance.attendanceVerified === true) return "already_verified";
  const checkIn = timestampMs(attendance.checkedInAt);
  const checkOut = timestampMs(attendance.checkedOutAt);
  const joinedAt = timestampMs(attendance.joinedAt);
  if (!checkIn || !checkOut || !joinedAt || joinedAt > checkIn ||
      checkOut - checkIn < MIN_AUTO_ATTENDANCE_MS ||
      checkOut - checkIn > MAX_ATTENDANCE_MS || checkOut > nowMs + 60 * 1000) {
    return "invalid_or_short_attendance";
  }
  const window = eventWindow(event);
  if (!window || checkIn < window.earliest || checkIn > window.latest ||
      checkOut > window.latest) return "outside_event_schedule";
  if (event.status === "completed" &&
      (!timestampMs(event.completedAt) || timestampMs(event.completedAt) < checkOut ||
       !String(event.completedBy || "").trim())) return "completion_record_invalid";
  return "eligible";
}

async function verifyCommunityEventAttendance({db, FieldValue, eventId, volunteerId, nowMs = Date.now()}) {
  const participantId = `${eventId}_${volunteerId}`;
  const eventRef = db.collection("communityEvents").doc(eventId);
  const participantRef = db.collection("communityEventParticipants").doc(participantId);
  const volunteerRef = db.collection("users").doc(volunteerId);
  return db.runTransaction(async (tx) => {
    const [eventSnap, participantSnap, volunteerSnap] = await Promise.all([
      tx.get(eventRef), tx.get(participantRef), tx.get(volunteerRef),
    ]);
    if (!eventSnap.exists || !participantSnap.exists) return {status:"needs_admin_review",reason:"record_not_found"};
    const decision = automaticAttendanceDecision({
      eventId, participantId, event:eventSnap.data() || {},
      attendance:participantSnap.data() || {},
      volunteer:volunteerSnap.exists ? volunteerSnap.data() || {} : null,
      nowMs,
    });
    if (decision === "already_verified") return {status:"already_verified"};
    if (decision !== "eligible") return {status:"needs_admin_review",reason:decision};
    tx.update(participantRef, {
      attendanceVerified:true,
      attendanceVerifiedAt:FieldValue.serverTimestamp(),
      attendanceVerifiedBy:AUTOMATIC_VERIFIER,
      updatedAt:FieldValue.serverTimestamp(),
    });
    return {status:"verified"};
  });
}

async function reconcileCommunityEventAttendance({db, FieldValue, eventId, participantId = ""}) {
  const eventSnap = await db.collection("communityEvents").doc(eventId).get();
  if (!eventSnap.exists || eventSnap.data()?.status !== "completed" ||
      eventSnap.data()?.publicationStatus !== "published") {
    return {verified:0,reviewRequired:0,reason:"event_not_completed"};
  }
  let docs;
  if (participantId) {
    const snap = await db.collection("communityEventParticipants").doc(participantId).get();
    docs = snap.exists ? [snap] : [];
  } else {
    const snap = await db.collection("communityEventParticipants")
      .where("eventId","==",eventId).limit(MAX_EVENT_PARTICIPANTS+1).get();
    if (snap.size > MAX_EVENT_PARTICIPANTS) return {verified:0,reviewRequired:0,reason:"too_many_participants"};
    docs = snap.docs;
  }
  const pending = docs.filter((snap) => {
    const a = snap.data() || {};
    return a.status === "joined" && a.attendanceVerified !== true && !!a.checkedOutAt &&
      a.eventId === eventId && snap.id === `${eventId}_${a.uid}`;
  });
  const summary = {verified:0,reviewRequired:0,failed:0};
  for (let i=0;i<pending.length;i+=5) {
    const results = await Promise.allSettled(pending.slice(i,i+5).map((snap) =>
      verifyCommunityEventAttendance({db,FieldValue,eventId,volunteerId:snap.data().uid})
    ));
    for (const result of results) {
      if (result.status === "rejected") summary.failed++;
      else if (result.value.status === "verified") summary.verified++;
      else if (result.value.status === "needs_admin_review") summary.reviewRequired++;
    }
  }
  return summary;
}

module.exports = {
  AUTOMATIC_VERIFIER, automaticAttendanceDecision,
  verifyCommunityEventAttendance, reconcileCommunityEventAttendance,
};
