"use strict";

/**
 * Spark-compatible LGU staff onboarding: Cloudinary authenticated proof images
 * and Firebase Admin SDK-only account review. Does not change existing routes,
 * Firestore Rules, Storage Rules, or other images.
 */
const crypto = require("node:crypto");
const express = require("express");

const TYPES = Object.freeze(["staff-id", "appointment-letter"]);
const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PRIVATE_TTL = 300;
const KIND_PATTERN = /^(staff-id|appointment-letter)$/;
const UID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;
const OFFICIAL_METHODS = new Set([
  "In-person verification at LGU office",
  "Official LGU phone callback",
  "Official LGU email confirmation",
  "Official appointment records verification",
]);
const ALLOWED_BARANGAY = /^[\p{L}\p{M}0-9 .'-]{2,100}$/u;

function error(status, code, message) {
  const e = new Error(message);
  e.statusCode = status;
  e.code = code;
  return e;
}
const trimmed = (x, n = 200) => typeof x === "string" ? x.trim().replace(/\s+/g, " ").slice(0, n + 1) : "";
function validateText(value, min, max, name) {
  const text = trimmed(value, max);
  if (text.length < min || text.length > max) throw error(400, "invalid_" + name, "Invalid " + name + " (required " + min + "–" + max + " characters).");
  return text;
}
function imageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > MAX_BYTES) {
    throw error(400, "invalid_lgu_credential_image", "Choose an image under 3 MB.");
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw error(415, "unsupported_lgu_credential_image", "Only valid JPG, PNG and WEBP images are accepted.");
}
function respondError(response, err) {
  response.set("Cache-Control", "no-store");
  const status = Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  if (status >= 500) console.error("LGU credential workflow failed:", err?.code || err?.message);
  response.status(status).json({
    ok: false, error: err?.code || "lgu_credential_request_failed",
    message: status >= 500 ? "Could not process the private LGU credential request. Please try again." : err.message,
  });
}
function installLguCredentialRoutes({ app, db, auth, FieldValue, requireFirebaseUser, cloudinary, configureCloudinary }) {
  if (!app || !db || !auth || !FieldValue || !requireFirebaseUser || !cloudinary || !configureCloudinary) {
    throw Error("LGU credential route dependencies are required");
  }
  const profiles = db.collection("users");
  const evidence = db.collection("lguStaffCredentialAssets");
  const validUid = uid => { if (!UID_PATTERN.test(uid || "")) throw error(400, "invalid_uid", "Invalid applicant account reference."); return uid; };
  const validKind = kind => { if (!KIND_PATTERN.test(kind || "")) throw error(400, "invalid_kind", "Only ID or employment proof may be submitted."); return kind; };
  const slotRef = (uid, kind) => evidence.doc(validUid(uid) + "_" + validKind(kind));
  const getProfile = async uid => {
    const snap = await profiles.doc(uid).get();
    return snap.exists ? snap.data() || {} : null;
  };
  const pendingApplicant = async uid => {
    const profile = await getProfile(uid);
    if (!profile || profile.role !== "applicant" || profile.status !== "pending_review") {
      throw error(403, "pending_lgu_applicant_required", "Only your pending LGU staff application may submit these documents.");
    }
    return profile;
  };
  const superAdmin = async req => {
    const reviewer = await getProfile(req.firebaseUser.uid);
    if (!reviewer || reviewer.role !== "superadmin" || reviewer.status !== "approved") {
      throw error(403, "superadmin_required", "An approved Super Admin account is required.");
    }
    return reviewer;
  };
  const saveAuthenticatedImage = async (uid, kind, buffer) => {
    configureCloudinary();
    const publicId = "volunserve/lgu-staff-credentials/" + uid + "/" + kind + "/" + crypto.randomBytes(20).toString("hex");
    return await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        resource_type: "image", type: "authenticated", public_id: publicId,
        overwrite: false, use_filename: false, unique_filename: false,
      }, (err, value) => err ? reject(err) : resolve(value));
      stream.on("error", reject);
      stream.end(buffer);
    });
  };
  const deleteAuthenticatedImage = async image => {
    if (!image?.public_id) return;
    try {
      configureCloudinary();
      await cloudinary.uploader.destroy(image.public_id, { resource_type: "image", type: "authenticated" });
    } catch (_) {
      // An orphaned protected asset cannot be disclosed through this API.
      console.warn("Could not clean up an uncommitted private LGU asset.");
    }
  };

  // Creates a strictly unprivileged applicant profile. This is the only
  // Spark-compatible path for an applicant; direct client writes are not needed.
  app.post("/api/lgu-staff/application", requireFirebaseUser, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const uid = validUid(req.firebaseUser.uid);
      const email = trimmed(req.firebaseUser.email, 320).toLowerCase();
      // A Firebase Auth email/password account is not eligible for staff
      // onboarding until Auth confirms email verification. The earlier
      // boolean expression accidentally accepted any unverified email with
      // an @ sign. Always require the boolean token claim, not email shape.
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw error(400, "invalid_account_email", "Use a valid account email.");
      }
      if (req.firebaseUser.email_verified !== true) {
        throw error(403, "email_verification_required",
          "Verify your staging account email before applying for LGU Admin access.");
      }
      const name = validateText(req.body?.fullName, 5, 160, "full_name");
      const office = validateText(req.body?.lguOffice, 3, 160, "lgu_office");
      const position = validateText(req.body?.lguPosition, 3, 120, "lgu_position");
      const reference = validateText(req.body?.appointmentReference, 5, 160, "appointment_reference");
      const barangay = validateText(req.body?.barangay, 2, 100, "barangay");
      if (!ALLOWED_BARANGAY.test(barangay)) throw error(400, "invalid_barangay", "Invalid LGU barangay.");
      const initial = {
        uid, email, fullName: name, age: 0, phoneNumber: "",
        role: "applicant", status: "pending_review", residentAccess: false, volunteerAccess: false,
        region: "Region III – Central Luzon", province: "Bulacan", city: "City of San Jose del Monte",
        barangay, lguOffice: office, lguPosition: position, appointmentReference: reference,
        createdAt: FieldValue.serverTimestamp(),
      };
      const ref = profiles.doc(uid);
      const created = await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.exists) {
          const prior = existing.data() || {};
          if (prior.role !== "applicant" || prior.status !== "pending_review" ||
              String(prior.email || "").toLowerCase() !== email) {
            throw error(409, "account_already_registered", "This email is not a pending LGU application.");
          }
          return false;
        }
        tx.create(ref, initial);
        return true;
      });
      res.status(created ? 201 : 200).json({ ok: true, uid, status: "pending_review" });
    } catch (err) { respondError(res, err); }
  });

  // Owner-only upload. Each applicant can submit each of their two documents
  // once; retries after successful upload do not replace the original evidence.
  app.post("/api/lgu-staff/credentials/:kind", requireFirebaseUser,
    express.raw({ type: ["image/jpeg", "image/png", "image/webp", "application/octet-stream"], limit: "3mb" }),
    async (req, res) => {
      let stage = "", ref = null, uploaded = null;
      try {
        res.set("Cache-Control", "no-store");
        const uid = validUid(req.firebaseUser.uid), kind = validKind(req.params.kind);
        await pendingApplicant(uid);
        const mime = imageMime(req.body);
        const declared = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
        if (!IMAGE_TYPES.has(declared) && declared !== "application/octet-stream") {
          throw error(415, "unsupported_lgu_credential_image", "Unsupported image content type.");
        }
        if (declared !== "application/octet-stream" && declared !== mime) {
          throw error(415, "lgu_image_type_mismatch", "The image format does not match the selected file.");
        }
        ref = slotRef(uid, kind);
        stage = crypto.randomBytes(24).toString("hex");
        const action = await db.runTransaction(async tx => {
          const snap = await tx.get(ref);
          if (snap.exists && snap.data()?.status === "ready") return "ready";
          if (snap.exists && snap.data()?.status === "uploading" &&
             Date.now() - Number(snap.data()?.stageStartedMs || 0) < 10 * 60 * 1000) {
            throw error(409, "lgu_photo_upload_busy", "A document upload is underway. Retry shortly.");
          }
          tx.set(ref, { ownerUid: uid, kind, status: "uploading", stage,
            stageStartedMs: Date.now(), createdAt: FieldValue.serverTimestamp() });
          return "upload";
        });
        if (action === "ready") return res.status(200).json({ ok: true, kind, alreadyUploaded: true });
        uploaded = await saveAuthenticatedImage(uid, kind, req.body);
        if (!uploaded?.public_id || !uploaded?.format || uploaded.resource_type !== "image") {
          throw error(502, "private_lgu_image_upload_incomplete", "Private image storage did not complete.");
        }
        await db.runTransaction(async tx => {
          const [slot, profile] = await Promise.all([tx.get(ref), tx.get(profiles.doc(uid))]);
          if (!slot.exists || slot.data()?.stage !== stage || !profile.exists ||
              profile.data()?.role !== "applicant" || profile.data()?.status !== "pending_review") {
            throw error(409, "lgu_upload_no_longer_pending", "This LGU application is no longer pending.");
          }
          tx.set(ref, { ownerUid: uid, kind, status: "ready",
            cloudinaryPublicId: uploaded.public_id, cloudinaryFormat: uploaded.format,
            deliveryType: "authenticated", resourceType: "image", mimeType: mime,
            bytes: req.body.length, createdAt: FieldValue.serverTimestamp(),
          });
        });
        res.status(201).json({ ok: true, kind, uploaded: true });
      } catch (err) {
        await deleteAuthenticatedImage(uploaded);
        if (ref && stage) {
          await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (snap.exists && snap.data()?.stage === stage) tx.delete(ref);
          }).catch(() => undefined);
        }
        respondError(res, err);
      }
    });

  // The URL is signed and short-lived; no public Cloudinary URL or secret is
  // stored in Firestore or printed to logs.
  app.get("/api/superadmin/lgu-credentials/:uid/:kind/access", requireFirebaseUser, async (req, res) => {
    try {
      res.set("Cache-Control", "private, no-store, max-age=0");
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      await superAdmin(req);
      const uid = validUid(req.params.uid), kind = validKind(req.params.kind);
      const snap = await slotRef(uid, kind).get();
      const asset = snap.exists ? snap.data() || {} : {};
      if (asset.ownerUid !== uid || asset.kind !== kind || asset.status !== "ready" ||
          asset.deliveryType !== "authenticated" || asset.resourceType !== "image" ||
          !asset.cloudinaryPublicId || !asset.cloudinaryFormat) {
        throw error(404, "lgu_credential_not_uploaded", "Credential image has not been submitted.");
      }
      configureCloudinary();
      const expiresAt = Math.floor(Date.now() / 1000) + PRIVATE_TTL;
      const url = cloudinary.utils.private_download_url(asset.cloudinaryPublicId,
        asset.cloudinaryFormat, { resource_type: "image", type: "authenticated", expires_at: expiresAt });
      if (!url || !url.startsWith("https://")) throw error(502, "credential_private_link_failed", "Unable to create a private image link.");
      res.json({ ok: true, kind, url, expiresAt });
    } catch (err) { respondError(res, err); }
  });

  // Role granting uses Firebase Admin SDK in a single server-validated
  // Firestore transaction, so it does not require permissive client Rules.
  app.post("/api/superadmin/lgu-applications/:uid/approve", requireFirebaseUser, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const reviewer = await superAdmin(req);
      const uid = validUid(req.params.uid);
      if (uid === req.firebaseUser.uid) throw error(403, "cannot_approve_self", "Super Admin cannot approve their own account.");
      const office = validateText(req.body?.office, 3, 160, "office");
      const position = validateText(req.body?.position, 3, 120, "position");
      const credentialReference = validateText(req.body?.credentialReference, 5, 160, "credential_reference");
      const verificationMethod = validateText(req.body?.verificationMethod, 8, 200, "verification_method");
      if (!OFFICIAL_METHODS.has(verificationMethod) &&
          !(verificationMethod.startsWith("Other official source:") && verificationMethod.length >= 32)) {
        throw error(400, "independent_verification_required", "Confirm LGU employment through an independent official source.");
      }
      if (req.body?.identityMatched !== true || req.body?.lguEmploymentConfirmed !== true ||
          req.body?.credentialsConfirmed !== true) {
        throw error(400, "credential_review_incomplete", "Confirm identity, employment, and reviewed documents.");
      }
      // Check the actual *applicant's* Firebase Auth account, not the
      // Super Admin reviewer's token or client-supplied profile fields.
      // Both website-created and API-created pending applicants use this
      // final promotion path. No client can claim email verification.
      let targetAuth;
      try {
        targetAuth = await auth.getUser(uid);
      } catch {
        throw error(409, "lgu_target_auth_missing",
          "The pending LGU applicant has no usable Firebase Auth account.");
      }
      if (targetAuth.disabled === true || targetAuth.emailVerified !== true ||
          typeof targetAuth.email !== "string" || !targetAuth.email.trim()) {
        throw error(409, "lgu_target_email_unverified",
          "The applicant must verify their staging email before Admin approval.");
      }
      const targetEmail = targetAuth.email.trim().toLowerCase();
      const reviewerUid = req.firebaseUser.uid;
      await db.runTransaction(async tx => {
        const userRef = profiles.doc(uid), idRef = slotRef(uid, "staff-id"),
          letterRef = slotRef(uid, "appointment-letter");
        const [userSnap, idSnap, letterSnap] = await Promise.all([
          tx.get(userRef), tx.get(idRef), tx.get(letterRef),
        ]);
        if (!userSnap.exists || userSnap.data()?.role !== "applicant" ||
            userSnap.data()?.status !== "pending_review") {
          throw error(409, "lgu_application_not_pending", "This account is no longer a pending applicant.");
        }
        for (const [snapshot, kind] of [[idSnap, "staff-id"], [letterSnap, "appointment-letter"]]) {
          const asset = snapshot.exists ? snapshot.data() : {};
          if (asset.ownerUid !== uid || asset.kind !== kind || asset.status !== "ready" ||
              asset.deliveryType !== "authenticated" || !asset.cloudinaryPublicId) {
            throw error(409, "lgu_proof_missing", "Both private ID and employment-proof images are required.");
          }
        }
        const original = userSnap.data();
        if (String(original.email || "").trim().toLowerCase() !== targetEmail ||
            String(original.uid || "").trim() !== uid) {
          throw error(409, "lgu_target_auth_profile_mismatch",
            "The applicant's Firebase Auth identity and pending profile do not match.");
        }
        tx.set(db.collection("lguAdminCredentialReviews").doc(uid), {
          targetUid: uid, accountEmail: original.email, reviewStatus: "verified",
          office, position, credentialReference, verificationMethod,
          verifiedBy: reviewerUid, verifiedAt: FieldValue.serverTimestamp(),
        });
        tx.update(userRef, {
          previousRole: "applicant", previousPrimaryRole: original.primaryRole || "applicant",
          role: "admin", adminStatus: "active", status: "approved",
          adminCreatedAt: FieldValue.serverTimestamp(), adminCreatedBy: reviewerUid,
          adminUpdatedAt: FieldValue.serverTimestamp(), adminUpdatedBy: reviewerUid,
        });
        tx.set(db.collection("adminLogs").doc(), {
          actionType: "admin_account_created", targetType: "user", targetId: uid,
          adminUid: reviewerUid, adminName: trimmed(reviewer.fullName || req.firebaseUser.email || "Super Admin", 160),
          description: "LGU applicant approved after independently verifying identity, employment, and both private documents.",
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      res.json({ ok: true, uid, status: "approved" });
    } catch (err) { respondError(res, err); }
  });

  app.post("/api/superadmin/lgu-applications/:uid/reject", requireFirebaseUser, async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      const reviewer = await superAdmin(req), uid = validUid(req.params.uid);
      const reason = validateText(req.body?.reason, 10, 300, "rejection_reason");
      await db.runTransaction(async tx => {
        const target = profiles.doc(uid), snap = await tx.get(target);
        if (!snap.exists || snap.data()?.role !== "applicant" ||
            snap.data()?.status !== "pending_review") {
          throw error(409, "lgu_application_not_pending", "This account is no longer pending.");
        }
        tx.update(target, {
          status: "rejected", rejectedReason: reason,
          reviewedAt: FieldValue.serverTimestamp(), reviewedBy: req.firebaseUser.uid,
        });
        tx.set(db.collection("adminLogs").doc(), {
          actionType: "lgu_admin_application_rejected", targetType: "user", targetId: uid,
          adminUid: req.firebaseUser.uid,
          adminName: trimmed(reviewer.fullName || req.firebaseUser.email || "Super Admin", 160),
          description: "LGU staff application rejected after credential review.",
          createdAt: FieldValue.serverTimestamp(),
        });
      });
      res.json({ ok: true, uid, status: "rejected" });
    } catch (err) { respondError(res, err); }
  });
}
module.exports = { installLguCredentialRoutes, imageMime };
