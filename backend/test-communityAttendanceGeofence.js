"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validateLocation,recordGeofencedAttendance}=require("./communityAttendanceGeofence");
const now=Date.now(), event={coordinates:{latitude:14.81,longitude:121.04},status:"active",publicationStatus:"published",proposedBy:"owner"};
const fix={latitude:14.81,longitude:121.04,accuracy:10,timestamp:now};
test("accept accurate venue location",()=>assert.equal(validateLocation(event,fix,now).distanceMeters,0));
test("reject outside area",()=>assert.throws(()=>validateLocation(event,{...fix,latitude:14.812},now),{code:"outside_event_area"}));
test("reject uncertain boundary",()=>assert.throws(()=>validateLocation(event,{...fix,latitude:14.8108,accuracy:30},now),{code:"uncertain_event_location"}));
test("reject stale, future, inaccurate or missing fixes",()=>{
  for(const loc of [null,{...fix,timestamp:now-31000},{...fix,timestamp:now+6000},{...fix,latitude:null}]) assert.throws(()=>validateLocation(event,loc,now),{code:"invalid_location"});
  assert.throws(()=>validateLocation(event,{...fix,accuracy:51},now),{code:"low_location_accuracy"});
  assert.throws(()=>validateLocation({},fix,now),{code:"event_location_missing"});
});
function fixture(attendance={},eventOverride={},profileOverride={}) {
  const data={communityEvents:{...event,...eventOverride},communityEventParticipants:{eventId:"e",uid:"u",status:"joined",...attendance},users:{email:"u@gmail.com",role:"resident",status:"approved",volunteerAccess:true,volunteerStatus:"approved",activeMode:"volunteer",...profileOverride}};
  const writes=[];
  const db={collection:name=>({doc:()=>name}),runTransaction:fn=>fn({get:async name=>({exists:true,data:()=>data[name]}),update:(ref,patch)=>writes.push(patch)})};
  return {writes,run:(action,location=fix)=>recordGeofencedAttendance({db,FieldValue:{serverTimestamp:()=>"server-stamp"},uid:"u",email:"u@gmail.com",eventId:"e",action,location})};
}
test("check in writes only server time and minimized evidence",async()=>{
 const f=fixture();await f.run("check-in");assert.equal(f.writes[0].checkedInAt,"server-stamp");assert.equal(f.writes[0].checkInGeofence.distanceMeters,0);assert.equal("latitude" in f.writes[0].checkInGeofence,false);
});
test("check out revalidates location",async()=>{
 const f=fixture({checkedInAt:"existing"});await assert.rejects(f.run("check-out",{...fix,latitude:14.812}),{code:"outside_event_area"});assert.equal(f.writes.length,0);await f.run("check-out");assert.equal(f.writes[0].checkedOutAt,"server-stamp");
});
test("reject invalid order, duplicate attendance, unjoined, own event, inactive, unapproved",async()=>{
 for(const [f,a,code] of [[fixture(),"check-out","invalid_check_out"],[fixture({checkedInAt:"x"}),"check-in","already_checked_in"],[fixture({status:"declined"}),"check-in","attendance_not_eligible"],[fixture({},{proposedBy:"u"}),"check-in","attendance_not_eligible"],[fixture({},{status:"upcoming"}),"check-in","event_not_active"],[fixture({},{},{volunteerAccess:false}),"check-in","volunteer_required"],[fixture({},{},{email:"other@gmail.com"}),"check-in","volunteer_required"]]){
 await assert.rejects(f.run(a),{code});assert.equal(f.writes.length,0);}
});
