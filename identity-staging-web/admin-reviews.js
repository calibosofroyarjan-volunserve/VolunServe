// Staging-only authenticated Admin queue; no biometric uploads or persistence.
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  inMemoryPersistence, setPersistence,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  reviewBucket, availableMethods, METHOD_LABELS,
  canVerify, canRequireRetry, evidenceConflicts,
  screeningDescription, mrzDescription,
} from "./admin-review-guards.mjs";

// Public staging Firebase SDK configuration; no Firebase Admin private key.
const config = Object.freeze({
  apiKey:"AIzaSyBvBU0Ze4TBBgsgoLtmPUk9W0xN7kBNWRQ",
  authDomain:"volunserve-full-staging.firebaseapp.com",
  projectId:"volunserve-full-staging",
  storageBucket:"volunserve-full-staging.firebasestorage.app",
  messagingSenderId:"429213950126",
  appId:"1:429213950126:web:955dbf575697826b674d3f",
});
const BACKEND = "https://volunserve-backend-staging.onrender.com";
const SITE = "volunserve-identity-test-staging.onrender.com";
const enabled = location.protocol === "https:" &&
  location.hostname === SITE &&
  config.projectId === "volunserve-full-staging" &&
  config.authDomain === "volunserve-full-staging.firebaseapp.com" &&
  new URL(BACKEND).origin === "https://volunserve-backend-staging.onrender.com";

const el = id => document.getElementById(id);
const $ = (name, value, className) => {
  const node = document.createElement(name);
  if (value !== undefined) node.textContent = String(value);
  if (className) node.className = className;
  return node;
};
const auth = enabled ? getAuth(initializeApp(config, "admin-review-staging")) : null;
let signedIn = null;
let reviews = [];
let selectedUid = "";
let page = 1;
let isBusy = false;
let hasAccess = false;
const PAGE_SIZE = 5;

