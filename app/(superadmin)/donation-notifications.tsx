import { Redirect } from "expo-router";

/** Financial inbox notifications are restricted to approved LGU Admin staff. */
export default function SuperAdminFinancialNotificationsRedirect() {
  return <Redirect href="/(superadmin)" />;
}
