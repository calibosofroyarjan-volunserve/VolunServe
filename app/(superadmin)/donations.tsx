import { Redirect } from "expo-router";

// LGU Admin handles donation payments and approvals. Super Admin oversight
// of permitted donation records belongs in read-only All Records.
export default function SuperAdminDonationRedirect() {
  return <Redirect href="/(superadmin)/all-records" />;
}
