import test from "node:test";
import assert from "node:assert/strict";
import {QA_CASES,buildDeviceQaReport} from "./pad-qa-report.mjs";

test("All scenarios start not tested; independent PAD and face match NEVER certified",()=>{
 const report=buildDeviceQaReport();
 assert.equal(report.counts.not_tested,QA_CASES.length);
 assert.equal(report.counts.pass,0);
 assert.equal(report.independentPadValidated,false);
 assert.equal(report.faceMatchAccuracyValidated,false);
 assert.equal(report.autoApprovalAuthorized,false);
});
test("Observed printed photo or screen replay acceptance is a risk",()=>{
 for(const scenario of ["print_attack","screen_replay"]){
  const report=buildDeviceQaReport({device:"android_chrome",observations:{[scenario]:"fail"}});
  assert.equal(report.observedSpoofAcceptance,true);
  assert.equal(report.counts.fail,1);
  assert.equal(report.independentPadValidated,false);
 }
});
test("Even all passing manual observations do not certify identity",()=>{
 const observations=Object.fromEntries(QA_CASES.map(x=>[x.id,"pass"]));
 const report=buildDeviceQaReport({device:"windows_edge",observations});
 assert.equal(report.counts.pass,QA_CASES.length);
 assert.equal(report.independentPadValidated,false);
 assert.equal(report.faceMatchAccuracyValidated,false);
 assert.match(report.assurance,/NOT_CERTIFIED/);
});
test("No names, uploaded IDs, arbitrary device strings or photos are included",()=>{
 const report=buildDeviceQaReport({
  device:"Samsung A07 5G - personal serial",
  observations:{selfie_camera:"pass",screen_replay:"failed",fullName:"private-name",
                idPhoto:"base64-sensitive-image",unexpected:"pass"}
 });
 const serialized=JSON.stringify(report);
 assert.equal(report.device,"unspecified");
 assert.equal(report.counts.pass,1);
 assert.equal(report.counts.not_tested,QA_CASES.length-1);
 for(const token of ["private-name","base64-sensitive-image","personal serial","fullName","idPhoto"]){
   assert.equal(serialized.includes(token),false);
 }
});
