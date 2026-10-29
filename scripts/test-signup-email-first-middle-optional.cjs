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
  const personalStep = source.indexOf("{step === 1");
  const finalStep = source.indexOf("{step === 4");
  const terms = source.indexOf('label="I’ve read and agree to the Terms and Conditions and Privacy Policy."');
  const birth = source.indexOf("Date of Birth", personalStep);
  assert(terms > birth && terms < finalStep, path + ": Terms checkbox must be visible under Date of Birth in Step 1");
  assert(source.includes("step1TermsBox") && source.includes("step1TermsLink"), path + ": Step 1 must offer a clear clickable policy link");
  assert(source.includes("&& formData.acceptTerms;"), path + ": Continue must require terms acceptance");
  assert(source.split("I’ve read and agree to the Terms and Conditions and Privacy Policy.").length - 1 === 1,
    path + ": Terms checkbox must not be duplicated on the final Security step");
  assert(source.indexOf('updateField("confirmReview"',finalStep) > finalStep,
    path + ": final information review confirmation must remain in Step 4");
  assert(source.includes("personalDetailsHeader"), path + ": personal details need separate clean spacing");
  console.log("PASS signup field order, Google logo/OR, middle optional:", path);
}
const auth = fs.readFileSync("lib/firebaseAuth.ts", "utf8");
assert(auth.includes("sendEmailVerification(user)"), "Keep Firebase email verification");
assert(auth.includes("if (!user.emailVerified)"), "Keep unverified email login block");
console.log("PASS email verification preserved");
