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
  const residentWallets = db.collection("fundReleaseWalletProfiles");
  const send = (res, err) => {
    const code = Number(err?.statusCode) || 500;
    if (code >= 500) console.error("Fund release demo endpoint:", err);
    return res.status(code).json({
      ok: false, error: safe(err?.code || "fund_demo_error", 80),
      message: code >= 500 ? "Fund review is unavailable. Please retry." : safe(err.message, 350),
    });
  };
  const iso = (stamp) => typeof stamp === "string" ? stamp : stamp?.toDate?.()?.toISOString?.() || null;
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
      releaseProcessor: a.releaseProcessor || "volunserve_internal_sandbox",
      deliveryStatus: a.deliveryStatus || "simulation_only",
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
    const snap = await db.collection("users").where("role", "==", "admin").limit(200).get();
    return snap.docs.filter(doc => {
      const p = doc.data() || {};
      return p.status === "approved" && getProfileRole(p) === "admin";
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
  // Financial demo operations belong to LGU Admin accounts only.
  // Super Admin is a programmer/system-maintenance role, not an LGU cashier.
  function requireLguAdmin(request, response, next) {
    if (getProfileRole(request.volunServeProfile) !== "admin") {
      return response.status(403).json({
        ok: false,
        error: "lgu_admin_required",
        message: "Only an approved LGU Admin can manage donation fund releases.",
      });
    }
    return next();
  }
  const withAdmin = [requireFirebaseUser, requireAdminOrSuperAdmin, requireLguAdmin];


  // Admin-facing reconciliation uses the exact same provider verification
  // predicate as release authorization. No metadata is upgraded or fabricated.
  const reconcileCampaign = async (campaignId, campaign) => {
    const snap = await db.collection("donations").where("campaignId","==",campaignId)
      .limit(1000).get();
    if (snap.size >= 1000) reject("donation_review_limit",
      "Too many donation records to safely reconcile; contact your LGU administrator.",409);
    let providerCents = 0, legacyCents = 0, pendingCount = 0, testCount = 0;
    let otherCount = 0;
    for (const item of snap.docs) {
      const d = item.data() || {};
      if (d.donationType && d.donationType !== "monetary") continue;
      const recorded = Math.max(0, amount(d.actualAmountReceived));
      if (isVerifiedTestPaymongoDonation(d)) {
        providerCents += recorded; testCount++;
      } else if (d.status === "received" && d.paymentProvider !== "paymongo") {
        legacyCents += recorded;
      } else if (["submitted","payment_pending","payment_creating"].includes(d.status)) {
        pendingCount++;
      } else {
        otherCount++;
      }
    }
    const goalCents = cents(campaign.monetaryGoal);
    const recordedCents = Math.max(0,amount(campaign.verifiedAmountReceived));
    const eligibleCents = Number.isInteger(goalCents)
      ? Math.min(goalCents, recordedCents, providerCents) : 0;
    const ready = Number.isInteger(goalCents) && providerCents >= goalCents &&
      recordedCents >= goalCents;
    const reason = !Number.isInteger(goalCents) ? "approved_goal_missing" :
      ready ? "ready" :
      providerCents === 0 && legacyCents > 0 ? "manual_records_only" :
      providerCents === 0 ? "no_verified_provider_payment" :
      providerCents < goalCents ? "provider_payments_below_goal" :
      "recorded_funding_below_goal";
    return {
      campaignId, approvedGoal: Number.isInteger(goalCents) ? goalCents / 100 : 0,
      recordedFunding: recordedCents / 100,
      providerVerifiedTestAmount: providerCents / 100,
      manualLegacyAmount: legacyCents / 100,
      eligibleAmount: eligibleCents / 100,
      providerVerifiedCount: testCount, pendingCount, otherCount,
      ready, reason,
    };
  };

  app.get(BASE, ...withAdmin, async (req, res) => {
    try {
      const [snap,campaignSnap] = await Promise.all([
        releases.limit(150).get(),
        db.collection("donationCampaigns").limit(150).get(),
      ]);
      const reviewableCampaigns = campaignSnap.docs.filter(c => {
        const d = c.data() || {};
        return d.sourceType === "community_assistance_request" &&
          !!d.sourceAssistanceRequestId && Number(d.monetaryGoal || 0) > 0;
      });
      if (campaignSnap.size === 150) reject("campaign_review_limit",
        "Too many campaigns for this review screen; request paginated reconciliation.",409);
      const funding = await Promise.all(reviewableCampaigns.map(async c => {
        const campaign = c.data() || {};
        const funding = await reconcileCampaign(c.id, campaign);
        if (funding.ready) {
          const sourceId = safe(campaign.sourceAssistanceRequestId);
          const source = await db.collection("assistanceRequests").doc(sourceId).get();
          const requester = safe(source.data()?.requesterUid);
          const linked = source.exists &&
            campaign.sourceType === "community_assistance_request" &&
            safe(source.data()?.donationCampaignId) === c.id &&
            safe(source.data()?.verificationStatus) === "verified" &&
            safe(source.data()?.supportDecision) === "donation_support" &&
            /^[A-Za-z0-9_-]{6,180}$/.test(requester);
          if (!linked) {
            return {...funding, ready:false, reason:"assistance_link_not_verified"};
          }
          const profile = await loadUserProfile(requester);
          if (!isVerifiedResidentProfile(profile)) {
            return {...funding, ready:false, reason:"requester_identity_not_verified"};
          }
        }
        return funding;
      }));
      return res.json({
        ok:true, releases:snap.docs.map(publicRecord),
        funding,
        // Each campaign has separate, source-backed accounting. Same-name
        // campaigns MUST NOT be merged into one release balance.
        reconciliationSource:"provider_verified_paymongo_sandbox_only",
      });
    } catch (error) { return send(res, error); }
  });

  // Read-only LGU Admin beneficiary card. Resolve each campaign by its *own*
  // source request, never by campaign title, donor metadata or Admin input.
  // Private documents, email, street address and full phone number are excluded.
  app.get(BASE + "/:id/beneficiary", ...withAdmin, async (req, res) => {
    try {
      const campaignId = validId(req.params.id);
      const campaignSnap = await db.collection("donationCampaigns").doc(campaignId).get();
      if (!campaignSnap.exists) reject("campaign_not_found","Campaign not found.",404);
      const campaign = campaignSnap.data() || {};
      if (campaign.sourceType !== "community_assistance_request" ||
        !campaign.sourceAssistanceRequestId) {
        reject("assistance_link_required","This campaign has no linked Assistance Request.",409);
      }
      const requestId = validId(campaign.sourceAssistanceRequestId);
      const sourceSnap = await db.collection("assistanceRequests").doc(requestId).get();
      if (!sourceSnap.exists) reject("source_missing","Linked Assistance Request was not found.",409);
      const source = sourceSnap.data() || {};
      const uid = safe(source.requesterUid,180);
      if (!/^[A-Za-z0-9_-]{6,180}$/.test(uid))
        reject("requester_missing","A verified requesting Resident is required.",409);
      validateSource({...campaign,campaignId},source,uid);
      const profile = await loadUserProfile(uid);
      if (!isVerifiedResidentProfile(profile))
        reject("recipient_not_verified","The requesting Resident is not currently identity-verified.",409);
      // Once a fund review exists it MUST still point to this same original
      // Assistance Request and Resident; never silently swap beneficiaries.
      const existing = await releases.doc(campaignId).get();
      if (existing.exists) {
        const record = existing.data() || {};
        if (record.assistanceRequestId !== requestId || record.recipientUid !== uid)
          reject("recipient_record_mismatch","Fund review recipient no longer matches the verified source.",409);
      }
      const name = safe(profile.fullName || [profile.firstName,profile.lastName]
        .filter(Boolean).join(" ") || source.requesterName,110);
      const photoCandidate = safe(profile.profilePictureUrl,1500);
      const photoUrl = /^https:\/\//i.test(photoCandidate) ? photoCandidate : "";
      // Display only the already-approved requesting Resident. A different
      // medical beneficiary named in the source request is not a wallet payee.
      return res.json({ok:true,beneficiary:{
        displayName:name || "Verified Resident",
        barangay:safe(profile.barangay || source.requesterBarangay,100),
        photoUrl,
        verified:true,
        verifiedLabel:"Identity-verified Resident",
        assistanceRequestId:requestId,
        requestNumber:safe(source.requestId || requestId,100),
        assistanceTitle:safe(source.title || campaign.title,150),
        assistanceCategory:safe(source.categoryLabel || source.category || "",100),
        campaignId,
        reviewStatus:"verified",
        payeeRole:"requesting_resident",
      }});
    }catch(error){return send(res,error);}
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
      if (!recipientUid || !/^[A-Za-z0-9_-]{6,180}$/.test(recipientUid)) {
        reject("requester_missing", "A verified requesting Resident is required.", 409);
      }
      validateSource({...campaign, campaignId}, source, recipientUid);
      await approvedRecipient(recipientUid);

      const goal = cents(campaign.monetaryGoal);
      if (!Number.isInteger(goal)) reject("goal_missing", "A verified approved monetary goal is required.", 409);
      // Same source-of-truth logic as Admin UI; legacy donations cannot
      // impersonate webhook-confirmed Sandbox payments.
      const check = await reconcileCampaign(campaignId, campaign);
      const eligible = amount(check.eligibleAmount);
      if (!check.ready)
        reject("funding_goal_not_reached",
          "Provider-confirmed test payments have not met the approved goal for this specific campaign.",409);
      if (requestedCents !== goal || eligible !== goal)
        reject("release_must_match_approved_goal",
          "Release review must use exactly the funded, approved goal.",409);
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
        if (amount(fresh.verifiedAmountReceived) !== amount(campaign.verifiedAmountReceived)) {
          reject("campaign_funding_changed",
            "Campaign funding changed during review. Refresh and reconcile again.", 409);
        }
        const at = FieldValue.serverTimestamp();
        tx.create(releaseRef, {
          campaignId, campaignTitle: safe(campaign.title, 160),
          assistanceRequestId: sourceId, recipientUid,
          amountCents: requestedCents, eligibleTestCents: eligible, approvedGoalCents: goal,
          status: "reviewed", reviewerUid: uid, reviewNote,
          reviewSource: "provider_verified_paymongo_sandbox_only",
          simulated: true, createdAt: at, reviewedAt: at, updatedAt: at,
          audit: [{stage:"reviewed",actorUid:uid,at:new Date().toISOString()}],
        });
        sendAdminNotices(tx, recipients, campaignId, "reviewed", "Fund review submitted",
          "An LGU Admin fund review is ready for an explicit release decision.");
      });
      return res.status(201).json({ok:true,campaignId,status:"reviewed",simulation:true});
    } catch(error) {return send(res,error);}
  });

  app.post(BASE + "/:id/authorize", ...withAdmin, async (req, res) => {
    try {
      const uid = req.firebaseUser.uid, campaignId = validId(req.params.id);
      const decision = safe(req.body?.decision, 20);
      const reason = safe(req.body?.reason, 500);
      if (!["approve","reject"].includes(decision)) reject("invalid_decision","Choose approve or reject.");
      if (reason.length < 10) reject("decision_reason_required","Record your reason for approving or rejecting the simulated release.");
      const recipients = await getAdmins();
      const ref = releases.doc(campaignId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) reject("review_missing","No fund review found.",404);
        const data = snap.data() || {};
        if (data.status !== "reviewed") reject("already_decided","This review has already been decided.",409);
        const stage = decision === "approve" ? "authorized" : "rejected";
        const at = FieldValue.serverTimestamp();
        tx.update(ref, {
          status:stage, authorizerUid:uid,decisionReason:reason,
          authorizedAt:at,updatedAt:at,
          audit: FieldValue.arrayUnion({stage,actorUid:uid,at:new Date().toISOString()}),
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
      // New checkout-style demo interface accepts 11 digits, but NEVER persists
      // the full test identifier. Previous APK clients may still supply last4.
      const testWalletNumber=safe(req.body?.testWalletNumber,30);
      const walletLast4=testWalletNumber
        ? testWalletNumber.slice(-4) : safe(req.body?.walletLast4,4);
      if (!["gcash","maya"].includes(method)) reject("invalid_method","Choose a demo GCash or Maya channel.");
      if (testWalletNumber) {
        if (!/^09[0-9]{9}$/.test(testWalletNumber)) reject("invalid_demo_account",
          "Enter an 11-digit TEST wallet number beginning with 09.");
        if (req.body?.confirmedSandbox !== true) reject("sandbox_confirmation_required",
          "Explicitly confirm this is an internal sandbox record, not a wallet transfer.");
      } else if (!/^[0-9]{4}$/.test(walletLast4)) reject("invalid_demo_account",
        "Only last four digits of a TEST wallet are allowed for legacy demo clients.");
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
          releaseProcessor:"volunserve_internal_sandbox",deliveryStatus:"simulation_only",
          simulationReference:"VS-DEMO-"+campaignId.slice(0,25).toUpperCase(),
          simulatedAt:at,updatedAt:at,
          audit:FieldValue.arrayUnion({stage:"simulated_sent",actorUid:uid,at:new Date().toISOString()}),
        });
        sendAdminNotices(tx,recipients,campaignId,"simulated_sent",
          "Demo fund release recorded",
          "A VolunServe INTERNAL SANDBOX "+method.toUpperCase()+" release has been recorded for Resident review. No external payout was attempted.");
        // Notify only the verified requester linked to the source Assistance Request.
        if (d.recipientUid) {
          tx.set(db.collection("notifications").doc(
            "fund_demo_" + campaignId + "_simulated_sent_resident_" + d.recipientUid
          ), {
            userId:d.recipientUid, type:"fund_release_demo",
            campaignId, title:"Assistance release demo ready for review",
            message:"A VolunServe internal sandbox release receipt is available for review in Donations. No real wallet transfer took place.",
            read:false,createdAt:FieldValue.serverTimestamp(),
          });
        }
      });
      return res.json({ok:true,status:"simulated_sent",simulation:true});
    }catch(error){return send(res,error);}
  });

  // Private resident endpoints return only releases belonging to the
  // identity-verified owner of the originating Assistance Request.
  async function requireVerifiedRequester(req,res,next){
    try {
      const profile=await loadUserProfile(req.firebaseUser.uid);
      if(!isVerifiedResidentProfile(profile) ||
        ["admin","superadmin","lgu_personnel"].includes(getProfileRole(profile))){
        return res.status(403).json({ok:false,message:"Identity-verified Resident access is required."});
      }
      req.releaseResidentProfile=profile;
      next();
    }catch(error){return send(res,error);}
  }
  // A Resident can create a fictional TEST-only wallet alias for the LGU
  // release demonstration. It is NOT an actual GCash/Maya account validation.
  // Do not collect or persist a full phone number or account credentials.
  app.get("/api/funds/my-release-wallet",requireFirebaseUser,requireVerifiedRequester,async(req,res)=>{
    try {
      const snap=await residentWallets.doc(req.firebaseUser.uid).get();
      const data=snap.exists?(snap.data()||{}):{};
      return res.json({ok:true,wallet:snap.exists&&
        ["gcash","maya"].includes(data.method)&&/^[0-9]{4}$/.test(data.walletLast4||"")
        ? {configured:true,method:data.method,walletLast4:data.walletLast4,testOnly:true}
        : {configured:false,testOnly:true}});
    }catch(error){return send(res,error);}
  });
  app.post("/api/funds/my-release-wallet",requireFirebaseUser,requireVerifiedRequester,async(req,res)=>{
    try {
      const method=safe(req.body?.method,20).toLowerCase();
      const walletLast4=safe(req.body?.walletLast4,10);
      if(!["gcash","maya"].includes(method))reject("invalid_method","Choose GCash or Maya.");
      if(!/^[0-9]{4}$/.test(walletLast4))
        reject("invalid_wallet_alias","Use four fictional digits for the test wallet alias.");
      if(req.body?.confirmedTestOnly!==true)
        reject("test_only_confirmation_required",
          "Confirm this is only a fictional wallet alias, not a verified real wallet.");
      await residentWallets.doc(req.firebaseUser.uid).set({
        ownerUid:req.firebaseUser.uid,method,walletLast4,testOnly:true,
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      return res.json({ok:true,wallet:{configured:true,method,walletLast4,testOnly:true}});
    }catch(error){return send(res,error);}
  });

  app.get("/api/funds/my-releases",requireFirebaseUser,requireVerifiedRequester,async(req,res)=>{
    try{
      const snap=await releases.where("recipientUid","==",req.firebaseUser.uid).limit(100).get();
      return res.json({ok:true,releases:snap.docs
        .filter(doc=>["simulated_sent","acknowledged_demo","disputed"].includes(doc.data()?.status))
        .map(doc=>{
          const p=publicRecord(doc);
          return {
            id:p.id,campaignId:p.campaignId,campaignTitle:p.campaignTitle,
            status:p.status,amount:p.amount,method:p.method,
            walletLast4:p.walletLast4,simulationReference:p.simulationReference,
            releaseProcessor:p.releaseProcessor,deliveryStatus:p.deliveryStatus,
            simulatedAt:p.simulatedAt,acknowledgedAt:p.acknowledgedAt,
            acknowledgmentNote:p.acknowledgmentNote,simulation:true,
          };
        })});
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
            audit:FieldValue.arrayUnion({stage,actorUid:uid,at:new Date().toISOString()}),
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
