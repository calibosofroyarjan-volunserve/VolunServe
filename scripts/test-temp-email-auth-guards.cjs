"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadTsModule(relPath, linked = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const scopedRequire = (request) => {
    if (request in linked) return linked[request];
    throw new Error("Unexpected test import: " + request);
  };
  new Function("require", "module", "exports", js)(scopedRequire, module, module.exports);
  return module.exports;
}
const generated = loadTsModule("lib/disposableEmailDomains.generated.ts");
const policy = loadTsModule("lib/registrationEmailPolicy.ts", {
  "./disposableEmailDomains.generated": generated,
});
const isDisposable = policy.isKnownDisposableEmail;

test("known temp email providers and subdomains are blocked", () => {
  for (const address of [
    "test@mailinator.com", "test@sub.yopmail.com", "test@tempmail.com",
    "TEST@10MINUTEMAIL.COM", "test@guerrillamail.com",
  ]) assert.equal(isDisposable(address), true, address);
});
test("major established providers remain eligible", () => {
  for (const address of [
    "test@gmail.com", "test@outlook.com", "test@yahoo.com", "test@icloud.com", "test@proton.me",
  ]) assert.equal(isDisposable(address), false, address);
});
test("maintained denylist is loaded, not replaced by short fallback list", () => {
  assert.ok(generated.GENERATED_DISPOSABLE_EMAIL_DOMAINS.length >= 50000);
  assert.equal(typeof isDisposable, "function");
});
test("signup and login code paths share the policy", () => {
  const source = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  for (const p of ["app/signup.tsx", "app/signup.web.tsx", "app/login.tsx", "app/_layout.tsx", "app/admin-request.tsx"]) {
    assert.match(source(p), /isKnownDisposableEmail/, p);
  }
  assert.match(source("lib/firebaseAuth.ts"), /assertAcceptedEmail\(submittedEmail\)/);
  assert.match(source("lib/firebaseAuth.ts"), /assertAcceptedEmail\(email\)/);
  assert.match(source("lib/firebaseAuth.ts"), /assertAcceptedEmail\(result\.user\.email\)/);
});
