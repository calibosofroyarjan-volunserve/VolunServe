"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTOMATIC_VERIFIER, automaticAttendanceDecision,
  verifyCommunityEventAttendance,
} = require("./communityAttendanceAutoVerify");

const millis = (iso) => Date.parse(iso);
const ts = (ms) => ({toMillis:()=>ms});
const checkIn = millis("2026-11-18T09:02:00+08:00");
const checkOut = millis("2026-11-18T09:03:00+08:00");
const now = millis("2026-11-18T09:04:00+08:00");
function fixture() {
  return {
    eventId:"eventA",
    participantId:"eventA_volA",
    event:{
      publicationStatus:"published",status:"active",date:"2026-11-18",
      time:"09:00",endTime:"10:00",proposedBy:"someoneElse",
    },
    attendance:{
      uid:"volA",eventId:"eventA",status:"joined",
      attendanceVerified:false,joinedAt:ts(checkIn-10000),
      checkedInAt:ts(checkIn),checkedOutAt:ts(checkOut),
    },
    volunteer:{
      role:"volunteer",status:"approved",
      volunteerAccess:true,volunteerStatus:"approved",
    },
    nowMs:now,
  };
}
test("one minute valid self attendance is eligible for automatic verification",()=>{
  assert.equal(automaticAttendanceDecision(fixture()),"eligible");
});
test("59-second duration is held for Admin review",()=>{
  const f=fixture();
  f.attendance.checkedOutAt=ts(checkIn+59000);
  assert.equal(automaticAttendanceDecision(f),"invalid_or_short_attendance");
});
test("future-date event with earlier attendance requires manual Admin review",()=>{
  const f=fixture();
  f.event.date="2026-11-20";
  assert.equal(automaticAttendanceDecision(f),"outside_event_schedule");
});
test("historical attendance is never auto-approved by a future rollout",()=>{
  const f=fixture();
  f.event.date="2026-11-17";
  f.event.time="09:00";
  f.event.endTime="10:00";
  const originalIn=checkIn-24*60*60*1000;
  f.attendance.joinedAt=ts(originalIn-10000);
  f.attendance.checkedInAt=ts(originalIn);
  f.attendance.checkedOutAt=ts(originalIn+60000);
  assert.equal(automaticAttendanceDecision(f),"historical_attendance_requires_admin");
});
test("a non-approved volunteer and a proposer cannot be auto verified",()=>{
  const f=fixture();
  f.volunteer.volunteerStatus="applied";
  assert.equal(automaticAttendanceDecision(f),"volunteer_approval_required");
  f.volunteer.volunteerStatus="approved";
  f.event.proposedBy="volA";
  assert.equal(automaticAttendanceDecision(f),"not_joined_eligible_volunteer");
});
test("missing server timestamps or invalid completion cannot be auto verified",()=>{
  const f=fixture();
  f.attendance.checkedInAt="fake";
  assert.equal(automaticAttendanceDecision(f),"invalid_or_short_attendance");
  f.attendance.checkedInAt=ts(checkIn);
  f.event.status="completed";
  f.event.completedAt=ts(checkOut-1000);
  f.event.completedBy="admin";
  assert.equal(automaticAttendanceDecision(f),"completion_record_invalid");
});
test("verified records are idempotent",()=>{
  const f=fixture();
  f.attendance.attendanceVerified=true;
  assert.equal(automaticAttendanceDecision(f),"already_verified");
});
test("auto verification defaults to OFF unless explicitly opted in",async()=>{
  const original=process.env.VOLUNSERVE_ATTENDANCE_AUTO_VERIFY_ENABLED;
  delete process.env.VOLUNSERVE_ATTENDANCE_AUTO_VERIFY_ENABLED;
  try {
    let reads=0;
    const result=await verifyCommunityEventAttendance({
      db:{runTransaction(){reads++;throw Error("must not read or write");}},
      FieldValue:{},eventId:"eventA",volunteerId:"volA",nowMs:now,
    });
    assert.equal(result.status,"needs_admin_review");
    assert.equal(result.reason,"auto_verification_disabled");
    assert.equal(reads,0);
  } finally {
    if (original === undefined) delete process.env.VOLUNSERVE_ATTENDANCE_AUTO_VERIFY_ENABLED;
    else process.env.VOLUNSERVE_ATTENDANCE_AUTO_VERIFY_ENABLED=original;
  }
});
test("server transaction updates verification fields only and does not modify timestamps or event",async()=>{
  const f=fixture();
  const records={
    "communityEvents/eventA":f.event,
    "communityEventParticipants/eventA_volA":f.attendance,
    "users/volA":f.volunteer,
  };
  const updates=[];
  const db={
    collection(name){return {doc(id){return {path:name+"/"+id};}};},
    async runTransaction(fn){
      return fn({
        get:async(ref)=>({exists:!!records[ref.path],data:()=>records[ref.path]}),
        update:(ref,payload)=>updates.push({ref,payload}),
      });
    },
  };
  const FieldValue={serverTimestamp:()=>({serverTimestamp:true})};
  const result=await verifyCommunityEventAttendance({
    db,FieldValue,eventId:"eventA",volunteerId:"volA",nowMs:now,enabled:true,
  });
  assert.equal(result.status,"verified");
  assert.equal(updates.length,1);
  assert.equal(updates[0].ref.path,"communityEventParticipants/eventA_volA");
  assert.deepEqual(Object.keys(updates[0].payload).sort(),
    ["attendanceVerified","attendanceVerifiedAt","attendanceVerifiedBy","updatedAt"].sort());
  assert.equal(updates[0].payload.attendanceVerifiedBy,AUTOMATIC_VERIFIER);
  assert.equal(f.attendance.attendanceVerified,false);
});
