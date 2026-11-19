"use strict";
const assert = require("node:assert/strict");

// Manual staging-only delivery smoke test. Exactly one email, never OTP.
// The API key is supplied only from GitHub Actions staging environment secrets.
const from = String(process.env.VOLUNSERVE_OTP_TEST_FROM || "").trim().toLowerCase();
const to = String(process.env.VOLUNSERVE_OTP_TEST_TO || "").trim().toLowerCase();
const key = String(process.env.RESEND_API_KEY_STAGING || "").trim();

function allowedEmail(value) {
  return /^[a-z0-9._%-]+@(gmail\.com|yahoo\.com)$/.test(value);
}
function senderDomain(value) {
  const [,domain] = value.split("@");
  return domain || "";
}
function verifiedDomainMatch(verifiedName, sender) {
  const name=String(verifiedName || "").toLowerCase();
  return sender===name || sender.endsWith("."+name);
}

async function main() {
  assert.equal(process.env.VOLUNSERVE_STAGING_CONFIRM_SEND,
    "YES_SEND_ONE_TEST_EMAIL",
    "Manual confirmation required before sending a real email.");
  assert(allowedEmail(to),
    "Test recipient must be a user-controlled Gmail/Yahoo email.");
  assert(/^[^\s@]+@(?:[a-z0-9-]+\.)*volunserve\.com$/.test(from),
    "Sending address must belong to volunserve.com or a subdomain.");
  assert(key.startsWith("re_") && key.length>16,
    "Missing staging Resend API key secret. Do NOT enter keys in GitHub workflow inputs.");
  const get=await fetch("https://api.resend.com/domains",{
    headers:{Authorization:"Bearer "+key},
    signal:AbortSignal.timeout(15000),
  });
  assert(get.ok,
    "Could not inspect Resend sender domain status. HTTP "+get.status);
  const domainData=await get.json();
  const sender=senderDomain(from);
  const match=(domainData.data || []).find(d=>
    d.status==="verified" && verifiedDomainMatch(d.name,sender));
  assert(match,
    "Sender domain has not been verified in Resend. Complete required DNS records first.");
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+key,
      "Content-Type":"application/json",
      "Idempotency-Key":"volunserve-staging-once-"+String(process.env.GITHUB_RUN_ID||"manual"),
    },
    signal:AbortSignal.timeout(15000),
    body:JSON.stringify({
      from:"VolunServe Staging <"+from+">",
      to:[to],
      subject:"VolunServe: email delivery test (not a verification code)",
      text:"This is a one-time VolunServe staging delivery test. It is not an OTP and will not verify an account. No action is required.",
    }),
  });
  assert(response.ok,
    "Test delivery request failed: HTTP "+response.status);
  const data=await response.json();
  assert(typeof data.id==="string","Provider did not return a delivery request identifier.");
  console.log("PASS: Verified sender domain, Resend accepted exactly one staging test email.");
  console.log("Check the designated Gmail/Yahoo test inbox (including Spam) for actual receipt.");
  console.log("No Firebase Auth/Firestore changes, signup action or production deploy occurred.");
}
main().catch(error=>{console.error("BLOCKED: "+String(error.message||error).slice(0,450));process.exitCode=1;});
