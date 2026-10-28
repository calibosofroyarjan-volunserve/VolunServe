"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("Resident web and native authentication never use blocking browser dialogs", () => {
  for (const file of ["app/login.web.tsx", "app/login.tsx"]) {
    const text = read(file);
    assert.doesNotMatch(text, /\b(?:window\.)?(?:alert|confirm)\s*\(/, file);
    assert.match(text, /import AuthFeedback/, file);
    assert.match(text, /<AuthFeedback/, file);
    assert.match(text, /showError\(/, file);
    assert.match(text, /showSuccess\(/, file);
    assert.match(text, /onDismiss=\{clearFeedback\}/, file);
    assert.match(text, /clearFeedback\(\)/, file);
    assert.match(text, /signIn|handleLogin/, file);
    assert.match(text, /profile\.role === "admin" \|\| profile\.role === "superadmin"/, file);
  }
});

test("Authentication feedback is accessible, nonblocking, dismissible, and readable", () => {
  const source = read("components/auth/AuthFeedback.tsx");
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /accessibilityLabel="Dismiss sign-in message"/);
  assert.match(source, /onPress=\{onDismiss\}/);
  assert.match(source, /styles\.errorBox/);
  assert.match(source, /styles\.successBox/);
  assert.match(source, /lineHeight: 19/);
});

test("Password reset and Google sign-in messages do not open browser confirmation dialogs", () => {
  const web = read("app/login.web.tsx");
  assert.match(web, /showSuccess\(message\)/);
  assert.match(web, /setPendingAction\("reset"\)/);
  assert.match(web, /setPendingAction\("google"\)/);
  assert.doesNotMatch(web, /window\.open\(/);
  assert.match(web, /Signing in\.\.\./);
  assert.match(web, /Connecting to Google\.\.\./);
});

test("Dedicated LGU Admin login already displays inline feedback and denies Resident portal escalation", () => {
  const admin = read("app/admin-login.tsx");
  assert.match(admin, /accessibilityRole="alert"/);
  assert.match(admin, /setError\(/);
  assert.match(admin, /profile\.role === "admin"/);
  assert.match(admin, /profile\.role === "superadmin"/);
  assert.match(admin, /await signOut\(auth\)/);
  assert.doesNotMatch(admin, /\b(?:window\.)?alert\s*\(/);
});
