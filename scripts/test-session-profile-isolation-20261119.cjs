"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("lib/useUserSession.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const auth = { currentUser: null };
const subscriptions = [];
let authListener;
let effect;
let currentState;
const fakeReact = {
  useState: (initial) => {
    currentState = initial;
    return [initial, (next) => {
      currentState = typeof next === "function" ? next(currentState) : next;
    }];
  },
  useEffect: (callback) => { effect = callback; },
};
const firestore = {
  doc: (_db, _collection, uid) => ({ uid }),
  onSnapshot: (ref, next, error) => {
    const subscription = { uid: ref.uid, next, error, closed: false };
    subscriptions.push(subscription);
    return () => { subscription.closed = true; };
  },
};
const moduleExports = {};
vm.runInNewContext(js, {
  exports: moduleExports,
  require: (id) => {
    if (id === "react") return fakeReact;
    if (id === "firebase/firestore") return firestore;
    if (id === "./firebase") return { auth, db: {} };
    if (id === "./firebaseAuth") {
      return { onAuthChange: (fn) => {
        authListener = fn;
        return () => { authListener = null; };
      } };
    }
    throw new Error("Unexpected import: " + id);
  },
});
moduleExports.useUserSession();
const cleanup = effect();
const snapshot = (profile) => ({
  exists: () => Boolean(profile),
  data: () => profile,
});
const emitAuth = (user) => { auth.currentUser = user; authListener(user); };
const a = { uid: "resident-a" };
const b = { uid: "volunteer-b" };

assert.equal(currentState.loading, true);
emitAuth(a);
assert.equal(currentState.profile, null);
subscriptions[0].next(snapshot({ uid: a.uid, role: "resident" }));
assert.equal(currentState.profile.uid, a.uid);
assert.equal(currentState.loading, false);

emitAuth(b);
assert.equal(subscriptions[0].closed, true);
assert.equal(currentState.user.uid, b.uid);
assert.equal(currentState.loading, true);
assert.equal(currentState.profile, null, "Do not carry a previous account's profile");
subscriptions[0].next(snapshot({ uid: a.uid, role: "admin" }));
assert.equal(currentState.profile, null, "Ignore queued old-account snapshots");
subscriptions[0].error(new Error("late permission denied"));
assert.equal(currentState.user.uid, b.uid);
assert.equal(currentState.loading, true);
subscriptions[1].next(snapshot({ uid: b.uid, role: "volunteer" }));
assert.equal(currentState.profile.uid, b.uid);

emitAuth(null);
assert.equal(subscriptions[1].closed, true);
assert.equal(currentState.user, null);
assert.equal(currentState.profile, null);
subscriptions[1].next(snapshot({ uid: b.uid, role: "volunteer" }));
assert.equal(currentState.user, null, "Do not restore a user after logout");

emitAuth(a);
subscriptions[2].next(snapshot({ uid: a.uid, role: "resident" }));
cleanup();
assert.equal(subscriptions[2].closed, true);
const before = currentState;
subscriptions[2].next(snapshot({ uid: "wrong", role: "admin" }));
assert.equal(currentState, before, "No callbacks after unmount");
console.log("PASS session profile isolation: account switch, stale snapshots/errors, logout, unmount");
