"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict");
const sidebar=fs.readFileSync("app/(admin)/_layout.tsx","utf8");
const announcement=fs.readFileSync("app/(admin)/create-announcement.tsx","utf8");
const nav=sidebar.slice(sidebar.indexOf("const NAV_ITEMS: NavItem[] = ["),sidebar.indexOf("type NavSectionId"));
const sections=sidebar.slice(sidebar.indexOf("const NAV_SECTIONS:"),sidebar.indexOf("const navActive"));
assert(nav.includes('label: "Announcements"')&&nav.includes('route: "/(admin)/create-announcement"'));
assert(!nav.includes('label: "Disputes"')&&!sections.includes("Communication & Reports"));
assert(sidebar.includes('accessibilityLabel="Announcements"'));
assert(sidebar.includes('NAV_ITEMS.filter(item => item.label === "Announcements")'));
assert.equal((nav.match(/label: "Announcements"/g)||[]).length,1);
for(const text of ["COMMUNICATION & REPORTS","LOCAL COMMUNICATION","No barangay assigned","Ask your Super Admin","Assign Barangay"]){
  assert(!announcement.includes(text),"Obsolete announcement text: "+text);
}
for(const token of [
  'title="Announcements"','eyebrow="LGU WORKSPACE / ANNOUNCEMENTS"',
  "Complete My Official Barangay","SJDM_BARANGAYS.includes(initialBarangay)",
  "await updateDoc(doc(db, \"users\", user.uid)","barangayDeclaredBy: user.uid",
  "barangayDeclaredAt: serverTimestamp()","publishBarangay !== barangay",
  'accessibilityLabel="Choose authorized announcement barangay"',
  "audience: publishBarangay","cleanMessage.length < 10",
  "disabled={submitting || !barangay || !activeApprovedAdmin}"
]){
  assert(announcement.includes(token),"Missing announcement safety/UX token: "+token);
}
console.log("PASS: clean standalone Announcements, no Disputes entry, protected one-time LGU area and scoped publishing.");
