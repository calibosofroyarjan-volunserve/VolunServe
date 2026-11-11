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
