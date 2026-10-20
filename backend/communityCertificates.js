"use strict";

const crypto = require("crypto");
const { db, FieldValue } = require("./firebaseAdmin");

function cleanText(value, maximumLength = 240) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

const MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES = 30;

function communityTimestampMillis(value) {
  if (!value || typeof value.toMillis !== "function") {
    return 0;
  }

  const result = value.toMillis();
  return Number.isFinite(result) ? result : 0;
}

function communityCertificateId(eventId, volunteerId, eventDate) {
  const match = /^([0-9]{4})-[0-9]{2}-[0-9]{2}$/.exec(
      String(eventDate || ""),
  );
  const year = match ? match[1] : "EVENT";
  const digest = crypto.createHash("sha256")
      .update(`volunserve-community-event-v1\n${eventId}\n${volunteerId}`)
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();

  return `VS-CE-${year}-${digest}`;
}

async function issueCommunityEventCertificate(eventId, participantId) {
  const database = db;
  const eventRef = database.collection("communityEvents").doc(eventId);
  const participantRef = database
      .collection("communityEventParticipants")
      .doc(participantId);

  return database.runTransaction(async (transaction) => {
    const [eventSnap, participantSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(participantRef),
    ]);

    if (!eventSnap.exists || !participantSnap.exists) {
      return {issued: false, reason: "missing_record"};
    }

    const eventData = eventSnap.data() || {};
    const attendance = participantSnap.data() || {};
    const volunteerId = cleanText(attendance.uid, 160);
    const timeIn = communityTimestampMillis(attendance.checkedInAt);
    const timeOut = communityTimestampMillis(attendance.checkedOutAt);

    if (
      eventData.publicationStatus !== "published" ||
      eventData.status !== "completed" ||
      attendance.status !== "joined" ||
      attendance.attendanceVerified !== true ||
      !volunteerId ||
      attendance.eventId !== eventId ||
      participantId !== `${eventId}_${volunteerId}` ||
      eventData.proposedBy === volunteerId ||
      !cleanText(eventData.completedBy, 160) ||
      !cleanText(attendance.attendanceVerifiedBy, 160) ||
      timeIn <= 0 ||
      timeOut < timeIn ||
      timeOut - timeIn > 24 * 60 * 60 * 1000 ||
      timeOut - timeIn < MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES * 60000
    ) {
      return {issued: false, reason: "not_eligible"};
    }

    const certificateId = communityCertificateId(
        eventId, volunteerId, eventData.date,
    );
    const certificateRef = database
        .collection("certificates")
        .doc(certificateId);
    const publicRef = database
        .collection("publicCertificateVerifications")
        .doc(certificateId);
    const volunteerRef = database.collection("users").doc(volunteerId);

    const [certificateSnap, publicSnap, volunteerSnap] = await Promise.all([
      transaction.get(certificateRef),
      transaction.get(publicRef),
      transaction.get(volunteerRef),
    ]);

    // Never reissue an existing (including revoked) certificate.
    if (certificateSnap.exists) {
      const existing = certificateSnap.data() || {};
      if (
        existing.certificateType === "community_event_participation" &&
        existing.eventId === eventId &&
        existing.volunteerId === volunteerId
      ) {
        return {issued: false, reason: "already_exists", certificateId};
      }
      throw new Error(`Community certificate ID collision: ${certificateId}`);
    }

    // Don't overwrite an orphaned/mismatched public verification entry.
    if (publicSnap.exists) {
      throw new Error(`Public certificate record already exists: ${certificateId}`);
    }

    const volunteerData = volunteerSnap.exists ? volunteerSnap.data() || {} : {};
    const volunteerName = cleanText(
        volunteerData.fullName || attendance.fullName, 120,
    );
    const eventTitle = cleanText(eventData.title, 160);
    const location = cleanText(eventData.location, 240);

    if (!volunteerName || !eventTitle || !location) {
      return {issued: false, reason: "missing_certificate_details"};
    }

    const serviceMinutes = Math.floor((timeOut - timeIn) / 60000);
    const snapshotHash = crypto.createHash("sha256")
        .update(JSON.stringify({
          certificateId,
          eventId,
          volunteerId,
          timeIn,
          timeOut,
          attendanceVerifiedBy: attendance.attendanceVerifiedBy,
          eventCompletedBy: eventData.completedBy,
        }))
        .digest("hex");
    const issuedAt = FieldValue.serverTimestamp();

    const common = {
      certificateId,
      certificateType: "community_event_participation",
      certificateTitle: "Certificate of Participation",
      volunteerName,
      eventId,
      eventTitle,
      eventDate: cleanText(eventData.date, 30),
      eventTime: cleanText(eventData.time, 50),
      eventLocation: location,
      eventBarangay: cleanText(eventData.barangay, 120),
      verifiedServiceMinutes: serviceMinutes,
      verificationStatus: "issued",
      issuerOrganization: "VolunServe",
      issuedByName: "VolunServe (automated)",
      issuedByRole: "system",
      snapshotHash,
      issuedAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.create(certificateRef, {
      ...common,
      userId: volunteerId,
      volunteerId,
      source: "verified_community_event_attendance",
      participationId: participantId,
      checkedInAt: attendance.checkedInAt,
      checkedOutAt: attendance.checkedOutAt,
      attendanceVerifiedAt: attendance.attendanceVerifiedAt || null,
      attendanceVerifiedBy: attendance.attendanceVerifiedBy,
      eventCompletedAt: eventData.completedAt || null,
      eventCompletedBy: eventData.completedBy,
      issuedByUid: eventData.completedBy,
    });

    transaction.create(publicRef, {...common});

    transaction.set(
        database.collection("notifications")
            .doc(`community_certificate_${certificateId}`),
        {
          userId: volunteerId,
          certificateId,
          eventId,
          title: "Your community event certificate is ready",
          message: `Your verified participation in ${eventTitle} has been recorded. View your Certificate of Participation in My Certificates.`,
          type: "certificate_issued",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        },
    );

    return {issued: true, certificateId};
  });
}

