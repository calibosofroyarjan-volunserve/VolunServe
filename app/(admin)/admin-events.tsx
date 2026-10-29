import { Redirect } from "expo-router";

/** Compatibility route: Volunteer Events was retired as a duplicate LGU module.
 * Event Attendance is the single active event operations destination.
 * Legacy volunteerEvents records are preserved in Firestore, not deleted.
 */
export default function RetiredVolunteerEventsRoute() {
  return <Redirect href="/(admin)/community-attendance" />;
}
