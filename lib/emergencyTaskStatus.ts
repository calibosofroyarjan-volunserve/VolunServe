/**
 * UI-only labels for the Resident -> Admin -> Volunteer task workflow.
 * Firestore status values and their validated transition rules stay unchanged.
 */
export type EmergencyTaskStatus =
  | "Pending"
  | "Approved"
  | "Assigned"
  | "In Progress"
  | "Completed"
  | "Rejected";

const normal = (input: unknown) => String(input ?? "").trim().toLowerCase();

export function emergencyTaskStatusLabel(
  caseStatus: unknown,
  verificationStatus?: unknown,
  assignmentStatus?: unknown,
): EmergencyTaskStatus {
  const report = normal(caseStatus);
  const review = normal(verificationStatus);
  const task = normal(assignmentStatus);

  if (review === "rejected" || report === "rejected") return "Rejected";
  // Task completion is not equivalent to Admin-confirmed case completion.
  if (report === "closed" || report === "resolved") return "Completed";
  if (task === "responding" || task === "on_site" || report === "in_progress") {
    return "In Progress";
  }
  if (["offered", "accepted", "completed"].includes(task) || report === "assigned") {
    return "Assigned";
  }
  if (report === "validated" || review === "validated") return "Approved";
  return "Pending";
}
