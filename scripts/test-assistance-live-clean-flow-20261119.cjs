"use strict";
const fs=require("node:fs"), assert=require("node:assert/strict");
const page=fs.readFileSync("app/(admin)/assistance-requests.tsx","utf8");
const backend=fs.readFileSync("backend/server.js","utf8");
const start=page.indexOf("function DecisionTab({"),end=page.indexOf("function EmbeddedGoogleMap({",start);
assert(start>=0 && end>start,"DecisionTab must be present");
const review=page.slice(start,end);
for(const word of ["Review Assistance Request","Confirm Basic Details",
  "Documents, requester and beneficiary match","No duplicate request found",
  "Residency confirmed in San Jose del Monte","Confirm Provider and Amount",
  "Record Decision","Approve Request","Reject Request",
  "Request more information instead","Support Plan","Public Coordination Point",
  "Create Donation Campaign"]){
  assert(review.includes(word),"Missing required review flow: "+word);
}
assert(!review.includes("StatusChoiceRow"),"No Pending dropdowns in simple LGU decision");
assert(!review.includes("EmbeddedGoogleMap") && !review.includes("Search Address"),
  "Google Maps and address search must not appear in review");
assert(!review.includes('label="Start Review"'),"Do not require a separate Start Review button");
assert(page.includes("const ensurePrivateReviewStarted = async () =>"),
  "Protected review must be initiated automatically");
assert((page.match(/await ensurePrivateReviewStarted\(\);/g)||[]).length>=4,
  "Protected review must start for approve, reject and more information");
assert(page.includes('reviewTab === "decision" && renderDecisionRail()'),
  "Simple decision must display in main pane");
assert(!page.includes('<View style={styles.detailEvaluationPanel}>') &&
  !page.includes('<View style={styles.mobileEvaluationSection}>'),
  "Remove nested decision side panel from user journey");
assert(review.includes('onReviewChange("documentConsistencyStatus"') &&
  review.includes('onReviewChange("duplicateCheckStatus"') &&
  review.includes('onReviewChange("beneficiaryCheckStatus"') &&
  review.includes('onReviewChange("residencyVerificationStatus"'),
  "Explicit confirmation required for all backend checks");
assert(backend.includes("private_verification_incomplete") &&
  backend.includes("requireOperationalAdmin"),"Do not bypass protected backend");
assert(page.includes('pathname: "/donation-list"') &&
  page.includes('onSaveResourceAssessment') &&
  page.includes('onSaveLocation'),"Preserve donation handoff");
console.log("PASS: UI simplified, no map/dropdowns, protected backend and donation handoff retained");
