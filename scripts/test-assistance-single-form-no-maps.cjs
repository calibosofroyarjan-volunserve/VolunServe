"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const file = "app/(admin)/assistance-requests.tsx";
const s = fs.readFileSync(file, "utf8");
const between = (a,b) => {
  const from=s.indexOf(a),to=s.indexOf(b,from+1);
  assert(from>=0&&to>from,"Missing component boundaries: "+a);
  return s.slice(from,to);
};
const verified=between("function CompactVerifiedAssistance({","function CompactReviewSelect({");
const pending=between("function CompactAssistanceReview({","function DecisionTab({");
const route=between("  const renderDecisionRail = () => {","  const renderDetailChrome = () => {");
const backend=between("  const updateRequest = async (","  const startReview = () => {");
const operations=s.slice(s.indexOf("  const continueToDonationCampaign = async ("),s.indexOf("  const startReview = () => {"));
assert(!s.includes("<EmbeddedGoogleMap"),"No Google Maps component may render inside LGU Assistance review");
assert(!s.includes('https://www.google.com/maps'),'No Google Maps embed or linked map should remain in this module');
assert(!s.includes("privateMapSearchQuery"),"No stale map-specific verification dependency");
assert(route.includes('selected.verificationStatus === "verified"'),"Verified case must use streamlined form");
assert(route.includes("<CompactVerifiedAssistance"),"Streamlined form must render on verified request");
assert(route.indexOf("<CompactVerifiedAssistance") < route.indexOf("<DecisionTab"),"Streamlined flow must be default");
assert(route.includes("key={selected.id}"),"Review state must reset when switching residents");
for(const item of [
  "Request Verified","Create Donation Campaign","LGU or Partner Support","No Further Support",
  "Set Up Donation Campaign","Public coordination location","Public office address",
  "Approved amount from the LGU review","Confirmed total cost (PHP)",
  "Donations do not start automatically",
])assert(verified.includes(item),"Missing simple UI item "+item);
assert(verified.includes("verifiedUncoveredAmount"),"Verified donation cap must originate from LGU review");
assert(!verified.includes("onChangeText={setRemainingAmount}"),"Do not ask for arbitrary donation amount");
assert(!verified.includes("Save Support Decision"),"No separate Save Support button in simple flow");
assert(!verified.includes("Save Official Location"),"No separate Save Location button in simple flow");
assert(verified.includes("submitting"),"Single call to action must prevent double submissions");
assert(verified.includes("publicOfficeAddress.trim().length < 5"),"Required public address check remains");
assert(verified.includes("Do not use the resident’s home address"),"Public coordination privacy guide remains");
for(const item of [
  '"save_location"','"resource_assessment"','"donation_support"',
  'verificationReview.verifiedUncoveredAmount','validateAssistanceLocation',
  'if (!saved) return false','if (!supportSaved) return false',
  'router.push({ pathname: "/donation-list"'
])assert(operations.includes(item),"Missing secure sequential backend operation: "+item);
assert(operations.indexOf('"save_location"')<operations.indexOf('"resource_assessment"'),
  "Location must be saved first so campaign setup can read both records");
assert(backend.includes("if (!quiet)"),"Bundled flow should avoid duplicate browser popups");
assert(backend.includes("return false;") && backend.includes("return true;"),"Must only continue if backend confirms success");
for(const item of ['onVerify={verifyNeed}','onReject={rejectRequest}','onMoreInfo={requestMoreInformation}']){
  assert(route.includes(item),"Original secure decision handler missing: "+item);
}
assert(pending.includes('label="Approve Request"') && pending.includes('label="Reject Request"'),"Verify/Reject retained");
assert(pending.includes("onAdditional"),"Additional check handler remains available when required");
console.log("PASS one-form post-verification, no Google Maps, real verified amount, public-office privacy, sequential secure operations, and original LGU decisions");
