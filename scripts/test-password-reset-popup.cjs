#!/usr/bin/env node
/**
 * The public login forgot-password action must open a real in-app modal,
 * not immediately send/reset and print an inline success banner.
 */
const fs = require("node:fs");
const assert = require("node:assert/strict");
const modal = fs.readFileSync("components/auth/PasswordResetDialog.tsx", "utf8");

for (const path of ["app/login.web.tsx", "app/login.tsx"]) {
  const source = fs.readFileSync(path, "utf8");
  assert(source.includes('import PasswordResetDialog from "../components/auth/PasswordResetDialog"'),
    path + ": shared reset modal missing");
  assert(source.includes("setResetOpen(true)"), path + ": Forgot password must OPEN modal");
  assert(source.includes("visible={resetOpen}"), path + ": modal visibility must bind to state");
  assert(source.includes("initialEmail={email}"), path + ": the login email must prefill the modal");
  assert(source.includes("onClose={() => setResetOpen(false)}"), path + ": modal must be closeable");
  assert(source.includes("onPress={handleForgotPassword}"), path + ": forgot button must open modal");
  assert(!source.includes("sendPasswordResetEmail("), path + ": forgot button must not send immediately");
  console.log("PASS forgot-password popup opened on", path);
}
assert(modal.includes("<Modal") && modal.includes("transparent") && modal.includes('animationType="fade"'),
  "Popup must be a centered branded Modal");
assert(modal.includes("Password reset email address") && modal.includes("value={resetEmail}"),
  "Popup must allow a separate editable email field");
assert(modal.includes('accessibilityLabel="Send password reset link"') && modal.includes("onPress={() => void sendLink()}"),
  "Popup must have deliberate Send Reset Link action");
assert(modal.includes("await sendPasswordResetEmail(auth, address)"),
  "Reset email must only be sent after modal submission");
assert(modal.includes("Check your email") && modal.includes("Back to login"),
  "Success confirmation must remain INSIDE the popup");
assert(modal.includes("auth/too-many-requests") && modal.includes("auth/network-request-failed"),
  "Popup must handle reset errors");
assert(modal.includes("For Google-only accounts"),
  "Popup must explain the Google sign-in alternative");
console.log("PASS branded password reset modal, submit validation and in-popup confirmation");
