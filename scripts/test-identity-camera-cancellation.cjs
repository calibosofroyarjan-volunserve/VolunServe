"use strict";
/**
 * Offline behavior tests for actual web camera capture closures.
 * Mocks canvas.toBlob(), no camera, ID media, accounts or HTTP calls.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("app/identity-verification.web.tsx", "utf8");
const syntaxTree = ts.createSourceFile("identity-verification.web.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = syntaxTree.statements.find((statement) =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "IdentityVerificationWeb"
);
assert(component?.body, "IdentityVerificationWeb function was not found");

function getClosure(name, context) {
  const declaration = component.body.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((node) => node.name?.getText(syntaxTree) === name);
  assert(declaration?.initializer, "Cannot find function: " + name);
  const extracted = "module.exports = " + declaration.initializer.getText(syntaxTree) + ";";
  const js = ts.transpileModule(extracted, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const module = { exports: null };
  vm.runInNewContext(js, { module, ...context }, { filename: name + ".js", timeout: 1000 });
  return module.exports;
}

function setupIdCapture() {
  const recorded = { front: [], back: [], errors: [], cameraOpen: [], blobs: 0 };
  let pendingBlob = null;
  const idCameraSessionRef = { current: 7 };
  const idCaptureLockRef = { current: false };
  const idStreamRef = { current: { getTracks: () => [] } };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback) => { pendingBlob = callback; },
  };
  const context = {
    idCaptureLockRef,
    idCameraSessionRef,
    idCameraSide: "front",
    idStreamRef,
    idCameraReady: true,
    idVideoRef: { current: { videoWidth: 800, videoHeight: 700 } },
    idCanvasRef: { current: canvas },
    setIdDocument: (value) => recorded.front.push(value),
    setIdBackDocument: (value) => recorded.back.push(value),
    setLocalMessage: () => {},
    setIdCameraOpen: (v) => recorded.cameraOpen.push(v),
    setIdCameraError: (value) => recorded.errors.push(value),
    File: class FakeFile { constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options.type; } },
    URL: { createObjectURL: () => { recorded.blobs++; return "blob:offline-test"; } },
    Date,
    Promise,
  };
  return {
    ...recorded,
    idCameraSessionRef,
    idCaptureLockRef,
    idStreamRef,
    get pendingBlob() { return pendingBlob; },
    captureIdDocument: getClosure("captureIdDocument", context),
  };
}

function setupSelfieCapture() {
  const recorded = { selfies: [], state: [], errors: [], blobs: 0, stopped: 0 };
  let pendingBlob = null;
  const cameraRequestRef = { current: 9 };
  const captureLockRef = { current: false };
  const streamRef = { current: { getTracks: () => [] } };
  const context = {
    useCallback: (fn) => fn,
    cameraRequestRef,
    captureLockRef,
    streamRef,
    videoRef: { current: { videoWidth: 720, videoHeight: 720 } },
    canvasRef: { current: {
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb) => { pendingBlob = cb; },
    } },
    stopCamera: () => { recorded.stopped++; cameraRequestRef.current++; streamRef.current = null; },
    setSelfie: (media) => recorded.selfies.push(media),
    setScanProgress: () => {},
    setScanState: (state) => recorded.state.push(state),
    setCameraError: (err) => recorded.errors.push(err),
    File: class FakeFile { constructor(parts, name, options) { this.name = name; this.type = options.type; } },
    URL: { createObjectURL: () => { recorded.blobs++; return "blob:offline-selfie"; } },
    Date,
    Promise,
  };
  return {
    ...recorded,
    cameraRequestRef,
    captureLockRef,
    streamRef,
    get pendingBlob() { return pendingBlob; },
    captureFrame: getClosure("captureFrame", context),
  };
}

test("ID capture saves a valid frame to the selected side", async () => {
  const c = setupIdCapture();
  const task = c.captureIdDocument();
  assert.equal(typeof c.pendingBlob, "function");
  c.pendingBlob({ type: "image/jpeg" });
  await task;
  assert.equal(c.front.length, 1);
  assert.equal(c.back.length, 0);
  assert.equal(c.blobs, 1);
  assert.deepEqual(c.cameraOpen, [false]);
  assert.equal(c.idCaptureLockRef.current, false);
});

test("cancelled ID capture never writes stale image after asynchronous encoder completes", async () => {
  const c = setupIdCapture();
  const task = c.captureIdDocument();
  c.idCameraSessionRef.current++;
  c.idStreamRef.current = null;
  c.pendingBlob({ type: "image/jpeg" });
  await task;
  assert.equal(c.front.length, 0);
  assert.equal(c.back.length, 0);
  assert.equal(c.blobs, 0);
  assert.equal(c.idCaptureLockRef.current, false);
});

test("new side selection invalidates unfinished previous-side capture", async () => {
  const c = setupIdCapture();
  const task = c.captureIdDocument();
  c.idCameraSessionRef.current++;
  c.pendingBlob({ type: "image/jpeg" });
  await task;
  assert.equal(c.front.length, 0);
  assert.equal(c.back.length, 0);
  assert.equal(c.blobs, 0);
});

test("cancelled selfie capture is discarded before creating temporary photo URL", async () => {
  const c = setupSelfieCapture();
  const task = c.captureFrame();
  assert.equal(typeof c.pendingBlob, "function");
  c.cameraRequestRef.current++;
  c.streamRef.current = null;
  c.pendingBlob({ type: "image/jpeg" });
  await task;
  assert.equal(c.selfies.length, 0);
  assert.equal(c.blobs, 0);
  assert.equal(c.stopped, 0);
  assert.equal(c.captureLockRef.current, false);
});

test("valid selfie frame is captured and camera stops after snapshot", async () => {
  const c = setupSelfieCapture();
  const task = c.captureFrame();
  c.pendingBlob({ type: "image/jpeg" });
  await task;
  assert.equal(c.selfies.length, 1);
  assert.equal(c.blobs, 1);
  assert.equal(c.stopped, 1);
  assert.equal(c.captureLockRef.current, false);
});
