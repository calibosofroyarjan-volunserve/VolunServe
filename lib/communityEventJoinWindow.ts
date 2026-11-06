/**
 * Treat dates as Philippine local time, irrespective of the browser timezone.
 * The Admin's official event status is still authoritative: ongoing events
 * remain joinable, while a stale "upcoming" event cannot invite signups.
 * This is a UI / transaction preflight, not a substitute for Firestore rules.
 */
export type JoinWindowEvent = {
  status: string;
  date?: string;
  time?: string;
  endTime?: string;
};

export function eventScheduleHasPassed(event: JoinWindowEvent, nowMs = Date.now()): boolean {
  const day = String(event.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const end = String(event.endTime || "").trim();
  const start = String(event.time || "").trim();
  // Unknown end time: keep today's event eligible until end of the day.
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/.test(end) ? end :
    /^([01]\d|2[0-3]):[0-5]\d$/.test(start) ? "23:59" : "23:59";
  const cutoff = Date.parse(day + "T" + clock + ":00+08:00");
  return Number.isFinite(cutoff) && cutoff < nowMs;
}

export function canVolunteerJoinEvent(event: JoinWindowEvent, nowMs = Date.now()): boolean {
  return event.status === "active" ||
    (event.status === "upcoming" && !eventScheduleHasPassed(event, nowMs));
}
