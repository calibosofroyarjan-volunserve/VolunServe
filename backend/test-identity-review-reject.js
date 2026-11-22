"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync(require("node:path").join(__dirname,"server.js"),"utf8");
const start=source.indexOf('"/api/admin/identity/reviews/:uid/decision"');
const end=source.indexOf('"/api/admin/assistance/requests/',start);
const route=source.slice(start,end);

test("distinct rejection needs authorized Admin and a written reason",()=>{
 assert(start>0&&end>start);
 assert.match(route,/requireFirebaseUser/);
 assert.match(route,/requireOperationalAdmin/);
 assert.match(route,/action !== "reject"/);
 assert.match(route,/action === "reject" && notes\.length < 10/);
 assert.match(route,/manualReviewDecision:[\s\S]*?"rejected"/);
 assert.match(route,/action === "reject" \? "rejected" : "retry_required"/);
});

test("rejection is not verification or an account ban",()=>{
 assert.match(route,/currentStatus === "verified"/);
 assert.match(route,/transaction\.set\(\s*userRef,[\s\S]*?identityVerified: false/);
 assert.match(route,/Resident Identity Verification Rejected/);
 assert.match(route,/manualReviewDecision: action === "reject"/);
 assert.match(route,/aiAttemptCount: 0/);
 assert.doesNotMatch(route,/auth\.deleteUser\(/);
 assert.doesNotMatch(route,/disabled:\s*true/);
});

test("previous verify and retry protections remain",()=>{
 assert.match(route,/ocr_only_review_requires_rescan/);
 assert.match(route,/selected_government_id_not_recognized/);
 assert.match(route,/reviewIssuerEvidence\(/);
 assert.match(route,/issuerReviewAttested/);
 assert.match(route,/action === "require_retry" &&\s*notes\.length < 5/);
});
