"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/identityBackendUrl.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function resolve(host, extra = {}) {
  const context = {
    exports: {},
    process: { env: { ...extra } },
    URL,
    window: host ? { location: { hostname: host } } : undefined,
  };
  vm.runInNewContext(compiled, context);
  return context.exports.getIdentityBackendBaseUrl();
}

test("production backend remains the default on production sites", () => {
  assert.equal(resolve("volunserve.com"), "https://volunserve.onrender.com");
});
test("isolated staging backend and Firebase target are required", () => {
  const host = "volunserve-expo-resident-full-staging.onrender.com";
  assert.throws(() => resolve(host), /FIREBASE_TARGET=staging/);
  assert.throws(() => resolve(host, {
    EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET: "staging",
  }), /staging backend is not configured/);
  assert.equal(resolve(host, {
    EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET: "staging",
    EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "https://volunserve-backend-staging.onrender.com/api/identity/status",
  }), "https://volunserve-backend-staging.onrender.com");
});
test("staging submissions cannot use production backend", () => {
  assert.throws(() => resolve("volunserve-staging.onrender.com", {
    EXPO_PUBLIC_VOLUNSERVE_FIREBASE_TARGET: "staging",
    EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "https://volunserve.onrender.com",
  }), /cannot use the live/);
});
test("production submissions cannot use staging backend", () => {
  assert.throws(() => resolve("volunserve.com", {
    EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "https://volunserve-backend-staging.onrender.com",
  }), /cannot use a staging backend/);
});
test("origin is HTTPS only and does not accept credentials, query or path", () => {
  assert.throws(() => resolve("volunserve.com", {
    EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "http://external.example.com",
  }), /must use HTTPS/);
  assert.throws(() => resolve("volunserve.com", {
    EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "https://token@example.com/api",
  }), /must be an origin/);
  assert.equal(resolve("", {
    EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "http://localhost:10000",
  }), "http://localhost:10000");
});
test("all three identity clients share the safe endpoint resolver", () => {
  for (const file of [
    "lib/identityVerification.ts",
    "app/(admin)/identity-reviews.tsx",
    "components/identity/AdminIdentityEvidence.tsx",
  ]) {
    const text = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    assert.ok(text.includes("getIdentityBackendBaseUrl"), file);
    assert.ok(!text.includes('const API = "https://volunserve.onrender.com"'), file);
    assert.ok(!text.includes('const BACKEND_URL = "https://volunserve.onrender.com"'), file);
  }
});
