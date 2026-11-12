"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const server=fs.readFileSync("backend/server.js","utf8");
test("preserve protected production email-verified auth gate",()=>{
 assert.match(server,/isVerifiedFirebaseToken/);
 assert.match(server,/isCompletedVolunServeProfile/);
 assert.match(server,/Auth-only registration UIDs must not bypass email verification/);
});
test("release candidate keeps staging-only CORS origin out of production",()=>{
 assert.doesNotMatch(server,/stagingTestOrigins/);
 assert.doesNotMatch(server,/volunserve-backend-staging\.onrender\.com/);
});
test("identity endpoints enforce five supported IDs and fail closed",()=>{
 assert.match(server,/selectedIdRecognized/);
 assert.match(server,/enforceSelectedIdDecision/);
 assert.match(server,/classifyIdentityReviewTrack/);
 assert.match(server,/issuerReviewAttested/);
 assert.match(server,/independent_id_review_required/);
});
test("no unconditional automatic verified-resident grant from OCR",()=>{
 const policy=require("./selectedIdPolicy");
 const matched={status:"text_consistent_unverified",declaredIdType:"national_id",detectedIdType:"national_id",imageQualityStatus:"adequate",authenticityVerified:false};
 assert.equal(policy.enforceSelectedIdDecision("verified",matched,false),"manual_review");
 const school={status:"unsupported",declaredIdType:"national_id",detectedIdType:null};
 assert.equal(policy.enforceSelectedIdDecision("verified",school,true),"failed");
});

// Include the final integration hardening contract in the existing protected CI.
require("./test-identity-final-admin-only");
