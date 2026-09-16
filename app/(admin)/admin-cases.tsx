import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";

type Severity = "low" | "medium" | "high" | "critical";
type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type AssignmentStatus =
  | "offered"
  | "accepted"
  | "responding"
  | "on_site"
  | "completed"
  | "declined"
  | "cancelled"
  | string;

type Attachment = {
  url?: string;
  path?: string;
  type?: "image" | "video" | string;
  name?: string;
  contentType?: string;
  sizeBytes?: number;
};

type VerificationStatus =
  | "pending_verification"
  | "needs_more_evidence"
  | "validated"
  | "rejected"
  | string;

interface DisasterCase {
  id: string;
  reporterUid: string;
  reporterName: string;
  reporterEmail?: string;
  reporterBarangay?: string;
  reporterAddress?: string;
  contactNumber?: string;
  emergencyContact?: string;

  source?: string;
  title: string;
  category: string;
  severity: Severity;
  status: CaseStatus;

  verificationStatus?: VerificationStatus;
  evidenceReviewStatus?: string;
  verification?: {
    accountApproved?: boolean;
    emailVerified?: boolean;
    phoneOnFile?: boolean;
    gpsProvided?: boolean;
    photoEvidenceProvided?: boolean;
    videoEvidenceProvided?: boolean;
    duplicateCheckStatus?: string;
    locationCheckStatus?: string;
  };

  location: string;
  latitude?: number;
  longitude?: number;
  details: string;

  affectedPeople?: number;
  assistanceTypes?: string[];
  requiredSkills?: string[];
  neededGoods?: string[];
  needsNote?: string;
  needs?: string;
  attachments?: Attachment[];

  requiredVolunteers?: number;
  assignedVolunteersCount?: number;
  assignedVolunteerIds?: string[];

  adminNote?: string;
  evidenceRequestReason?: string;
  rejectionReason?: string;

  createdAt?: any;
  updatedAt?: any;
  validatedAt?: any;
  validatedBy?: string;
  evidenceRequestedAt?: any;
  evidenceRequestedBy?: string;
  rejectedAt?: any;
  rejectedBy?: string;
  assignedAt?: any;
  resolvedAt?: any;
  closedAt?: any;
}

type VolunteerProfile = {
  uid: string;
  fullName: string;
  barangay: string;
  skills: string[];
  availability: string[];
  role?: string;
  volunteerAccess?: boolean;
  volunteerStatus?: string;
  status?: string;
};

type ResponseAssignment = {
  id: string;
  caseId: string;
  volunteerId: string;
  volunteerName: string;
  caseTitle: string;
  status: AssignmentStatus;
  createdAt?: any;
  updatedAt?: any;
};

