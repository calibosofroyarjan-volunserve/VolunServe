"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const assistance=fs.readFileSync("app/(admin)/assistance-requests.tsx","utf8");
const donation=fs.readFileSync("app/(admin)/donation-list.tsx","utf8");
const backend=fs.readFileSync("backend/server.js","utf8");
const detail=assistance.slice(assistance.indexOf("function DecisionTab({"),assistance.indexOf("function EmbeddedGoogleMap({"));
const reviewReady=assistance.slice(assistance.indexOf("const reviewReadyForVerification ="),assistance.indexOf("const LOCATION_TYPES ="));
const handoff=assistance.slice(assistance.indexOf("const saveAndContinueDonation = async () =>"),assistance.indexOf("const saveOfficialLocation",assistance.indexOf("const saveAndContinueDonation")));
const publishing=donation.slice(donation.indexOf("const createCampaign = async () =>"),donation.indexOf("const updateCampaign",donation.indexOf("const createCampaign = async ()")));
assert(detail.length>10000 && publishing.length>5000,"Required admin flow missing");

// The complete required review must be visible and actionable; no risk bypass.
for(const label of ["Additional Verification","Required Video Verification","Required Site Visit",
"Unresolved Risk Flags","Resolution Notes","Save Review Progress",
"videoVerificationNotes","siteVisitNotes","riskFlags","internalNotes"]){
 assert(detail.includes(label),"Missing conditional review control "+label);
}
assert(detail.includes("reviewDraft.videoVerificationRequired") &&
 detail.includes("reviewDraft.siteVisitRequired"),"Conditional checks must only appear when required");
assert(detail.includes('onReviewChange("videoVerificationStatus","completed")') &&
 detail.includes('onReviewChange("videoVerificationStatus","pending")') &&
 detail.includes('onReviewChange("siteVisitStatus","completed")') &&
 detail.includes('onReviewChange("siteVisitStatus","pending")'),
 "Verification can be marked complete only by deliberate Admin input");
assert(detail.includes("previousRiskFlags") && detail.includes("riskResolutionNoteMissing") &&
 detail.includes("reviewDraft.internalNotes.trim().length < 10"),
 "Resolved risk flag must carry an explanatory audit note");
assert(reviewReady.includes('draft.videoVerificationStatus === "completed"') &&
 reviewReady.includes('draft.siteVisitStatus === "completed"'),
 "Required video and site checks cannot pass as not_required");
assert(!reviewReady.includes('["not_required", "completed"].includes'),
 "Reject false approval-ready state for mandatory additional verification");
assert(detail.includes("!!reviewDraft?.facilityVerificationRequired") &&
 detail.includes("!!reviewDraft?.costVerificationRequired"),
 "Historic required provider and cost checks must remain visible even when category/estimate changes");
assert(detail.includes("billingValid") && detail.includes("recordedAid <= grossCost") &&
 detail.includes('Enter a confirmed cost greater than zero.'),
 "Reject invalid verified expense/previous assistance amounts");
assert(assistance.includes('onSaveVerificationDraft={saveVerificationDraft}'),
 "Review draft save handler must remain wired");
assert(backend.includes("private_verification_incomplete") &&
 backend.includes("residency_verification_method_required"),
 "Backend must still enforce mandatory verification checks");

// The handoff must save two authorized backend steps then navigate, never publish.
assert(handoff.includes('updateRequest("resource_assessment"') &&
 handoff.includes('updateRequest("save_location"') &&
 handoff.includes('router.push({pathname: "/donation-list"'),
 "Verified support plan and public office must be saved before opening campaign");
assert(handoff.indexOf('updateRequest("resource_assessment"')<
 handoff.indexOf('updateRequest("save_location"') &&
 handoff.indexOf('updateRequest("save_location"')<
 handoff.lastIndexOf('router.push({pathname: "/donation-list"'),
 "Support plan/office/campaign order wrong");
assert(!handoff.includes("createCampaign(") && !handoff.includes("publishModuleAnnouncement("),
 "Approval must never auto-publish a donation campaign");

// The backend requires consent on the ORIGINAL resident photo, not just an Admin upload.
assert(publishing.includes('assistanceSource.publicCampaignPhotoConsent !== true') &&
 publishing.includes('assistanceSource.publicCampaignPhotoUrl') &&
 publishing.includes('"Resident Photo Consent Required"'),
 "Give actionable error before publishing an ineligible historical request");
assert(donation.includes("Resident-consented public campaign photo confirmed.") &&
 donation.includes("An Admin-uploaded photo alone is insufficient"),
 "Admin must understand photo consent prerequisite");
assert(backend.includes('"resident_public_campaign_photo_required"') &&
 backend.includes("assistance.publicCampaignPhotoConsent !== true"),
 "Resident-consented photo is a protected backend requirement");
assert(publishing.indexOf('"Resident Photo Consent Required"')<
 publishing.indexOf('secureAdminPost("/api/admin/donations/campaigns"'),
 "Photo consent must fail before any Campaign publish action");
assert(publishing.includes("residentStoryPrivacyReviewed") &&
 publishing.includes('sourceType: openedFromAssistance') &&
 publishing.includes("selectedPublicPhotoUrls") &&
 publishing.includes("officialChannelInstructions"),
 "Privacy, photos, exact source and official channel must remain required");
assert(backend.includes('transaction.update(assistanceRef') &&
 backend.includes('donationCampaignId: campaignRef.id') &&
 backend.includes('"campaign_already_active"'),
 "Backend must atomically link campaigns and reject duplicates");
console.log("PASS: complete conditional LGU review, required video/site/risk and bill validations, save/approval, protected support handoff and consent-aware donation publishing");
