"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const screen = fs.readFileSync("app/(tabs)/community-events.tsx","utf8");
test("Event map stays out of the My Attendance card and opens separately",()=>{
 const a=screen.indexOf("{/* Event map belongs to the expanded event details via a dialog");
 const b=screen.indexOf("\n          </View>\n        )}",a);
 assert(a>=0 && b>a,"Missing compact event location section");
 const card=screen.slice(a,b);
 assert.match(card,/View Map &amp; Directions/);
 assert.match(card,/setExpandedMapEvent\(event\.id\)/);
 assert.doesNotMatch(card,/renderWebMap\(event\)/,"Large map must not render inside the event card");
 assert.doesNotMatch(card,/Show Road Route/,"Route controls must stay in dialog");
});
test("Map modal retains route preview and Google navigation",()=>{
 const a=screen.indexOf('{Platform.OS === "web" && mapModalEvent && (');
 const b=screen.indexOf('{Platform.OS === "web" && participantsModalEvent && user && (',a);
 assert(a>=0 && b>a,"Missing isolated map modal");
 const modal=screen.slice(a,b);
 for(const term of ['<Modal visible transparent','onRequestClose={() => setExpandedMapEvent(null)}','<ScrollView','renderWebMap(mapModalEvent)','showRouteInVolunServe(mapModalEvent)','googleMapsNavigationUrl(mapModalEvent)','View Map']) {
  if(term==='View Map')continue;
  assert(modal.includes(term),"Missing modal feature: "+term);
 }
 assert(modal.includes('accessibilityLabel="Close location map"'));
});
test("My Attendance, participant profiles and certificate actions are still in screen",()=>{
 for(const term of ["recordSelfAttendance", "My Event Attendance History", "CommunityEventRoster",
  "CommunityEventAvatarPreview","View My Certificates","setParticipantsModalEventId"]) {
  assert(screen.includes(term),"Missing existing function: "+term);
 }
});
