import { Redirect } from "expo-router";

/** Operational analytics now render inside the Command Center.
 * Keep this former URL as a non-duplicative compatibility redirect.
 */
export default function RetiredAnalyticsRoute() {
  return <Redirect href="/(admin)/command-center" />;
}
