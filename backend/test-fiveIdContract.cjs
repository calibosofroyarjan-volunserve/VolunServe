"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = p => fs.readFileSync(p,"utf8");
const ids = ["national_id","drivers_license","passport","umid","prc_id"];
const sources=[
 "identity-ai/document_screening.py",
 "identity-ai/main.py",
 "backend/selectedIdPolicy.js",
 "backend/server.js",
 "backend/identityIssuerReviewPolicy.js",
 "lib/identityVerification.ts",
 "app/identity-verification.web.tsx",
 "app/identity-verification.tsx",
 "components/identity/DocumentScreeningSummary.tsx",
];
test("all nine identity components expose the same five government ID types",()=>{
 for(const path of sources){
  const content=read(path);
  for(const id of ids)assert.ok(content.includes(id),"Missing "+id+" in "+path);
 }
});
test("unsupported document types are not added to the source selections",()=>{
 for(const p of ["app/identity-verification.web.tsx","app/identity-verification.tsx","lib/identityVerification.ts"]){
  const s=read(p);
  assert.equal(s.includes('value: "school_id"'),false);
  assert.equal(s.includes('value: "other_government_id"'),false);
 }
});
test("school ID and unknown document OCR cannot become verified automatically",()=>{
 const screening=read("identity-ai/document_screening.py");
 const backend=read("backend/selectedIdPolicy.js");
 assert.match(screening,/school_id_not_supported/);
 assert.match(screening,/document_type_not_recognized/);
 assert.match(backend,/text_consistent_unverified/);
 assert.match(backend,/return "failed"/);
});
