/** Volunteer join eligibility for the published schedule (Asia/Manila device-local demo).
 * UI/transaction guard: server-side rules remain the authority for access.
 * Never infer that a stale 'upcoming' or 'active' label means a past event is open.
 */
export function isEventJoinableNow(
  event: {status?: string; date?: string; time?: string; endTime?: string},
  now: number = Date.now(),
): boolean {
  if (event.status !== "upcoming" && event.status !== "active") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date || "") ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time || "")) return false;
  const start = new Date(`${event.date}T${event.time}:00`);
  if (!Number.isFinite(start.getTime()) ||
      start.getFullYear() !== Number(event.date!.slice(0,4)) ||
      start.getMonth()+1 !== Number(event.date!.slice(5,7)) ||
      start.getDate() !== Number(event.date!.slice(8,10))) return false;
  if (event.status === "upcoming") return now < start.getTime();
  // When Admin has actually started an event, allow late entry only while it
  // remains on its recorded date and before the declared end time.
  const end = event.endTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(event.endTime)
    ? new Date(`${event.date}T${event.endTime}:00`)
    : new Date(`${event.date}T23:59:59`);
  return Number.isFinite(end.getTime()) && end.getTime() > start.getTime() &&
    now >= start.getTime() && now < end.getTime();
}
