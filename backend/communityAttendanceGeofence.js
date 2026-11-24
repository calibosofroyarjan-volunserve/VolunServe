"use strict";

const RADIUS_METERS = 100;
const MAX_ACCURACY_METERS = 50;
const MAX_AGE_MS = 30000;
function fail(statusCode, code, message) {
  return Object.assign(new Error(message), {statusCode, code});
}
function validCoordinates(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}
function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude-a.latitude)*rad;
  const dLng = (b.longitude-a.longitude)*rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLng/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1, Math.max(0,h))));
}
function validateLocation(event, location, now = Date.now()) {
  const latitude = event.coordinates?.latitude ?? event.latitude;
  const longitude = event.coordinates?.longitude ?? event.longitude;
  if (!validCoordinates(latitude, longitude) || (latitude === 0 && longitude === 0)) {
    throw fail(409,"event_location_missing","Event venue coordinates are missing. Contact Admin.");
  }
  if (!location || !validCoordinates(location.latitude,location.longitude) ||
      !Number.isFinite(location.accuracy) || location.accuracy < 0 ||
      !Number.isFinite(location.timestamp) || location.timestamp > now+5000 ||
      now-location.timestamp > MAX_AGE_MS) {
    throw fail(400,"invalid_location","A fresh, accurate GPS location is required. Please try again.");
  }
  if (location.accuracy > MAX_ACCURACY_METERS) {
    throw fail(409,"low_location_accuracy","GPS accuracy is too low. Move to an open area and try again.");
  }
  const distance = distanceMeters({latitude,longitude},location);
  if (distance > RADIUS_METERS) {
    throw fail(403,"outside_event_area","You are outside the 100-meter event attendance area.");
  }
  if (distance + location.accuracy > RADIUS_METERS) {
    throw fail(409,"uncertain_event_location","Move closer to the event venue and try again.");
  }
  // Do not store raw volunteer coordinates. Accuracy is a device-reported estimate.
  return {radiusMeters:RADIUS_METERS,distanceMeters:Math.round(distance),accuracyMeters:Math.round(location.accuracy)};
}
async function recordGeofencedAttendance({db,FieldValue,uid,email,eventId,action,location}) {
  if (typeof eventId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(eventId) ||
      !["check-in","check-out"].includes(action)) {
    throw fail(400,"invalid_attendance_request","Invalid event or attendance action.");
  }
  const eventRef=db.collection("communityEvents").doc(eventId);
  const participantRef=db.collection("communityEventParticipants").doc(eventId+"_"+uid);
  const profileRef=db.collection("users").doc(uid);
  return db.runTransaction(async tx=>{
    const [es,ps,us]=await Promise.all([tx.get(eventRef),tx.get(participantRef),tx.get(profileRef)]);
    if (!es.exists || !ps.exists || !us.exists) throw fail(404,"attendance_not_found","Event or participation record not found.");
    const event=es.data(), attendance=ps.data(), volunteer=us.data();
    if (typeof email !== "string" || !email || volunteer.email !== email ||
        !["resident","volunteer"].includes(volunteer.role) || volunteer.status!=="approved" ||
        volunteer.volunteerAccess!==true || volunteer.volunteerStatus!=="approved" ||
        volunteer.adminStatus==="suspended" || volunteer.activeMode!=="volunteer") {
      throw fail(403,"volunteer_required","Switch to an approved Volunteer account.");
    }
    if (event.publicationStatus!=="published" || event.status!=="active")
      throw fail(409,"event_not_active","Attendance is available only while the event is ongoing.");
    if (event.proposedBy===uid || attendance.eventId!==eventId || attendance.uid!==uid ||
        attendance.status!=="joined" || attendance.attendanceVerified===true)
      throw fail(403,"attendance_not_eligible","You are not eligible to record attendance for this event.");
    const evidence=validateLocation(event,location);
    if (action==="check-in" && (attendance.checkedInAt || attendance.checkedOutAt))
      throw fail(409,"already_checked_in","Your Time In has already been recorded.");
    if (action==="check-out" && (!attendance.checkedInAt || attendance.checkedOutAt))
      throw fail(409,"invalid_check_out","You must Time In first and can Time Out only once.");
    const stamp=FieldValue.serverTimestamp();
    tx.update(participantRef, action==="check-in" ?
      {checkedInAt:stamp,checkedOutAt:null,checkInGeofence:evidence,updatedAt:stamp} :
      {checkedOutAt:stamp,checkOutGeofence:evidence,updatedAt:stamp});
    return {action,...evidence};
  });
}
module.exports={validateLocation,distanceMeters,recordGeofencedAttendance};
