import { Redirect } from "expo-router";

/** LGU Admin handles donation receipts; Super Admin is a system-maintenance role. */
export default function SuperAdminDonationRedirect() {
  return <Redirect href="/(superadmin)" />;
}
