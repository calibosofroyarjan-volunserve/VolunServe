import {initializeApp} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,getIdToken} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,query,where,limit} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Public Firebase web app fields (NOT a service-account credential).
// Strictly bound to existing identity-only staging Firebase, never production.
const stagingConfig = Object.freeze({
  apiKey:"AIzaSyDQgSgUT2QQivfq8CHbQKM0Df0mkCTFXFI",
  authDomain:"volunserve-auth-staging.firebaseapp.com",
  projectId:"volunserve-auth-staging",
  storageBucket:"volunserve-auth-staging.firebasestorage.app",
  messagingSenderId:"916160317396",
  appId:"1:916160317396:web:0626f2a622b6aa25027841"
});
const backend = "https://volunserve-backend-staging.onrender.com";
const permittedHosts = new Set([
  "volunserve-identity-test-staging.onrender.com", "localhost", "127.0.0.1"
]);

if (!permittedHosts.has(location.hostname) ||
    stagingConfig.projectId !== "volunserve-auth-staging" ||
    stagingConfig.authDomain !== stagingConfig.projectId + ".firebaseapp.com" ||
    new URL(backend).hostname !== "volunserve-backend-staging.onrender.com") {
  throw new Error("STAGING ISOLATION BLOCKED: wrong origin or Firebase/backend project");
}

const app = initializeApp(stagingConfig, "staging-community-certificate-test");
const auth = getAuth(app);
const db = getFirestore(app);
const el = id => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let adminEligible = false;
let busy = false;
let previewedEvent = "";
let currentCertificates = [];

function display(id, value) {
  el(id).textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function errorText(error) {
  const code = error && error.code ? String(error.code) : "";
  const msg = error && error.message ? String(error.message) : "Request failed.";
  // Do not expose token contents, credential values or verbose SDK internals.
  return (code ? code + ": " : "") + msg.slice(0, 240);
}
function updateButtons() {
  el("loginButton").disabled = busy || Boolean(currentUser);
  el("logoutButton").disabled = busy || !currentUser;
  el("loadEvents").disabled = busy || !adminEligible;
  el("previewSync").disabled = busy || !adminEligible;
  el("issueSync").disabled = busy || !adminEligible || !previewedEvent;
  el("loadCertificates").disabled = busy || !currentUser;
  el("verifyButton").disabled = busy;
}
function setBusy(next) {
  busy = Boolean(next);
  updateButtons();
}
function clearList(id) {
  el(id).replaceChildren();
}
function addLine(parent, text, cssClass = "") {
  const line = document.createElement("p");
  line.textContent = text;
  if (cssClass) line.className = cssClass;
  parent.appendChild(line);
  return line;
}
function addButton(parent, label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "alt";
  button.textContent = label;
  button.addEventListener("click", action);
  parent.appendChild(button);
  return button;
}
function normalizedId(raw) {
  const id = String(raw || "").trim().replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9-]{6,80}$/.test(id) ? id : "";
}
function exactEventId() {
  const id = el("eventId").value.trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) {
    throw new Error("Enter a valid staging Community Event document ID.");
  }
  return id;
}
function isApprovedAdmin(profile) {
  if (!profile || !["admin", "superadmin"].includes(String(profile.role || "").toLowerCase())) return false;
  if (String(profile.status || "approved").toLowerCase() !== "approved") return false;
  if (String(profile.adminStatus || "").toLowerCase() === "suspended") return false;
  return true;
}
async function checkProfile(user) {
  const snapshot = await getDoc(doc(db, "users", user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  currentProfile = null;
  adminEligible = false;
  previewedEvent = "";
  currentCertificates = [];
  clearList("eventList");
  clearList("certificateList");
  el("password").value = "";
  if (!user) {
    display("session", "Not signed in. Use an account from volunserve-auth-staging.");
    display("authResult", "Sign in with a staging test account.");
    display("eventResult", "Admin login required.");
    display("syncResult", "Admin login required.");
    display("certificateResult", "Volunteer staging login required.");
    updateButtons();
    return;
  }
  display("session", "Signed into separate staging Firebase: " + (user.email || "test account"));
  try {
    const profile = await checkProfile(user);
    if (auth.currentUser?.uid !== user.uid) return;
    currentProfile = profile;
    adminEligible = isApprovedAdmin(profile);
    const role = profile?.role ? String(profile.role) : "no staging Firestore profile";
    display("authResult", "Authentication succeeded in volunserve-auth-staging.\nProfile role: " + role +
      "\nAdmin certificate actions: " + (adminEligible ? "enabled" : "restricted"));
    display("eventResult", adminEligible ? "Load staging events to select an ID." : "Only approved staging Admins can view this list.");
    display("syncResult", adminEligible ? "Select a completed staging event and check eligibility first." : "Admin role is not approved in staging.");
    display("certificateResult", "Click Refresh my certificates to view this UID's staging records.");
  } catch (error) {
    display("authResult", "Staging Auth signed in, but users/{uid} profile was not readable: " + errorText(error));
    display("syncResult", "Admin permissions cannot be confirmed. Check staging Firestore rules/profile.");
  }
  updateButtons();
});
el("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || currentUser) return;
  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || !password) return;
  setBusy(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    display("authResult", "Staging sign-in accepted. Checking staging user profile…");
  } catch (error) {
    display("authResult", errorText(error));
  } finally {
    el("password").value = "";
    setBusy(false);
  }
});
el("logoutButton").addEventListener("click", async () => {
  if (!currentUser) return;
  setBusy(true);
  try { await signOut(auth); }
  catch (error) { display("authResult", errorText(error)); }
  finally { setBusy(false); }
});

