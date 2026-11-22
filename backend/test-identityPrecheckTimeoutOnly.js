"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const code = fs.readFileSync("backend/server.js","utf8");

test("only document OCR precheck has extra time; actual face verification stays at 55s",()=>{
  const fn=code.slice(code.indexOf("async function callIdentityAiService("),
    code.indexOf("function diditCleanupFields()"));
  assert.match(fn,/options\.documentPrecheck\s*\?\s*105000\s*:\s*55000/);
  assert.match(fn,/AbortSignal\.timeout\(options\.documentPrecheck\s*\?\s*105000\s*:\s*55000\)/);
  assert.match(fn,/await fetch\(endpoint/);
  assert.match(code,/const result = await callIdentityAiService\(request, \{ documentPrecheck: true \}\)/);
  assert.match(code,/const aiResult = await callIdentityAiService\(request\)/);
  assert.match(code,/IDENTITY_DOC_PRECHECK_COOLDOWN_MS = 8000/);
  assert.match(code,/IDENTITY_DOC_PRECHECK_DAILY_LIMIT = 30/);
});
