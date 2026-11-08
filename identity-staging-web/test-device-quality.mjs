import test from "node:test";
import assert from "node:assert/strict";
import {assessCameraSample} from "./device-quality.mjs";
test("solid camera signal is not confused with biometric verification",()=>{
 const r=assessCameraSample({width:1280,height:720,fps:24,lighting:{acceptable:true}});
 assert.equal(r.status,"camera_basic_checks_passed");
 assert.match(r.note,/cannot validate face-match accuracy/i);
});
test("low fps must be flagged",()=>{
 const r=assessCameraSample({width:1280,height:720,fps:4,lighting:{acceptable:true}});
 assert.equal(r.status,"needs_review");assert.ok(r.warnings.some(x=>/frame rate/i.test(x)));
});
test("low resolution requires review",()=>{
 const r=assessCameraSample({width:320,height:240,fps:20,lighting:{acceptable:true}});
 assert.equal(r.status,"needs_review");assert.ok(r.warnings.some(x=>/resolution/i.test(x)));
});
test("poor lighting requires review",()=>{
 const r=assessCameraSample({width:1280,height:720,fps:20,lighting:{acceptable:false}});
 assert.equal(r.status,"needs_review");assert.ok(r.warnings.some(x=>/lighting/i.test(x)));
});
test("missing metrics are not passes",()=>{
 const r=assessCameraSample({});
 assert.equal(r.status,"needs_review");assert.ok(r.warnings.length>=2);
});
test("interrupted camera cannot pass",()=>{
 const r=assessCameraSample({width:1280,height:720,fps:20,lighting:{acceptable:true},interrupted:true});
 assert.equal(r.status,"needs_review");
});
