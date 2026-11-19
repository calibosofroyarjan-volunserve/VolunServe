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
  "Request more information instead","Choose Support","Public Coordination",
  "Create Donation Campaign","Step 2 — Donation Details",
  "Step 3 — Public Coordination","Save & Continue to Campaign Setup",
  "Mark Assistance Provided","Close Assistance Case","Open Linked Donation Campaign"]){
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
assert(page.includes("const saveAndContinueDonation = async () =>"),
  "Donation setup should have a single continuous Admin action");
const continueFunction=page.slice(page.indexOf("const saveAndContinueDonation = async () =>"),
  page.indexOf("const saveOfficialLocation",page.indexOf("const saveAndContinueDonation = async () =>")));
assert(continueFunction.includes('await updateRequest("resource_assessment"') &&
  continueFunction.includes('await updateRequest("save_location"') &&
  continueFunction.includes('router.push({pathname: "/donation-list"'),
  "Campaign editor must open only after both authorized backend saves succeed");
assert(continueFunction.indexOf('await updateRequest("resource_assessment"') <
  continueFunction.indexOf('await updateRequest("save_location"') &&
  continueFunction.indexOf('await updateRequest("save_location"') <
  continueFunction.lastIndexOf('router.push({pathname: "/donation-list"'),
  "Preserve support -> coordination -> campaign ordering");
assert(continueFunction.includes("if (!savedPlan) return") &&
  continueFunction.includes("if (!savedOffice) return"),
  "Never navigate to campaign editor after failed backend operation");
assert(review.includes('linkedCampaign') && review.includes('completed'),
  "Completed cases and linked campaigns need non-editable final screens");
assert(!continueFunction.includes("publishModuleAnnouncement") &&
  !continueFunction.includes("create_campaign"),
  "Opening campaign setup must never publish a campaign");
console.log("PASS: simplified Assistance review plus approved -> support -> campaign setup and completed-case UI");
