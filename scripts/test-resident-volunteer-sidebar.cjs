"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=f=>fs.readFileSync(path.resolve(__dirname,"..",f),"utf8");
const layout=read("app/(tabs)/_layout.tsx");
const profile=read("app/(tabs)/profile.tsx");
const progress=read("app/(tabs)/volunteer-impact.tsx");
const web=read("app/(tabs)/volunteer.web.tsx");
const native=read("app/(tabs)/volunteer.tsx");
function menu(name) {
 const begin=layout.indexOf("const "+name+": TabDefinition[] = [");
 const end=layout.indexOf("];",begin);
 assert.ok(begin>=0 && end>begin,"Menu missing: "+name);
 return layout.slice(begin,end);
}
test("Resident navigation has five service modules; Profile stays in account menu",()=>{
 const menuText=menu("residentDesktopTabs");
 const expected=["index","disaster-response","resident","community-events","donation"];
 const found=[...menuText.matchAll(/name:"([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(found,expected);
 for(const gone of ["my-cases","notifications","announcements","map-tracking","profile","certificate"])assert.ok(!found.includes(gone));
});
test("Volunteer navigation exposes Emergency Tasks not redundant progress or alerts",()=>{
 const menuText=menu("volunteerDesktopTabs");
 const found=[...menuText.matchAll(/name:"([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(found,["index","volunteer","community-events"]);
 assert.match(menuText,/label:"Emergency Tasks"/);
 assert.doesNotMatch(menuText,/My Progress|Volunteer Tasks|Notifications|Announcements|Certificates|My Profile/);
 assert.match(web,/Emergency Tasks/);
 assert.match(native,/Emergency Tasks/);
});
test("No mode switch, account settings or logout in desktop sidebar footer",()=>{
 const region=layout.slice(layout.indexOf("function DesktopTabBar("),layout.indexOf("function CustomTabBar("));
 assert.doesNotMatch(region,/Switch to (Volunteer|Resident) Mode|onPress=\{requestConfirmedResidentLogout\}|>Account Settings</);
 assert.match(region,/showOnboardingShortcut/);
 const header=layout.slice(layout.indexOf("const residentMobileTabs"),layout.indexOf("function DesktopTabBar("));
 assert.match(header,/requestConfirmedResidentLogout/);
 assert.match(header,/mobileAccountActionText}>Account Settings/);
 assert.match(header,/Switch to \{mode ===/);
});
test("Volunteer progress is LIVE inside profile, not a blank link",()=>{
 assert.match(profile,/\| "progress"/);
 assert.match(profile,/label:"My Progress"/);
 assert.match(profile,/<VolunteerImpact embedded \/>/);
 assert.match(progress,/embedded \? View : ScrollView/);
 assert.match(progress,/verifiedContributions/);
 assert.match(progress,/communityEventParticipants/);
 assert.match(progress,/certificates/);
});
test("Sidebars use only low-opacity Super Admin leaf accent",()=>{
 assert.match(layout,/sidebarLeafDecoration/);
 assert.match(layout,/mobileSidebarLeafDecoration/);
 assert.match(layout,/name="leaf-outline" size=\{220\}/);
 assert.match(layout,/opacity:0\.16/);
});
