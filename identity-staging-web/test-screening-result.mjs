import test from "node:test";
import assert from "node:assert/strict";
import {documentVerdict} from "./screening-result.mjs";
const five=["national_id","drivers_license","passport","umid","prc_id"];
for(const type of five){
 test(type+": recognized text never says fully verified",()=>{
  const a=documentVerdict({decision:"manual_review",documentScreening:{status:"text_consistent_unverified",declaredIdType:type,detectedIdType:type}});
  assert.equal(a.kind,"review");assert.match(a.description,/unverified/i);
 });
 test(type+": school ID cannot pass",()=>{
  const a=documentVerdict({decision:"failed",documentScreening:{status:"unsupported",declaredIdType:type,detectedIdType:null}});
  assert.equal(a.kind,"rejected");assert.match(a.heading,/auto rejected/i);
 });
 test(type+": unreadable ID cannot pass",()=>{
  const a=documentVerdict({decision:"failed",documentScreening:{status:"inconclusive",declaredIdType:type,detectedIdType:null}});
  assert.equal(a.kind,"retry");
 });
}
test("wrong ID type cannot be accepted even if another supported type recognized",()=>{
 const a=documentVerdict({decision:"manual_review",documentScreening:{status:"mismatch",declaredIdType:"national_id",detectedIdType:"passport"}});
 assert.equal(a.kind,"rejected");
});
test("status and declared document must agree",()=>{
 const a=documentVerdict({decision:"manual_review",documentScreening:{status:"text_consistent_unverified",declaredIdType:"national_id",detectedIdType:"prc_id"}});
 assert.equal(a.kind,"rejected");
});
test("server errors without screening must not falsely claim a government ID rejected",()=>{
 const a=documentVerdict({});
 assert.equal(a.kind,"retry");
 assert.doesNotMatch(a.heading,/auto rejected/i);
});

test("unknown ID cannot be displayed as accepted even if spoofed response claims consistency",()=>{
 const a=documentVerdict({decision:"manual_review",documentScreening:{status:"text_consistent_unverified",declaredIdType:"school_id",detectedIdType:"school_id"}});
 assert.equal(a.kind,"rejected");
});

test("unreadable claimed National ID routes to Admin to request rescan, not automatic approval",()=>{
 const a=documentVerdict({decision:"manual_review",reviewTrack:"blurry_id_review",documentScreening:{
   status:"inconclusive",declaredIdType:"national_id",detectedIdType:null,imageQualityStatus:"low"}});
 assert.equal(a.kind,"review");
 assert.match(a.heading,/blurry national id claim/i);
 assert.match(a.description,/not approved/i);
});
test("partly readable National ID with poor sharpness stays blurry Admin review",()=>{
 const a=documentVerdict({decision:"manual_review",reviewTrack:"blurry_id_review",documentScreening:{
   status:"text_consistent_unverified",declaredIdType:"national_id",detectedIdType:"national_id",imageQualityStatus:"low"}});
 assert.equal(a.kind,"review");assert.match(a.heading,/blurry/i);
});
test("clear profile-name possible match is priority Admin review not auto verified",()=>{
 const a=documentVerdict({decision:"manual_review",reviewTrack:"priority_admin_review",documentScreening:{
   status:"text_consistent_unverified",declaredIdType:"national_id",detectedIdType:"national_id",imageQualityStatus:"adequate",profileNameCheck:"possible_match"}});
 assert.equal(a.kind,"review");
 assert.match(a.heading,/priority admin review/i);
 assert.match(a.description,/not prove authentic issuance/i);
});
test("school ID cannot become priority review even if malicious response says it is",()=>{
 const a=documentVerdict({decision:"manual_review",reviewTrack:"priority_admin_review",documentScreening:{
   status:"unsupported",declaredIdType:"national_id",detectedIdType:null}});
 assert.equal(a.kind,"rejected");
});