function notice(message, kind="normal") {
  el("error").textContent = message;
  el("error").classList.toggle("hidden",!message);
  el("error").classList.toggle("danger",kind === "bad");
}
function clearPrivateState() {
  reviews = [];
  selectedUid = "";
  page = 1;
  hasAccess = false;
  el("workspace").classList.add("hidden");
  el("details").replaceChildren($("div","Sign in with an approved staging Admin account.","empty"));
  el("decisionForm").classList.add("hidden");
  el("queue").replaceChildren($("div","No staging review records loaded.","empty"));
  el("count").textContent = "No records loaded.";
  el("password").value = "";
  el("notes").value = "";
  el("attestation").checked = false;
}
function getSelected() {
  return reviews.find(item => item.uid === selectedUid) || null;
}
function safeMessage(body, response) {
  if (response.status === 401 || response.status === 403) {
    return "Only approved staging Admin test accounts may use this workspace.";
  }
  if (response.status === 409) {
    return "Review changed or ID evidence is inconsistent. Refresh and request corrected evidence.";
  }
  if (response.status === 423) {
    return "Staging ID/selfie media uploads remain disabled. Admin review requires existing authorized records.";
  }
  return String(body?.message || body?.error || "Staging backend is unavailable.").slice(0,260);
}
async function authorizedRequest(path,options={}) {
  const user=signedIn;
  if (!enabled || !user) throw new Error("Staging Admin sign-in is required.");
  const token=await user.getIdToken(true);
  if (signedIn !== user) throw new Error("Signed out; request cancelled.");
  const response=await fetch(BACKEND + path,{
    ...options,cache:"no-store",credentials:"omit",
    headers:{
      Authorization:"Bearer " + token,
      ...(options.body ? {"Content-Type":"application/json"} : {}),
    },
  });
  const body=await response.json().catch(()=>null);
  if (signedIn !== user) throw new Error("Signed out; request cancelled.");
  if (!response.ok || body?.ok !== true) throw new Error(safeMessage(body,response));
  return body;
}
function filtered() {
  const q=el("search").value.trim().toLowerCase();
  const filter=el("filter").value;
  return reviews.filter(item=>{
    if (filter !== "all" && reviewBucket(item) !== filter) return false;
    if (!q) return true;
    return [item.resident?.fullName,item.resident?.barangay,item.verificationId,item.uid]
      .filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
  });
}
function renderQueue() {
  const items=filtered();
  const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  page=Math.max(1,Math.min(page,pages));
  el("pageCount").textContent="Page " + page + " of " + pages;
  el("count").textContent=items.length + " matching review(s) · up to " + PAGE_SIZE + " per page";
  el("previous").disabled=isBusy || page<=1;
  el("next").disabled=isBusy || page>=pages;
  const list=el("queue");
  list.replaceChildren();
  if (!items.length) {
    list.append($("div","No matching reviews. Only authorized staging submissions appear here.","empty"));
    return;
  }
  for (const item of items.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)) {
    const button=$("button",undefined,"case");
    button.type="button";
    if (item.uid === selectedUid) button.classList.add("selected");
    button.setAttribute("aria-pressed",item.uid === selectedUid ? "true":"false");
    button.append(
      $("strong",item.resident?.fullName || "Resident"),
      $("span",reviewBucket(item).replaceAll("_"," ")+" · "+(item.resident?.barangay || "Barangay not set")),
      $("span","Verification "+(item.verificationId || "not assigned")),
    );
    button.addEventListener("click",()=>{
      selectedUid=item.uid;
      el("notes").value="";
      el("attestation").checked=false;
      el("method").value="";
      renderQueue();
      renderDetail();
    });
    list.append(button);
  }
}
function pair(container,label,value) {
  const row=$("div",undefined,"keyval");
  row.append($("span",label),$("span",String(value ?? "Not available")));
  container.append(row);
}
function renderDetail() {
  const detail=el("details");
  detail.replaceChildren();
  const item=getSelected();
  el("decisionForm").classList.add("hidden");
  if (!item) {
    detail.append($("div","Select a review to inspect its evidence.","empty"));
    return;
  }
  const doc=item.documentScreening || null;
  detail.append($("h3",item.resident?.fullName || "Resident"));
  pair(detail,"Account",item.resident?.email || "No email supplied");
  pair(detail,"Barangay",item.resident?.barangay || "Not set");
  pair(detail,"Status",reviewBucket(item).replaceAll("_"," "));
  pair(detail,"Verification ID",item.verificationId || "Not assigned");
  pair(detail,"Submitted",item.lastSubmissionAt || item.createdAt || "Not recorded");
  pair(detail,"Selected ID",doc?.declaredIdType || "Unknown");
  pair(detail,"OCR classification",doc?.status || "No document screening");
  pair(detail,"Document evidence",screeningDescription(doc));
  pair(detail,"Back of ID",doc?.declaredIdType==="passport" ? "Passport bio page only"
    : doc?.backSideScreened === true ? "Both sides OCR screened" : "Not confirmed");
  pair(detail,"Account name OCR",doc?.profileNameCheck || "not_checked");
  pair(detail,"Birthday OCR comparison",doc?.profileBirthDateCheck || "not_checked");
  pair(detail,"Barangay OCR comparison",doc?.profileAddressCheck || "not_checked");
  const mrz=mrzDescription(doc);
  if (mrz !== null) {
    pair(detail,"Passport MRZ check",mrz);
    pair(detail,"MRZ birthday vs profile",doc?.passportMrzBirthDateCheck || "not_checked");
  }
  pair(detail,"Issuer authenticity","Not independently verified by this AI");
  pair(detail,"Biometric anti-spoofing","Not validated / no automatic identity decision");
  pair(detail,"Warnings",Array.isArray(doc?.warningCodes) && doc.warningCodes.length
    ? doc.warningCodes.join(", ") : "None from OCR (not proof of authenticity)");

  if (reviewBucket(item) !== "pending") {
    pair(detail,"Manual decision",item.manualReviewDecision || item.decision || "Not recorded");
    pair(detail,"Independent method",item.manualValidationMethod || "Not recorded");
    pair(detail,"Reviewed by",item.reviewedByName || "Not recorded");
    pair(detail,"Reviewed at",item.reviewedAt || "Not recorded");
    return;
  }
  const method=el("method");
  method.replaceChildren($("option","Choose a validation method"));
  method.firstChild.value="";
  for (const value of availableMethods(doc?.declaredIdType)) {
    const option=$("option",METHOD_LABELS[value]);
    option.value=value;
    method.append(option);
  }
  if (evidenceConflicts(doc)) {
    el("riskNotice").textContent="ID evidence has unresolved MRZ or profile DOB inconsistencies. Verify is blocked. Request corrected evidence; OCR contradiction is not proof of fraud.";
    el("riskNotice").classList.add("danger");
  } else {
    el("riskNotice").textContent="Preliminary AI screening only. Independently check government-issued ID through an approved LGU/issuer process before verification.";
    el("riskNotice").classList.remove("danger");
  }
  el("decisionForm").classList.remove("hidden");
  renderButtons();
}
function renderButtons() {
  const item=getSelected();
  el("verify").disabled=!hasAccess || !canVerify({
    review:item,method:el("method").value,
    attested:el("attestation").checked,notes:el("notes").value,busy:isBusy,
  });
  el("retry").disabled=!hasAccess || !canRequireRetry({
    review:item,notes:el("notes").value,busy:isBusy,
  });
  el("refresh").disabled=isBusy || !hasAccess;
}
async function loadReviews() {
  if (!signedIn || isBusy) return;
  isBusy=true;
  notice("");
  renderButtons();
  try {
    const body=await authorizedRequest("/api/admin/identity/reviews");
    reviews=Array.isArray(body.items) ? body.items : [];
    hasAccess=true; // Node verifies a Firebase token and approved operational Admin.
    if (selectedUid && !getSelected()) selectedUid="";
    el("workspace").classList.remove("hidden");
    renderQueue();
    renderDetail();
  } catch (error) {
    clearPrivateState();
    notice(error instanceof Error ? error.message : "Unable to load Admin reviews.","bad");
  } finally {
    isBusy=false;
    renderButtons();
    if (hasAccess) renderQueue();
  }
}
async function decide(action) {
  const item=getSelected(),method=el("method").value;
  const notes=el("notes").value.trim(),attested=el("attestation").checked;
  if (!hasAccess || !item || isBusy) return;
  const valid=action==="verify"
    ? canVerify({review:item,method,notes,attested,busy:isBusy})
    : canRequireRetry({review:item,notes,busy:isBusy});
  if (!valid) return;
  const confirmed=window.confirm(action==="verify"
    ? "Confirm: you personally completed the independent official/LGU identity check? This changes the staging Resident account."
    : "Confirm: require the staging Resident to retry identity verification?");
  if (!confirmed) return;
  isBusy=true;
  renderButtons();
  try {
    await authorizedRequest("/api/admin/identity/reviews/"+encodeURIComponent(item.uid)+"/decision",{
      method:"POST",body:JSON.stringify({
        action,validationMethod:action==="verify" ? method : "",
        issuerReviewAttested:action==="verify" && attested,notes,
      }),
    });
    notice(action==="verify" ? "Staging manual verification saved and audited."
      : "Retry required. Staging Resident must submit corrected evidence.");
    selectedUid="";
    reviews=[]; // Never show stale results after an Admin state change.
    isBusy=false;
    await loadReviews();
  } catch (error) {
    notice(error instanceof Error ? error.message : "Unable to save decision.","bad");
  } finally {
    isBusy=false;
    renderButtons();
  }
}

