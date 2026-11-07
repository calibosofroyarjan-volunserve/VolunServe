"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {classifyRegistrationEmail} = require("./registrationEmailScreening");
test("known temporary and subdomain emails blocked on trusted server", () => {
  for (const value of [
    "person@en2ch.com", "person@MAILINATOR.COM", "person@sub.yopmail.com",
    "person@mail.tm", "person@guerrillamail.com", "person@10minutemail.com",
    "person@0-30-24.com",
  ]) assert.equal(classifyRegistrationEmail(value).allowed, false, value);
});
test("legitimate provider emails retain compatibility", () => {
  for (const value of [
    "person@gmail.com", "person@yahoo.com.ph", "person@outlook.com",
    "person@icloud.com", "person@department.gov.ph",
  ]) assert.equal(classifyRegistrationEmail(value).allowed, true, value);
});
test("malformed emails rejected and no claims about disposable real Gmail", () => {
  for (const value of ["", "person@", "person@gmail..com", "person@-gmail.com"])
    assert.equal(classifyRegistrationEmail(value).allowed, false, value);
  assert.equal(classifyRegistrationEmail("temporaryuser@gmail.com").allowed, true);
});
test("server snapshot matches the exact client generated denylist", () => {
  const app = fs.readFileSync(path.join(__dirname, "../lib/disposableEmailDomains.generated.ts"), "utf8");
  const match = app.match(/GENERATED_DISPOSABLE_EMAIL_DOMAINS = `\n([\s\S]*?)\n`\.trim\(\)\.split\("\\n"\)/);
  assert.ok(match, "client list representation should remain stable or update this test");
  const appDomains = match[1].trim().split("\n");
  const serverDomains = fs.readFileSync(path.join(__dirname, "disposable-email-domains.txt"), "utf8").trim().split("\n");
  assert.ok(serverDomains.length >= 50000);
  assert.deepEqual(serverDomains, appDomains);
});
