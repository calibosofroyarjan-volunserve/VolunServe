"use strict";
// Source-contract regression checks for QA-only Admin reason dropdown.
// The existing Render review endpoint still consumes one notes string.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const s=fs.readFileSync("app/(admin)/identity-reviews.tsx","utf8");
const reasons=[
 "Government ID is blurry or unreadable",
 "Selfie is blurry or the face is not clearly visible",
 "Face comparison could not be confirmed",
 "Uploaded document is not a National ID",
 "School ID or unsupported document",
 "Government ID or selfie photo is incomplete or missing",
 "Government ID authenticity could not be independently confirmed",
 "Other (Specify)"
];
for(const reason of reasons)assert(s.includes(reason),reason+" missing");
assert(s.includes("ADMIN_REVIEW_REASONS.filter(reason => !reason.faceOnly || faceOnlyReview)"),"National ID-specific reason only in original face-only");
assert(s.includes('setNotes(reason.value === "other" ? "" : reason.label)'),"dropdown must autofill notes and clear Other");
assert(s.includes('placeholder={selectedReviewReason === "other"'),"Other free-text input missing");
assert(s.includes('!!selectedReviewReason || notes.trim().length<10'),"Verification must not use rejection preset");
assert(s.includes('action === "verify" ? validationMethod : ""'),"Keep independent approval method");
assert(s.includes('issuerReviewAttested: action === "verify" && issuerReviewAttested'),"Admin ID attestation intact");
assert(s.includes('notes: notes.trim()'),"Existing Admin API notes contract must remain");
assert(s.includes('onPress={onRetry}')&&s.includes('onPress={onReject}')&&s.includes('onPress={onVerify}'),"Existing decision actions lost");
assert(s.includes("setSelectedReviewReason(\"\")"),"Reason must clear on case change");
console.log("PASS: 8 retry/reject quick reasons, Other free text, approval segregation and existing API preserved");
