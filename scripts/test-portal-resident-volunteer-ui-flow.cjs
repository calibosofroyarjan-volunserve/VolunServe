"use strict";
const fs=require("node:fs"), assert=require("node:assert/strict");
const read=p=>fs.readFileSync(p,"utf8");
const nav=read("app/(tabs)/_layout.tsx");
const volunteerWeb=read("app/(tabs)/volunteer.web.tsx");
const volunteerNative=read("app/(tabs)/volunteer.tsx");
const assistance=read("app/(tabs)/resident.tsx");
const home=read("components/home/Home.web.tsx");
const community=read("app/(tabs)/community-events.tsx");
const signup=read("app/signup.web.tsx");

const inOrder=(source,items)=>{
 let pos=-1;
 for(const item of items){const next=source.indexOf(item,pos+1);
  assert(next>pos, "Missing or out-of-order module: "+item);pos=next;}
};
// Service-first Resident path; no duplicate Profile, Certificate or Notifications sidebar entries.
inOrder(nav,['{name:"index",label:"Home"', '{name:"disaster-response",label:"Emergency Reports"',
 '{name:"resident",label:"Request Assistance"', '{name:"community-events",label:"Community Events"',
 '{name:"donation",label:"Donations"']);
inOrder(nav,['{name:"index",label:"Home"', '{name:"volunteer",label:"Emergency Tasks"',
 '{name:"community-events",label:"Community Events"']);
assert(nav.includes('backgroundColor: "#0B3F34"') &&
 nav.includes('residentNavItemActive: { backgroundColor: "#147D61"') &&
 nav.includes('mobileDrawerActive: { backgroundColor: "#147D61"'),
 "Resident and Volunteer sidebars should use the same premium emerald style");
assert(nav.includes('volunteerOnlyRoutes') &&
 nav.includes('residentOnlyRoutes') &&
 nav.includes('return <Redirect href="/login" />') &&
 nav.includes('hasVolunteerAccess(profile)') &&
 nav.includes('hasResidentAccess(profile)'),
 "Preserve mandatory role gates and login protection");
assert(volunteerWeb.includes('colors={["#EFFBF5", "#DFF4E9", "#F7FDF9"]}') &&
 volunteerWeb.includes('colors={["#EFFBF5", "#DDF4E8", "#F8FDFA"]}') &&
 volunteerWeb.includes('botanicalDesktop') && volunteerWeb.includes('botanicalMobile'),
 "Emergency Task web/mobile headers should share botanical mint appearance");
assert(volunteerWeb.includes('openLiveMap()') &&
 volunteerWeb.includes('onSnapshot(') &&
 volunteerWeb.includes('runTransaction('),
 "Keep all live response map, task and Firestore handling unchanged");
assert(volunteerNative.includes('styles.headerLeaf') &&
 volunteerNative.includes('backgroundColor: "#E9F8F0"') &&
 volunteerNative.includes('openLiveMap()'),
 "Native Volunteer header must match without losing map action");
assert(assistance.includes('colors={["#F1FCF6","#E4F7EB","#D7F2E3","#E9F9F1"]}') &&
 assistance.includes('premiumBotanicalLeaf') &&
 assistance.includes('screenMode') &&
 assistance.includes('requests.length'),
 "Preserve multi-step Resident assistance functionality and use new palette");
assert(home.includes('journeyBar') && community.includes('communityHero'),
 "Keep original Resident/Volunteer Home workflow and Community Events content");
assert(signup.includes('verification link') &&
 read("app/(tabs)/disaster-response.tsx").includes("MapTracking") &&
 read("app/(superadmin)/_layout.tsx").includes("Super Admin"),
 "Do not change/signup, city-only map or Super Admin");
console.log("PASS Resident + Volunteer portal visual system and safe existing route, assistance, tasks and map flow");
