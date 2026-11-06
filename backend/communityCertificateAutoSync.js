"use strict";

/**
 * Safe certificate recovery for Render/Spark without new Firestore rules.
 * The existing Admin action issues immediately; this periodic pass repairs
 * an eligible completed event if the Admin browser closed before the sync.
 * Does NOT modify attendance or existing certificates.
 */
function createCommunityCertificateAutoSync({ db, reconcile, logger = console }) {
  let running = false;
  async function runOnce() {
    if (running) return { skipped: "already_running" };
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
      logger.warn("[Community certificates] background scan unavailable", String(error?.message || error).slice(0,150));
      return {...summary, failed: summary.failed + 1};
    } finally {
      running = false;
    }
  }
  return {runOnce};
}

function startCommunityCertificateAutoSync({db,reconcile,logger=console,initialDelayMs=45000,intervalMs=300000}) {
  const runner = createCommunityCertificateAutoSync({db,reconcile,logger});
  const kickoff = setTimeout(() => void runner.runOnce(),initialDelayMs);
  const repeating = setInterval(() => void runner.runOnce(),intervalMs);
  kickoff.unref?.();
  repeating.unref?.();
  return {stop(){clearTimeout(kickoff);clearInterval(repeating);},runOnce:runner.runOnce};
}

module.exports={createCommunityCertificateAutoSync,startCommunityCertificateAutoSync};
