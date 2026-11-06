import { useEffect, useState } from "react";

/** Re-evaluate the published-only query cutoff as new notices are posted.
 * Firestore rules intentionally prohibit reading future-dated announcements.
 */
export function usePublishedAnnouncementCutoff() {
  const [cutoff, setCutoff] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setCutoff(new Date()), 10000);
    return () => clearInterval(interval);
  }, []);
  return cutoff;
}
