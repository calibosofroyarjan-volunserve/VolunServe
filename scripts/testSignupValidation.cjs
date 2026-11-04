"use strict";
/**
 * Fast, offline tests for the shared Signup email policy and collision
 * message mapping. No Firebase credentials, emulators, or writes required.
 * Run from repo root: node scripts/testSignupValidation.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function loadTypescriptModule(filename, injectRequire = () => {throw new Error("Unexpected import");}) {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
    fileName: filename,
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error("TypeScript syntax errors in " + filename + ": " + errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText," ")).join("; "));
  const mod = {exports: {}};
  new Function("require", "module", "exports", compiled.outputText)(injectRequire, mod, mod.exports);
  return mod.exports;
}

const policy = loadTypescriptModule("lib/registrationEmailPolicy.ts", (path) => {
  if (path === "./disposableEmailDomains.generated") return {GENERATED_DISPOSABLE_EMAIL_DOMAINS: []};
  throw new Error("Unexpected email-policy import: " + path);
});
const messages = loadTypescriptModule("lib/authUserMessages.ts");
const valid = [
  "example@gmail.com", "example+test@gmail.com", "person@legitimate.co",
  "name@agency.gov.ph", "name@deped.gov.ph",
];
const bad = [
  ["user@gmail.co", /Did you mean @gmail.com/],
  ["user@gmail.con", /Did you mean @gmail.com/],
  ["user@gmial.com", /Did you mean @gmail.com/],
  ["user@gmail", /complete, valid email/],
  ["user@gmail..com", /complete, valid email/],
  ["user@-gmail.com", /complete, valid email/],
  ["user@yopmail.com", /Temporary email/],
  ["user@sub.mailinator.com", /Temporary email/],
  ["", /required/],
];

let checks = 0;
for (const email of valid) {
  assert.equal(policy.getRegistrationEmailError(email), null, "Expected accepted email: " + email);
  checks++;
}
for (const [email, expected] of bad) {
  assert.match(String(policy.getRegistrationEmailError(email)), expected, "Expected rejected email: " + email);
  checks++;
}
assert.equal(messages.isRegistrationEmailConflict({code: "auth/email-already-in-use"}), true);
checks++;
assert.equal(messages.isRegistrationEmailConflict({
  message: "This account already has a VolunServe profile. Please sign in instead or use a different account for this registration."
}), true);
checks++;
assert.equal(messages.isRegistrationEmailConflict({code: "auth/invalid-email"}), false);
checks++;
assert.match(messages.REGISTRATION_EMAIL_CONFLICT_MESSAGE, /already registered/);
checks++;
console.log("PASS: " + checks + " email validation and duplicate-account message tests.");
