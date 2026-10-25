"use strict";

/**
 * Fund release DEFENSE SIMULATION only. The server never calls a wallet
 * provider, never asserts that a real LGU account has settled money, and
 * never stores a recipient's full wallet account number.
 *
 * Admin SDK is the only writer of fundReleaseDemos. All steps are an
 * atomic, one-record-per-campaign state machine with an immutable audit trail.
 */
function installFundReleaseDemoRoutes({
  app, db, FieldValue, requireFirebaseUser, requireAdminOrSuperAdmin,
  loadUserProfile, getProfileRole, isVerifiedResidentProfile,
  isVerifiedTestPaymongoDonation,
}) {
  const BASE = "/api/admin/donations/fund-releases";
  const safe = (value, max = 180) => String(value == null ? "" : value).trim().slice(0, max);
  const reject = (code, message, status = 400) => {
    const err = new Error(message);
    err.statusCode = status;
    err.code = code;
    throw err;
  };
  const cents = (value) => {
    if (typeof value === "boolean" || value == null || String(value).trim() === "") return NaN;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n <= 100000000 && Math.abs(Math.round(n * 100) - n * 100) < 0.001
      ? Math.round(n * 100) : NaN;
  };
  const amount = (n) => Math.round(Number(n || 0) * 100);
  const validId = (input) => {
    const id = safe(input, 160);
    if (!/^[A-Za-z0-9_-]{6,160}$/.test(id)) reject("invalid_campaign", "Select a valid campaign.");
    return id;
  };
  const releases = db.collection("fundReleaseDemos");
  const send = (res, err) => {
    const code = Number(err?.statusCode) || 500;
    if (code >= 500) console.error("Fund release demo endpoint:", err);
    return res.status(code).json({
      ok: false, error: safe(err?.code || "fund_demo_error", 80),
      message: code >= 500 ? "Fund review is unavailable. Please retry." : safe(err.message, 350),
    });
  };
  const iso = (stamp) => stamp?.toDate?.()?.toISOString?.() || null;
  const publicRecord = (snapshot) => {
    const a = snapshot.data() || {};
    return {
      id: snapshot.id, campaignId: a.campaignId,
      campaignTitle: a.campaignTitle || "Donation campaign",
      recipientUid: a.recipientUid,
      status: a.status,
      amount: Number(a.amountCents || 0) / 100,
      eligibleTestAmount: Number(a.eligibleTestCents || 0) / 100,
      approvedGoal: Number(a.approvedGoalCents || 0) / 100,
      reviewerUid: a.reviewerUid || "",
      authorizerUid: a.authorizerUid || "",
      releaseRecorderUid: a.releaseRecorderUid || "",
      method: a.method || "", walletLast4: a.walletLast4 || "",
      simulationReference: a.simulationReference || "",
      reviewNote: a.reviewNote || "",
      decisionReason: a.decisionReason || "",
      acknowledgmentNote: a.acknowledgmentNote || "",
      reviewedAt: iso(a.reviewedAt),
      authorizedAt: iso(a.authorizedAt),
      simulatedAt: iso(a.simulatedAt),
      acknowledgedAt: iso(a.acknowledgedAt),
      audit: Array.isArray(a.audit)
        ? a.audit.map(row => ({
          stage: row.stage, actorUid: row.actorUid, at: iso(row.at),
        }))
        : [],
      simulation: true,
    };
  };
  const getAdmins = async () => {
    const snap = await db.collection("users").where("role", "in", ["admin", "superadmin"]).limit(200).get();
    return snap.docs.filter(doc => {
      const p = doc.data() || {};
      return p.status === "approved" && ["admin", "superadmin"].includes(p.role);
    }).map(doc => ({ uid: doc.id }));
  };
  const sendAdminNotices = (tx, recipients, campaignId, stage, title, message) => {
    recipients.forEach(recipient => tx.set(
      db.collection("notifications").doc("fund_demo_" + campaignId + "_" + stage + "_" + recipient.uid),
      {
        userId: recipient.uid, type: "fund_release_demo", campaignId,
        title, message, read: false,
        createdAt: FieldValue.serverTimestamp(),
      },
    ));
  };
  // Server validates beneficiaries against the *verified source request*, not
  // campaign free-text, submitted UID, donor profile, or handoff address.
  const validateSource = (campaign, source, recipient) => {
    if (safe(campaign.sourceType) !== "community_assistance_request" ||
      safe(source?.verificationStatus) !== "verified" ||
      safe(source?.supportDecision) !== "donation_support" ||
      safe(source?.donationCampaignId) !== safe(campaign.campaignId) ||
      safe(source?.requesterUid) !== recipient) {
      reject("verified_beneficiary_required",
        "A linked, approved community Assistance Request with its verified requesting Resident is required.", 409);
    }
  };
  const approvedRecipient = async (uid) => {
    const p = await loadUserProfile(uid);
    if (!isVerifiedResidentProfile(p)) reject("recipient_not_verified",
      "The requesting Resident must still be approved and identity-verified.", 409);
  };
  const withAdmin = [requireFirebaseUser, requireAdminOrSuperAdmin];

  app.get(BASE, ...withAdmin, async (req, res) => {
    try {
      const snap = await releases.limit(150).get();
      return res.json({ok: true, releases: snap.docs.map(publicRecord)});
    } catch (error) { return send(res, error); }
  });

  app.post(BASE + "/review", ...withAdmin, async (req, res) => {
    try {
      const uid = req.firebaseUser.uid;
      const campaignId = validId(req.body?.campaignId);
      const requestedCents = cents(req.body?.amount);
      const reviewNote = safe(req.body?.reviewNote, 600);
      if (!Number.isInteger(requestedCents)) reject("invalid_amount", "Enter an amount in pesos with at most two decimal places.");
      if (reviewNote.length < 12) reject("review_note_required",
        "Explain the donation records reviewed (at least 12 characters).");
      const campaignRef = db.collection("donationCampaigns").doc(campaignId);
      const campaignSnap = await campaignRef.get();
      if (!campaignSnap.exists) reject("campaign_not_found", "Campaign not found.", 404);
      const campaign = campaignSnap.data() || {};
      if (!campaign.sourceAssistanceRequestId || campaign.sourceType !== "community_assistance_request")
        reject("assistance_link_required", "Only campaigns linked to verified Resident assistance can use Resident release simulation.", 409);
      const sourceId = validId(campaign.sourceAssistanceRequestId);
      const sourceRef = db.collection("assistanceRequests").doc(sourceId);
      const sourceSnap = await sourceRef.get();
      if (!sourceSnap.exists) reject("source_missing", "Linked assistance request not found.", 409);
      const source = sourceSnap.data() || {};
      const recipientUid = safe(source.requesterUid, 180);
      validateSource({...campaign, campaignId}, source, recipientUid);
      await approvedRecipient(recipientUid);

      const goal = cents(campaign.monetaryGoal);
      if (!Number.isInteger(goal)) reject("goal_missing", "A verified approved monetary goal is required.", 409);
      // Query the real donations collection; pending, manual/legacy, failed and
      // live funds are never counted as verified Sandbox test contributions.
      const donationsSnap = await db.collection("donations")
        .where("campaignId", "==", campaignId).limit(1000).get();
      if (donationsSnap.size === 1000) reject("donation_review_limit", "Too many donation records; request a manual reconciliation.", 409);
      const verifiedCents = donationsSnap.docs.reduce((sum, item) => {
        const d = item.data() || {};
        return sum + ((d.donationType === "monetary" && isVerifiedTestPaymongoDonation(d))
          ? amount(d.actualAmountReceived) : 0);
      }, 0);
      const eligible = Math.min(goal, verifiedCents, amount(campaign.verifiedAmountReceived));
      if (eligible <= 0 || requestedCents > eligible)
        reject("insufficient_verified_test_payments",
          "This amount exceeds verified Sandbox payments and the campaign's recorded approved funding.", 409);
      const releaseRef = releases.doc(campaignId);
      const recipients = await getAdmins();
      await db.runTransaction(async tx => {
        const [freshCampaign, freshSource, oldRelease] = await Promise.all([
          tx.get(campaignRef), tx.get(sourceRef), tx.get(releaseRef),
        ]);
        if (oldRelease.exists) reject("release_already_exists",
          "This campaign already has a release review. Select its existing record.", 409);
        if (!freshCampaign.exists || !freshSource.exists)
          reject("source_changed", "The campaign or Assistance Request no longer exists.", 409);
        const fresh = freshCampaign.data() || {};
        if (amount(fresh.monetaryGoal) !== goal ||
          amount(fresh.verifiedAmountReceived) < requestedCents ||
          fresh.sourceAssistanceRequestId !== sourceId)
          reject("campaign_changed", "Campaign figures or verification link changed; review again.", 409);
        validateSource({...fresh,campaignId}, freshSource.data() || {}, recipientUid);
        const at = FieldValue.serverTimestamp();
        tx.create(releaseRef, {
          campaignId, campaignTitle: safe(campaign.title, 160),
          assistanceRequestId: sourceId, recipientUid,
          amountCents: requestedCents, eligibleTestCents: eligible, approvedGoalCents: goal,
          status: "reviewed", reviewerUid: uid, reviewNote,
          reviewSource: "provider_verified_paymongo_sandbox_only",
          simulated: true, createdAt: at, reviewedAt: at, updatedAt: at,
          audit: [{stage:"reviewed",actorUid:uid,at}],
        });
        sendAdminNotices(tx, recipients, campaignId, "reviewed", "Fund review submitted",
          "A verified test donation fund review is ready for independent authorization.");
      });
      return res.status(201).json({ok:true,campaignId,status:"reviewed",simulation:true});
    } catch(error) {return send(res,error);}
  });

  app.post(BASE + "/:id/authorize", ...withAdmin, async (req, res) => {
    try {
      const uid = req.firebaseUser.uid, campaignId = validId(req.params.id);
      if (getProfileRole(req.volunServeProfile) !== "superadmin") reject(
        "superadmin_required", "A separate approved Super Admin must authorize the demo release.", 403);
      const decision = safe(req.body?.decision, 20);
      const reason = safe(req.body?.reason, 500);
      if (!["approve","reject"].includes(decision)) reject("invalid_decision","Choose approve or reject.");
      if (decision === "reject" && reason.length < 10) reject("reason_required","Explain the rejection.");
      const recipients = await getAdmins();
      const ref = releases.doc(campaignId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) reject("review_missing","No fund review found.",404);
        const data = snap.data() || {};
        if (data.status !== "reviewed") reject("already_decided","This review has already been decided.",409);
        if (data.reviewerUid === uid) reject("independent_approval_required",
          "A different authorized account must approve the review.",403);
        const stage = decision === "approve" ? "authorized" : "rejected";
        const at = FieldValue.serverTimestamp();
        tx.update(ref, {
          status:stage, authorizerUid:uid,decisionReason:reason,
          authorizedAt:at,updatedAt:at,
          audit: FieldValue.arrayUnion({stage,actorUid:uid,at}),
        });
        sendAdminNotices(tx,recipients,campaignId,stage,
          decision === "approve" ? "Fund release authorized" : "Fund release rejected",
          "The simulated release review decision has been recorded.");
      });
      return res.json({ok:true,status:decision==="approve"?"authorized":"rejected",simulation:true});
    } catch(error) {return send(res,error);}
  });

  app.post(BASE + "/:id/simulate", ...withAdmin, async (req,res) => {
    try {
      const uid=req.firebaseUser.uid,campaignId=validId(req.params.id);
      const method=safe(req.body?.method,20).toLowerCase();
      const walletLast4=safe(req.body?.walletLast4,4);
      if (!["gcash","maya"].includes(method)) reject("invalid_method","Choose a demo GCash or Maya channel.");
      if (!/^[0-9]{4}$/.test(walletLast4)) reject("invalid_demo_account",
        "Enter only the last 4 digits of a TEST wallet, not a full real account number.");
      const recipients=await getAdmins();
      const ref=releases.doc(campaignId);
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if (!snap.exists) reject("approval_missing","No authorized review found.",404);
        const d=snap.data()||{};
        if(d.status!=="authorized")reject("already_released","Only authorized and not-yet-recorded releases can be simulated.",409);
        const at=FieldValue.serverTimestamp();
        tx.update(ref,{
          status:"simulated_sent",method,walletLast4,releaseRecorderUid:uid,
          simulationReference:"VS-DEMO-"+campaignId.slice(0,25).toUpperCase(),
          simulatedAt:at,updatedAt:at,
          audit:FieldValue.arrayUnion({stage:"simulated_sent",actorUid:uid,at}),
        });
        sendAdminNotices(tx,recipients,campaignId,"simulated_sent",
          "Demo fund release recorded",
          "A simulated "+method.toUpperCase()+" release has been recorded for Resident review. No real funds were transferred.");
      });
      return res.json({ok:true,status:"simulated_sent",simulation:true});
    }catch(error){return send(res,error);}
  });

  // Private resident endpoints return only releases belonging to the
  // identity-verified owner of the originating Assistance Request.
  async function requireVerifiedRequester(req,res,next){
    try {
      const profile=await loadUserProfile(req.firebaseUser.uid);
      if(!isVerifiedResidentProfile(profile)){
        return res.status(403).json({ok:false,message:"Identity-verified Resident access is required."});
      }
      req.releaseResidentProfile=profile;
      next();
    }catch(error){return send(res,error);}
  }
  app.get("/api/funds/my-releases",requireFirebaseUser,requireVerifiedRequester,async(req,res)=>{
    try{
      const snap=await releases.where("recipientUid","==",req.firebaseUser.uid).limit(100).get();
      return res.json({ok:true,releases:snap.docs
        .filter(doc=>["simulated_sent","acknowledged_demo","disputed"].includes(doc.data()?.status))
        .map(publicRecord)});
    }catch(error){return send(res,error);}
  });
  app.post("/api/funds/my-releases/:id/acknowledge",requireFirebaseUser,requireVerifiedRequester,
    async(req,res)=>{
      try{
        const uid=req.firebaseUser.uid,campaignId=validId(req.params.id);
        const decision=safe(req.body?.decision,20);
        const note=safe(req.body?.note,500);
        if(!["acknowledge","dispute"].includes(decision))reject("invalid_decision","Choose acknowledge or dispute.");
        if(decision==="dispute"&&note.length<10)reject("dispute_note_required","Explain the issue with this demo record.");
        const ref=releases.doc(campaignId);
        const recipients=await getAdmins();
        await db.runTransaction(async tx=>{
          const snap=await tx.get(ref);
          if(!snap.exists)reject("release_not_found","No release record found.",404);
          const d=snap.data()||{};
          if(d.recipientUid!==uid)reject("forbidden","This is not your assistance release record.",403);
          if(d.status!=="simulated_sent")reject("already_answered","This record has already been acknowledged or disputed.",409);
          const at=FieldValue.serverTimestamp();
          const stage=decision==="acknowledge"?"acknowledged_demo":"disputed";
          tx.update(ref,{
            status:stage,acknowledgmentNote:note,acknowledgedAt:at,updatedAt:at,
            audit:FieldValue.arrayUnion({stage,actorUid:uid,at}),
          });
          sendAdminNotices(tx,recipients,campaignId,stage,
            decision==="acknowledge"?"Resident acknowledged demo record":"Resident disputed demo release",
            decision==="acknowledge"?
              "The verified requester acknowledged the simulated record; no real transfer occurred.":
              "The verified requester disputed a simulated release; LGU follow-up is required.");
        });
        return res.json({ok:true,status:decision==="acknowledge"?"acknowledged_demo":"disputed",simulation:true});
      }catch(error){return send(res,error);}
    });
}
module.exports = {installFundReleaseDemoRoutes};
