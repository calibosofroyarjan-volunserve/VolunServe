"use strict";

/**
 * True browser QA using LOCAL Firebase Auth and Firestore emulators.
 *
 * Run only on a temporary checkout where lib/firebase.ts has been patched
 * (not committed) to enable local emulators. This test blocks outbound
 * requests from the browser, so it cannot contact production Firebase,
 * payment providers, Maps APIs or Render.
 *
 * Required: emulator env vars, expo web dist/ output, playwright,
 * firebase-admin, and Chromium installed on the CI runner.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const admin = require("firebase-admin");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const baseUrl = "http://127.0.0.1:4173";
const emailPassword = "QaHeaderTest-2026!";

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST.includes("127.0.0.1") ||
    !process.env.FIRESTORE_EMULATOR_HOST.includes("127.0.0.1")) {
  throw Error("BLOCKED: both LOCAL Firebase emulators are required");
}
if (!fs.existsSync(path.join(dist, "index.html"))) {
  throw Error("BLOCKED: Expo test build missing");
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", baseUrl);
  const cleanPath = decodeURIComponent(url.pathname);
  const relative = cleanPath.replace(/^\/+/, "");
  const candidates = relative
    ? [relative, relative + ".html", relative + "/index.html", "index.html"]
    : ["index.html"];
  const match = candidates.map(candidate => path.resolve(dist, candidate))
    .find(file => file.startsWith(dist + path.sep) &&
      fs.existsSync(file) && fs.statSync(file).isFile());
  if (!match) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[path.extname(match)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(match).pipe(response);
});

async function createUser(db, auth, name, mode) {
  const email = mode === "resident" ? "header.qa.resident@gmail.com" : "header.qa.volunteer@gmail.com";
  const user = await auth.createUser({
    email, password: emailPassword, emailVerified: true,
    displayName: name,
  });
  await db.doc("users/" + user.uid).set({
    uid: user.uid, fullName: name, firstName: name.split(" ")[0],
    lastName: "Tester", age: 26, email, phoneNumber: "",
    role: "resident", status: "approved", residentAccess: true,
    volunteerAccess: mode === "volunteer",
    volunteerStatus: mode === "volunteer" ? "approved" : "pending",
    activeMode: mode, identityStatus: "verified",
    identityVerified: true, barangay: "Poblacion",
    city: "City of San Jose del Monte", province: "Bulacan",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    isTestAccount: true,
  });
  return email;
}
async function clickAndCheck(page, label) {
  const button = page.getByRole("button", { name: label });
  await button.waitFor({ state: "visible", timeout: 15000 });
  await button.click({ timeout: 15000 });
}
async function accountAndBell(page, mode, route) {
  const show = async p => {
    await page.screenshot({path: path.join(root, "test-artifacts", mode + "-" + route + "-" + p + ".png")}).catch(() => {});
  };
  try {
    await page.goto(baseUrl + "/" + route, { waitUntil: "domcontentloaded", timeout: 25000 });
    const bell = page.getByRole("button", { name: "Open notifications" });
    await bell.waitFor({ state: "visible", timeout: 25000 });
    await bell.click({ timeout: 15000 });
    const all = page.getByRole("button", { name: "View all notifications" });
    await all.waitFor({ state: "visible", timeout: 12000 });
    // Playwright refuses a covered/blocked element, so this tests the portal
    // overlay above screen cards, maps and scrollable content.
    await all.click({ trial: true, timeout: 12000 });
    if (route === "disaster-response" || route === "volunteer" || route === "community-events") {
      await show("notifications");
    }
    // The close icon is a labelled Pressable, not always exposed with role=button.
    await page.getByLabel("Close notifications").click({ timeout: 15000 });
    await clickAndCheck(page, "Open account menu");
    const profile = page.getByRole("button", { name: "My Profile", exact: true });
    await profile.waitFor({ state: "visible", timeout: 12000 });
    await profile.click({ trial: true, timeout: 12000 });
    const logout = page.getByRole("button", { name: "Log Out", exact: true });
    await logout.waitFor({ state: "visible", timeout: 12000 });
    await logout.click({ trial: true, timeout: 12000 });
    if (mode === "resident") {
      await page.getByRole("button", { name: "My Reports", exact: true }).waitFor({ state: "visible" });
    }
    if (route === "disaster-response" || route === "volunteer" || route === "community-events") {
      await show("profile");
    }
    await clickAndCheck(page, "Close menu");
    console.log("PASS browser " + mode + " /" + route + ": bell, overlay, My Profile, account actions");
  } catch (error) {
    await show("ERROR");
    throw new Error("FAIL browser " + mode + " /" + route + ": " + (error && error.message || error));
  }
}
async function signIn(page, email, mode) {
  await page.goto(baseUrl + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(emailPassword);
  await clickAndCheck(page, "Sign In");
  await page.waitForURL(url => !url.pathname.includes("login"), { timeout: 25000 });
  console.log("PASS authenticated " + mode + " session with LOCAL Firebase Auth emulator");
}
async function main() {
  fs.mkdirSync(path.join(root, "test-artifacts"), { recursive: true });
  admin.initializeApp({ projectId: "demo-volunserve" });
  const residentEmail = await createUser(admin.firestore(), admin.auth(), "Resident Tester", "resident");
  const volunteerEmail = await createUser(admin.firestore(), admin.auth(), "Volunteer Tester", "volunteer");

  await new Promise(resolve => server.listen(4173, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ["resident", "volunteer"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      // Prevent test browsers from contacting any production API or service.
      await context.route("**/*", route => {
        const u = new URL(route.request().url());
        if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
          return route.continue();
        }
        return route.abort("blockedbyclient");
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      try {
        await signIn(page, mode === "resident" ? residentEmail : volunteerEmail, mode);
        const modules = mode === "resident"
          ? ["disaster-response", "resident", "community-events", "donation", "my-cases", "profile", "notifications"]
          : ["volunteer", "community-events", "certificate", "profile", "notifications"];
        for (const moduleName of modules) await accountAndBell(page, mode, moduleName);
      } finally {
        await context.close();
      }
    }
    console.log("PASS: all Resident and Volunteer desktop modules interact with header");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    await admin.app().delete();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
