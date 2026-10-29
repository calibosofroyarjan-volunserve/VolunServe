"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.resolve(__dirname,"..",p),"utf8");
const layout=read("app/(tabs)/_layout.tsx");
const profile=read("app/(tabs)/profile.tsx");
const homeWeb=read("components/home/Home.web.tsx");
const homeNative=read("components/home/Home.native.tsx");
function menu(id) {
 const begin=layout.indexOf("const "+id+": TabDefinition[] = [");
 const end=layout.indexOf("];",begin);
 assert.ok(begin>-1&&end>begin,"missing "+id);
 return [...layout.slice(begin,end).matchAll(/name:\s*"([^"]+)"/g)].map(x=>x[1]);
}
test("Resident and Volunteer sidebar menus keep only actual service modules",()=>{
 assert.deepEqual(menu("residentDesktopTabs"),["index","disaster-response","resident","community-events","donation"]);
 assert.deepEqual(menu("volunteerDesktopTabs"),["index","volunteer","community-events"]);
 for(const id of ["residentDesktopTabs","volunteerDesktopTabs","residentMobileTabs","volunteerMobileTabs"])
   for(const duplicate of ["profile","certificate","volunteer-impact"])
     assert.ok(!menu(id).includes(duplicate),duplicate+" leaked into "+id);
 assert.deepEqual(menu("residentMobileTabs"),["index","disaster-response","resident","community-events"]);
 assert.deepEqual(menu("volunteerMobileTabs"),["index","volunteer","community-events"]);
});
test("Top-right account dropdown still has a Profile destination for both user modes",()=>{
 assert.match(homeWeb,/title="My Profile"/);
 assert.match(homeWeb,/openAccountDestination\("profile"\)/);
 assert.match(layout,/onPress=\{\(\) => visit\("profile"\)\}/);
 assert.match(layout,/mobileAccountActionText}>My Profile/);
});
test("Profile retains secure progress and certificate data",()=>{
 assert.match(profile,/label:"My Progress"/);
 assert.match(profile,/key: "certificates"/);
 assert.match(profile,/<VolunteerImpact embedded \/>/);
 assert.match(profile,/<CertificateCard/);
 assert.match(profile,/volunteerAccess &&/);
 assert.match(profile,/activeTab ===\s*"certificates"/);
});
test("Home Certificates shortcuts go to Profile Certificates on both web and mobile",()=>{
 for(const source of [homeWeb,homeNative]) {
   assert.match(source,/router\.push\("\/profile\?tab=certificates"\)/);
   assert.doesNotMatch(source,/router\.push\("\/certificate"\)/);
 }
 assert.match(profile,/tab === "certificates" \? "certificates" : "info"/);
 assert.match(profile,/tab === "certificates" && volunteerAccess/);
});