function isEligibleCommunityAttendance(eventId, eventData, participantId, attendance) {
  const volunteerId = cleanText(attendance?.uid, 160);
  const timeIn = communityTimestampMillis(attendance?.checkedInAt);
  const timeOut = communityTimestampMillis(attendance?.checkedOutAt);
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
    timeOut - timeIn >= MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES * 60000
  );
}

const MAX_PARTICIPANTS_PER_REQUEST = 500;

async function reconcileCommunityEventCertificates({ eventId, participantId = "", execute = false }) {
  const eventSnapshot = await db.collection("communityEvents").doc(eventId).get();
  if (!eventSnapshot.exists) {
    return { ok: false, reason: "event_not_found", eventId };
  }
  const eventData = eventSnapshot.data() || {};
  if (eventData.publicationStatus !== "published" || eventData.status !== "completed") {
    return { ok: false, reason: "event_not_completed", eventId };
  }

  let docs;
  if (participantId) {
    const snap = await db.collection("communityEventParticipants").doc(participantId).get();
    docs = snap.exists ? [snap] : [];
  } else {
    const snap = await db.collection("communityEventParticipants")
      .where("eventId", "==", eventId)
      .limit(MAX_PARTICIPANTS_PER_REQUEST + 1)
      .get();
    if (snap.size > MAX_PARTICIPANTS_PER_REQUEST) {
      return { ok: false, reason: "too_many_participants", eventId };
    }
    docs = snap.docs;
  }

  const eligibleDocs = docs.filter((snap) =>
    isEligibleCommunityAttendance(eventId, eventData, snap.id, snap.data() || {})
  );

  if (!execute) {
    return {
      ok: true, dryRun: true, eventId,
      participantsChecked: docs.length,
      eligibleCount: eligibleDocs.length,
      minimumMinutes: MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES,
    };
  }

  const summary = {
    ok: true, dryRun: false, eventId,
    participantsChecked: docs.length,
    eligibleCount: eligibleDocs.length,
    issuedCount: 0,
    alreadyExistingCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };
  
  for (let offset = 0; offset < eligibleDocs.length; offset += 5) {
    const batch = eligibleDocs.slice(offset, offset + 5);
    const attempts = await Promise.allSettled(batch.map((snap) =>
      issueCommunityEventCertificate(eventId, snap.id)
    ));
    for (const attempt of attempts) {
      if (attempt.status === "rejected") {
        summary.failedCount += 1;
        continue;
      }
      const result = attempt.value;
      if (result.issued) summary.issuedCount += 1;
      else if (result.reason === "already_exists") summary.alreadyExistingCount += 1;
      else summary.skippedCount += 1;
    }
  }
  if (summary.failedCount > 0) {
    summary.ok = false;
    summary.reason = "some_certificates_failed_retry_safely";
  }
  return summary;
}

module.exports = {
  MIN_COMMUNITY_CERTIFICATE_ATTENDANCE_MINUTES,
  communityCertificateId,
  isEligibleCommunityAttendance,
  issueCommunityEventCertificate,
  reconcileCommunityEventCertificates,
};
