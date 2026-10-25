import DonationAdminDashboard from "../../components/donations/DonationAdminDashboard";

/**
 * The Admin Donations entry point now shares the same single dashboard used
 * by donation alert deep links and Super Admin. Previous URLs stay valid.
 */
export default function AdminDonations() {
  return <DonationAdminDashboard mode="admin" />;
}
