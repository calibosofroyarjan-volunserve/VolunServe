"use strict";
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {getFirestore} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {createSignupEmailOtpService, OtpError} = require("./signupEmailOtpCore");

// Off in all current production Functions deployments unless explicitly
// enabled and both secrets and the verified sending domain are configured.
const RESEND_KEY = defineSecret("VOLUNSERVE_RESEND_API_KEY");
const EMAIL_OTP_PEPPER = defineSecret("VOLUNSERVE_EMAIL_OTP_PEPPER");

async function deliverEmail({to, code, lifetimeMinutes}) {
  const from = String(process.env.VOLUNSERVE_OTP_FROM_EMAIL || "").trim();
  const apiKey = RESEND_KEY.value();
  if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) || !apiKey) {
    throw new Error("Staging OTP sender not configured or verified");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "VolunServe <" + from + ">",
      to: [to],
      subject: "Your VolunServe verification code",
      text: "Your VolunServe verification code is " + code +
        ". It expires in " + lifetimeMinutes +
        " minutes. Never share this code. If you did not request it, ignore this message.",
      html: '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;' +
        'padding:28px;color:#0f172a"><h2 style="color:#065f46">VolunServe</h2>' +
        '<p>Use the six-digit code below to verify your email:</p>' +
        '<p style="font-size:34px;letter-spacing:8px;font-weight:700">' + code + '</p>' +
        '<p>Expires in ' + lifetimeMinutes + ' minutes. Never share this code.</p>' +
        '<p style="color:#64748b;font-size:12px">If you did not request this code, ignore this email.</p></div>',
    }),
  });
  if (!response.ok) throw new Error("Verification email provider rejected request");
}

function requestIdentity(request) {
  const uid = request?.auth?.uid;
  const email = request?.auth?.token?.email;
  if (!uid || !email) {
    throw new HttpsError("unauthenticated", "Sign in before requesting an email code.");
  }
  return {uid, email};
}

function buildService() {
  return createSignupEmailOtpService({
    db: getFirestore(),
    adminAuth: getAuth(),
    pepper: EMAIL_OTP_PEPPER.value(),
    deliverEmail,
  });
}

function withSafeOtpErrors(handler) {
  return async (request) => {
    try {
      const identity = requestIdentity(request);
      return await handler(buildService(), identity, request);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      if (err instanceof OtpError) throw new HttpsError(err.code, err.message);
      // Do not log or expose OTP values, secrets, provider response, UID or IP.
      throw new HttpsError("internal", "Email verification is temporarily unavailable.");
    }
  };
}

exports.requestResidentEmailOtp = onCall({
  region: "us-central1",
  maxInstances: 3,
  secrets: [RESEND_KEY, EMAIL_OTP_PEPPER],
}, withSafeOtpErrors((service, identity, request) =>
  service.send(identity, request.rawRequest?.ip || "")));

exports.confirmResidentEmailOtp = onCall({
  region: "us-central1",
  maxInstances: 3,
  secrets: [EMAIL_OTP_PEPPER],
}, withSafeOtpErrors((service, identity, request) =>
  service.verify(identity, request.data?.code)));
