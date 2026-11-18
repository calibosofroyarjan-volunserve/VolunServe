export interface EmergencyVolunteerCasePointer {
  autoVolunteerAcceptedAssignmentId?: string | null;
  activeVolunteerSupportAssignmentId?: string | null;
  activeVolunteerSupportUid?: string | null;
  dispatchBlocked?: boolean;
}
export interface EmergencyVolunteerAssignmentPointer {
  id: string;
  volunteerId?: string | null;
  offerMode?: string | null;
}
export type EmergencyVolunteerTransition =
  | "accepted" | "declined" | "responding" | "on_site" | "completed";
export function manualOfferConflictReason(
  caseData: EmergencyVolunteerCasePointer | null | undefined,
  targetAssignmentId: string,
  targetVolunteerUid: string
): string | null;
export function volunteerTransitionConflictReason(
  caseData: EmergencyVolunteerCasePointer | null | undefined,
  assignment: EmergencyVolunteerAssignmentPointer,
  next: EmergencyVolunteerTransition
): string | null;
export function isAutoOffer(assignment: { offerMode?: string | null } | null | undefined): boolean;
