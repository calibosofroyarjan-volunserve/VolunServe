"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const gate = require("./guard-live-hosting-source.cjs");
const base = "e83f4a72c7cb733ff7bb888a6ac19bf3c0f076c4";
const head = "17297a7f2d59910cb7c495def6779c0e1c2bbbec";
const changed = ["app/(tabs)/volunteer.tsx", "constants/volunserveLiveUi.ts"];
const env = { VOLUNSERVE_APPROVED_LIVE_SHA: base, VOLUNSERVE_APPROVED_CANDIDATE_SHA: head,
 VOLUNSERVE_APPROVED_FILES_JSON: JSON.stringify(changed) };
const response = (sha=base, type="application/json", status=200) => ({
  ok: status===200, status, headers: {get:()=>type},
  json:async()=>({app:"VolunServe",firebaseProject:"volunserve-3aa5b",revision:sha})
});
function mockGit(args) {
  if (args[0]==="rev-parse") return head+"\n";
  if (args[0]==="cat-file" || args[0]==="merge-base") return "";
  if (args[0]==="status") return "";
  if (args[0]==="diff") return "M\0"+changed[0]+"\0A\0"+changed[1]+"\0";
  throw Error("Unexpected git command: "+args[0]);
}
test("valid exact-live, exact-candidate, approved-files check",async()=>{
  const calls=[];
  const result=await gate.runGuard({env,git:mockGit,fetchImpl:async(url)=>{calls.push(url);return response();}});
  assert.equal(result.live,base); assert.equal(calls.length,2);
  assert.ok(calls.some(x=>x.includes("volunserve.com")));
  assert.ok(calls.some(x=>x.includes("volunserve-3aa5b.web.app")));
});
test("rejects unapproved file",()=>assert.throws(()=>gate.checkFileApproval(["app/signup.tsx"],new Set(changed)),/Unapproved/));
test("rejects deletion and rename",()=>{
  assert.throws(()=>gate.parseNameStatusZ("D\0app/login.tsx\0"),/Blocked/);
  assert.throws(()=>gate.parseNameStatusZ("R100\0old.ts\0new.ts\0"),/Blocked/);
});
test("rejects missing, duplicate or invalid file approvals",()=>{
  assert.throws(()=>gate.parseApprovedFiles(""),/JSON/);
  assert.throws(()=>gate.parseApprovedFiles('["app/a","app/a"]'),/Duplicate/);
  assert.throws(()=>gate.parseApprovedFiles('["../oops"]'),/Invalid/);
  assert.throws(()=>gate.checkFileApproval(["app/a"],new Set(["app/a","app/b"])),/missing/);
});
test("rejects stale live marker even if source is valid",async()=>{
  await assert.rejects(gate.runGuard({env,git:mockGit,fetchImpl:async()=>response("0".repeat(40))}),/differs/);
});
test("rejects mismatch across custom domain and Firebase alias",async()=>{
  let calls=0; await assert.rejects(gate.runGuard({env,git:mockGit,fetchImpl:async()=>response(++calls===1?base:"0".repeat(40))}),/differs/);
});
test("rejects unavailable marker; does not assume success",async()=>{
  await assert.rejects(gate.runGuard({env,git:mockGit,fetchImpl:async()=>{throw Error("blocked");}}),/Cannot verify/);
});
test("rejects HTML fallback instead of release JSON",async()=>{
  await assert.rejects(gate.runGuard({env,git:mockGit,fetchImpl:async()=>response(base,"text/html")}),/did not return a JSON/);
});
test("rejects candidate that is not exact approved head",async()=>{
  await assert.rejects(gate.runGuard({env:{...env,VOLUNSERVE_APPROVED_CANDIDATE_SHA:"0".repeat(40)},git:mockGit,fetchImpl:async()=>response()}),/not approved candidate/);
});
test("rejects candidate without approved live ancestry",async()=>{
  const git=args=>{if(args[0]==="merge-base")throw Error("not ancestor");return mockGit(args);};
  await assert.rejects(gate.runGuard({env,git,fetchImpl:async()=>response()}),/not descended/);
});
test("rejects dirty tracked files",async()=>{
  const git=args=>args[0]==="status"?" M app/login.tsx":mockGit(args);
  await assert.rejects(gate.runGuard({env,git,fetchImpl:async()=>response()}),/uncommitted/);
});
test("hosting-only guard never approves backend, Firebase rules, identity AI or legacy deploy workflows",()=>{
  for(const path of ["backend/server.js","functions/index.js","identity-ai/app.py", "firestore.rules", "storage.rules", "firebase.json", ".github/workflows/release-any.yml"]) {
    assert.throws(()=>gate.checkFileApproval([path],new Set([path])),/protected service\/config/);
  }
});
