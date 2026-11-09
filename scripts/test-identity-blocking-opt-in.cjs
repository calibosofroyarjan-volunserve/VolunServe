"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {test} = require("node:test");
const index = fs.readFileSync("functions/index.js", "utf8");
const blocking = fs.readFileSync("functions/registrationBlocking.js", "utf8");

test("Identity Platform blocking triggers are explicitly OFF unless safely enabled", () => {
  const gate = 'process.env.VOLUNSERVE_ENABLE_IDENTITY_BLOCKING === "true"';
  assert(index.includes(gate), "Identity Platform triggers must remain opt-in");
  const i = index.indexOf(gate);
  const after = index.slice(i, index.indexOf("setGlobalOptions(", i));
  assert(after.includes('require("./registrationBlocking")'));
  assert(after.includes("exports.volunserveBlockDisposableBeforeCreate"));
  assert(after.includes("exports.volunserveBlockDisposableBeforeSignIn"));
  const before = index.slice(0,i);
  assert(!before.includes("exports.volunserveBlockDisposableBeforeCreate"));
  assert(!before.includes("exports.volunserveBlockDisposableBeforeSignIn"));
});
test("blocking callbacks use Firebase identity namespace and never reject unverified-first-token signups", () => {
  assert(blocking.includes('require("firebase-functions/v2/identity")'));
  assert(blocking.includes("beforeUserCreated") && blocking.includes("beforeUserSignedIn"));
  assert(blocking.includes("classifyRegistrationEmail"));
  assert(!blocking.includes("if (!event.data?.emailVerified)"));
  assert(!blocking.includes('require("firebase-functions/v2/https")'));
});

test("separate before-create-only flag does not export a sign-in blocker", () => {
  const gate = 'process.env.VOLUNSERVE_ENABLE_IDENTITY_BEFORE_CREATE === "true"';
  assert(index.includes(gate), "Dedicated before-create activation must be opt-in");
  const isolated = index.slice(index.indexOf(gate), index.indexOf("setGlobalOptions(", index.indexOf(gate)));
  assert(isolated.includes("exports.volunserveBlockDisposableBeforeCreate"));
  assert(!isolated.includes("exports.volunserveBlockDisposableBeforeSignIn"));
  assert(isolated.includes('process.env.VOLUNSERVE_ENABLE_IDENTITY_BLOCKING !== "true"'));
});
