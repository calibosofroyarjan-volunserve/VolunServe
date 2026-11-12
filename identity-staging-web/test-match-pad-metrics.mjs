import test from "node:test";
import assert from "node:assert/strict";
import {parseScoreList,calculateMatchPadMetrics,wilsonInterval,DEFAULT_MATCH_THRESHOLD}
  from "./match-pad-metrics.mjs";

test("Threshold exactly 0.78 uses >= for possible match, and < for miss",()=>{
  assert.equal(DEFAULT_MATCH_THRESHOLD,0.78);
  const result=calculateMatchPadMetrics({
    genuineScores:[0.91,0.78,0.70],
    impostorScores:[0.78,0.30],
    printAttempts:4,printAccepted:1,
    screenAttempts:3,screenAccepted:0
  });
  assert.equal(result.falseNonMatch.trials,3);
  assert.equal(result.falseNonMatch.events,1);
  assert.equal(result.falseNonMatch.rate,1/3);
  assert.equal(result.falseMatch.trials,2);
  assert.equal(result.falseMatch.events,1);
  assert.equal(result.falseMatch.rate,.5);
  assert.equal(result.challengeAcceptanceObserved.printedPhoto.rate,.25);
  assert.equal(result.challengeAcceptanceObserved.screenReplay.rate,0);
  assert.equal(result.attackAcceptanceObserved,true);
});

test("Empty data remain NOT measured, never falsely 0% error",()=>{
 const r=calculateMatchPadMetrics();
 assert.equal(r.falseMatch.rate,null);
 assert.equal(r.falseNonMatch.rate,null);
 assert.equal(r.falseMatch.wilson95,null);
 assert.equal(r.pairedMatchingMeasurementsPresent,false);
 assert.equal(r.challengeObservationsPresent,false);
 assert.equal(r.independentPadValidated,false);
 assert.equal(r.realDeviceMatchAccuracyValidated,false);
 assert.equal(r.autoVerificationAllowed,false);
});

test("Even perfect fabricated examples do not grant PAD or auto approval",()=>{
 const r=calculateMatchPadMetrics({
   genuineScores:[.95,.96], impostorScores:[.1,.2],
   printAttempts:3,printAccepted:0,
   screenAttempts:2,screenAccepted:0
 });
 assert.equal(r.falseMatch.rate,0);
 assert.ok(r.falseMatch.wilson95.upper>0);
 assert.equal(r.independentPadValidated,false);
 assert.equal(r.issuerAuthenticityValidated,false);
 assert.equal(r.autoVerificationAllowed,false);
 assert.equal(r.finalApproval,"AUTHORIZED_ADMIN_ONLY");
 assert.equal(JSON.stringify(r).includes(".95"),false);
});

test("Threshold sweep retains error definitions",()=>{
 const r=calculateMatchPadMetrics({genuineScores:[.81],impostorScores:[.79],threshold:.8});
 assert.equal(r.falseMatch.events,0);
 assert.equal(r.falseNonMatch.events,0);
 assert.equal(r.thresholdComparison.find(x=>x.threshold===.78).falseMatch.events,1);
});

test("Score parser refuses names, IDs, photos, and nonnumeric values",()=>{
 assert.deepEqual(parseScoreList("0.78, .95\n 1.0;0"),[.78,.95,1,0]);
 for(const value of ["name:Arvee, 0.8","user@example.com","data:image/png;base64","0.9,NaN",
                    "0.8,2","0.8,-1","001","1.01","0.78 0.85 john","Infinity"]){
  assert.throws(()=>parseScoreList(value));
 }
 assert.throws(()=>parseScoreList("0.4 ".repeat(2001)));
});

test("Invalid or impossible attack trial counts fail closed",()=>{
 for(const bad of [
    {printAttempts:2,printAccepted:3},
    {screenAttempts:1,screenAccepted:2},
    {screenAttempts:-1},
    {screenAttempts:2.3},
    {printAccepted:Infinity},
    {threshold:0},
    {threshold:1.02},
    {genuineScores:[NaN]},
    {impostorScores:[-1]}
 ]){
  assert.throws(()=>calculateMatchPadMetrics(bad));
 }
});

test("Wilson intervals are bounded and nonzero upper for zero observed matches",()=>{
 const zero=wilsonInterval(0,5), all=wilsonInterval(5,5);
 assert.equal(zero.lower,0);
 assert.ok(zero.upper>0&&zero.upper<1);
 assert.equal(all.upper,1);
 assert.ok(all.lower>0);
});
