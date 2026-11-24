"use strict";

/**
 * Safe certificate recovery for Render/Spark without new Firestore rules.
 * The existing Admin action issues immediately; this periodic pass repairs
 * an eligible completed event if the Admin browser closed before the sync.
 * Does NOT modify attendance or existing certificates.
 */
const RECOVERY_INTERVAL_MS = 30 * 60 * 1000;
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000;
function quotaExhausted(error) {
  return Number(error?.code) === 8 || /RESOURCE_EXHAUSTED|quota exceeded/i.test(String(error?.message || error));
}

function createCommunityCertificateAutoSync({ db, reconcile, logger = console, now = Date.now }) {
  let running = false;
  let quotaBlockedUntil = 0;
  async function runOnce() {
    if (running) return { skipped: "already_running" };
    if (now() < quotaBlockedUntil) return { skipped: "quota_cooldown" };
    running = true;
    const summary = { reviewed: 0, issued: 0, failed: 0 };
    try {
      // Single-field Firestore index. Newest completed events first.
      // Bounded to limit Firestore reads on the Render free service.
      const snapshot = await db.collection("communityEvents")
        .orderBy("completedAt", "desc").limit(20).get();
      for (const item of snapshot.docs) {
        const event = item.data() || {};
        if (event.status !== "completed" || event.publicationStatus !== "published" ||
            !event.completedBy || !event.completedAt) continue;
        summary.reviewed++;
        try {
          // Existing eligibility, deterministic IDs and idempotent create.
          const result = await reconcile({eventId:item.id,execute:true});
          if (result.ok) summary.issued += result.issuedCount || 0;
          else summary.failed++;
        } catch (error) {
          summary.failed++;
          if (quotaExhausted(error)) {
            quotaBlockedUntil = now() + QUOTA_COOLDOWN_MS;
            logger.warn("[Community certificates] quota exhausted; postponing background recovery");
            break;
          }
          logger.warn("[Community certificates] automatic retry failed", {
            eventId:item.id, message:String(error?.message || error).slice(0,150),
          });
        }
      }
      if (summary.issued || summary.failed) {
        logger.info("[Community certificates] auto sync", summary);
      }
      return summary;
    } catch (error) {
      if (quotaExhausted(error)) quotaBlockedUntil = now() + QUOTA_COOLDOWN_MS;
      logger.warn("[Community certificates] background scan unavailable", String(error?.message || error).slice(0,150));
      return {...summary, failed: summary.failed + 1};
    } finally {
      running = false;
    }
  }
  return {runOnce};
}

function startCommunityCertificateAutoSync({db,reconcile,logger=console,initialDelayMs=45000,intervalMs=RECOVERY_INTERVAL_MS}) {
  const runner = createCommunityCertificateAutoSync({db,reconcile,logger});
  const kickoff = setTimeout(() => void runner.runOnce(),initialDelayMs);
  const repeating = setInterval(() => void runner.runOnce(),intervalMs);
  kickoff.unref?.();
  repeating.unref?.();
  return {stop(){clearTimeout(kickoff);clearInterval(repeating);},runOnce:runner.runOnce};
}

module.exports={createCommunityCertificateAutoSync,startCommunityCertificateAutoSync,RECOVERY_INTERVAL_MS,QUOTA_COOLDOWN_MS};
