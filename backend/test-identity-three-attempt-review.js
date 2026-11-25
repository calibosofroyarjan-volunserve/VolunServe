"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const server=fs.readFileSync("backend/server.js","utf8");

const outcomeSource=server.match(/function identityAttemptOutcome\(decision, attempts\) \{[\s\S]*?\n\}/);
assert.ok(outcomeSource,"Missing active production attempt policy");
const outcome=vm.runInNewContext(outcomeSource[0]+"\nidentityAttemptOutcome",{MAX_IDENTITY_AI_ATTEMPTS:3});

const trackSource=server.match(/const finalReviewTrack = decision === "failed"[\s\S]*?;/);
assert.ok(trackSource,"Missing exhausted-retry review track");
const finalReviewTrack=vm.runInNewContext(
  "(function(decision,result,reviewTrack){"+trackSource[0]+"return finalReviewTrack;})"
);
function route(decision,attempts,baseTrack="none"){
  const result=outcome(decision,attempts);
  return {status:result.status,requiresManualReview:result.requiresManualReview,
    reviewTrack:finalReviewTrack(decision,result,baseTrack)};
}

test("First and second failed attempts remain retryable Basic Resident",()=>{
 for(const attempt of [1,2]){
  assert.deepEqual(route("failed",attempt),{
    status:"failed",requiresManualReview:false,reviewTrack:"none"
  });
 }
});
test("Third failed attempt is pending Admin review with explicit 3-failure reason",()=>{
 assert.deepEqual(route("failed",3),{
  status:"pending",requiresManualReview:true,reviewTrack:"three_failed_attempts"
 });
});
test("Blurry claimed National ID is referred immediately without auto approval",()=>{
 assert.deepEqual(route("manual_review",1,"blurry_id_review"),{
  status:"pending",requiresManualReview:true,reviewTrack:"blurry_id_review"
 });
});
test("Even AI-verified candidate remains pending Admin; never automatic Verified Resident",()=>{
 assert.deepEqual(route("verified",1,"priority_admin_review"),{
  status:"pending",requiresManualReview:true,reviewTrack:"priority_admin_review"
 });
});
test("All records and queue API retain the special 3-failure reason",()=>{
 const routeSource=server.slice(server.indexOf('"/api/identity/verify"'),
   server.indexOf('"/api/admin/identity/reviews"'));
 assert.ok(routeSource.length>6000,"Identity verify route boundary is missing");
 assert.match(routeSource,/reviewTrack: finalReviewTrack,/);
 assert.match(server,/\["blurry_id_review", "priority_admin_review", "standard_admin_review", "three_failed_attempts"\]/);
 assert.doesNotMatch(routeSource,/identityVerified:\s*true/);
});
test("Unsupported document remains unapprovable despite escalation",()=>{
 const policy=require("./selectedIdPolicy");
 const unsupported={status:"unsupported",declaredIdType:"national_id",
  detectedIdType:null,warningCodes:["school_id_not_supported"]};
 assert.equal(policy.selectedIdRecognized(unsupported),false);
 assert.equal(policy.enforceSelectedIdDecision("verified",unsupported,true),"failed");
 assert.equal(route("failed",3).reviewTrack,"three_failed_attempts");
 const adminRoute=server.slice(server.indexOf('"/api/admin/identity/reviews/:uid/decision"'),
   server.indexOf('"/api/admin/assistance/requests/:requestId/start-review"'));
 assert.match(adminRoute,/if \(!selectedIdRecognized\(selectedIdCheck\)\)/);
 assert.match(adminRoute,/selected_government_id_not_recognized/);
});
