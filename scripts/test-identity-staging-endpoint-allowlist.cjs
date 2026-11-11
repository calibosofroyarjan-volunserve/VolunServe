"use strict";
// Offline regression of the real staging identity gateway resolver.
// Never sends credentials, ID documents, or browser requests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("lib/identityVerification.ts", "utf8");
const modified = source.replace(
  "function getBackendBaseUrl() {",
  "export function getBackendBaseUrl() {",
);
assert.notEqual(source, modified, "Expected production URL resolver");
const compiled = ts.transpileModule(modified, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function resolve(env) {
  const mod = { exports: {} };
  const sandbox = {
    module: mod,
    exports: mod.exports,
    process: { env },
    URL,
    require(spec) {
      if (spec === "./firebase") return { auth: { app: { options: { projectId: "ci-staging-identity" } } } };
      throw Error("Unexpected runtime dependency " + spec);
    },
  };
  vm.runInNewContext(compiled, sandbox, { filename: "identityVerification.ts", timeout: 1000 });
  return () => mod.exports.getBackendBaseUrl();
}

test("production resolver remains compatible without staging flag", () => {
  assert.equal(resolve({})(), "https://volunserve.onrender.com");
});

test("staging cannot silently fall back to production identity API", () => {
  assert.throws(resolve({ EXPO_PUBLIC_VOLUNSERVE_ENV: "staging" }), /Staging identity backend URL is required/);
});

test("only the configured, approved staging Node gateway is accepted", () => {
  const env = { EXPO_PUBLIC_VOLUNSERVE_ENV: "staging" };
  assert.equal(resolve({ ...env, EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "https://volunserve-backend-staging.onrender.com/" })(),
    "https://volunserve-backend-staging.onrender.com");
  assert.equal(resolve({ ...env, EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "https://volunserve-backend-staging.onrender.com/api/identity/verify" })(),
    "https://volunserve-backend-staging.onrender.com");
  assert.equal(resolve({ ...env, EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: "https://identity-bundle-smoke.invalid" })(),
    "https://identity-bundle-smoke.invalid");
});

test("staging rejects production, unknown hosts and phishing subdomains", () => {
  for (const url of [
    "https://volunserve.onrender.com",
    "https://volunserve.com",
    "https://volunserve-identity-ai.onrender.com",
    "https://volunserve-identity-ai-staging.onrender.com",
    "https://evil.example.com",
    "https://volunserve-backend-staging.onrender.com.evil.example.com",
    "http://volunserve-backend-staging.onrender.com",
    "https://volunserve-backend-staging.onrender.com:4443",
    "https://bad:password@volunserve-backend-staging.onrender.com",
    "https://volunserve-backend-staging.onrender.com/x",
    "https://volunserve-backend-staging.onrender.com/?upload=1",
    "https://volunserve-backend-staging.onrender.com/#test",
  ]) {
    assert.throws(resolve({
      EXPO_PUBLIC_VOLUNSERVE_ENV: "staging",
      EXPO_PUBLIC_IDENTITY_VERIFICATION_API_URL: url,
    }), /unauthorized URL/, "Should reject: " + url);
  }
});
