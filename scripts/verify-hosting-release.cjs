#!/usr/bin/env node
/**
 * Run after "npx expo export --platform web".
 * Prepares an auditable revision marker but NEVER deploys, resets data,
 * creates emergency reports, or contacts production Firestore.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
assert(fs.existsSync(path.join(dist, "index.html")),
  "Expo static export missing dist/index.html; do not deploy.");
const config = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
assert(config.hosting?.public === "dist", "Firebase Hosting must deploy dist only.");
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
assert(app.expo?.web?.output === "static", "Expo web output must remain static.");

const files = [];
const walk = folder => {
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, item.name);
    if (item.isDirectory()) walk(full);
    else files.push(path.relative(dist, full).replaceAll(path.sep, "/"));
  }
};
walk(dist);
const htmlRoutes = files.filter(file => file.endsWith(".html"));
const required = ["login", "admin-login", "disaster-response", "map-tracking", "my-cases", "community-events"];
const missing = required.filter(name =>
  !htmlRoutes.some(file => file === name + ".html" ||
    file === name + "/index.html" || file.endsWith("/" + name + ".html")));
if (missing.length) {
  console.error("Exported HTML routes:", htmlRoutes.slice(0, 100).join(", "));
  throw Error("Required remock routes missing from Expo export: " + missing.join(", "));
}
assert(files.some(file => /\.js$/.test(file)),
  "No JavaScript assets exported; web app could be blank.");

const sha = process.env.GITHUB_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert(/^[0-9a-f]{40}$/.test(sha), "Expected full Git SHA for release fingerprint.");
const manifest = {
  app: "VolunServe",
  firebaseProject: "volunserve-3aa5b",
  revision: sha,
  builtAt: new Date().toISOString(),
  releaseType: "firebase-hosting-web",
};
fs.writeFileSync(path.join(dist, "volunserve-release.json"),
  JSON.stringify(manifest, null, 2) + "\n");
console.log("PASS: required Expo web routes (" + required.join(", ") + ")");
console.log("PASS: Firebase Hosting dist config and JavaScript assets");
console.log("READY FOR HOSTING DEPLOY: revision " + sha.slice(0, 12));
console.log("NOT DEPLOYED: this script only prepares an export fingerprint.");
