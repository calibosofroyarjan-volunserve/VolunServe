"use strict";
/**
 * Exercise the actual Firebase Identity blocking callbacks without real Firebase
 * services, Auth UIDs, external requests, or live database writes.
 * This catches mistakes that source-string presence tests cannot detect.
 */
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {classifyRegistrationEmail} = require("./registrationEmailScreening");

const SOURCE = fs.readFileSync(path.join(__dirname, "registrationBlocking.js"), "utf8");

function callbacks({profile = null, limiterFailure = null} = {}) {
  const calls = [];
  const handlers = {};
  class FakeHttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  class RegistrationRateLimitError extends Error {}
  const database = {
    doc(path) {
      assert.match(path, /^users\/[a-zA-Z0-9-]+$/);
      return {get: async () => ({exists: !!profile, data: () => profile})};
    },
  };
  const imports = {
    "firebase-functions/v2/identity": {
      HttpsError: FakeHttpsError,
      beforeUserCreated(options, handler) {
        assert.equal(options.region, "us-central1");
        assert.equal(options.secrets.length, 1);
        handlers.beforeCreate = handler;
        return handler;
      },
      beforeUserSignedIn(options, handler) {
        assert.equal(options.region, "us-central1");
        handlers.beforeSignIn = handler;
        return handler;
      },
    },
    "firebase-admin/firestore": {getFirestore: () => database},
    "firebase-functions/params": {
      defineSecret(key) {
        assert.equal(key, "VOLUNSERVE_REGISTRATION_RATE_LIMIT_SECRET");
        return {value: () => "testing-only-secret-32-characters-or-more"};
      },
    },
    "./registrationEmailScreening": {classifyRegistrationEmail},
    "./registrationIpRateLimiter": {
      RegistrationRateLimitError,
      enforceSignupIpRateLimit: async (args) => {
        calls.push(args);
        if (limiterFailure === "rate") throw new RegistrationRateLimitError();
        if (limiterFailure === "other") throw Error("unavailable");
        return {enforced: true};
      },
    },
  };
  const fakeRequire = (id) => {
    if (!Object.prototype.hasOwnProperty.call(imports, id)) {
      throw Error("Unapproved import in blocking callback test: " + id);
    }
    return imports[id];
  };
  const mod = {exports: {}};
  vm.runInNewContext(
    "(function(require, module, exports){\n" + SOURCE + "\n})",
    {},
    {filename: "registrationBlocking.js"}
  )(fakeRequire, mod, mod.exports);
  assert.equal(mod.exports.beforeCreate, handlers.beforeCreate);
  assert.equal(mod.exports.beforeSignIn, handlers.beforeSignIn);
  return {...handlers, calls};
}

test("new Firebase Auth UID is blocked for all sampled known disposable domain families", async () => {
  const env = callbacks();
  for (const email of [
    "person@en2ch.com", "person@en2ch.co", "person@sub.en2ch.co",
    "person@MAILINATOR.COM", "person@sub.yopmail.com", "person@mail.tm",
    "person@0-30-24.com", "person@gmaill.com", "person+alias@gmail.com",
    "person@nonexistent..com",
  ]) {
    await assert.rejects(
      env.beforeCreate({data: {email}, id: "blocked-event"}),
      error => error.code === "permission-denied",
      email
    );
  }
  assert.equal(env.calls.length, 0, "blocked accounts must not consume IP quota");
});

test("verified mailbox providers still create Auth-only UID and use v2 event.id", async () => {
  const env = callbacks();
  for (const [i, email] of [
    "person@gmail.com", "person@yahoo.com.ph", "person@outlook.com",
    "person@icloud.com", "person@school.edu.ph",
  ].entries()) {
    await env.beforeCreate({
      data: {email}, id: "cloud-event-" + i, eventId: "wrong-legacy-id",
      ipAddress: "203.0.113.7",
    });
    assert.equal(env.calls[i].eventId, "cloud-event-" + i);
    assert.equal(env.calls[i].ipAddress, "203.0.113.7");
  }
  await env.beforeCreate({
    data: {email: "person@gmail.com"}, eventId: "legacy-event-id",
    ipAddress: "203.0.113.8",
  });
  assert.equal(env.calls.at(-1).eventId, "legacy-event-id");
});

test("limiter failures fail closed without revealing server-side implementation", async () => {
  const rate = callbacks({limiterFailure: "rate"});
  await assert.rejects(
    rate.beforeCreate({data: {email: "a@gmail.com"}, id: "x"}),
    error => error.code === "resource-exhausted"
  );
  const outage = callbacks({limiterFailure: "other"});
  await assert.rejects(
    outage.beforeCreate({data: {email: "a@gmail.com"}, id: "x"}),
    error => error.code === "unavailable"
  );
});

test("beforeSignIn remains optional: existing approved staff are exempt; residents are not", async () => {
  const admin = callbacks({profile: {role: "admin", status: "approved", adminStatus: "active"}});
  await admin.beforeSignIn({data: {email: "legacy@en2ch.co", uid: "legacy-admin"}});
  const resident = callbacks({profile: {role: "resident", status: "approved"}});
  await assert.rejects(
    resident.beforeSignIn({data: {email: "legacy@en2ch.co", uid: "resident-1"}}),
    error => error.code === "permission-denied"
  );
  const suspended = callbacks({profile: {role: "superadmin", status: "approved", adminStatus: "suspended"}});
  await assert.rejects(
    suspended.beforeSignIn({data: {email: "legacy@en2ch.co", uid: "suspended-1"}}),
    error => error.code === "permission-denied"
  );
  await resident.beforeSignIn({data: {email: "person@gmail.com", uid: "resident-2"}});
});
