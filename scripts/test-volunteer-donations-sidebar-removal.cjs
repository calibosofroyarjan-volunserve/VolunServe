"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const tabs = read("app/(tabs)/_layout.tsx");
const donate = read("app/(tabs)/donation.tsx");
const profile = read("app/(tabs)/profile.tsx");
function names(menu) {
  const start = tabs.indexOf("const "+menu+": TabDefinition[] = [");
  const end = tabs.indexOf("];",start);
  assert.ok(start>=0&&end>start,"Menu not found: "+menu);
  return [...tabs.slice(start,end).matchAll(/name:\s*"([^"]+)"/g)].map(x=>x[1]);
}
test("Volunteer desktop preserves My Certificates while mobile keeps compact service modules",()=>{
  assert.deepEqual(names("volunteerDesktopTabs"),["index","volunteer","community-events","certificate"]);
  assert.deepEqual(names("volunteerMobileTabs"),["index","volunteer","community-events"]);
  assert.ok(!names("volunteerDesktopTabs").includes("donation"));
  assert.ok(!names("volunteerMobileTabs").includes("donation"));
});
test("Resident donations remain accessible through Resident mode",()=>{
  assert.deepEqual(names("residentDesktopTabs"),["index","disaster-response","resident","community-events","donation"]);
  assert.deepEqual(names("residentMobileTabs"),["index","disaster-response","resident","community-events"]);
  assert.match(tabs,/Switch to \{mode ===/);
  assert.match(tabs,/volunteerAccess/);
});
test("Donation experience and existing financial records are unchanged",()=>{
  for(const fragment of ["listedCampaigns.map", "myDonations.map", "DonationHeroArt", "checkoutUrl"]) {
    assert.ok(donate.includes(fragment),"Donation module changed or missing: "+fragment);
  }
});
test("Volunteer Profile continues to expose progress and certificate records",()=>{
  assert.match(profile,/label:"My Progress"/);
  assert.match(profile,/key: "certificates"/);
  assert.match(profile,/<VolunteerImpact embedded \/>/);
});
