"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {selectedIdRecognized, enforceSelectedIdDecision} = require("./selectedIdPolicy");
const valid = type => ({
  status:"text_consistent_unverified", declaredIdType:type,
  detectedIdType:type, authenticityVerified:false,
});
for (const type of ["national_id","drivers_license","passport","umid","prc_id"]) {
  test("recognizes selected "+type+" type without claiming authenticity", () => {
    assert.equal(selectedIdRecognized(valid(type)),true);
    assert.equal(enforceSelectedIdDecision("verified",valid(type),false),"manual_review");
    assert.equal(enforceSelectedIdDecision("manual_review",valid(type),false),"manual_review");
  });
}
for (const [label,screening] of [
  ["school ID",{status:"unsupported",declaredIdType:"national_id",detectedIdType:null}],
  ["wrong type",{status:"mismatch",declaredIdType:"national_id",detectedIdType:"drivers_license"}],
  ["unreadable",{status:"inconclusive",declaredIdType:"national_id",detectedIdType:null}],
  ["generic other",{status:"text_consistent_unverified",declaredIdType:"other_government_id",detectedIdType:"other_government_id"}],
  ["missing",null],
]) {
  test("rejects "+label+" even with perfect face match",()=> {
    assert.equal(selectedIdRecognized(screening),false);
    assert.equal(enforceSelectedIdDecision("verified",screening,true),"failed");
    assert.equal(enforceSelectedIdDecision("manual_review",screening,false),"failed");
  });
}
