"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const test = require("node:test");
const source = fs.readFileSync("backend/server.js", "utf8");

test("confirmed account name is required for National ID precheck pass", () => {
  const i = source.indexOf('"/api/identity/document/precheck"');
  assert.ok(i >= 0, "Authenticated document precheck must exist");
  const j = source.indexOf('app.get(', i + 10);
  const precheck = source.slice(i, j > i ? j : i + 14000);
  assert.match(precheck, /requireFirebaseUser/);
  assert.match(precheck, /x-volunserve-document-precheck-consent/);
  assert.match(precheck, /declared !== "national_id" \|\| screening\.profileNameCheck === "possible_match"/);
  assert.match(precheck, /const nameConflict = screening\.profileNameCheck === "possible_conflict"/);
  assert.match(precheck, /result\?\.outcome === "pass"/);
  assert.match(precheck, /selectedIdRecognized\(screening\)/);
  assert.match(precheck, /The name read from the National ID appears different/);
  assert.match(precheck, /account name could not be confirmed/);
  assert.match(precheck, /school_id_not_supported/);
  assert.match(precheck, /document_back_ocr_inconclusive/);
  assert.match(precheck, /authenticityVerified: false/);
  assert.match(precheck, /livenessVerified: false/);
});