const severityRank: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const formatDate = (value: any) => {
  try {
    const date = value?.toDate?.()
      ? value.toDate()
      : value instanceof Date
      ? value
      : null;

    if (!date) return "—";

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const labelOfStatus = (status: string) =>
  status.replaceAll("_", " ").toUpperCase();

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const firstIncidentImage = (attachments?: Attachment[]) => {
  if (!Array.isArray(attachments)) return "";

  const image = attachments.find((item) => {
    const url = String(item?.url || "").trim();
    const type = String(item?.type || "").toLowerCase();
    const name = String(item?.name || "").toLowerCase();

    if (!url) return false;

    return (
      type.includes("image") ||
      /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) ||
      /\.(png|jpe?g|webp|gif)$/i.test(name)
    );
  });

  return String(image?.url || "");
};

const categoryIcon = (category: string) => {
  const value = category.toLowerCase();

  if (value.includes("flood")) return "🌊";
  if (value.includes("fire")) return "🔥";
  if (value.includes("medical")) return "✚";
  if (value.includes("road") || value.includes("tree")) return "⚠";
  if (value.includes("earthquake")) return "🏚";
  if (value.includes("storm") || value.includes("typhoon")) return "🌧";

  return "🚨";
};

export default function AdminCases() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 920;

  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [cases, setCases] = useState<DisasterCase[]>([]);
  const [assignments, setAssignments] = useState<ResponseAssignment[]>([]);
  const [approvedVolunteers, setApprovedVolunteers] = useState<VolunteerProfile[]>(
    []
  );

  const [filterStatus, setFilterStatus] = useState<CaseStatus | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [requiredVolunteers, setRequiredVolunteers] = useState<
    Record<string, string>
  >({});

  const [assignmentCaseId, setAssignmentCaseId] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    const loadRole = async () => {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));

        if (!snapshot.exists()) {
          router.replace("/login");
          return;
        }

        const nextRole = String(snapshot.data()?.role || "")
          .trim()
          .toLowerCase();

        setRole(nextRole);
      } finally {
        setLoadingRole(false);
      }
    };

    loadRole();
  }, [router]);

  const isAuthorized = role === "admin" || role === "superadmin";

  useEffect(() => {
    if (!isAuthorized) return;

    const casesQuery = query(
      collection(db, "disasterCases"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      casesQuery,
      (snapshot) => {
        const list: DisasterCase[] = snapshot.docs.map((item) => {
          const data: any = item.data();

          return {
            id: item.id,
            reporterUid: data.reporterUid || "",
            reporterName: data.reporterName || "Resident",
            reporterEmail: data.reporterEmail || "",
            reporterBarangay: data.reporterBarangay || "",
            reporterAddress: data.reporterAddress || "",
            contactNumber: data.contactNumber || "",
            emergencyContact: data.emergencyContact || "",

            source: data.source || "",
            title: data.title || "Untitled incident",
            category: data.category || "Emergency",
            severity: (data.severity || "medium") as Severity,
            status: (data.status || "reported") as CaseStatus,

            verificationStatus:
              data.verificationStatus ||
              (data.status === "validated" ||
              data.status === "assigned" ||
              data.status === "in_progress" ||
              data.status === "resolved" ||
              data.status === "closed"
                ? "validated"
                : "pending_verification"),
            evidenceReviewStatus: data.evidenceReviewStatus || "",
            verification:
              data.verification && typeof data.verification === "object"
                ? data.verification
                : {},

            location: data.location || "",
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            details: data.details || "",

            affectedPeople: Number(data.affectedPeople || 0),
            assistanceTypes: normalizeStringArray(data.assistanceTypes),
            requiredSkills: normalizeStringArray(data.requiredSkills),
            neededGoods: normalizeStringArray(data.neededGoods),
            needsNote: data.needsNote || "",
            needs: data.needs || "",
            attachments: Array.isArray(data.attachments) ? data.attachments : [],

            requiredVolunteers: Number(data.requiredVolunteers || 0),
            assignedVolunteersCount: Number(data.assignedVolunteersCount || 0),
            assignedVolunteerIds: Array.isArray(data.assignedVolunteerIds)
              ? data.assignedVolunteerIds
              : [],

            adminNote: data.adminNote || "",
            evidenceRequestReason: data.evidenceRequestReason || "",
            rejectionReason: data.rejectionReason || "",

            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            validatedAt: data.validatedAt,
            validatedBy: data.validatedBy,
            evidenceRequestedAt: data.evidenceRequestedAt,
            evidenceRequestedBy: data.evidenceRequestedBy,
            rejectedAt: data.rejectedAt,
            rejectedBy: data.rejectedBy,
            assignedAt: data.assignedAt,
            resolvedAt: data.resolvedAt,
            closedAt: data.closedAt,
          };
        });

        setCases(list);
      },
      (error) => {
        console.log("Cases listener error:", error);
        Alert.alert(
          "Permission Error",
          "Unable to load disaster cases. Check the deployed Firestore rules."
        );
      }
    );
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    // Volunteer-specific information comes from volunteerApplications.
    // The Admin only views/filters these values; the volunteer supplies them
    // during the volunteer application/profile flow.
    return onSnapshot(
      collection(db, "volunteerApplications"),
      async (snapshot) => {
        try {
          const approvedApplications = snapshot.docs.filter((item) => {
            const data: any = item.data();
            return String(data.status || "").toLowerCase() === "approved";
          });

          const list = await Promise.all(
            approvedApplications.map(async (item) => {
              const application: any = item.data();
              const uid = String(
                application.uid ||
                  application.userId ||
                  application.volunteerId ||
                  item.id
              );

              let userData: any = {};

              try {
                const userSnapshot = await getDoc(doc(db, "users", uid));
                if (userSnapshot.exists()) {
                  userData = userSnapshot.data();
                }
              } catch (userError) {
                console.log("Volunteer user profile lookup error:", userError);
              }

              const applicationFullName =
                application.fullName ||
                application.name ||
                [
                  application.firstName,
                  application.middleName,
                  application.lastName,
                ]
                  .filter(Boolean)
                  .join(" ");

              const userFullName =
                userData.fullName ||
                userData.name ||
                [userData.firstName, userData.middleName, userData.lastName]
                  .filter(Boolean)
                  .join(" ");

              return {
                uid,
                fullName:
                  String(applicationFullName || userFullName || "Volunteer").trim(),
                barangay: String(
                  application.barangay ||
                    application.addressBarangay ||
                    userData.barangay ||
                    userData.addressBarangay ||
                    ""
                ).trim(),
                skills: normalizeStringArray(
                  application.skills ??
                    application.skillSet ??
                    application.volunteerSkills ??
                    userData.skills
                ),
                availability: normalizeStringArray(
                  application.availability ??
                    application.availableSchedule ??
                    application.schedule ??
                    userData.availability
                ),
                role: String(userData.role || "").toLowerCase(),
                volunteerAccess:
                  userData.volunteerAccess === true ||
                  String(application.status || "").toLowerCase() === "approved",
                volunteerStatus:
                  userData.volunteerStatus || application.status || "approved",
                status: userData.status || "approved",
              } as VolunteerProfile;
            })
          );

          // Admin and Super Admin accounts are control-plane accounts.
          // Never show them as assignable field responders.
          const assignableVolunteers = list.filter(
            (person) =>
              person.role !== "admin" &&
              person.role !== "superadmin"
          );

          assignableVolunteers.sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          );
          setApprovedVolunteers(assignableVolunteers);
        } catch (error) {
          console.log("Approved volunteer merge error:", error);
          setApprovedVolunteers([]);
        }
      },
      (error) => {
        console.log("Volunteer applications listener error:", error);
        Alert.alert(
          "Permission Error",
          "Unable to load approved volunteer applications."
        );
      }
    );
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    return onSnapshot(
      collection(db, "responseAssignments"),
      (snapshot) => {
        const list: ResponseAssignment[] = snapshot.docs.map((item) => {
          const data: any = item.data();

          return {
            id: item.id,
            caseId: data.caseId || "",
            volunteerId: data.volunteerId || "",
            volunteerName: data.volunteerName || "Volunteer",
            caseTitle: data.caseTitle || "Incident",
            status: data.status || "offered",
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });

        setAssignments(list);
      },
      (error) => {
        console.log("Assignment listener error:", error);
        Alert.alert(
          "Permission Error",
          "Unable to load response assignments. Check Firestore rules."
        );
      }
    );
  }, [isAuthorized]);

  const sortedFiltered = useMemo(() => {
    let list = [...cases];

    if (filterStatus !== "all") {
      list = list.filter((item) => item.status === filterStatus);
    }

    if (filterSeverity !== "all") {
      list = list.filter((item) => item.severity === filterSeverity);
    }

    list.sort((a, b) => {
      const severityDifference =
        (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);

      if (severityDifference !== 0) return severityDifference;

      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;

      return bTime - aTime;
    });

    return list;
  }, [cases, filterStatus, filterSeverity]);

  const assignmentsForCase = (caseId: string) =>
    assignments.filter((item) => item.caseId === caseId);

  const activeAssignmentsForCase = (caseId: string) =>
    assignmentsForCase(caseId).filter(
      (item) => !["declined", "cancelled"].includes(String(item.status))
    );

  const skillMatchCount = (
    incident: DisasterCase,
    volunteer: VolunteerProfile
  ) => {
    const required = (incident.requiredSkills || []).map((item) =>
      item.toLowerCase()
    );

    if (required.length === 0) return 0;

    return required.filter((needed) =>
      volunteer.skills.some((skill) => {
        const candidate = skill.toLowerCase();
        return (
          candidate === needed ||
          candidate.includes(needed) ||
          needed.includes(candidate)
        );
      })
    ).length;
  };

  const filteredVolunteersForCase = (incident: DisasterCase) => {
    const alreadyAssigned = new Set(
      activeAssignmentsForCase(incident.id).map((item) => item.volunteerId)
    );

    return approvedVolunteers
      .filter((volunteer) => {
        if (alreadyAssigned.has(volunteer.uid)) return false;

        const skillMatch =
          !skillFilter.trim() ||
          volunteer.skills.some((skill) =>
            skill.toLowerCase().includes(skillFilter.trim().toLowerCase())
          );

        const barangayMatch =
          !barangayFilter.trim() ||
          volunteer.barangay
            .toLowerCase()
            .includes(barangayFilter.trim().toLowerCase());

        const availabilityText = volunteer.availability.join(" ").toLowerCase();

        const availabilityMatch =
          !availabilityFilter.trim() ||
          availabilityText.includes(availabilityFilter.trim().toLowerCase());

        return skillMatch && barangayMatch && availabilityMatch;
      })
      .sort((a, b) => {
        const skillDifference =
          skillMatchCount(incident, b) - skillMatchCount(incident, a);

        if (skillDifference !== 0) return skillDifference;

        const aBarangay =
          Boolean(incident.reporterBarangay) &&
          a.barangay.toLowerCase() === incident.reporterBarangay?.toLowerCase();

        const bBarangay =
          Boolean(incident.reporterBarangay) &&
          b.barangay.toLowerCase() === incident.reporterBarangay?.toLowerCase();

        if (aBarangay !== bBarangay) return bBarangay ? 1 : -1;

        return a.fullName.localeCompare(b.fullName);
      });
  };

  const reviewVerification = async (
    incident: DisasterCase,
    action: "validate" | "request_more_evidence" | "reject"
  ) => {
    const auth = getAuth();
    const adminUser = auth.currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    const reason = (reviewReasons[incident.id] || "").trim();
    const hasImage = (incident.attachments || []).some((attachment) =>
      String(attachment.type || "").toLowerCase().includes("image")
    );

    if (
      action === "validate" &&
      incident.source === "resident_emergency_assistance" &&
      !hasImage
    ) {
      Alert.alert(
        "Evidence Required",
        "This assistance request has no photo evidence. Request more evidence or reject it instead."
      );
      return;
    }

    if (action !== "validate" && reason.length < 5) {
      Alert.alert(
        "Reason Required",
        "Enter a clear reason before requesting more evidence or rejecting the request."
      );
      return;
    }

    const caseRef = doc(db, "disasterCases", incident.id);
    const notificationRef = doc(collection(db, "notifications"));
    const activityLogRef = doc(collection(db, "adminActivityLogs"));

    try {
      await runTransaction(db, async (transaction) => {
        const caseSnapshot = await transaction.get(caseRef);

        if (!caseSnapshot.exists()) {
          throw new Error("The resident request no longer exists.");
        }

        const current: any = caseSnapshot.data();
        const currentVerification = String(
          current.verificationStatus || "pending_verification"
        );

        if (
          currentVerification === "validated" &&
          action !== "validate"
        ) {
          throw new Error(
            "This request is already validated. Do not reject it after dispatch preparation has started."
          );
        }

        const basePatch: any = {
          updatedAt: serverTimestamp(),
        };

        let notificationTitle = "";
        let notificationMessage = "";
        let logAction = "";

        if (action === "validate") {
          basePatch.status = "validated";
          basePatch.verificationStatus = "validated";
          basePatch.evidenceReviewStatus = "approved";
          basePatch.validatedAt = serverTimestamp();
          basePatch.validatedBy = adminUser.uid;
          basePatch.rejectionReason = "";
          basePatch.evidenceRequestReason = "";
          basePatch.dispatchBlocked = false;

          notificationTitle = "Assistance request validated";
          notificationMessage =
            "Your emergency assistance request was verified. Admin may now assign an appropriate responder.";
          logAction = "Emergency Request Validated";
        }

        if (action === "request_more_evidence") {
          basePatch.verificationStatus = "needs_more_evidence";
          basePatch.evidenceReviewStatus = "more_evidence_requested";
          basePatch.evidenceRequestReason = reason;
          basePatch.evidenceRequestedAt = serverTimestamp();
          basePatch.evidenceRequestedBy = adminUser.uid;
          basePatch.dispatchBlocked = true;

          notificationTitle = "More evidence needed";
          notificationMessage = `Admin needs more information before dispatch: ${reason}`;
          logAction = "More Emergency Evidence Requested";
        }

        if (action === "reject") {
          basePatch.verificationStatus = "rejected";
          basePatch.evidenceReviewStatus = "rejected";
          basePatch.rejectionReason = reason;
          basePatch.rejectedAt = serverTimestamp();
          basePatch.rejectedBy = adminUser.uid;
          basePatch.dispatchBlocked = true;

          notificationTitle = "Assistance request rejected";
          notificationMessage = `Your request was not approved for dispatch. Reason: ${reason}`;
          logAction = "Emergency Request Rejected";
        }

        transaction.update(caseRef, basePatch);

        if (incident.reporterUid) {
          transaction.set(notificationRef, {
            userId: incident.reporterUid,
            audience: "resident",
            type: "emergency_verification",
            caseId: incident.id,
            title: notificationTitle,
            message: notificationMessage,
            read: false,
            createdAt: serverTimestamp(),
          });
        }

        transaction.set(activityLogRef, {
          action: logAction,
          caseId: incident.id,
          residentUid: incident.reporterUid || "",
          performedBy: adminUser.uid,
          reason: action === "validate" ? "" : reason,
          timestamp: serverTimestamp(),
        });
      });

      if (action === "validate") {
        Alert.alert(
          "Request Validated",
          "The case is now eligible for responder assignment."
        );
      } else if (action === "request_more_evidence") {
        Alert.alert(
          "Resident Notified",
          "The resident was asked to provide more evidence."
        );
      } else {
        Alert.alert(
          "Request Rejected",
          "The request is blocked from responder assignment."
        );
      }

      setReviewReasons((current) => ({
        ...current,
        [incident.id]: "",
      }));
    } catch (error) {
      console.log("Verification review error:", error);
      Alert.alert(
        "Review Failed",
        error instanceof Error
          ? error.message
          : "Unable to update verification status."
      );
    }
  };

  const saveAdminNote = async (incident: DisasterCase) => {
    try {
      const note = (notes[incident.id] ?? incident.adminNote ?? "").trim();

      await updateDoc(doc(db, "disasterCases", incident.id), {
        adminNote: note,
        updatedAt: serverTimestamp(),
      });

      Alert.alert("Saved", "Admin note updated.");
    } catch (error) {
      console.log("Save note error:", error);
      Alert.alert("Error", "Unable to save the admin note.");
    }
  };

  const saveRequiredVolunteers = async (incident: DisasterCase) => {
    const raw =
      requiredVolunteers[incident.id] ??
      String(incident.requiredVolunteers ?? 0);

    const count = Number(raw.trim());

    if (!Number.isInteger(count) || count < 0) {
      Alert.alert(
        "Invalid Number",
        "Required volunteers must be a whole number of 0 or higher."
      );
      return;
    }

    try {
      await updateDoc(doc(db, "disasterCases", incident.id), {
        requiredVolunteers: count,
        updatedAt: serverTimestamp(),
      });

      Alert.alert("Saved", "Required volunteer count updated.");
    } catch (error) {
      console.log("Required volunteers error:", error);
      Alert.alert("Error", "Unable to update required volunteers.");
    }
  };

  const changeCaseStatus = async (
    incident: DisasterCase,
    nextStatus: CaseStatus
  ) => {
    const previous: Partial<Record<CaseStatus, CaseStatus>> = {
      validated: "reported",
      in_progress: "assigned",
      resolved: "in_progress",
      closed: "resolved",
    };

    if (previous[nextStatus] !== incident.status) {
      Alert.alert(
        "Status Changed",
        "This action is not valid for the case's current status."
      );
      return;
    }

    try {
      const patch: any = {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      };

      if (nextStatus === "validated") {
        patch.validatedAt = serverTimestamp();
      }

      if (nextStatus === "resolved") {
        patch.resolvedAt = serverTimestamp();
      }

      if (nextStatus === "closed") {
        patch.closedAt = serverTimestamp();
      }

      await updateDoc(doc(db, "disasterCases", incident.id), patch);

      Alert.alert(
        "Case Updated",
        `Status changed to ${labelOfStatus(nextStatus)}.`
      );
    } catch (error) {
      console.log("Case status error:", error);
      Alert.alert("Error", "Unable to update the case status.");
    }
  };

  const assignVolunteerToCase = async (
    incident: DisasterCase,
    volunteer: VolunteerProfile
  ) => {
    const auth = getAuth();
    const adminUser = auth.currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    const required = Number(incident.requiredVolunteers || 0);
    const activeCount = activeAssignmentsForCase(incident.id).length;

    if (required <= 0) {
      Alert.alert(
        "Required Volunteers Not Set",
        "Set the required volunteer count before assigning responders."
      );
      return;
    }

    if (activeCount >= required) {
      Alert.alert(
        "Assignment Filled",
        "The required number of responders has already been assigned."
      );
      return;
    }

    const busyId = `${incident.id}_${volunteer.uid}`;
    setBusyKey(busyId);

    try {
      const caseRef = doc(db, "disasterCases", incident.id);
      const assignmentRef = doc(
        db,
        "responseAssignments",
        `${incident.id}_${volunteer.uid}`
      );
      const notificationRef = doc(
        db,
        "notifications",
        `response_${incident.id}_${volunteer.uid}`
      );
      const activityLogRef = doc(collection(db, "adminActivityLogs"));

      await runTransaction(db, async (transaction) => {
        const [caseSnapshot, assignmentSnapshot] = await Promise.all([
          transaction.get(caseRef),
          transaction.get(assignmentRef),
        ]);

        if (!caseSnapshot.exists()) {
          throw new Error("The disaster case no longer exists.");
        }

        const currentCase: any = caseSnapshot.data();

        const currentVerification = String(
          currentCase.verificationStatus ||
            (currentCase.status === "validated" ||
            currentCase.status === "assigned" ||
            currentCase.status === "in_progress"
              ? "validated"
              : "pending_verification")
        );

        if (
          currentVerification !== "validated" ||
          !["validated", "assigned", "in_progress"].includes(
            String(currentCase.status || "")
          )
        ) {
          throw new Error(
            "Admin verification must be completed before assigning a volunteer."
          );
        }

        const currentRequired = Number(currentCase.requiredVolunteers || 0);

        if (currentRequired <= 0) {
          throw new Error(
            "Set the required volunteer count before assigning responders."
          );
        }

        const previousAssignmentStatus = assignmentSnapshot.exists()
          ? String(assignmentSnapshot.data()?.status || "")
          : "";

        const canReofferPreviousAssignment =
          assignmentSnapshot.exists() &&
          ["cancelled", "declined"].includes(previousAssignmentStatus);

        if (
          assignmentSnapshot.exists() &&
          !canReofferPreviousAssignment
        ) {
          throw new Error(
            "This volunteer already has an active assignment for this case."
          );
        }

        if (canReofferPreviousAssignment) {
          // Re-use the same deterministic assignment document.
          // This preserves history and works with the deployed rules,
          // while making the assignment active again.
          transaction.update(assignmentRef, {
            status: "offered",
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.set(assignmentRef, {
            caseId: incident.id,
            volunteerId: volunteer.uid,
            volunteerName: volunteer.fullName,
            caseTitle: currentCase.title || incident.title || "Incident",
            status: "offered",
            createdBy: adminUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const casePatch: any = {
          assignedVolunteerIds: arrayUnion(volunteer.uid),
          updatedAt: serverTimestamp(),
        };

        // Only increment the legacy counter for a brand-new assignment record.
        // The UI itself uses live responseAssignments for the real active count.
        if (!assignmentSnapshot.exists()) {
          casePatch.assignedVolunteersCount = increment(1);
        }

        if (currentCase.status === "validated") {
          casePatch.status = "assigned";
          casePatch.assignedAt = serverTimestamp();
        }

        transaction.update(caseRef, casePatch);

        transaction.set(notificationRef, {
          userId: volunteer.uid,
          audience: "volunteer",
          type: "response_assignment",
          title: "New emergency assignment",
          message: `You were assigned to ${
            currentCase.title || incident.title || "an emergency case"
          }. Open Volunteer Tasks to accept or decline.`,
          read: false,
          createdAt: serverTimestamp(),
        });

        transaction.set(activityLogRef, {
          action: "Volunteer Assigned to Disaster Case",
          caseId: incident.id,
          volunteerUid: volunteer.uid,
          volunteerName: volunteer.fullName,
          performedBy: adminUser.uid,
          timestamp: serverTimestamp(),
        });
      });

      Alert.alert(
        "Assignment Sent",
        `${volunteer.fullName} will receive this case under Volunteer Tasks.`
      );
    } catch (error) {
      console.log("Assign volunteer error:", error);

      Alert.alert(
        "Assignment Failed",
        error instanceof Error
          ? error.message
          : "Unable to assign this volunteer."
      );
    } finally {
      setBusyKey("");
    }
  };

  const cancelAssignment = async (assignment: ResponseAssignment) => {
    try {
      await updateDoc(doc(db, "responseAssignments", assignment.id), {
        status: "cancelled",
        updatedAt: serverTimestamp(),
      });

      Alert.alert("Cancelled", "The volunteer assignment was cancelled.");
    } catch (error) {
      console.log("Cancel assignment error:", error);
      Alert.alert("Error", "Unable to cancel the assignment.");
    }
  };

  const severityStyle = (severity: Severity) => {
    if (severity === "critical") return styles.severityCritical;
    if (severity === "high") return styles.severityHigh;
    if (severity === "medium") return styles.severityMedium;
    return styles.severityLow;
  };

  const verificationStyle = (status: VerificationStatus) => {
    if (status === "validated") return styles.verificationValidated;
    if (status === "rejected") return styles.verificationRejected;
    if (status === "needs_more_evidence")
      return styles.verificationNeedsEvidence;
    return styles.verificationPending;
  };

  const statusStyle = (status: string) => {
    if (status === "reported") return styles.statusReported;
    if (status === "validated") return styles.statusValidated;
    if (status === "assigned") return styles.statusAssigned;
    if (status === "in_progress") return styles.statusProgress;
    if (status === "resolved") return styles.statusResolved;
    if (status === "closed") return styles.statusClosed;

    if (status === "offered") return styles.assignmentOffered;
    if (status === "accepted") return styles.assignmentAccepted;
    if (status === "responding") return styles.assignmentResponding;
    if (status === "on_site") return styles.assignmentOnSite;
    if (status === "completed") return styles.assignmentCompleted;
    if (status === "declined") return styles.assignmentDeclined;

    return styles.statusReported;
  };

  if (loadingRole) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading disaster cases…</Text>
      </View>
    );
  }

  if (!isAuthorized) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Access Denied</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={true}
    >
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>ADMIN · EMERGENCY OPERATIONS</Text>
          <Text style={styles.title}>Disaster Cases</Text>
          <Text style={styles.subtitle}>
            Validate resident reports, set responder requirements, and assign
            approved volunteers.
          </Text>
        </View>

        <View style={styles.liveSummary}>
          <Text style={styles.liveSummaryNumber}>
            {
              cases.filter((item) =>
                ["reported", "validated", "assigned", "in_progress"].includes(
                  item.status
                )
              ).length
            }
          </Text>
          <Text style={styles.liveSummaryLabel}>Open Cases</Text>
        </View>
      </View>

      <View style={styles.filterCard}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>STATUS</Text>
          <View style={styles.pillRow}>
            {(
              [
                "all",
                "reported",
                "validated",
                "assigned",
                "in_progress",
                "resolved",
                "closed",
              ] as const
            ).map((status) => {
              const active = filterStatus === status;

              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setFilterStatus(status)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      active && styles.pillTextActive,
                    ]}
                  >
                    {labelOfStatus(status)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>SEVERITY</Text>
          <View style={styles.pillRow}>
            {(["all", "low", "medium", "high", "critical"] as const).map(
              (severity) => {
                const active = filterSeverity === severity;

                return (
                  <TouchableOpacity
                    key={severity}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setFilterSeverity(severity)}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        active && styles.pillTextActive,
                      ]}
                    >
                      {severity.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              }
            )}
          </View>
        </View>
      </View>

      {sortedFiltered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No disaster cases found</Text>
          <Text style={styles.emptyText}>
            Try another filter or wait for a resident emergency report.
          </Text>
        </View>
      ) : (
        sortedFiltered.map((incident) => {
          const incidentAssignments = assignmentsForCase(incident.id);
          const activeAssignments = activeAssignmentsForCase(incident.id);
          const required = Number(incident.requiredVolunteers || 0);
          const remainingSlots = Math.max(required - activeAssignments.length, 0);
          const photoUrl = firstIncidentImage(incident.attachments);
          const note = notes[incident.id] ?? incident.adminNote ?? "";
          const requiredValue =
            requiredVolunteers[incident.id] ??
            String(incident.requiredVolunteers ?? 0);

          const assignmentPanelOpen = assignmentCaseId === incident.id;
          const volunteerMatches = filteredVolunteersForCase(incident);
          const verificationStatus =
            incident.verificationStatus || "pending_verification";

          const imageEvidence = (incident.attachments || []).filter((item) =>
            String(item.type || "").toLowerCase().includes("image")
          );

          const videoEvidence = (incident.attachments || []).filter((item) =>
            String(item.type || "").toLowerCase().includes("video")
          );

          const dispatchReady =
            verificationStatus === "validated" &&
            ["validated", "assigned", "in_progress", "resolved", "closed"].includes(
              incident.status
            );

          const reviewReason =
            reviewReasons[incident.id] ??
            incident.evidenceRequestReason ??
            incident.rejectionReason ??
            "";

          return (
            <View key={incident.id} style={styles.caseCard}>
              <View
                style={[
                  styles.caseMain,
                  compact && styles.caseMainCompact,
                ]}
              >
                <View
                  style={[
                    styles.mediaBox,
                    compact && styles.mediaBoxCompact,
                  ]}
                >
                  {photoUrl ? (
                    <Image
                      source={{ uri: photoUrl }}
                      style={styles.incidentImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.imageFallback}>
                      <Text style={styles.imageFallbackIcon}>
                        {categoryIcon(incident.category)}
                      </Text>
                      <Text style={styles.imageFallbackText}>
                        {incident.category || "Emergency"}
                      </Text>
                      <Text style={styles.imageFallbackSubtext}>
                        No incident photo
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.caseContent}>
                  <View style={styles.caseTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.caseTitle}>{incident.title}</Text>

                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.badge,
                            severityStyle(incident.severity),
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {incident.severity.toUpperCase()}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.badge,
                            statusStyle(incident.status),
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {labelOfStatus(incident.status)}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.badge,
                            verificationStyle(verificationStatus),
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {labelOfStatus(verificationStatus)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text style={styles.caseId}>CASE {incident.id}</Text>
                  </View>

                  <Text style={styles.locationText}>⌖ {incident.location}</Text>
                  <Text style={styles.details}>{incident.details}</Text>

                  <View style={styles.responseNeedsGrid}>
                    <View style={styles.responseNeedCard}>
                      <Text style={styles.needsLabel}>HELP NEEDED</Text>
                      <Text style={styles.needsText}>
                        {incident.assistanceTypes?.length
                          ? incident.assistanceTypes.join(" · ")
                          : incident.needs || "Not specified"}
                      </Text>
                    </View>

                    <View style={styles.responseNeedCard}>
                      <Text style={styles.needsLabel}>REQUIRED SKILLS</Text>
                      <Text style={styles.needsText}>
                        {incident.requiredSkills?.length
                          ? incident.requiredSkills.join(" · ")
                          : "General volunteer assistance"}
                      </Text>
                    </View>

                    <View style={styles.responseNeedCard}>
                      <Text style={styles.needsLabel}>GOODS / SUPPLIES</Text>
                      <Text style={styles.needsText}>
                        {incident.neededGoods?.length
                          ? incident.neededGoods.join(" · ")
                          : "No goods specified"}
                      </Text>
                    </View>
                  </View>

                  {!!incident.needsNote && (
                    <View style={styles.needsBox}>
                      <Text style={styles.needsLabel}>
                        RESIDENT RESPONSE NOTE
                      </Text>
                      <Text style={styles.needsText}>
                        {incident.needsNote}
                      </Text>
                    </View>
                  )}

                  <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Reporter</Text>
                      <Text style={styles.metaValue}>
                        {incident.reporterName}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Barangay</Text>
                      <Text style={styles.metaValue}>
                        {incident.reporterBarangay || "—"}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Contact</Text>
                      <Text style={styles.metaValue}>
                        {incident.contactNumber || "—"}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Affected People</Text>
                      <Text style={styles.metaValue}>
                        {incident.affectedPeople || "—"}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Submitted</Text>
                      <Text style={styles.metaValue}>
                        {formatDate(incident.createdAt)}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Responders</Text>
                      <Text style={styles.metaValue}>
                        {activeAssignments.length} / {required || 0}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.verificationPanel}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>
                      ANTI-SCAM VERIFICATION
                    </Text>
                    <Text style={styles.sectionTitle}>
                      Review Resident Request
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.reviewState,
                      verificationStyle(verificationStatus),
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {labelOfStatus(verificationStatus)}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewInfoGrid}>
                  <View style={styles.reviewInfoCard}>
                    <Text style={styles.metaLabel}>Resident</Text>
                    <Text style={styles.reviewInfoValue}>
                      {incident.reporterName}
                    </Text>
                    <Text style={styles.reviewInfoSub}>
                      {incident.reporterEmail || "No email"}
                    </Text>
                  </View>

                  <View style={styles.reviewInfoCard}>
                    <Text style={styles.metaLabel}>Exact Response Location</Text>
                    <Text style={styles.reviewInfoValue}>
                      {incident.location || "Not provided"}
                    </Text>
                    <Text style={styles.reviewInfoSub}>
                      {Number.isFinite(incident.latitude) &&
                      Number.isFinite(incident.longitude)
                        ? `${incident.latitude?.toFixed(6)}, ${incident.longitude?.toFixed(6)}`
                        : "No GPS coordinates"}
                    </Text>
                  </View>

                  <View style={styles.reviewInfoCard}>
                    <Text style={styles.metaLabel}>Evidence</Text>
                    <Text style={styles.reviewInfoValue}>
                      {imageEvidence.length} photo
                      {imageEvidence.length === 1 ? "" : "s"} ·{" "}
                      {videoEvidence.length} video
                      {videoEvidence.length === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.reviewInfoSub}>
                      Photo evidence is required for new assistance requests.
                    </Text>
                  </View>
                </View>

                <View style={styles.verificationChecks}>
                  <View style={styles.checkItem}>
                    <Text style={styles.checkIcon}>
                      {incident.verification?.accountApproved ? "✓" : "—"}
                    </Text>
                    <Text style={styles.checkText}>Approved account</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Text style={styles.checkIcon}>
                      {incident.verification?.phoneOnFile ||
                      incident.contactNumber
                        ? "✓"
                        : "—"}
                    </Text>
                    <Text style={styles.checkText}>Contact on file</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Text style={styles.checkIcon}>
                      {incident.verification?.gpsProvided ||
                      (Number.isFinite(incident.latitude) &&
                        Number.isFinite(incident.longitude))
                        ? "✓"
                        : "—"}
                    </Text>
                    <Text style={styles.checkText}>GPS location</Text>
                  </View>
                  <View style={styles.checkItem}>
                    <Text style={styles.checkIcon}>
                      {imageEvidence.length > 0 ? "✓" : "—"}
                    </Text>
                    <Text style={styles.checkText}>Photo evidence</Text>
                  </View>
                </View>

                {imageEvidence.length > 0 && (
                  <View style={styles.evidenceGrid}>
                    {imageEvidence.slice(0, 5).map((attachment, index) => (
                      <TouchableOpacity
                        key={`${attachment.url || "image"}-${index}`}
                        style={styles.evidenceCard}
                        onPress={() =>
                          attachment.url
                            ? Linking.openURL(attachment.url)
                            : undefined
                        }
                      >
                        <Image
                          source={{ uri: attachment.url || "" }}
                          style={styles.evidenceImage}
                          resizeMode="cover"
                        />
                        <Text
                          style={styles.evidenceName}
                          numberOfLines={1}
                        >
                          {attachment.name || `Photo ${index + 1}`}
                        </Text>
                        <Text style={styles.evidenceOpen}>
                          Open full image
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {videoEvidence.length > 0 && (
                  <View style={styles.videoList}>
                    {videoEvidence.map((attachment, index) => (
                      <TouchableOpacity
                        key={`${attachment.url || "video"}-${index}`}
                        style={styles.videoButton}
                        onPress={() =>
                          attachment.url
                            ? Linking.openURL(attachment.url)
                            : undefined
                        }
                      >
                        <Text style={styles.videoButtonTitle}>
                          ▶ {attachment.name || `Evidence Video ${index + 1}`}
                        </Text>
                        <Text style={styles.videoButtonSub}>
                          Open verification video
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {verificationStatus !== "validated" &&
                  verificationStatus !== "rejected" && (
                    <>
                      <Text style={styles.controlLabel}>
                        Review reason / evidence request
                      </Text>
                      <TextInput
                        style={[styles.input, styles.reviewReasonInput]}
                        multiline
                        value={reviewReason}
                        placeholder="Required when requesting more evidence or rejecting. Example: Please upload a clearer photo showing the affected area."
                        onChangeText={(value) =>
                          setReviewReasons((current) => ({
                            ...current,
                            [incident.id]: value,
                          }))
                        }
                      />

                      <View style={styles.reviewActions}>
                        <TouchableOpacity
                          style={styles.validateButton}
                          onPress={() =>
                            reviewVerification(incident, "validate")
                          }
                        >
                          <Text style={styles.primaryButtonText}>
                            ✓ Validate Request
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.moreEvidenceButton}
                          onPress={() =>
                            reviewVerification(
                              incident,
                              "request_more_evidence"
                            )
                          }
                        >
                          <Text style={styles.moreEvidenceText}>
                            Request More Evidence
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.rejectButton}
                          onPress={() =>
                            reviewVerification(incident, "reject")
                          }
                        >
                          <Text style={styles.rejectButtonText}>
                            Reject Request
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                {verificationStatus === "needs_more_evidence" && (
                  <View style={styles.reviewNotice}>
                    <Text style={styles.warningTitle}>
                      Waiting for additional resident evidence
                    </Text>
                    <Text style={styles.warningText}>
                      {incident.evidenceRequestReason ||
                        "The resident was asked to provide more evidence."}
                    </Text>
                  </View>
                )}

                {verificationStatus === "rejected" && (
                  <View style={styles.rejectNotice}>
                    <Text style={styles.rejectNoticeTitle}>
                      Dispatch blocked — request rejected
                    </Text>
                    <Text style={styles.rejectNoticeText}>
                      {incident.rejectionReason || "No rejection reason saved."}
                    </Text>
                  </View>
                )}
              </View>

              {dispatchReady ? (
                <View style={styles.adminSection}>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionEyebrow}>CASE CONTROL</Text>
                    <Text style={styles.sectionTitle}>
                      Validation & Assignment
                    </Text>
                  </View>

                  {required > 0 && (
                    <Text style={styles.slotText}>
                      {remainingSlots} slot{remainingSlots === 1 ? "" : "s"} remaining
                    </Text>
                  )}
                </View>

                <View style={styles.controlGrid}>
                  <View style={styles.controlBlock}>
                    <Text style={styles.controlLabel}>
                      Required Volunteers
                    </Text>
                    <View style={styles.inlineControl}>
                      <TextInput
                        style={[styles.input, styles.numberInput]}
                        value={requiredValue}
                        keyboardType="numeric"
                        onChangeText={(value) =>
                          setRequiredVolunteers((current) => ({
                            ...current,
                            [incident.id]: value,
                          }))
                        }
                        placeholder="0"
                      />

                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => saveRequiredVolunteers(incident)}
                      >
                        <Text style={styles.secondaryButtonText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.controlBlockWide}>
                    <Text style={styles.controlLabel}>Admin Note</Text>
                    <TextInput
                      style={[styles.input, styles.noteInput]}
                      value={note}
                      multiline
                      placeholder="Validation or coordination note…"
                      onChangeText={(value) =>
                        setNotes((current) => ({
                          ...current,
                          [incident.id]: value,
                        }))
                      }
                    />

                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => saveAdminNote(incident)}
                    >
                      <Text style={styles.secondaryButtonText}>Save Note</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  {["validated", "assigned", "in_progress"].includes(
                    incident.status
                  ) && (
                    <TouchableOpacity
                      style={styles.assignButton}
                      onPress={() => {
                        setAssignmentCaseId((current) =>
                          current === incident.id ? "" : incident.id
                        );
                        setSkillFilter("");
                        setBarangayFilter("");
                        setAvailabilityFilter("");
                      }}
                    >
                      <Text style={styles.assignButtonText}>
                        {assignmentPanelOpen
                          ? "Hide Volunteer Assignment"
                          : "Assign Volunteer"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {incident.status === "assigned" && (
                    <TouchableOpacity
                      style={styles.progressButton}
                      onPress={() =>
                        changeCaseStatus(incident, "in_progress")
                      }
                    >
                      <Text style={styles.primaryButtonText}>
                        Mark In Progress
                      </Text>
                    </TouchableOpacity>
                  )}

                  {incident.status === "in_progress" && (
                    <TouchableOpacity
                      style={styles.resolveButton}
                      onPress={() =>
                        changeCaseStatus(incident, "resolved")
                      }
                    >
                      <Text style={styles.primaryButtonText}>
                        Resolve Case
                      </Text>
                    </TouchableOpacity>
                  )}

                  {incident.status === "resolved" && (
                    <TouchableOpacity
                      style={styles.closeButton}
                      onPress={() => changeCaseStatus(incident, "closed")}
                    >
                      <Text style={styles.primaryButtonText}>
                        Close Case
                      </Text>
                    </TouchableOpacity>
                  )}

                  {incident.status === "closed" && (
                    <Text style={styles.completedText}>
                      ✓ Case workflow completed
                    </Text>
                  )}
                </View>
              </View>
              ) : (
                <View style={styles.dispatchLocked}>
                  <Text style={styles.dispatchLockedTitle}>
                    Responder assignment locked
                  </Text>
                  <Text style={styles.dispatchLockedText}>
                    Validate the resident request first. Rejected or
                    unverified requests cannot notify or dispatch volunteers.
                  </Text>
                </View>
              )}

              {assignmentPanelOpen && dispatchReady && (
                <View style={styles.assignmentPanel}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>
                        APPROVED VOLUNTEERS
                      </Text>
                      <Text style={styles.sectionTitle}>
                        Assign Responders
                      </Text>
                    </View>

                    <Text style={styles.volunteerCount}>
                      {volunteerMatches.length} available
                    </Text>
                  </View>

                  {required <= 0 && (
                    <View style={styles.warningBox}>
                      <Text style={styles.warningTitle}>
                        Set required volunteers first
                      </Text>
                      <Text style={styles.warningText}>
                        The case needs a responder target before assignments can
                        be sent.
                      </Text>
                    </View>
                  )}

                  <View style={styles.matchFilters}>
                    <TextInput
                      style={styles.filterInput}
                      value={skillFilter}
                      placeholder="Skill"
                      onChangeText={setSkillFilter}
                    />
                    <TextInput
                      style={styles.filterInput}
                      value={barangayFilter}
                      placeholder="Barangay"
                      onChangeText={setBarangayFilter}
                    />
                    <TextInput
                      style={styles.filterInput}
                      value={availabilityFilter}
                      placeholder="Availability"
                      onChangeText={setAvailabilityFilter}
                    />
                  </View>

                  {volunteerMatches.length === 0 ? (
                    <View style={styles.smallEmpty}>
                      <Text style={styles.emptyText}>
                        No matching approved volunteers.
                      </Text>
                    </View>
                  ) : (
                    volunteerMatches.slice(0, 12).map((volunteer) => {
                      const key = `${incident.id}_${volunteer.uid}`;
                      const disabled =
                        required <= 0 ||
                        remainingSlots <= 0 ||
                        busyKey === key;

                      return (
                        <View key={volunteer.uid} style={styles.volunteerRow}>
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                              {volunteer.fullName
                                .split(" ")
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase())
                                .join("") || "V"}
                            </Text>
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text style={styles.volunteerName}>
                              {volunteer.fullName}
                            </Text>
                            <Text style={styles.volunteerMeta}>
                              {volunteer.barangay || "Barangay not set"}
                            </Text>
                            <Text style={styles.volunteerMeta}>
                              Skills:{" "}
                              {volunteer.skills.length
                                ? volunteer.skills.join(" · ")
                                : "Not provided"}
                            </Text>
                            <Text style={styles.volunteerMeta}>
                              Availability:{" "}
                              {volunteer.availability.length
                                ? volunteer.availability.join(" · ")
                                : "Not provided"}
                            </Text>
                            <Text style={styles.matchText}>
                              Skill match:{" "}
                              {skillMatchCount(incident, volunteer)} /{" "}
                              {incident.requiredSkills?.length || 0}
                            </Text>
                          </View>

                          <TouchableOpacity
                            disabled={disabled}
                            style={[
                              styles.assignSmallButton,
                              disabled && styles.disabledButton,
                            ]}
                            onPress={() =>
                              assignVolunteerToCase(incident, volunteer)
                            }
                          >
                            <Text style={styles.assignSmallButtonText}>
                              {busyKey === key ? "Assigning…" : "Assign"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {activeAssignments.length > 0 && (
                <View style={styles.assignmentRoster}>
                  <Text style={styles.sectionEyebrow}>ACTIVE RESPONSE</Text>
                  <Text style={styles.sectionTitle}>Assigned Volunteers</Text>

                  {activeAssignments.map((assignment) => {
                    const currentVolunteer = approvedVolunteers.find(
                      (item) => item.uid === assignment.volunteerId
                    );

                    const displayName =
                      currentVolunteer?.fullName ||
                      assignment.volunteerName ||
                      "Volunteer";

                    return (
                      <View key={assignment.id} style={styles.assignmentRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.volunteerName}>
                            {displayName}
                          </Text>
                          <Text style={styles.volunteerMeta}>
                            Updated {formatDate(assignment.updatedAt)}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.assignmentStatus,
                            statusStyle(String(assignment.status)),
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {labelOfStatus(String(assignment.status))}
                          </Text>
                        </View>

                        {!["completed"].includes(
                          String(assignment.status)
                        ) && (
                          <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => cancelAssignment(assignment)}
                          >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },
  container: {
    width: "100%",
    maxWidth: 1220,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    minHeight: 520,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f4f7fb",
  },
  loadingText: {
    color: "#64748b",
    fontWeight: "700",
  },
  denied: {
    fontSize: 18,
    fontWeight: "900",
    color: "#b42318",
  },

  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginBottom: 18,
  },
  eyebrow: {
    color: "#078f82",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    marginTop: 3,
    color: "#0f172a",
    fontSize: 29,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 5,
    maxWidth: 720,
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
  liveSummary: {
    minWidth: 108,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  liveSummaryNumber: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900",
  },
  liveSummaryLabel: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },

  filterCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 16,
    padding: 15,
    marginBottom: 16,
    gap: 12,
  },
  filterGroup: {
    gap: 7,
  },
  filterLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  pill: {
    borderWidth: 1,
    borderColor: "#d5dde5",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pillActive: {
    borderColor: "#078f82",
    backgroundColor: "#078f82",
  },
  pillText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
  },
  pillTextActive: {
    color: "#ffffff",
  },

  caseCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  caseMain: {
    flexDirection: "row",
    gap: 0,
  },
  caseMainCompact: {
    flexDirection: "column",
  },
  mediaBox: {
    width: 270,
    minHeight: 220,
    backgroundColor: "#e8eef2",
  },
  mediaBoxCompact: {
    width: "100%",
    height: 210,
    minHeight: 210,
  },
  incidentImage: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    flex: 1,
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  imageFallbackIcon: {
    fontSize: 38,
  },
  imageFallbackText: {
    marginTop: 9,
    color: "#334155",
    fontWeight: "900",
    textAlign: "center",
  },
  imageFallbackSubtext: {
    marginTop: 3,
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
  },

  caseContent: {
    flex: 1,
    padding: 18,
  },
  caseTopRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  caseTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },
  caseId: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    maxWidth: 180,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },

  severityCritical: { backgroundColor: "#c92a2a" },
  severityHigh: { backgroundColor: "#e8590c" },
  severityMedium: { backgroundColor: "#1971c2" },
  severityLow: { backgroundColor: "#2b8a3e" },

  statusReported: { backgroundColor: "#64748b" },
  statusValidated: { backgroundColor: "#2563eb" },
  statusAssigned: { backgroundColor: "#7c3aed" },
  statusProgress: { backgroundColor: "#0284c7" },
  statusResolved: { backgroundColor: "#15803d" },
  statusClosed: { backgroundColor: "#1f2937" },

  assignmentOffered: { backgroundColor: "#d97706" },
  assignmentAccepted: { backgroundColor: "#2563eb" },
  assignmentResponding: { backgroundColor: "#0284c7" },
  assignmentOnSite: { backgroundColor: "#7c3aed" },
  assignmentCompleted: { backgroundColor: "#15803d" },
  assignmentDeclined: { backgroundColor: "#b42318" },

  verificationPending: { backgroundColor: "#b7791f" },
  verificationNeedsEvidence: { backgroundColor: "#9a6700" },
  verificationValidated: { backgroundColor: "#15803d" },
  verificationRejected: { backgroundColor: "#b42318" },

  locationText: {
    marginTop: 12,
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
  },
  details: {
    marginTop: 8,
    color: "#475569",
    lineHeight: 19,
    fontSize: 12.5,
  },
  needsBox: {
    marginTop: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 11,
    padding: 11,
  },
  needsLabel: {
    color: "#94a3b8",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  needsText: {
    marginTop: 4,
    color: "#334155",
    fontSize: 11.5,
    fontWeight: "700",
  },

  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 13,
  },
  metaItem: {
    minWidth: 130,
    flexGrow: 1,
    flexBasis: 130,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 9,
  },
  metaLabel: {
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  metaValue: {
    marginTop: 3,
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "800",
  },

  responseNeedsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 12,
  },
  responseNeedCard: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 170,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#edf1f5",
    borderRadius: 11,
    padding: 11,
  },

  verificationPanel: {
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    padding: 16,
    backgroundColor: "#ffffff",
  },
  reviewState: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  reviewInfoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  reviewInfoCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#edf1f5",
    borderRadius: 11,
    padding: 11,
  },
  reviewInfoValue: {
    marginTop: 3,
    color: "#0f172a",
    fontSize: 11.5,
    fontWeight: "900",
  },
  reviewInfoSub: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
  },
  verificationChecks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 11,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f3faf8",
    borderWidth: 1,
    borderColor: "#d9eee8",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  checkIcon: {
    color: "#078f82",
    fontSize: 10,
    fontWeight: "900",
  },
  checkText: {
    color: "#49646f",
    fontSize: 9,
    fontWeight: "800",
  },
  evidenceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  evidenceCard: {
    width: 170,
    overflow: "hidden",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 11,
  },
  evidenceImage: {
    width: "100%",
    height: 115,
    backgroundColor: "#e8eef2",
  },
  evidenceName: {
    paddingHorizontal: 9,
    paddingTop: 7,
    color: "#334155",
    fontSize: 9.5,
    fontWeight: "800",
  },
  evidenceOpen: {
    paddingHorizontal: 9,
    paddingTop: 2,
    paddingBottom: 8,
    color: "#078f82",
    fontSize: 8.5,
    fontWeight: "800",
  },
  videoList: {
    gap: 8,
    marginTop: 11,
  },
  videoButton: {
    backgroundColor: "#f5f7ff",
    borderWidth: 1,
    borderColor: "#dce2f5",
    borderRadius: 10,
    padding: 11,
  },
  videoButtonTitle: {
    color: "#27365f",
    fontSize: 10.5,
    fontWeight: "900",
  },
  videoButtonSub: {
    marginTop: 2,
    color: "#6b7699",
    fontSize: 9,
  },
  reviewReasonInput: {
    minHeight: 72,
    textAlignVertical: "top",
    marginTop: 6,
  },
  reviewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 11,
  },
  validateButton: {
    backgroundColor: "#078f82",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  moreEvidenceButton: {
    backgroundColor: "#fff7e6",
    borderWidth: 1,
    borderColor: "#f4d28e",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  moreEvidenceText: {
    color: "#9a6700",
    fontSize: 10.5,
    fontWeight: "900",
  },
  rejectButton: {
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#f2c7c2",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rejectButtonText: {
    color: "#b42318",
    fontSize: 10.5,
    fontWeight: "900",
  },
  reviewNotice: {
    marginTop: 11,
    backgroundColor: "#fff8e8",
    borderWidth: 1,
    borderColor: "#f2d89c",
    borderRadius: 10,
    padding: 11,
  },
  rejectNotice: {
    marginTop: 11,
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#f2c7c2",
    borderRadius: 10,
    padding: 11,
  },
  rejectNoticeTitle: {
    color: "#b42318",
    fontSize: 10.5,
    fontWeight: "900",
  },
  rejectNoticeText: {
    marginTop: 3,
    color: "#b42318",
    fontSize: 9.5,
    lineHeight: 14,
  },
  dispatchLocked: {
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    backgroundColor: "#f8fafc",
    padding: 14,
  },
  dispatchLockedTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
  },
  dispatchLockedText: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
  },
  matchText: {
    marginTop: 4,
    color: "#078f82",
    fontSize: 9.5,
    fontWeight: "900",
  },

  adminSection: {
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    padding: 16,
    backgroundColor: "#fbfcfd",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  sectionEyebrow: {
    color: "#94a3b8",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sectionTitle: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  slotText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },

  controlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  controlBlock: {
    flexGrow: 1,
    flexBasis: 230,
    minWidth: 220,
  },
  controlBlockWide: {
    flexGrow: 2,
    flexBasis: 420,
    minWidth: 260,
  },
  controlLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 6,
  },
  inlineControl: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d9e1e8",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: "#0f172a",
    fontSize: 11.5,
    fontWeight: "700",
  },
  numberInput: {
    flex: 1,
    minWidth: 80,
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },

  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 13,
  },
  primaryButton: {
    backgroundColor: "#078f82",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 10.5,
    fontWeight: "900",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#e7f7f3",
    borderWidth: 1,
    borderColor: "#c5e9e1",
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 7,
  },
  secondaryButtonText: {
    color: "#078f82",
    fontSize: 10.5,
    fontWeight: "900",
  },
  assignButton: {
    backgroundColor: "#e7f7f3",
    borderWidth: 1,
    borderColor: "#bde7dd",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  assignButtonText: {
    color: "#078f82",
    fontSize: 10.5,
    fontWeight: "900",
  },
  progressButton: {
    backgroundColor: "#0284c7",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resolveButton: {
    backgroundColor: "#15803d",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closeButton: {
    backgroundColor: "#1f2937",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  completedText: {
    color: "#15803d",
    fontSize: 11,
    fontWeight: "900",
    paddingVertical: 8,
  },

  assignmentPanel: {
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    padding: 16,
    backgroundColor: "#ffffff",
  },
  volunteerCount: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
  },
  warningBox: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 10,
    padding: 11,
    marginBottom: 11,
  },
  warningTitle: {
    color: "#9a3412",
    fontSize: 11,
    fontWeight: "900",
  },
  warningText: {
    marginTop: 3,
    color: "#9a3412",
    fontSize: 10,
    lineHeight: 15,
  },
  matchFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  filterInput: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#d9e1e8",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: "#0f172a",
    fontSize: 10.5,
  },

  volunteerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f5",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#e7f7f3",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#078f82",
    fontSize: 11,
    fontWeight: "900",
  },
  volunteerName: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },
  volunteerMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
  },
  assignSmallButton: {
    backgroundColor: "#078f82",
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  assignSmallButtonText: {
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.4,
  },

  assignmentRoster: {
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    padding: 16,
    backgroundColor: "#fbfcfd",
  },
  assignmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f5",
  },
  assignmentStatus: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  cancelButton: {
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#f2c7c2",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  cancelButtonText: {
    color: "#b42318",
    fontSize: 9.5,
    fontWeight: "900",
  },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
  },
  smallEmpty: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 11,
    textAlign: "center",
  },
});
