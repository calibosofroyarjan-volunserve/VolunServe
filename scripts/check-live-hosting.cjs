#!/usr/bin/env node
/**
 * Public, read-only smoke check for Firebase Hosting.
 * No sign-in, Firestore writes, secrets, GPS, payments, or dispatch.
 * A 200 response is NOT an authenticated end-to-end test.
 */
const { URL } = require("node:url");
const base = process.env.VOLUNSERVE_HOSTING_URL || "https://volunserve.com";
const origin = new URL(base);
if (origin.protocol !== "https:" || origin.username || origin.password ||
    origin.search || origin.hash || origin.pathname !== "/") {
  throw Error("Specify a HTTPS origin without credentials or path.");
}
const required = ["/", "/login", "/admin-login", "/disaster-response",
  "/map-tracking", "/my-cases", "/community-events"];
let failures = 0;
async function get(route, expectJson = false) {
  const href = new URL(route, origin).href;
  try {
    const response = await fetch(href, { redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "accept": expectJson ? "application/json" : "text/html",
        "cache-control": "no-cache" } });
    const type = response.headers.get("content-type") || "";
    const body = (await response.text()).slice(0, 12000);
    if (!response.ok || !type.includes(expectJson ? "json" : "html") ||
        body.length < 30 || (!expectJson && !body.includes("<html"))) {
      failures++;
      console.error("FAIL " + route + ": HTTP " + response.status +
        " / " + type + " / bytes " + body.length);
      return null;
    }
    console.log("PASS " + route + ": HTTP " + response.status + " / " + type);
    return body;
  } catch (error) {
    failures++;
    console.error("BLOCKED " + route + ": " + (error?.message || String(error)));
    return null;
  }
}
async function main() {
  for (const url of required) await get(url);
  const text = await get("/volunserve-release.json", true);
  let manifest = null;
  if (text) {
    try {
      manifest = JSON.parse(text);
      if (manifest.app !== "VolunServe" ||
          manifest.firebaseProject !== "volunserve-3aa5b" ||
          !/^[0-9a-f]{40}$/.test(manifest.revision)) throw Error("Invalid revision metadata");
      console.log("LIVE HOSTING REVISION " + manifest.revision + " built " + manifest.builtAt);
    } catch (e) { failures++; console.error("FAIL release marker: " + e.message); }
  }
  const expected = process.env.VOLUNSERVE_EXPECTED_SHA;
  if (expected) {
    if (manifest?.revision !== expected) {
      failures++;
      console.error("NOT DEPLOYED / REVISION MISMATCH: expected " + expected +
        ", observed " + (manifest?.revision || "none"));
    } else console.log("PASS: live Hosting serves expected GitHub revision");
  }
  console.log("Production smoke: " + (failures ? failures + " failures or unknowns" : "public routes and marker verified"));
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
