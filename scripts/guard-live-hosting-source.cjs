#!/usr/bin/env node
"use strict";

/**
 * Fail-closed, read-only PRE-RELEASE gate for VolunServe Firebase Hosting.
 * Does not deploy, authenticate to Firebase, edit files, or read production data.
 * Must be used twice: before build and immediately before an approved deployment.
 * This is one layer of protection; restrict Firebase credentials to a protected
 * GitHub Environment to stop legacy workflows from bypassing this gate.
 */
const { execFileSync } = require("node:child_process");
const HOSTS = Object.freeze([
  "https://volunserve.com",
  "https://volunserve-3aa5b.web.app",
]);
const SHA = /^[0-9a-f]{40}$/;

function requireSha(value, name) {
  if (typeof value !== "string" || !SHA.test(value)) {
    throw new Error(name + " must be a full lowercase 40-character commit SHA");
  }
  return value;
}

function parseApprovedFiles(raw) {
  let parsed;
  try { parsed = JSON.parse(raw || ""); }
  catch { throw new Error("VOLUNSERVE_APPROVED_FILES_JSON must be a JSON array"); }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100) {
    throw new Error("Approved files must contain 1–100 paths");
  }
  const set = new Set();
  for (const path of parsed) {
    if (typeof path !== "string" || !path || path.startsWith("/") ||
        path.includes("\\") || path.includes("\0") ||
        path.split("/").some(piece => piece === ".." || piece === "." || piece === "")) {
      throw new Error("Invalid approved file path");
    }
    if (set.has(path)) throw new Error("Duplicate approved file path: " + path);
    set.add(path);
  }
  return set;
}

function parseNameStatusZ(raw) {
  const parts = raw.split("\0");
  if (parts.at(-1) === "") parts.pop();
  const files = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    // Reject deletion, rename, copy, type changes and unmerged changes BEFORE
    // attempting to parse their different -z output shapes.
    if (!/^[AM]$/.test(status)) throw new Error("Blocked git change type " + status + "; STOP");
    if (i >= parts.length) throw new Error("Malformed git name-status output");
    const path = parts[i++];
    if (!path) throw new Error("Empty git changed file name");
    files.push(path);
  }
  return files;
}

function prohibitedHostingPath(path) {
  return ["firestore.rules", "storage.rules", "firebase.json", ".firebaserc", "firestore.indexes.json"].includes(path) ||
    ["backend/", "identity-ai/", "functions/", ".github/workflows/release-", ".github/workflows/deploy-"].some(prefix => path.startsWith(prefix));
}

function checkFileApproval(actual, approved) {
  if (actual.length === 0) throw new Error("No changes to release; refusing empty release");
  if (new Set(actual).size !== actual.length) throw new Error("Duplicate file in git diff");
  for (const path of actual) {
    if (prohibitedHostingPath(path)) throw new Error("Hosting-only release includes protected service/config path: " + path);
    if (!approved.has(path)) throw new Error("Unapproved changed file: " + path);
  }
  for (const path of approved) {
    if (!actual.includes(path)) throw new Error("Approved file missing from diff: " + path);
  }
  return true;
}

function validateLiveMarker(data, origin, expected) {
  if (!data || typeof data !== "object" ||
      data.app !== "VolunServe" ||
      data.firebaseProject !== "volunserve-3aa5b" ||
      typeof data.revision !== "string" || !SHA.test(data.revision)) {
    throw new Error("Invalid release marker from " + origin);
  }
  if (data.revision !== expected) {
    throw new Error(origin + " revision " + data.revision + " differs from approved live base " + expected + "; STOP");
  }
  return data.revision;
}

async function verifyBothLiveHosts(expected, fetchImpl = fetch) {
  for (const origin of HOSTS) {
    const url = origin + "/volunserve-release.json";
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: "error",
        headers: { "cache-control": "no-cache", accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
    } catch (error) {
      throw new Error("Cannot verify " + origin + ": " + (error.message || String(error)) + "; STOP");
    }
    if (!response.ok || !String(response.headers.get("content-type") || "").includes("json")) {
      throw new Error(origin + " did not return a JSON release marker (HTTP " + response.status + "); STOP");
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error("Unreadable JSON release marker from " + origin + "; STOP"); }
    validateLiveMarker(data, origin, expected);
  }
}

function defaultGit(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

async function runGuard({ env = process.env, git = defaultGit, fetchImpl = fetch } = {}) {
  const base = requireSha(env.VOLUNSERVE_APPROVED_LIVE_SHA, "VOLUNSERVE_APPROVED_LIVE_SHA");
  const approvedHead = requireSha(env.VOLUNSERVE_APPROVED_CANDIDATE_SHA, "VOLUNSERVE_APPROVED_CANDIDATE_SHA");
  const approvedFiles = parseApprovedFiles(env.VOLUNSERVE_APPROVED_FILES_JSON);
  const head = git(["rev-parse", "HEAD"]).trim();
  requireSha(head, "Checked-out HEAD");
  if (head !== approvedHead) throw new Error("HEAD is " + head + ", not approved candidate " + approvedHead + "; STOP");
  git(["cat-file", "-e", base + "^{commit}"]);
  try { git(["merge-base", "--is-ancestor", base, head]); }
  catch { throw new Error("Candidate is not descended from exact approved LIVE source; STOP"); }
  const trackedEdits = git(["status", "--porcelain", "--untracked-files=no"]).trim();
  if (trackedEdits) throw new Error("Checkout has uncommitted tracked modifications; STOP");
  const changes = parseNameStatusZ(git(["diff", "--name-status", "-z", base, head]));
  checkFileApproval(changes, approvedFiles);
  await verifyBothLiveHosts(base, fetchImpl);
  return { live: base, candidate: head, changedFiles: changes };
}

if (require.main === module) {
  runGuard().then(data => {
    console.log("PASS: both live domains match " + data.live);
    console.log("PASS: candidate " + data.candidate + " descends from live, with " + data.changedFiles.length + " exactly approved changed paths");
    console.log("READ-ONLY SOURCE GATE PASSED. This does NOT deploy or prove all user flows work.");
  }).catch(error => { console.error("LIVE-FIRST RELEASE BLOCKED: " + error.message); process.exitCode = 1; });
}

module.exports = { requireSha, parseApprovedFiles, parseNameStatusZ,
  prohibitedHostingPath, checkFileApproval, validateLiveMarker, verifyBothLiveHosts, runGuard };
