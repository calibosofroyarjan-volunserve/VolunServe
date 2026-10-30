"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.resolve(__dirname,"..",p),"utf8");
const web=read("components/home/Home.web.tsx");
const native=read("components/home/Home.native.tsx");
const quickStart=read("components/home/QuickStartActions.tsx");
const profile=read("app/(tabs)/profile.tsx");
const sidebar=read("app/(tabs)/_layout.tsx");
test("Volunteer Home progress shortcuts open the Profile tab on both platforms",()=>{
  assert.match(web,/router\.push\(volunteerMode \? "\/profile\?tab=progress" : "\/my-cases"\)/);
  assert.match(web,/onPress=\{\(\) => router\.push\("\/profile\?tab=progress"\)\}/);
  assert.match(native,/<QuickStartActions/);
  assert.match(quickStart,/route: "\/profile\?tab=progress"/);
  assert.doesNotMatch(web,/router\.push\("\/volunteer-impact"\)/);
  assert.doesNotMatch(native,/router\.push\("\/volunteer-impact"\)/);
});
test("Volunteer Profile selects actual verified My Progress on deep link",()=>{
  assert.match(profile,/useLocalSearchParams<\{ edit\?: string; tab\?: string \}>/);
  assert.match(profile,/tab === "progress" \? "progress" : tab === "certificates" \? "certificates" : "info"/);
  assert.match(profile,/tab === "progress" && currentMode === "volunteer" && volunteerAccess/);
  assert.match(profile,/<VolunteerImpact embedded \/>/);
});
test("Emergency Tasks label is consistent with sidebar and volunteer Home",()=>{
 assert.match(sidebar,/label:"Emergency Tasks"/);
 assert.match(quickStart,/title: "Emergency Tasks"/);
 assert.match(native,/<QuickStartActions/);
 assert.match(web,/<QuickStartActions/);
 assert.match(quickStart,/title: "Emergency Tasks"/);
});
