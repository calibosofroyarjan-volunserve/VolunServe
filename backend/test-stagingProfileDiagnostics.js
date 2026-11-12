"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {classifyStagingFirestoreFailure: classify}=require("./stagingProfileDiagnostics");

test("Firestore gRPC codes are reduced to a fixed privacy-safe error category",()=>{
 for(const [input,want] of [
   [7,"PERMISSION_DENIED"],
   [14,"UNAVAILABLE"],
   [5,"NOT_FOUND"],
   [16,"UNAUTHENTICATED"],
   ["permission-denied","PERMISSION_DENIED"],
   ["failed-precondition","FAILED_PRECONDITION"],
   ["resource-exhausted","RESOURCE_EXHAUSTED"],
   [13,"INTERNAL"],
   [42,"OTHER"],["PRIVATE_user_uid_or_email","OTHER"],[undefined,"OTHER"]
 ]){
  const err={code:input,message:"privateKey user@email.test sensitive path users/uid123",stack:"secret data"};
  const result=classify(err);
  assert.equal(result,want);
  const serialized=JSON.stringify(result);
  for(const bad of ["privateKey","email.test","users/","uid123"])assert.ok(!serialized.includes(bad));
 }
});

test("No exception message or UID reaches staging logger",()=>{
 const source=fs.readFileSync("backend/server.js","utf8");
 const segment=source.slice(source.indexOf("if (profileError?.statusCode !== 404)"),
                            source.indexOf('error: "profile_check_unavailable"'));
 assert.ok(segment.includes('console.warn("STAGING_PROFILE_READ_FAILURE", classifyStagingFirestoreFailure(profileError))'));
 assert.ok(!segment.includes("profileError.message"));
 assert.ok(!segment.includes("decodedToken.uid"));
 assert.ok(!segment.includes("error.stack"));
 assert.ok(source.includes('if (!isCompletedVolunServeProfile(storedProfile) && !validStaffProof)'));
 assert.ok(source.includes('error: "registration_incomplete"'));
});
