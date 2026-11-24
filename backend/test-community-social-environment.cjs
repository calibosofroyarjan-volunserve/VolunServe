"use strict";
/** Pure local QA: no network, Firebase credentials, users, or live services. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const text = fs.readFileSync("lib/identityEnvironmentTarget.ts", "utf8");
const compiled = ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0);
const moduleMock = { exports: {} };
vm.runInNewContext(compiled.outputText, { module: moduleMock, exports: moduleMock.exports }, {
  filename: "identityEnvironmentTarget.js",
});
const { identityAdminApiBaseUrl } = moduleMock.exports;
const production = {
  runtimeEnv: "production", firebaseTarget: "production", projectId: "volunserve-3aa5b",
};
const staging = {
  runtimeEnv: "staging", firebaseTarget: "staging", projectId: "volunserve-full-staging",
};

test("restored social API resolves production only for production Firebase", () => {
  assert.equal(identityAdminApiBaseUrl(production), "https://volunserve.onrender.com");
});
test("restored social API resolves staging only for isolated staging Firebase", () => {
  assert.equal(identityAdminApiBaseUrl(staging), "https://volunserve-backend-staging.onrender.com");
});
test("cross-environment and ambiguous Firebase targets fail closed", () => {
  for (const input of [
    { ...staging, runtimeEnv: "production" },
    { ...staging, firebaseTarget: "production" },
    { ...staging, projectId: "volunserve-3aa5b" },
    { ...production, runtimeEnv: "staging" },
    { ...production, firebaseTarget: "staging" },
    { ...production, projectId: "volunserve-full-staging" },
    { ...production, projectId: "" },
  ]) {
    assert.throws(() => identityAdminApiBaseUrl(input), /inconsistent|unknown/i);
  }
});
test("community message client chooses backend and validates path BEFORE fetching ID token", () => {
  const code = fs.readFileSync("lib/communitySocial.ts", "utf8");
  const helper = code.indexOf("const apiUrl = identityAdminApiBaseUrl({");
  const pathGuard = code.indexOf('if (!path.startsWith("/api/community/"))');
  const token = code.indexOf("const token=await current.getIdToken();");
  const send = code.indexOf("await fetch(apiUrl+path,");
  assert(helper >= 0 && pathGuard > helper && token > pathGuard && send > token,
    "endpoint binding and validation must precede token issue and request");
  assert(!code.includes("const API_URL ="), "no fixed production social URL");
  assert(!code.includes("fetch(\"https://volunserve.onrender.com\""));
});