el("loadEvents").addEventListener("click", async () => {
  if (!currentUser || !adminEligible) return;
  setBusy(true);
  clearList("eventList");
  try {
    const snapshot = await getDocs(query(collection(db, "communityEvents"), limit(40)));
    const events = snapshot.docs
      .map(d => ({id:d.id, ...(d.data() || {})}))
      .filter(d => d.status === "completed" && d.publicationStatus === "published");
    display("eventResult", events.length ? events.length + " completed/published staging events found." :
      "No completed published events found in the first 40 staging event documents. You can enter an event ID manually.");
    events.forEach(item => {
      const card = document.createElement("div");
      card.className = "item";
      const label = document.createElement("strong");
      label.textContent = String(item.title || "Community Event").slice(0, 120);
      card.appendChild(label);
      addLine(card, "Document ID: " + item.id, "muted");
      addButton(card, "Select event", () => {
        el("eventId").value = item.id;
        previewedEvent = "";
        display("syncResult", "Selected " + item.id + ". Check eligibility before issuing.");
        updateButtons();
      });
      el("eventList").appendChild(card);
    });
  } catch (error) {
    display("eventResult", "Could not list staging events: " + errorText(error));
  } finally { setBusy(false); }
});

el("eventId").addEventListener("input", () => {
  previewedEvent = "";
  updateButtons();
});
async function certificateSync(execute) {
  if (!currentUser || !adminEligible) return;
  const eventId = exactEventId();
  if (execute && previewedEvent !== eventId) {
    throw new Error("Check eligibility for this exact event before issuing.");
  }
  if (execute && !window.confirm("Issue eligible certificates in STAGING ONLY for this event? This writes staging certificate records.")) return;
  setBusy(true);
  try {
    const token = await getIdToken(currentUser);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 110000);
    let response;
    try {
      response = await fetch(backend + "/api/admin/community-certificates/reconcile", {
        method:"POST", redirect:"error", signal:controller.signal,
        headers: { "Content-Type":"application/json", Authorization:"Bearer " + token },
        body: JSON.stringify({eventId, execute})
      });
    } finally { clearTimeout(timeout); }
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      previewedEvent = "";
      display("syncResult", "Certificate sync failed (HTTP " + response.status + "): " +
        (data?.message || data?.reason || data?.error || "Try again."));
      return;
    }
    if (execute) previewedEvent = "";
    else previewedEvent = eventId;
    display("syncResult", "Staging event: " + eventId + "\n" +
      (execute ? "EXECUTED" : "PREVIEW ONLY") + "\n" +
      "Eligible: " + Number(data.eligibleCount || 0) + "\n" +
      "Issued: " + Number(data.issuedCount || 0) + "\n" +
      "Already existing: " + Number(data.alreadyExistingCount || 0) + "\n" +
      "Skipped: " + Number(data.skippedCount || 0) + "\n" +
      "Failed: " + Number(data.failedCount || 0) + "\n" +
      (data.message || ""));
  } catch (error) {
    previewedEvent = "";
    display("syncResult", "Staging certificate sync failed: " + errorText(error));
  } finally { setBusy(false); }
}
el("previewSync").addEventListener("click", () => { void certificateSync(false); });
el("issueSync").addEventListener("click", () => { void certificateSync(true); });

