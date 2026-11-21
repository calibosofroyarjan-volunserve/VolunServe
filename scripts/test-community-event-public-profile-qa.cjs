"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const read=p=>fs.readFileSync(p,"utf8");
const roster=read("components/volunteers/CommunityEventRoster.tsx");
const screen=read("app/(tabs)/community-events.tsx");
const profile=read("app/(tabs)/community-event-profile.tsx");
const backend=read("backend/communityEventRoster.js");
test("View Profile uses real navigable route instead of preview modal",()=>{
  assert.match(roster,/pathname: "\/\(tabs\)\/community-event-profile"/);
  assert.match(roster,/member: item\.key, page: String\(page\)/);
  assert.doesNotMatch(roster,/<Modal/);
  assert.doesNotMatch(roster,/setPreview/);
  assert.match(screen,/onOpenProfile=\{\(\) => setParticipantsModalEventId\(null\)\}/);
});
test("Public profile resolves authenticated opaque roster entry from server",()=>{
  assert.match(profile,/useLocalSearchParams/);
  assert.match(profile,/onAuthChange/);
  assert.match(profile,/getIdToken\(\)/);
  assert.match(profile,/Authorization: `Bearer \$\{token\}`/);
  assert.match(profile,/v\.key === member/);
  assert.match(profile,/v\.status === "Joined"/);
  assert.match(profile,/safeAvatar/);
  assert.match(profile,/router\.back\(\)/);
  assert.doesNotMatch(profile,/getDoc\(/);
  assert.doesNotMatch(profile,/onSnapshot\(/);
  assert.doesNotMatch(profile,/users\/\$\{/);
});
test("Existing backend enforces authorized volunteer and only safe public fields",()=>{
  assert.match(backend,/requireFirebaseUser/);
  assert.match(backend,/volunteerStatus !== "approved"/);
  assert.match(backend,/publicationStatus !== "published"/);
  assert.match(backend,/key: crypto\.createHash/);
  assert.match(backend,/name, avatarUrl, status:"Joined"/);
  assert.doesNotMatch(backend,/return res\.json\(\{.*phoneNumber/s);
});
test("Event map, attendance, participants, and certificates preserved",()=>{
  for(const t of ["CommunityEventRoster", "CommunityEventAvatarPreview", "recordSelfAttendance", "My Event Attendance History", "View My Certificates","renderWebMap(mapModalEvent)"])assert(screen.includes(t),t);
});
