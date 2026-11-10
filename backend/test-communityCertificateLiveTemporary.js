"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {minimumCommunityCertificateMinutes: threshold,
  isEligibleCommunityAttendance: eligible} = require("./communityCertificateEligibility");

const keys = [
  "VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED",
  "VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC",
  "VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC",
  "VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED",
  "VOLUNSERVE_CERT_TEST_EVENT_IDS",
  "VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS",
];
const ts = ms => ({toMillis:()=>ms});
const iso = ms => new Date(ms).toISOString().slice(0,19)+"Z";
function withEnv(env, run) {
  const before = new Map(keys.map(k=>[k,process.env[k]]));
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, env);
    run();
  } finally {
    for (const [key,value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
const now = Date.now();
const start = now - 60*60*1000;
const end = now + 60*60*1000;
const enabled = {
  VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED:"true",
  VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC:iso(start),
  VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC:iso(end),
};
function fixture({
  duration=60, checkIn = now-5*60*1000,
  completed = now-10*1000, verified = true,
  proposedBy = "resident-other", eventStatus = "completed",
} = {}) {
  const eventId="production-new-event";
  const uid="unlisted-test-volunteer";
  const attendance={
    uid,eventId,status:"joined",attendanceVerified:verified,
    attendanceVerifiedBy:"verified-admin",
    checkedInAt:ts(checkIn),checkedOutAt:ts(checkIn+duration*1000)
  };
  const event={
    publicationStatus:"published",status:eventStatus,
    proposedBy,completedBy:"verified-admin",
    completedAt:ts(completed),
  };
  return {eventId,uid,attendance,event,participantId:eventId+"_"+uid};
}
function check(f) {
  return eligible(f.eventId,f.event,f.participantId,f.attendance);
}
function minimum(f) {
  return threshold(f.eventId,f.uid,f.attendance,f.event);
}
test("temporary production 1m applies to new completed events and new volunteer Time In/Out",()=>{
  withEnv(enabled,()=>{
    const f=fixture();
    assert.equal(minimum(f),1);
    assert.equal(check(f),true);
    const short=fixture({duration:59});
    assert.equal(check(short),false);
  });
});
test("production does not retroactively issue 1m certificates for old attendance",()=>{
  withEnv(enabled,()=>{
    const cutoff=Date.parse(enabled.VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC);
    const old=fixture({checkIn:cutoff-30*60*1000});
    assert.equal(minimum(old),30);
    assert.equal(check(old),false);
    const oldEvent=fixture({completed:cutoff-1000});
    assert.equal(minimum(oldEvent),30);
    assert.equal(check(oldEvent),false);
    assert.equal(check(fixture({duration:30*60,checkIn:cutoff-35*60*1000})),true);
  });
});
test("unapproved or incomplete events never qualify with temporary live 1m",()=>{
  withEnv(enabled,()=>{
    assert.equal(check(fixture({verified:false})),false);
    assert.equal(check(fixture({eventStatus:"active"})),false);
    assert.equal(check(fixture({proposedBy:"unlisted-test-volunteer"})),false);
    assert.equal(check(fixture({completed:now+60*60*1000})),false);
  });
});
test("temporary override requires exact enable, valid bounded window, and auto-expires",()=>{
  const f=fixture();
  withEnv({...enabled,VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED:"false"},()=>{
    assert.equal(minimum(f),30);
    assert.equal(check(f),false);
  });
  withEnv({...enabled,VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_ENABLED:"TRUE"},()=>assert.equal(minimum(f),30));
  withEnv({...enabled,VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC:"bad"},()=>assert.equal(minimum(f),30));
  withEnv({...enabled,VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC:""},()=>assert.equal(minimum(f),30));
  withEnv({...enabled,VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_START_UTC:iso(now+60*1000)},()=>assert.equal(minimum(f),30));
  withEnv({...enabled,VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC:iso(now-60*1000)},()=>assert.equal(minimum(f),30));
  withEnv({...enabled,VOLUNSERVE_CERT_LIVE_TEMP_ONE_MIN_END_UTC:iso(now+8*24*60*60*1000)},()=>assert.equal(minimum(f),30));
});
test("other existing exact-ID test-only gate is unaffected by temporary live switch",()=>{
  withEnv({
    VOLUNSERVE_CERT_TEST_OVERRIDE_ENABLED:"true",
    VOLUNSERVE_CERT_TEST_EVENT_IDS:"production-new-event",
    VOLUNSERVE_CERT_TEST_VOLUNTEER_UIDS:"unlisted-test-volunteer"
  },()=>{
    const f=fixture({completed:undefined});
    assert.equal(minimum(f),1);
  });
});
