"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict");
const page=fs.readFileSync("app/(admin)/assistance-requests.tsx","utf8");
const donations=fs.readFileSync("app/(admin)/donation-list.tsx","utf8");
const backend=fs.readFileSync("backend/server.js","utf8");
const start=page.indexOf("function DecisionTab({");
const end=page.indexOf("function EmbeddedGoogleMap({",start);
assert(start>=0 && end>start,"Assistance decision screen must exist");
const details=page.slice(page.indexOf("function CaseReviewTab({"),page.indexOf("function EvidenceTab({"));
const queue=page.slice(page.indexOf('screenMode === "queue"'),page.indexOf(') : !selected ?'));
const review=page.slice(start,end);
for(const label of ["Assistance Request Queue","REQUEST CASE","RESIDENT","CATEGORY","AMOUNT",
   "STATUS","All Requests","For Review","Approved","Rejected","Completed",
   "5 per page","<ListPagination","<MockQueueRow"]){
  assert(queue.includes(label),"Queue design is missing: "+label);
}
assert(page.includes('filter === "pending" ? ["pending","under_review"].includes(status)'),
  "For Review must display both pending and already-under-review requests");
assert(page.includes('label="Request Details"') &&
  page.includes('label="Review & Decision"'),
  "Separate request tabs must preserve navigation");
assert(details.includes('title="Request Information"') &&
  details.includes('title="Resident Information"') &&
  details.includes('label="Requested Amount"'),
  "Request detail must have two simple clean cards");
for(const label of ["Review Summary","Confirm Decision",
  "Documents and beneficiary details match","No duplicate assistance request",
  "Resident belongs to San Jose del Monte","Medical Bill Check",
  "Approve Request","Request More Information","Reject Request",
  "Choose Assistance","Create Donation Campaign","Record LGU Assistance",
  "Publish Donation Campaign","Campaign Title","Campaign Story",
  "Donation Target (PHP)","Campaign Cover","Campaign Summary",
  "Amount for Donation","Continue to Publish Campaign","Assistance Office",
  "Mark Assistance Provided","Open Linked Donation Campaign"]){
  assert(review.includes(label),"Request detail/approval design missing: "+label);
}
assert(!review.includes("StatusChoiceRow"),"No Pending status dropdowns on the simple review");
assert(!review.includes("EmbeddedGoogleMap"),"No Google Map in Assistance detail");
assert(!review.includes('label="Start Review"'),"Protected review must auto-start on decision");
assert(page.includes("const ensurePrivateReviewStarted = async () =>") &&
  (page.match(/await ensurePrivateReviewStarted\(\);/g)||[]).length>=4,
  "Backend private review still starts for approve/reject/more-info");
for(const field of ["documentConsistencyStatus","duplicateCheckStatus",
  "beneficiaryCheckStatus","residencyVerificationStatus","facilityVerificationStatus",
  "costVerificationStatus"]){
 assert(review.includes('onReviewChange("'+field+'"'),"No check for "+field);
}
assert(backend.includes("private_verification_incomplete") &&
  backend.includes("requireOperationalAdmin"),
  "Do not bypass LGU authorization or backend financial review");
const flow=page.slice(page.indexOf("const saveAndContinueDonation = async () =>"),
  page.indexOf("const saveOfficialLocation",page.indexOf("const saveAndContinueDonation = async ()")));
assert(flow.includes('await updateRequest("resource_assessment"') &&
  flow.includes('await updateRequest("save_location"') &&
  flow.indexOf('await updateRequest("resource_assessment"') <
  flow.indexOf('await updateRequest("save_location"') &&
  flow.indexOf('await updateRequest("save_location"') <
  flow.lastIndexOf('router.push({pathname: "/donation-list"'),
  "Campaign navigation must save support plan, then public office, then open editor");
assert(flow.includes("if (!savedPlan) return") &&
  flow.includes("if (!savedOffice) return"),
  "A failed backend save must never proceed to Campaign Publishing");
assert(!flow.includes("create_campaign") && !flow.includes("publishModuleAnnouncement"),
  "Approval must not auto-publish a campaign");
assert(donations.includes("privacySafeResidentDraft") &&
  donations.includes("defaultCommunityCampaignTitle(assistanceSource)") &&
  donations.includes("defaultCommunityCampaignDescription(assistanceSource)") &&
  donations.includes("defaultCommunityPublicStory(assistanceSource)"),
  "Resident title and description must auto-populate the campaign draft");
assert(donations.includes("setResidentStoryPrivacyReviewed(false)") &&
  donations.includes("openedFromAssistance && !residentStoryPrivacyReviewed"),
  "Require manual privacy approval before publishing resident-derived content");
assert(donations.includes("assistanceSource.publicCampaignPhotoConsent === true"),
  "Only consented resident campaign photos may be preselected");
assert(donations.includes("setShowCampaignForm(!existing && assistanceSourceIsEligible(assistanceSource))"),
  "Approved request handoff must open publishing editor without a second setup click");
assert(donations.includes("openedFromAssistance && showCampaignForm") &&
  donations.includes("Publish Donation Campaign") &&
  donations.includes("Official Donation Channel") &&
  donations.includes("Publish Campaign"),
  "Post-approval campaign must use its compact separate publishing page");
console.log("PASS: Emergency-style paginated queue, clear review, approved support and private-safe resident-sourced donation publishing");
