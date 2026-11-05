import { Redirect } from "expo-router";

// Keep existing deep links working without a duplicate Announcements page.
export default function AnnouncementsRedirect() {
  return <Redirect href="/(tabs)/notifications" />;
}
