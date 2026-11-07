import { volunserveUi } from "./volunserveUi";

/**
 * Shared visual identity for the active VolunServe workspaces.
 * These entries describe navigation and form review; they do not grant access.
 * Real access checks continue to live in Firebase Auth / Firestore rules.
 */
export type VolunServeRole = "resident" | "volunteer" | "admin" | "superadmin";
export type VolunServeModule = {
  id: string;
  label: string;
  icon: string;
  description: string;
  roles: readonly VolunServeRole[];
  kind: "form" | "review" | "records" | "dashboard";
};

export const volunserveModules: readonly VolunServeModule[] = [
  { id: "overview", label: "Overview", icon: "home-outline", description: "Your community workspace and recent activity", roles: ["resident", "volunteer", "admin", "superadmin"], kind: "dashboard" },
  { id: "identity", label: "Identity Verification", icon: "shield-checkmark-outline", description: "Submit and review verified resident identity", roles: ["resident", "admin"], kind: "form" },
  { id: "emergency", label: "Emergency Reports", icon: "alert-circle-outline", description: "Review safety reports and response status", roles: ["resident", "admin"], kind: "form" },
  { id: "volunteer-tasks", label: "Emergency Tasks", icon: "hand-left-outline", description: "Review and respond to volunteer assignments", roles: ["volunteer", "admin"], kind: "review" },
  { id: "assistance", label: "Request Assistance", icon: "help-circle-outline", description: "Apply for assistance and review evidence", roles: ["resident", "admin"], kind: "form" },
  { id: "events", label: "Community Events", icon: "calendar-outline", description: "Community activities, joining and participation", roles: ["resident", "volunteer", "admin"], kind: "form" },
  { id: "attendance", label: "Event Attendance", icon: "checkmark-done-outline", description: "Volunteer time-in, time-out and verified hours", roles: ["volunteer", "admin"], kind: "review" },
  { id: "certificates", label: "Certificates", icon: "ribbon-outline", description: "Verified service records and certificates", roles: ["resident", "volunteer", "admin"], kind: "records" },
  { id: "donations", label: "Donations", icon: "heart-outline", description: "Donation campaigns, transactions and funds", roles: ["resident", "admin"], kind: "form" },
  { id: "announcements", label: "Community Updates", icon: "megaphone-outline", description: "Read or publish verified announcements", roles: ["resident", "volunteer", "admin"], kind: "form" },
  { id: "notifications", label: "Notifications", icon: "notifications-outline", description: "Account and community updates", roles: ["resident", "volunteer", "admin"], kind: "records" },
  { id: "volunteer-application", label: "Volunteer Application", icon: "person-add-outline", description: "Apply to serve and submit qualifications", roles: ["resident", "admin"], kind: "form" },
  { id: "profile", label: "My Profile", icon: "person-circle-outline", description: "Your account, contact details and progress", roles: ["resident", "volunteer", "admin", "superadmin"], kind: "form" },
  { id: "accounts", label: "Account Management", icon: "people-outline", description: "Review accounts and staff access", roles: ["admin", "superadmin"], kind: "review" },
  { id: "records", label: "System Records", icon: "albums-outline", description: "Inspect authorized operational records", roles: ["superadmin"], kind: "records" },
  { id: "audit", label: "Audit Logs", icon: "time-outline", description: "Review recorded administrative actions", roles: ["admin", "superadmin"], kind: "records" },
  { id: "settings", label: "System Settings", icon: "settings-outline", description: "Manage authorized platform settings", roles: ["superadmin"], kind: "form" },
] as const;

export const moduleById = (id: string): VolunServeModule | undefined =>
  volunserveModules.find(module => module.id === id);

export const moduleIcon = (id: string): string =>
  moduleById(id)?.icon ?? "grid-outline";

export const volunserveBrand = volunserveUi.brand;
