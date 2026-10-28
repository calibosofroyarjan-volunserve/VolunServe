/**
 * Community Events are scheduled for City of San Jose del Monte, Philippines.
 * Use UTC+08:00 for all validation regardless of the viewer's device timezone.
 * The Philippines does not observe daylight saving time.
 * This is a client convenience check, not proof of a server-side booking lock.
 */
const SJDM_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function sjdmEventTimeMillis(date: string | undefined, time: string | undefined): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return null;
  const [year, month, day] = date!.split("-").map(Number);
  const [hour, minute] = time!.split(":").map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute) - SJDM_UTC_OFFSET_MS;
  if (!Number.isFinite(timestamp)) return null;
  const normalized = new Date(timestamp + SJDM_UTC_OFFSET_MS);
  // Reject invalid dates such as February 31; Date.UTC silently normalizes them.
  if (normalized.getUTCFullYear() !== year ||
      normalized.getUTCMonth() + 1 !== month ||
      normalized.getUTCDate() !== day ||
      normalized.getUTCHours() !== hour ||
      normalized.getUTCMinutes() !== minute) return null;
  return timestamp;
}

export function validSjdmEventSchedule(event: {date?: string; time?: string; endTime?: string}): boolean {
  const start = sjdmEventTimeMillis(event.date, event.time);
  if (start === null) return false;
  if (!event.endTime) return true;
  const end = sjdmEventTimeMillis(event.date, event.endTime);
  return end !== null && end > start;
}

/** Volunteers must not join expired or unpublished events, even when their
 *  Firestore status is stale. Firestore rules govern final authorization.
 */
export function isEventJoinableNow(
  event: {status?: string; date?: string; time?: string; endTime?: string},
  now: number = Date.now(),
): boolean {
  if (event.status !== "upcoming" && event.status !== "active") return false;
  if (!validSjdmEventSchedule(event)) return false;
  const start = sjdmEventTimeMillis(event.date, event.time)!;
  if (event.status === "upcoming") return now < start;
  const end = event.endTime
    ? sjdmEventTimeMillis(event.date, event.endTime)!
    : sjdmEventTimeMillis(event.date, "23:59")! + 60_000;
  return now >= start && now < end;
}
