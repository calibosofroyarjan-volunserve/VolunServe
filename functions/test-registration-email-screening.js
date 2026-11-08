"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {classifyRegistrationEmail} = require("./registrationEmailScreening");
test("known temporary and subdomain emails blocked on trusted server", () => {
  for (const value of [
    "person+alias@gmail.com", "person+alias@googlemail.com",
    "person@en2ch.com", "person@en2ch.co", "person@sub.en2ch.co", "person@MAILINATOR.COM", "person@sub.yopmail.com",
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

test("server rejects Gmail-looking fake provider domains and matches client corrections", () => {
  const typos = require("./providerTypoDomains.json");
  const client = fs.readFileSync(path.join(__dirname, "../lib/registrationEmailPolicy.ts"),"utf8");
  const block = client.split("KNOWN_PROVIDER_TYPO_CORRECTIONS: Readonly<Record<string, string>> = Object.freeze({")[1].split("});")[0];
  const keys = [...block.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map(match => [match[1],match[2]]);
  assert.deepEqual(Object.fromEntries(keys),typos,"Client and server fake-provider corrections must match");
  assert(Object.keys(typos).length >= 40);
  for(const domain of Object.keys(typos)) {
    const v=classifyRegistrationEmail("candidate@"+domain);
    assert.equal(v.allowed,false,"Fake provider @"+domain+" must not create Auth UID");
    assert.equal(v.reason,"provider_typo");
  }
  for(const domain of ["gmail.com","googlemail.com","yahoo.com","outlook.com","hotmail.com","icloud.com"]) {
    assert.equal(classifyRegistrationEmail("candidate@"+domain).allowed,true,domain);
  }
});
