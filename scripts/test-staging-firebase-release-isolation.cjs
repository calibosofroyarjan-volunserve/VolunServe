"use strict";
/**
 * Test only: evaluate the actual firebase.ts module with mocked Firebase
 * dependencies. No network, test identities, or credentials are used.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("lib/firebase.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

const isolatedProject = {
  EXPO_PUBLIC_VOLUNSERVE_ENV: "staging",
  EXPO_PUBLIC_FIREBASE_API_KEY: "fake-ci-api-key",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "ci-staging-identity.firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "ci-staging-identity",
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "ci-staging-identity.appspot.com",
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  EXPO_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:0000000000000000",
};

function loadFirebase(config) {
  const record = { initialized: null };
  const fakeModule = { exports: {} };
  const mockRequire = (name) => {
    switch (name) {
      case "firebase/app":
        return {
          getApps: () => [],
          getApp: () => null,
          initializeApp: (options) => {
            record.initialized = options;
            return { options };
          },
        };
      case "firebase/auth":
        return {
          getAuth: (app) => ({ app }),
          connectAuthEmulator: () => {},
        };
      case "firebase/firestore":
        return { getFirestore: () => ({}), connectFirestoreEmulator: () => {} };
      case "firebase/storage":
        return { getStorage: () => ({}) };
      case "firebase/functions":
        return { getFunctions: () => ({}), connectFunctionsEmulator: () => {} };
      default:
        throw Error("Unexpected module: " + name);
    }
  };
  const run = () => vm.runInNewContext(
    compiled,
    {
      module: fakeModule,
      exports: fakeModule.exports,
      require: mockRequire,
      process: { env: config },
      console: { log: () => {} },
    },
    { filename: "lib/firebase.ts", timeout: 1000 },
  );
  return { run, record, module: fakeModule };
}

test("production behavior stays unchanged without staging opt-in", () => {
  const app = loadFirebase({});
  app.run();
  assert.equal(app.record.initialized.projectId, "volunserve-3aa5b");
  assert.equal(app.module.exports.usingStagingFirebase, false);
});

test("staging fails before Firebase initialization when no separate config is provided", () => {
  const app = loadFirebase({ EXPO_PUBLIC_VOLUNSERVE_ENV: "staging" });
  assert.throws(app.run, /Unsafe staging Firebase configuration/);
  assert.equal(app.record.initialized, null);
});

test("staging rejects the production Firebase project even when credentials are complete", () => {
  const app = loadFirebase({
    ...isolatedProject,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: "volunserve-3aa5b",
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "volunserve-3aa5b.firebaseapp.com",
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "volunserve-3aa5b.appspot.com",
  });
  assert.throws(app.run, /Unsafe staging Firebase configuration/);
  assert.equal(app.record.initialized, null);
});

test("staging rejects mixed-project Auth or Storage settings", () => {
  for (const extra of [
    { EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "volunserve-3aa5b.firebaseapp.com" },
    { EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "volunserve-3aa5b.appspot.com" },
  ]) {
    const app = loadFirebase({ ...isolatedProject, ...extra });
    assert.throws(app.run, /Unsafe staging Firebase configuration/);
    assert.equal(app.record.initialized, null);
  }
});

test("staging initializes only the isolated Firebase project when complete", () => {
  const app = loadFirebase(isolatedProject);
  app.run();
  assert.equal(app.module.exports.usingStagingFirebase, true);
  assert.equal(app.record.initialized.projectId, "ci-staging-identity");
  assert.equal(app.record.initialized.authDomain, "ci-staging-identity.firebaseapp.com");
});
