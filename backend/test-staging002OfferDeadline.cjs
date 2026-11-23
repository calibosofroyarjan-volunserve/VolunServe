"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {deadlineMs,toIso}=require("./staging002OfferDeadline");
test("numeric and Firestore Timestamp deadlines parse to same absolute UTC millisecond",()=>{
  const t=Date.UTC(2026,10,19,3,35,14);
  assert.equal(deadlineMs(t),t);
  assert.equal(deadlineMs(String(t)),t);
  assert.equal(deadlineMs({seconds:Math.floor(t/1000),nanoseconds:0}),t);
  assert.equal(deadlineMs({_seconds:Math.floor(t/1000),_nanoseconds:0}),t);
  assert.equal(deadlineMs({toMillis:()=>t}),t);
  assert.equal(toIso(t),"2026-11-19T03:35:14.000Z");
});
test("invalid, missing, unsafe, overlarge and nonnumeric timestamps fail closed",()=>{
  for(const v of [undefined,null,"","NaN","tomorrow","2026-11-19","3.35AM",0,-1,Infinity,NaN,
    {},{seconds:"1700000000"},{seconds:1,nanoseconds:1e10},
    {toMillis:()=>NaN},{toMillis:()=>{throw Error("fake")}},
    4102444800001,Number.MAX_SAFE_INTEGER]){
    assert.equal(deadlineMs(v),null,String(v));
  }
  assert.equal(toIso(null),null);
});
