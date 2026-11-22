"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const web = fs.readFileSync("app/identity-verification.web.tsx","utf8");
const client = fs.readFileSync("lib/identityVerification.ts","utf8");
const python = fs.readFileSync("identity-ai/main.py","utf8");
const server = fs.readFileSync("backend/server.js","utf8");
const normalized = x => x.replace(/\r\n/g,"\n");

test("web National ID wizard has two distinct captures",()=>{
  assert.match(normalized(web), /useState<CapturedIdentityMedia \| null>\(null\);\s*const \[idCaptureSide/);
  assert.match(web, /idCaptureSide === "back"/);
  assert.match(web, /setIdBackDocument\(media\)/);
  assert.match(web, /onPickBack=\{\(\) => chooseIdDocument\("back"\)\}/);
  assert.match(web, /disabled=\{!idDocument \|\| !idBackDocument\}/);
  assert.match(web, /National ID BACK Required/);
});
test("web submit includes both ID photos and private user consent",()=>{
  assert.match(web, /idType,\s*idDocument,\s*idBackDocument,\s*selfie/);
  assert.match(web, /if \(!consent\)/);
  assert.match(client, /formData,\s*"idBackDocument",\s*input\.idBackDocument/);
  assert.match(client, /getAuthenticatedUser\(\)/);
  assert.match(client, /Authorization: \x60Bearer \$\{token\}\x60/);
});
test("Python OCR checks both sides when provided without changing legacy upload",()=>{
  assert.match(python, /id_back_upload = form\.get\("idBackDocument"\)/);
  assert.match(python, /screen_national_id_both_sides,/);
  assert.match(python, /if id_back_bytes is not None/);
  assert.match(python, /else:\s*document_screening = await asyncio\.to_thread\(\s*screen_government_id/);
});
test("verified cannot be granted from an AI-only decision",()=>{
  assert.match(server, /const decision = requireAdminFinalApproval\(rawDecision\)/);
  assert.match(server, /const status = requiresManualReview \? "pending" : "failed"/);
});

test("staging web client must never fall back to production backend", ()=>{
  assert.match(client, /firebaseTarget === "staging" && value !== STAGING_IDENTITY_BACKEND_URL/);
  assert.match(client, /Staging identity upload blocked: configure EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL/);
  assert.match(client, /firebaseTarget !== "staging" && value === STAGING_IDENTITY_BACKEND_URL/);
});

test("staging Admin identity review must only call staging backend", ()=>{
  const admin = fs.readFileSync("app/(admin)/identity-reviews.tsx", "utf8");
  assert.match(admin, /const IS_STAGING = process\.env\.EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET === "staging"/);
  assert.match(admin, /if \(IS_STAGING && BACKEND_URL !== STAGING_BACKEND_URL\)/);
  assert.match(admin, /Staging Admin Identity Review blocked: staging backend URL required/);
});
