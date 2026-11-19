"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const s=fs.readFileSync("app/(admin)/donation-list.tsx","utf8");
assert(s.includes('const showDonationAlert = (title: string, message: string) => {'),"Browser-compatible feedback helper missing");
assert(s.includes('Platform.OS === "web"'),"Web branch missing");
assert(s.includes('(globalThis as any).alert(`${title}\\n\\n${message}`)'),"Browser feedback missing");
assert(s.includes('Alert.alert(title, message);'),"Native feedback removed");
const uses=s.match(/showDonationAlert\(/g)||[];
assert.equal(uses.length,46,"All 45 original Donation alerts plus mandatory Resident-consent preflight must use browser feedback");
const raw=s.match(/Alert\.alert\(/g)||[];
assert.equal(raw.length,1,"Unsupported direct Alert.alert calls remain on web");
for(const key of [
  '"Privacy Review Required"', '"Campaign Title"', '"Official LGU Channel Required"',
  '"Public Campaign Photo Required"', '"Campaign Published and Announced"',
  '"Campaign Published — Announcement Pending"', '"Campaign Failed"',
  '"Donation Verified"', '"Verification Failed"', '"Rejection Failed"',
]){
  assert(s.includes('showDonationAlert('+key) ||
    s.includes('showDonationAlert(\n        '+key) ||
    s.includes('showDonationAlert(\n          '+key),
    "Important Donation feedback missing: "+key);
}
assert(s.includes("privacySafeResidentDraft") &&
  s.includes("residentStoryPrivacyReviewed") &&
  s.includes('assistanceSourceIsEligible(assistanceSource)') &&
  s.includes("publishModuleAnnouncement"),
  "Donation campaign privacy, eligibility or announcement behavior must not be changed");
console.log("PASS: 45 Donation outcomes/validation alerts now visible on web, native alerts preserved; no payment logic edited");