el("login").addEventListener("submit",async event=>{
  event.preventDefault();
  if (!enabled || !auth || isBusy || signedIn) return;
  isBusy=true;
  el("loginButton").disabled=true;
  notice("");
  try {
    await setPersistence(auth,inMemoryPersistence);
    await signInWithEmailAndPassword(auth,el("email").value.trim(),el("password").value);
    el("password").value="";
  } catch {
    notice("Staging sign-in failed. Check email, password and account approval. Do not use production credentials.","bad");
  } finally {
    isBusy=false;
    el("loginButton").disabled=!!signedIn || !enabled;
    el("password").value="";
    // onAuthStateChanged may fire while signIn() is still busy.
    // Ensure the first Admin queue fetch is not silently skipped.
    if (signedIn && !hasAccess) void loadReviews();
  }
});
el("logoutButton").addEventListener("click",async()=>{
  if (!auth) return;
  clearPrivateState();
  notice("");
  await signOut(auth).catch(()=>notice("Could not complete sign out. Close this tab.","bad"));
});
el("filter").addEventListener("change",()=>{page=1;renderQueue();});
el("search").addEventListener("input",()=>{page=1;renderQueue();});
el("previous").addEventListener("click",()=>{page--;renderQueue();});
el("next").addEventListener("click",()=>{page++;renderQueue();});
el("refresh").addEventListener("click",()=>void loadReviews());
for (const id of ["method","notes","attestation"]) {
  el(id).addEventListener(id==="notes"?"input":"change",renderButtons);
}
el("verify").addEventListener("click",()=>void decide("verify"));
el("retry").addEventListener("click",()=>void decide("require_retry"));

if (!enabled) {
  el("loginButton").disabled=true;
  notice("BLOCKED: this Admin workspace is only available on the dedicated HTTPS staging preview hostname.","bad");
} else {
  onAuthStateChanged(auth,user=>{
    clearPrivateState();
    signedIn=user;
    el("loginButton").disabled=!!user;
    el("logoutButton").classList.toggle("hidden",!user);
    el("account").textContent=user
      ? "Signed in to full staging: "+(user.email || "test account")+". Checking operational Admin access."
      : "Not signed in. Only approved staging Admin accounts can continue.";
    if (user) void loadReviews();
  });
}
