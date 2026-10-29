#!/usr/bin/env node
// Guard the requested signup ordering and optional middle-name UX.
const assert = require("node:assert/strict");
const fs = require("node:fs");

for (const path of ["app/signup.web.tsx", "app/signup.tsx"]) {
  const source = fs.readFileSync(path, "utf8");
  const email = source.indexOf('label="Email Address *"');
  const password = source.indexOf('label="Password *"');
  const confirm = source.indexOf('label="Confirm Password *"');
  const google = source.indexOf("Continue with Google", confirm);
  assert(email >= 0 && email < password && password < confirm && confirm < google,
    path + ": email, password, confirmation, then optional Google must be ordered");
  assert(source.includes("signupDividerText") && source.includes(">OR</Text>"),
    path + ": OR separator must be prominent");
  assert(source.includes("g-logo.png"), path + ": multicolor Google icon required");
  assert(source.includes('label="Middle Name (Optional)"'), path + ": middle name must be optional");
  assert(!source.includes("I do not have a middle name") && !source.includes("No Middle Name"),
    path + ": redundant middle name checkbox must be absent");
  assert(!source.includes("noMiddleName"), path + ": obsolete middle-name state must be removed");
  assert(source.includes("googleBound || passwordValid"),
    path + ": email signup password must validate before Next");
  assert(source.includes('label="Confirm Password *"'),
    path + ": confirmed password remains required for email signup");
  assert(!source.includes("Mobile Number *"), path + ": removed phone field must remain removed");
  assert(!source.includes('title="Email Account"') && !source.includes('<SectionTitle title="Email Account"'),
    path + ": redundant Email Account heading must remain absent");
  const personal = source.indexOf('title="Personal Information"');
  const first = source.indexOf('label="First Name *"',personal);
  const middle = source.indexOf('label="Middle Name (Optional)"',personal);
  const last = source.indexOf('label="Last Name *"',personal);
  assert(personal >= 0 && personal < first && first < middle && middle < last,
    path + ": name fields must appear First, optional Middle, Last");
  const finalStep = source.indexOf("{step === 4");
  const finalTerms = source.indexOf("finalTermsSection",finalStep);
  const confirmReview = source.indexOf('updateField("confirmReview"',finalStep);
  assert(finalStep >= 0 && finalTerms > confirmReview && source.includes("I’ve read and agree to the Terms and Conditions and Privacy Policy."),
    path + ": clear policy acceptance must be the last confirmation");
  assert(source.includes("personalDetailsHeader"), path + ": personal details need separate clean spacing");
  console.log("PASS signup field order, Google logo/OR, middle optional:", path);
}
const auth = fs.readFileSync("lib/firebaseAuth.ts", "utf8");
assert(auth.includes("sendEmailVerification(user)"), "Keep Firebase email verification");
assert(auth.includes("if (!user.emailVerified)"), "Keep unverified email login block");
console.log("PASS email verification preserved");
