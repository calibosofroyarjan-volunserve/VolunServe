"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {isVerifiedCallableEmail} = require("./verifiedCallableEmail");

test("verified callable email claim gates all authenticated callables", () => {
  for(const value of [null, {}, {auth:{uid:"pending",token:{email:"x@gmail.com",email_verified:false}}},
    {auth:{uid:"pending",token:{email:"x@gmail.com"}}},
    {auth:{uid:"pending",token:{email_verified:true}}},
  ]) assert.equal(isVerifiedCallableEmail(value),false);
  assert.equal(isVerifiedCallableEmail({auth:{uid:"resident",token:{email:"x@gmail.com",email_verified:true}}}),true);
});
test("existing authenticated Callable Functions explicitly enforce shared gate", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  assert(source.includes('require("./verifiedCallableEmail")'));
  for(const name of ["generateMapBriefing","issueVolunteerCertificate","registerAndroidPushToken","unregisterAndroidPushToken"]) {
    const i = source.indexOf("exports."+name+" = onCall(");
    assert(i>=0,name);
    const stop=source.indexOf("exports.",i+14);
    const block=source.slice(i, stop>i?stop:undefined);
    assert(block.includes("requireVerifiedCallableEmail(request)"),name);
  }
});

test("legacy Guest flags cannot enable certificates or push notification registration", () => {
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  const issuer = source.slice(source.indexOf('exports.issueVolunteerCertificate = onCall('),
    source.indexOf('exports.issueCommunityCertificatesOnEventCompletion'));
  assert(issuer.includes('["resident", "volunteer"].includes(volunteerRole)'),
    "a volunteerAccess flag on Guest must not qualify for a certificate");
  const push = source.slice(source.indexOf('exports.registerAndroidPushToken = onCall('),
    source.indexOf('exports.unregisterAndroidPushToken = onCall('));
  assert(push.includes('["resident", "volunteer", "admin", "superadmin", "lgu_personnel"]'),
    "push registration must only accept actual registered roles");
});
