import { Redirect } from "expo-router";

/** Old staff bookmarks keep working, but only one credential form exists. */
export default function LegacyAdminLoginRedirect() {
  return <Redirect href="/login" />;
}
