// Scoped view over the existing LGU account moderation implementation.
// Shares the same Firestore records and authorization; does not create new roles.
import AccountApprovals from "./account-approvals";

export default function VolunteerManagement() {
  return <AccountApprovals mode="volunteers" />;
}