function safePrintableText(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function printStagingCertificate(record) {
  if (record.verificationStatus !== "issued") {
    display("certificateResult", "A revoked or unissued certificate cannot be printed.");
    return;
  }
  const popup = window.open("", "_blank");
  if (!popup) {
    display("certificateResult", "Pop-up blocked. Please allow pop-ups for this staging test site.");
    return;
  }
  // This is a lightweight staging preview, not the official production paper template.
  const title = safePrintableText(record.eventTitle || "Community Event");
  const name = safePrintableText(record.volunteerName || "Staging Volunteer");
  const id = safePrintableText(record.certificateId || record.id || "");
  const minutes = Math.max(0, Number(record.verifiedServiceMinutes) || 0);
  popup.document.open();
  popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>STAGING ONLY - Certificate Test</title>' +
    '<style>@page{size:A4 portrait;margin:15mm}body{font:16px Arial;text-align:center;margin:45mm 15mm;color:#133f38}' +
    'h1{font:bold 32px Georgia}h2{font:24px Georgia;margin:20px}p{line-height:1.7}.id{margin-top:40px;font-size:12px}</style></head><body>' +
    '<p>VOLUNSERVE — STAGING TEST PRINT (NOT AN OFFICIAL CERTIFICATE)</p>' +
    '<h1>Certificate of Participation</h1><p>Issued to</p><h2>' + name + '</h2>' +
    '<p>Community Event: ' + title + '</p><p>Admin-verified service: ' +
    safePrintableText(minutes) + ' minutes</p><div class="id">Certificate ID: ' + id + '</div></body></html>');
  popup.document.close();
  popup.focus();
  popup.addEventListener("load", () => popup.print(), {once:true});
}

el("loadCertificates").addEventListener("click", async () => {
  if (!currentUser) return;
  setBusy(true);
  clearList("certificateList");
  currentCertificates = [];
  try {
    const snapshot = await getDocs(query(collection(db, "certificates"),
      where("volunteerId", "==", currentUser.uid), limit(35)));
    const certificates = snapshot.docs
      .map(d => ({id:d.id, ...(d.data() || {})}))
      .filter(d => d.certificateType === "community_event_participation");
    currentCertificates = certificates;
    display("certificateResult", certificates.length ?
      certificates.length + " Community Event staging certificate(s) found for this Auth UID." :
      "No Community Event staging certificates found for this user. An Admin must first issue a valid certificate.");
    certificates.forEach(record => {
      const card = document.createElement("div");
      card.className = "item";
      const heading = document.createElement("strong");
      heading.textContent = String(record.eventTitle || "Community Event").slice(0, 120);
      card.appendChild(heading);
      addLine(card, "Certificate ID: " + String(record.certificateId || record.id), "muted");
      addLine(card, "Status: " + String(record.verificationStatus || "unknown") +
        " · Verified service: " + Number(record.verifiedServiceMinutes || 0) + " min", "muted");
      const actions = document.createElement("div");
      actions.className = "row";
      addButton(actions, "Verify public ID", () => {
        el("verifyId").value = String(record.certificateId || record.id);
        void verifyId();
      });
      if (record.verificationStatus === "issued") {
        addButton(actions, "Print staging test copy", () => printStagingCertificate(record));
      }
      card.appendChild(actions);
      el("certificateList").appendChild(card);
    });
  } catch (error) {
    display("certificateResult", "Could not read this staging user's certificates: " + errorText(error));
  } finally { setBusy(false); }
});

async function verifyId() {
  const id = normalizedId(el("verifyId").value);
  if (!id) {
    display("verifyResult", "Enter a valid Certificate ID (letters, digits, hyphen; 6–80 characters).");
    return;
  }
  setBusy(true);
  try {
    const snapshot = await getDoc(doc(db, "publicCertificateVerifications", id));
    if (!snapshot.exists()) {
      display("verifyResult", "No certificate found in STAGING for ID: " + id);
      return;
    }
    const record = snapshot.data() || {};
    if (normalizedId(record.certificateId || snapshot.id) !== id) {
      display("verifyResult", "STAGING VERIFICATION ERROR: certificate record ID mismatch.");
      return;
    }
    const status = String(record.verificationStatus || "unknown");
    display("verifyResult", "STAGING CERTIFICATE ID: " + id + "\n" +
      "Status: " + status.toUpperCase() +
      (status === "revoked" ? " (NOT VALID)" : "") + "\n" +
      "Event: " + String(record.eventTitle || "Not provided") + "\n" +
      "Volunteer: " + String(record.volunteerName || "Not provided") + "\n" +
      "Verified minutes: " + Number(record.verifiedServiceMinutes || 0));
  } catch (error) {
    display("verifyResult", "Staging verification unavailable: " + errorText(error));
  } finally { setBusy(false); }
}
el("verifyButton").addEventListener("click", () => { void verifyId(); });
updateButtons();
