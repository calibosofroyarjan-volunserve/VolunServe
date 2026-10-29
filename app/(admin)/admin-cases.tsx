import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
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
import ListPagination from "../../components/ui/ListPagination";
import AdminReviewHero from "../../components/admin/AdminReviewHero";
import {
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";

const BACKEND_URL = "https://volunserve.onrender.com";

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
  incidentBarangay?: string;
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
    reporterTrust?: string;
    identityVerified?: boolean;
    identityStatus?: string;
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

  // Optional Volunteer support is tracked separately from the official LGU responder.
  activeVolunteerSupportUid?: string;
  activeVolunteerSupportName?: string;
  activeVolunteerSupportAssignmentId?: string;

  // Legacy compatibility fields from the older Volunteer-as-primary design.
  activeResponderUid?: string;
  activeResponderName?: string;
  activeResponderAssignmentId?: string;
  activeResponderKind?: string;
  activeLguResponderUid?: string;
  activeLguResponderName?: string;
  activeLguHeartbeatAt?: any;
  officialLguResponseStatus?: string;
  latestLguFieldReportId?: string;
  lguFieldReportReviewedAt?: any;
  lguFieldReportReviewedBy?: string;

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
  identityVerified?: boolean;
  identityStatus?: string;
  applicationApproved?: boolean;
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

type LguPersonnelCandidate = {
  uid: string;
  fullName: string;
  email: string;
  employeeId: string;
  department: string;
  position: string;
  capabilities: string[];
  verificationStatus: string;
  employmentStatus: string;
  dutyStatus: string;
  availabilityStatus: string;
  shiftDate: string;
  activeCaseId: string;
  activeAssignmentId: string;
  isTestAccount: boolean;
};

type LguFieldReport = {
  id: string;
  assignmentId: string;
  caseId: string;
  personnelUid: string;
  personnelName: string;
  department: string;
  position: string;
  caseTitle: string;
  caseCategory: string;
  caseSeverity: string;
  responseLocation: string;
  situationSummary: string;
  actionsTaken: string;
  peopleAssisted: number;
  outcome: string;
  remainingNeeds: string;
  notes: string;
  adminReviewStatus: string;
  adminReviewNote: string;
  submittedAt: string;
  reviewedAt: string;
  reviewedBy: string;
};

type VolunteerFieldReportStatus =
  | "submitted"
  | "reviewed"
  | "incorporated"
  | "dismissed"
  | string;

type VolunteerFieldReport = {
  id: string;
  assignmentId: string;
  caseId: string;
  volunteerId: string;
  volunteerName: string;
  barangay: string;
  situationSummary: string;
  assistanceProvided: string;
  peopleHelped: number;
  remainingNeeds: string[];
  remainingNeedsNote: string;
  lguFollowUpRequired: boolean;
  evidenceUrls: string[];
  reportStatus: VolunteerFieldReportStatus;
  adminReviewNote: string;
  createdAt?: any;
  updatedAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
};

type BarangayNeedDraft = {
  affectedHouseholds: string;
  affectedPeople: string;
  peopleNeedingFood: string;
  peopleNeedingWater: string;
  peopleNeedingClothing: string;
  peopleNeedingMedical: string;
  householdsNeedingShelter: string;
  householdsNeedingHygiene: string;
  otherNeedDescription: string;
  adminNote: string;
};

type ReliefScope = "household" | "community";

type VerificationMethod =
  | "on_site_lgu"
  | "barangay_confirmation"
  | "emergency_case_evidence"
  | "volunteer_field_report"
  | "other";

type DirectBarangayNeedDraft = BarangayNeedDraft & {
  barangay: string;
  reliefScope: ReliefScope;
  verificationMethod: VerificationMethod | "";
  verificationMethodOther: string;
};

type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type DirectNeedCountField =
  | "peopleNeedingFood"
  | "peopleNeedingWater"
  | "peopleNeedingClothing"
  | "peopleNeedingMedical"
  | "householdsNeedingShelter"
  | "householdsNeedingHygiene";

const RELIEF_SCOPE_OPTIONS: SelectOption[] = [
  {
    value: "household",
    label: "Household Relief",
    description: "One LGU-verified household with a serious remaining material need.",
  },
  {
    value: "community",
    label: "Community Relief",
    description: "Two or more verified households or a broader community-level relief need.",
  },
];

const VERIFICATION_METHOD_OPTIONS: SelectOption[] = [
  {
    value: "on_site_lgu",
    label: "On-site LGU assessment",
    description: "LGU personnel inspected or assessed the affected household or area.",
  },
  {
    value: "barangay_confirmation",
    label: "Barangay confirmation",
    description: "Barangay officials confirmed the affected household(s) and remaining needs.",
  },
  {
    value: "emergency_case_evidence",
    label: "Emergency case evidence",
    description: "The verified report, photos, location, and case evidence support the assessment.",
  },
  {
    value: "volunteer_field_report",
    label: "Volunteer field report",
    description: "An assigned responder submitted field findings reviewed by the LGU.",
  },
  {
    value: "other",
    label: "Other official verification",
    description: "Use another documented LGU/barangay verification method.",
  },
];

const verificationMethodLabel = (value?: string) =>
  VERIFICATION_METHOD_OPTIONS.find((item) => item.value === value)?.label ||
  "Not selected";

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

const timestampMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
};

const labelOfStatus = (status: string) =>
  status.replaceAll("_", " ").toUpperCase();

const formatApiDate = (value?: string) => {
  if (!value) return "—";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

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

const lguFieldOutcomeLabel = (value?: string) => {
  switch (String(value || "").trim().toLowerCase()) {
    case "resolved_on_site":
      return "Resolved On Site";
    case "stabilized":
      return "Stabilized";
    case "referred":
      return "Referred";
    case "needs_follow_up":
      return "Needs Follow-up";
    default:
      return value ? labelOfStatus(value) : "Not specified";
  }
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const normalizeBarangay = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^(barangay|brgy\.?)\s+/i, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");

const barangayDisplay = (value?: string) => {
  const clean = String(value || "")
    .trim()
    .replace(/^(barangay|brgy\.?)\s+/i, "")
    .trim();

  return clean ? `Brgy. ${clean}` : "Barangay not set";
};

const caseBarangayValue = (incident: DisasterCase) =>
  String(incident.incidentBarangay || incident.reporterBarangay || "").trim();

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

const lguResponseFieldLabel = (personnel?: LguPersonnelCandidate | null) => {
  if (!personnel) return "Official LGU Response";

  const profileText = [
    personnel.department,
    personnel.position,
    ...(personnel.capabilities || []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    profileText.includes("bfp") ||
    profileText.includes("fire") ||
    profileText.includes("bombero") ||
    profileText.includes("firefighter")
  ) {
    return "Fire & Rescue";
  }

  if (
    profileText.includes("ems") ||
    profileText.includes("ambulance") ||
    profileText.includes("paramedic") ||
    profileText.includes("medical") ||
    profileText.includes("city health")
  ) {
    return "Medical / EMS";
  }

  if (
    profileText.includes("drrmo") ||
    profileText.includes("rescue") ||
    profileText.includes("disaster") ||
    profileText.includes("evacuation") ||
    profileText.includes("search and rescue")
  ) {
    return "Disaster & Rescue";
  }

  if (
    profileText.includes("engineering") ||
    profileText.includes("public works") ||
    profileText.includes("infrastructure") ||
    profileText.includes("road")
  ) {
    return "Engineering / Public Works";
  }

  if (
    profileText.includes("social welfare") ||
    profileText.includes("cswdo") ||
    profileText.includes("relief") ||
    profileText.includes("shelter")
  ) {
    return "Social Welfare / Relief";
  }

  if (
    profileText.includes("logistics") ||
    profileText.includes("transport") ||
    profileText.includes("driver") ||
    profileText.includes("vehicle")
  ) {
    return "Logistics / Transport";
  }

  return "General LGU Response";
};

export default function AdminCases() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 920;

  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [cases, setCases] = useState<DisasterCase[]>([]);
  const [assignments, setAssignments] = useState<ResponseAssignment[]>([]);
  const [fieldReports, setFieldReports] = useState<VolunteerFieldReport[]>([]);
  const [approvedVolunteers, setApprovedVolunteers] = useState<VolunteerProfile[]>(
    []
  );
  const [lguPersonnel, setLguPersonnel] = useState<LguPersonnelCandidate[]>([]);
  const [lguPersonnelLoading, setLguPersonnelLoading] = useState(false);
  const [lguPersonnelError, setLguPersonnelError] = useState("");
  const [lguFieldReports, setLguFieldReports] = useState<LguFieldReport[]>([]);
  const [lguFieldReportsLoading, setLguFieldReportsLoading] = useState(false);
  const [lguFieldReportsError, setLguFieldReportsError] = useState("");
  const [lguFieldReviewNotes, setLguFieldReviewNotes] = useState<
    Record<string, string>
  >({});

  const [filterStatus, setFilterStatus] = useState<CaseStatus | "all">("all");
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");
  const [caseSearch, setCaseSearch] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const [personnelPage, setPersonnelPage] = useState(1);
  const [volunteerPage, setVolunteerPage] = useState(1);
  const [activeAssignmentPage, setActiveAssignmentPage] = useState(1);
  const [historyAssignmentPage, setHistoryAssignmentPage] = useState(1);
  const [photoPage, setPhotoPage] = useState(1);
  const [videoPage, setVideoPage] = useState(1);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [detailTab, setDetailTab] = useState<
    "overview" | "map" | "evidence" | "response" | "personnel" | "history"
  >("overview");

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [assignmentCaseId, setAssignmentCaseId] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const [fieldReportNotes, setFieldReportNotes] = useState<
    Record<string, string>
  >({});
  const [needDraftReportId, setNeedDraftReportId] = useState("");
  const [needDrafts, setNeedDrafts] = useState<
    Record<string, BarangayNeedDraft>
  >({});

  const [directNeedCaseId, setDirectNeedCaseId] = useState("");
  const [directNeedDrafts, setDirectNeedDrafts] = useState<
    Record<string, DirectBarangayNeedDraft>
  >({});
  const [barangayNeedAssessmentIds, setBarangayNeedAssessmentIds] = useState<
    Set<string>
  >(new Set());

  const loadLguPersonnel = async (silent = false) => {
    const adminUser = getAuth().currentUser;

    if (!adminUser) {
      setLguPersonnelError("Admin session expired. Please sign in again.");
      return;
    }

    if (!silent) {
      setLguPersonnelLoading(true);
    }

    setLguPersonnelError("");

    try {
      const token = await adminUser.getIdToken(true);
      const response = await fetch(`${BACKEND_URL}/api/admin/lgu/personnel`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      const raw = await response.text();
      let payload: any = {};

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        throw new Error(
          payload?.message ||
            `Unable to load LGU Personnel (status ${response.status}).`
        );
      }

      const list = Array.isArray(payload?.personnel) ? payload.personnel : [];

      setLguPersonnel(
        list
          .map((item: any) => ({
            uid: String(item?.uid || ""),
            fullName: String(item?.fullName || "LGU Personnel"),
            email: String(item?.email || ""),
            employeeId: String(item?.employeeId || ""),
            department: String(item?.department || ""),
            position: String(item?.position || ""),
            capabilities: normalizeStringArray(item?.capabilities),
            verificationStatus: String(item?.verificationStatus || ""),
            employmentStatus: String(item?.employmentStatus || ""),
            dutyStatus: String(item?.dutyStatus || "off_duty"),
            availabilityStatus: String(
              item?.availabilityStatus || "unavailable"
            ),
            shiftDate: String(item?.shiftDate || ""),
            activeCaseId: String(item?.activeCaseId || ""),
            activeAssignmentId: String(item?.activeAssignmentId || ""),
            isTestAccount: item?.isTestAccount === true,
          }))
          .filter((item: LguPersonnelCandidate) => Boolean(item.uid))
          .sort((a: LguPersonnelCandidate, b: LguPersonnelCandidate) => {
            const aAvailable =
              a.dutyStatus === "on_duty" &&
              a.availabilityStatus === "available" &&
              !a.activeCaseId &&
              !a.activeAssignmentId;
            const bAvailable =
              b.dutyStatus === "on_duty" &&
              b.availabilityStatus === "available" &&
              !b.activeCaseId &&
              !b.activeAssignmentId;

            if (aAvailable !== bAvailable) {
              return aAvailable ? -1 : 1;
            }

            return a.fullName.localeCompare(b.fullName);
          })
      );
    } catch (error) {
      console.log("LGU personnel load error:", error);
      setLguPersonnelError(
        error instanceof Error
          ? error.message
          : "Unable to load LGU Personnel."
      );
    } finally {
      if (!silent) {
        setLguPersonnelLoading(false);
      }
    }
  };

  const loadLguFieldReports = async (
    caseId: string,
    silent = false
  ) => {
    const adminUser = getAuth().currentUser;

    if (!adminUser || !caseId) {
      setLguFieldReports([]);
      return;
    }

    if (!silent) {
      setLguFieldReportsLoading(true);
    }

    setLguFieldReportsError("");

    try {
      const token = await adminUser.getIdToken(true);
      const response = await fetch(
        `${BACKEND_URL}/api/admin/lgu/field-reports?caseId=${encodeURIComponent(
          caseId
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const raw = await response.text();
      let payload: any = {};

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        throw new Error(
          payload?.message ||
            `Unable to load official LGU field report (status ${response.status}).`
        );
      }

      const list = Array.isArray(payload?.reports) ? payload.reports : [];

      setLguFieldReports(
        list.map((item: any) => ({
          id: String(item?.id || item?.assignmentId || ""),
          assignmentId: String(item?.assignmentId || ""),
          caseId: String(item?.caseId || ""),
          personnelUid: String(item?.personnelUid || ""),
          personnelName: String(item?.personnelName || "LGU Responder"),
          department: String(item?.department || ""),
          position: String(item?.position || ""),
          caseTitle: String(item?.caseTitle || "Emergency Case"),
          caseCategory: String(item?.caseCategory || "Emergency"),
          caseSeverity: String(item?.caseSeverity || ""),
          responseLocation: String(item?.responseLocation || ""),
          situationSummary: String(item?.situationSummary || ""),
          actionsTaken: String(item?.actionsTaken || ""),
          peopleAssisted: Number(item?.peopleAssisted || 0),
          outcome: String(item?.outcome || ""),
          remainingNeeds: String(item?.remainingNeeds || ""),
          notes: String(item?.notes || ""),
          adminReviewStatus: String(item?.adminReviewStatus || "pending"),
          adminReviewNote: String(item?.adminReviewNote || ""),
          submittedAt: String(item?.submittedAt || ""),
          reviewedAt: String(item?.reviewedAt || ""),
          reviewedBy: String(item?.reviewedBy || ""),
        }))
      );
    } catch (error) {
      console.log("Official LGU field report load error:", error);
      setLguFieldReports([]);
      setLguFieldReportsError(
        error instanceof Error
          ? error.message
          : "Unable to load official LGU field report."
      );
    } finally {
      if (!silent) {
        setLguFieldReportsLoading(false);
      }
    }
  };

  const reviewLguFieldReport = async (report: LguFieldReport) => {
    const adminUser = getAuth().currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    const note = (
      lguFieldReviewNotes[report.id] ??
      report.adminReviewNote ??
      ""
    ).trim();

    if (note.length > 1500) {
      Alert.alert(
        "Review Note Too Long",
        "Admin review note must be 1500 characters or fewer."
      );
      return;
    }

    const busyId = `lgu_field_review_${report.id}`;
    setBusyKey(busyId);

    try {
      const token = await adminUser.getIdToken(true);
      const response = await fetch(
        `${BACKEND_URL}/api/admin/lgu/field-reports/${encodeURIComponent(
          report.id
        )}/review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            adminReviewNote: note,
          }),
        }
      );

      const raw = await response.text();
      let payload: any = {};

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        throw new Error(
          payload?.message ||
            `Unable to review official LGU field report (status ${response.status}).`
        );
      }

      await loadLguFieldReports(report.caseId, true);

      Alert.alert(
        "LGU Field Report Reviewed",
        "The official responder report is reviewed. You may now resolve the emergency if the case is fully handled, or keep it In Progress for follow-up."
      );
    } catch (error) {
      console.log("Official LGU field report review error:", error);
      Alert.alert(
        "Review Failed",
        error instanceof Error
          ? error.message
          : "Unable to review the official LGU field report."
      );
    } finally {
      setBusyKey("");
    }
  };

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

  const isAuthorized = role === "admin";

  useEffect(() => {
    if (!isAuthorized || detailTab !== "personnel") return;
    void loadLguPersonnel();
  }, [isAuthorized, detailTab]);

  useEffect(() => {
    if (
      !isAuthorized ||
      detailTab !== "response" ||
      !selectedCaseId
    ) {
      return;
    }

    void loadLguFieldReports(selectedCaseId);
  }, [isAuthorized, detailTab, selectedCaseId]);

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
            incidentBarangay:
              data.incidentBarangay ||
              data.emergencyBarangay ||
              data.barangay ||
              data.reporterBarangay ||
              "",
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
            activeVolunteerSupportUid: data.activeVolunteerSupportUid || "",
            activeVolunteerSupportName: data.activeVolunteerSupportName || "",
            activeVolunteerSupportAssignmentId:
              data.activeVolunteerSupportAssignmentId || "",
            activeResponderUid: data.activeResponderUid || "",
            activeResponderName: data.activeResponderName || "",
            activeResponderAssignmentId: data.activeResponderAssignmentId || "",
            activeResponderKind: data.activeResponderKind || "",
            activeLguResponderUid: data.activeLguResponderUid || "",
            activeLguResponderName: data.activeLguResponderName || "",
            activeLguHeartbeatAt: data.activeLguHeartbeatAt || null,
            officialLguResponseStatus:
              data.officialLguResponseStatus || "",
            latestLguFieldReportId:
              data.latestLguFieldReportId || "",
            lguFieldReportReviewedAt:
              data.lguFieldReportReviewedAt || null,
            lguFieldReportReviewedBy:
              data.lguFieldReportReviewedBy || "",

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

    // Approved Volunteer access comes from volunteerApplications.
    // Current profile identity/location data (especially barangay) comes from
    // users/{uid}, so local Volunteer pools always follow the Volunteer profile.
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
                // Volunteer barangay is always taken from the current
                // users/{uid} profile. The approved application proves Volunteer
                // access, but it must not override the Volunteer's current profile
                // barangay used for local emergency grouping.
                barangay: String(
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
                role: String(userData.role || "").trim().toLowerCase(),
                // The approved Volunteer Application is the authoritative
                // source that this Resident has Volunteer access. Older test
                // accounts may not yet have every mirrored users/{uid} field.
                volunteerAccess:
                  userData.volunteerAccess === true ||
                  String(application.status || "").trim().toLowerCase() ===
                    "approved" ||
                  String(userData.role || "").trim().toLowerCase() ===
                    "volunteer",
                volunteerStatus: String(
                  userData.volunteerStatus || application.status || "approved"
                )
                  .trim()
                  .toLowerCase(),
                status: String(userData.status || "approved")
                  .trim()
                  .toLowerCase(),
                identityVerified:
                  application.identityVerified === true ||
                  String(application.identityStatus || "")
                    .trim()
                    .toLowerCase() === "verified" ||
                  userData.identityVerified === true ||
                  String(userData.identityStatus || "")
                    .trim()
                    .toLowerCase() === "verified",
                identityStatus: String(
                  application.identityStatus ||
                    userData.identityStatus ||
                    "legacy_verified_by_application"
                )
                  .trim()
                  .toLowerCase(),
                applicationApproved: true,
              } as VolunteerProfile;
            })
          );

          // A user may have both Resident and approved Volunteer access.
          // Keep every approved Volunteer Application visible in the Admin
          // support panel. Eligibility is evaluated per emergency case so
          // an unavailable, busy, or skill-mismatched Volunteer is shown
          // with a clear reason instead of silently disappearing.
          const visibleApprovedVolunteers = list.filter((person) => {
            const role = String(person.role || "").trim().toLowerCase();
            const status = String(person.status || "").trim().toLowerCase();

            const blockedSystemRole =
              role === "admin" || role === "superadmin";
            const explicitlyBlockedAccount =
              status === "rejected" ||
              status === "suspended" ||
              status === "disabled" ||
              status === "deactivated";

            return !blockedSystemRole && !explicitlyBlockedAccount;
          });

          visibleApprovedVolunteers.sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          );
          setApprovedVolunteers(visibleApprovedVolunteers);
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


  useEffect(() => {
    if (!isAuthorized) return;

    return onSnapshot(
      collection(db, "volunteerFieldReports"),
      (snapshot) => {
        const list: VolunteerFieldReport[] = snapshot.docs.map((item) => {
          const data: any = item.data();

          return {
            id: item.id,
            assignmentId: String(data.assignmentId || item.id),
            caseId: String(data.caseId || ""),
            volunteerId: String(data.volunteerId || ""),
            volunteerName: String(data.volunteerName || "Volunteer"),
            barangay: String(data.barangay || ""),
            situationSummary: String(data.situationSummary || ""),
            assistanceProvided: String(data.assistanceProvided || ""),
            peopleHelped: Number(data.peopleHelped || 0),
            remainingNeeds: normalizeStringArray(data.remainingNeeds),
            remainingNeedsNote: String(data.remainingNeedsNote || ""),
            lguFollowUpRequired: data.lguFollowUpRequired === true,
            evidenceUrls: normalizeStringArray(data.evidenceUrls),
            reportStatus: String(data.reportStatus || "submitted"),
            adminReviewNote: String(data.adminReviewNote || ""),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            reviewedAt: data.reviewedAt,
            reviewedBy: String(data.reviewedBy || ""),
          };
        });

        list.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          // Within the same severity, serve the oldest waiting case first.
      return aTime - bTime;
        });

        setFieldReports(list);
      },
      (error) => {
        console.log("Volunteer field report listener error:", error);
        Alert.alert(
          "Permission Error",
          "Unable to load Volunteer field reports. Check the deployed Firestore rules."
        );
      }
    );
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;

    return onSnapshot(
      collection(db, "barangayNeedAssessments"),
      (snapshot) => {
        setBarangayNeedAssessmentIds(
          new Set(snapshot.docs.map((item) => item.id))
        );
      },
      (error) => {
        console.log("Barangay need assessments listener error:", error);
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

  const visibleCases = useMemo(() => {
    const term = caseSearch.trim().toLowerCase();
    if (!term) return sortedFiltered;

    return sortedFiltered.filter((item) =>
      [
        item.id,
        item.title,
        item.category,
        item.location,
        item.reporterName,
        item.reporterBarangay,
        item.contactNumber,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [sortedFiltered, caseSearch]);

  const casePages = Math.max(1, Math.ceil(visibleCases.length / 5));
  const activeCasePage = Math.max(1, Math.min(recordPage, casePages));
  const pagedCases = visibleCases.slice((activeCasePage - 1) * 5, activeCasePage * 5);
  useEffect(() => {
    if (pagedCases.length > 0 && !pagedCases.some(item => item.id === selectedCaseId)) {
      setSelectedCaseId(pagedCases[0].id);
    }
  }, [activeCasePage, pagedCases, selectedCaseId]);
  useEffect(() => {
    if (visibleCases.length === 0) {
      setSelectedCaseId("");
      return;
    }

    if (!visibleCases.some((item) => item.id === selectedCaseId)) {
      setSelectedCaseId(visibleCases[0].id);
    }
  }, [visibleCases, selectedCaseId]);

  const selectedCase =
    visibleCases.find((item) => item.id === selectedCaseId) ||
    visibleCases[0] ||
    null;

  useEffect(() => {
    setDetailTab("overview");
    setAssignmentCaseId("");
    setPersonnelPage(1);
    setVolunteerPage(1);
    setActiveAssignmentPage(1);
    setHistoryAssignmentPage(1);
    setPhotoPage(1);
    setVideoPage(1);
  }, [selectedCaseId]);

  const pageFive = <T,>(rows: T[], page: number): T[] => {
    const safe = Math.max(1, Math.min(page, Math.max(1, Math.ceil(rows.length / 5))));
    return rows.slice((safe - 1) * 5, safe * 5);
  };

  const assignmentsForCase = (caseId: string) =>
    assignments.filter((item) => item.caseId === caseId);

  const activeAssignmentsForCase = (caseId: string) =>
    assignmentsForCase(caseId).filter((item) =>
      ["offered", "accepted", "responding", "on_site"].includes(
        String(item.status),
      ),
    );


  const fieldReportsForCase = (caseId: string) =>
    fieldReports.filter((item) => item.caseId === caseId);

  const emptyNeedDraft = (
    incident: DisasterCase,
    report: VolunteerFieldReport
  ): BarangayNeedDraft => ({
    affectedHouseholds: "",
    affectedPeople: "",
    peopleNeedingFood: "0",
    peopleNeedingWater: "0",
    peopleNeedingClothing: "0",
    peopleNeedingMedical: "0",
    householdsNeedingShelter: "0",
    householdsNeedingHygiene: "0",
    otherNeedDescription: report.remainingNeedsNote || "",
    adminNote: "",
  });

  const openNeedDraft = (
    incident: DisasterCase,
    report: VolunteerFieldReport
  ) => {
    setNeedDrafts((current) => ({
      ...current,
      [report.id]: current[report.id] || emptyNeedDraft(incident, report),
    }));
    setNeedDraftReportId((current) =>
      current === report.id ? "" : report.id
    );
  };

  const updateNeedDraft = (
    reportId: string,
    field: keyof BarangayNeedDraft,
    value: string
  ) => {
    setNeedDrafts((current) => ({
      ...current,
      [reportId]: {
        ...(current[reportId] || {
          affectedHouseholds: "",
          affectedPeople: "",
          peopleNeedingFood: "0",
          peopleNeedingWater: "0",
          peopleNeedingClothing: "0",
          peopleNeedingMedical: "0",
          householdsNeedingShelter: "0",
          householdsNeedingHygiene: "0",
          otherNeedDescription: "",
          adminNote: "",
        }),
        [field]: value,
      },
    }));
  };

  const emptyDirectNeedDraft = (
    incident: DisasterCase
  ): DirectBarangayNeedDraft => ({
    barangay: String(incident.reporterBarangay || "").trim(),
    reliefScope: "household",
    verificationMethod: "",
    verificationMethodOther: "",
    affectedHouseholds: "1",
    affectedPeople: String(
      Math.max(Number(incident.affectedPeople || 0), 1)
    ),
    peopleNeedingFood: "0",
    peopleNeedingWater: "0",
    peopleNeedingClothing: "0",
    peopleNeedingMedical: "0",
    householdsNeedingShelter: "0",
    householdsNeedingHygiene: "0",
    otherNeedDescription: "",
    adminNote: "",
  });

  const openDirectNeedDraft = (incident: DisasterCase) => {
    setDirectNeedDrafts((current) => ({
      ...current,
      [incident.id]:
        current[incident.id] || emptyDirectNeedDraft(incident),
    }));

    setDirectNeedCaseId((current) =>
      current === incident.id ? "" : incident.id
    );
  };

  const updateDirectNeedDraft = (
    caseId: string,
    field: keyof DirectBarangayNeedDraft,
    value: string
  ) => {
    const incident = cases.find((item) => item.id === caseId);

    setDirectNeedDrafts((current) => ({
      ...current,
      [caseId]: {
        ...(current[caseId] ||
          (incident
            ? emptyDirectNeedDraft(incident)
            : {
                barangay: "",
                reliefScope: "household",
                verificationMethod: "",
                verificationMethodOther: "",
                affectedHouseholds: "1",
                affectedPeople: "",
                peopleNeedingFood: "0",
                peopleNeedingWater: "0",
                peopleNeedingClothing: "0",
                peopleNeedingMedical: "0",
                householdsNeedingShelter: "0",
                householdsNeedingHygiene: "0",
                otherNeedDescription: "",
                adminNote: "",
              })),
        [field]: value,
      },
    }));
  };

  const setDirectReliefScope = (
    incident: DisasterCase,
    reliefScope: ReliefScope
  ) => {
    setDirectNeedDrafts((current) => {
      const draft = current[incident.id] || emptyDirectNeedDraft(incident);
      const currentHouseholds = Number(draft.affectedHouseholds || 0);

      return {
        ...current,
        [incident.id]: {
          ...draft,
          reliefScope,
          affectedHouseholds:
            reliefScope === "household"
              ? "1"
              : currentHouseholds >= 2
              ? draft.affectedHouseholds
              : "",
        },
      };
    });
  };


  const toggleDirectNeedCategory = (
    incident: DisasterCase,
    field: DirectNeedCountField,
    basis: "people" | "households"
  ) => {
    setDirectNeedDrafts((current) => {
      const draft = current[incident.id] || emptyDirectNeedDraft(incident);
      const currentValue = Number(String(draft[field] || "0"));
      const maximum =
        basis === "people"
          ? Math.max(Number(draft.affectedPeople || 0), 1)
          : Math.max(Number(draft.affectedHouseholds || 0), 1);

      return {
        ...current,
        [incident.id]: {
          ...draft,
          [field]: currentValue > 0 ? "0" : String(maximum),
        },
      };
    });
  };

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

  const volunteerEligibilityForCase = (
    incident: DisasterCase,
    volunteer: VolunteerProfile
  ) => {
    const alreadyAssigned = activeAssignmentsForCase(incident.id).some(
      (item) => item.volunteerId === volunteer.uid
    );

    const busyOnAnotherCase = assignments.some(
      (item) =>
        item.caseId !== incident.id &&
        item.volunteerId === volunteer.uid &&
        ["offered", "accepted", "responding", "on_site"].includes(
          String(item.status)
        )
    );

    const reporterIsVolunteer =
      String(volunteer.uid || "").trim() ===
      String(incident.reporterUid || "").trim();

    const role = String(volunteer.role || "").trim().toLowerCase();
    const accountStatus = String(volunteer.status || "")
      .trim()
      .toLowerCase();
    const identityStatus = String(volunteer.identityStatus || "")
      .trim()
      .toLowerCase();

    const blockedSystemRole = role === "admin" || role === "superadmin";
    const explicitlyBlockedAccount =
      accountStatus === "rejected" ||
      accountStatus === "suspended" ||
      accountStatus === "disabled" ||
      accountStatus === "deactivated";
    const explicitlyRejectedIdentity =
      identityStatus === "rejected" || identityStatus === "failed";

    const requiredSkillList = (incident.requiredSkills || []).filter(Boolean);
    const specializedSkills = requiredSkillList.filter(
      (skill) => !String(skill).toLowerCase().includes("general volunteer")
    );
    const skillMatches = skillMatchCount(incident, volunteer);
    const skillMatched = specializedSkills.length === 0 || skillMatches > 0;

    const caseBarangay = normalizeBarangay(caseBarangayValue(incident));
    const volunteerBarangay = normalizeBarangay(volunteer.barangay);
    const sameBarangay =
      Boolean(caseBarangay) &&
      Boolean(volunteerBarangay) &&
      caseBarangay === volunteerBarangay;

    if (reporterIsVolunteer) {
      return { eligible: false, reason: "Reporter cannot respond to own case", skillMatches };
    }
    if (blockedSystemRole) {
      return { eligible: false, reason: "LGU/Admin account — not Volunteer support", skillMatches };
    }
    if (explicitlyBlockedAccount || explicitlyRejectedIdentity) {
      return { eligible: false, reason: "Volunteer account is not currently eligible", skillMatches };
    }
    if (!caseBarangay) {
      return { eligible: false, reason: "Emergency case barangay is missing", skillMatches };
    }
    if (!volunteerBarangay) {
      return { eligible: false, reason: "Volunteer profile has no barangay", skillMatches };
    }
    if (!sameBarangay) {
      return {
        eligible: false,
        reason: `Volunteer belongs to ${volunteer.barangay || "another barangay"}`,
        skillMatches,
      };
    }
    if (alreadyAssigned) {
      return { eligible: false, reason: "Already assigned to this emergency", skillMatches };
    }
    if (busyOnAnotherCase) {
      return { eligible: false, reason: "Busy on another active emergency", skillMatches };
    }
    if (!skillMatched) {
      return {
        eligible: false,
        reason: specializedSkills.length
          ? `Needs matching skill: ${specializedSkills.join(", ")}`
          : "Required skill does not match",
        skillMatches,
      };
    }
    return {
      eligible: true,
      reason: specializedSkills.length
        ? "Qualified Volunteer — support offer can be sent offline"
        : "Approved Volunteer — support offer can be sent offline",
      skillMatches,
    };
  };

  const volunteerCandidatesForCase = (incident: DisasterCase) => {
    const caseBarangay = normalizeBarangay(caseBarangayValue(incident));

    return approvedVolunteers
      .filter((volunteer) => {
        const availabilityText = volunteer.availability.join(" ").toLowerCase();
        const isReporter =
          String(volunteer.uid || "").trim() ===
          String(incident.reporterUid || "").trim();

        const skillSearchMatch =
          !skillFilter.trim() ||
          volunteer.skills.some((skill) =>
            skill.toLowerCase().includes(skillFilter.trim().toLowerCase())
          );

        const availabilityMatch =
          !availabilityFilter.trim() ||
          availabilityText.includes(availabilityFilter.trim().toLowerCase());

        // The Resident who filed this emergency must never appear in the
        // Volunteer candidate pool, even if the same account also has
        // approved Volunteer access.
        return !isReporter && skillSearchMatch && availabilityMatch;
      })
      .sort((a, b) => {
        const eligibilityA = volunteerEligibilityForCase(incident, a);
        const eligibilityB = volunteerEligibilityForCase(incident, b);

        // Prefer local, eligible volunteers, but show approved out-of-barangay
        // profiles as well so admins understand why a candidate is restricted.
        if (eligibilityA.eligible !== eligibilityB.eligible) {
          return eligibilityB.eligible ? 1 : -1;
        }

        if (eligibilityA.skillMatches !== eligibilityB.skillMatches) {
          return eligibilityB.skillMatches - eligibilityA.skillMatches;
        }

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
        "This emergency report has no photo evidence. Request more evidence or reject it instead."
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
          throw new Error("The emergency report no longer exists.");
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

          notificationTitle = "Emergency report validated";
          notificationMessage =
            "Your emergency report was verified. LGU response may proceed, with optional Volunteer support when appropriate.";
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

          notificationTitle = "Emergency report rejected";
          notificationMessage = `Your emergency report was not approved for dispatch. Reason: ${reason}`;
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
          "The emergency report is blocked from Volunteer dispatch."
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

  const saveFinalSeverity = async (
    incident: DisasterCase,
    nextSeverity: Severity
  ) => {
    const auth = getAuth();
    const adminUser = auth.currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    if (incident.severity === nextSeverity) {
      return;
    }

    const busyId = `severity_${incident.id}`;
    setBusyKey(busyId);

    try {
      const caseRef = doc(db, "disasterCases", incident.id);
      const activityLogRef = doc(collection(db, "adminActivityLogs"));

      await runTransaction(db, async (transaction) => {
        const caseSnapshot = await transaction.get(caseRef);

        if (!caseSnapshot.exists()) {
          throw new Error("The disaster case no longer exists.");
        }

        transaction.update(caseRef, {
          severity: nextSeverity,
          updatedAt: serverTimestamp(),
        });

        transaction.set(activityLogRef, {
          action: "Emergency Severity Finalized",
          caseId: incident.id,
          previousSeverity: incident.severity,
          severity: nextSeverity,
          performedBy: adminUser.uid,
          timestamp: serverTimestamp(),
        });
      });

      Alert.alert(
        "Severity Updated",
        `Admin severity is now ${nextSeverity.toUpperCase()}.`
      );
    } catch (error) {
      console.log("Severity update error:", error);
      Alert.alert(
        "Update Failed",
        error instanceof Error
          ? error.message
          : "Unable to update the case severity."
      );
    } finally {
      setBusyKey("");
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



  const changeCaseStatus = async (
    incident: DisasterCase,
    nextStatus: CaseStatus
  ) => {
    const validTransition =
      (incident.status === "reported" && nextStatus === "validated") ||
      (["validated", "assigned"].includes(incident.status) &&
        nextStatus === "in_progress") ||
      (incident.status === "in_progress" && nextStatus === "resolved") ||
      (incident.status === "resolved" && nextStatus === "closed");

    if (!validTransition) {
      Alert.alert(
        "Status Changed",
        "This action is not valid for the case's current status."
      );
      return;
    }

    const caseAssignments = activeAssignmentsForCase(incident.id);

    if (
      nextStatus === "resolved" &&
      String(incident.officialLguResponseStatus || "")
        .trim()
        .toLowerCase() === "completed_pending_admin_review"
    ) {
      Alert.alert(
        "LGU Field Report Review Required",
        "Review the completed official LGU field report in the Response tab before resolving this emergency."
      );
      return;
    }

    if (
      nextStatus === "resolved" &&
      caseAssignments.length > 0 &&
      caseAssignments.some(
        (item) => String(item.status) !== "completed"
      )
    ) {
      Alert.alert(
        "Volunteer Support Still Active",
        "Finish or cancel the active Volunteer assignments before resolving the case. LGU response itself does not depend on Volunteer acceptance."
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
        patch.activeResponderUid = "";
        patch.activeResponderName = "";
        patch.activeResponderAssignmentId = "";
        patch.activeResponderKind = "";
        patch.activeVolunteerSupportUid = "";
        patch.activeVolunteerSupportName = "";
        patch.activeVolunteerSupportAssignmentId = "";
        patch.activeLguResponderUid = "";
        patch.activeLguResponderName = "";
        patch.activeLguHeartbeatAt = null;
      }

      await updateDoc(doc(db, "disasterCases", incident.id), patch);

      if (nextStatus === "closed") {
        // Close Case is the hard end of the live response session.
        // Clean up case-scoped live GPS so stale pins cannot remain visible.
        const cleanupTasks: Promise<unknown>[] = [
          deleteDoc(doc(db, "lguResponseLocations", incident.id)),
        ];

        if (incident.reporterUid) {
          cleanupTasks.push(
            deleteDoc(doc(db, "residentResponseLocations", incident.reporterUid)),
          );
        }

        assignmentsForCase(incident.id).forEach((assignment) => {
          if (assignment.volunteerId) {
            cleanupTasks.push(
              deleteDoc(doc(db, "responseLocations", assignment.volunteerId)),
            );

            cleanupTasks.push(
              runTransaction(db, async (transaction) => {
                const lockRef = doc(db, "responderLocks", assignment.volunteerId!);
                const lockSnapshot = await transaction.get(lockRef);
                if (
                  lockSnapshot.exists() &&
                  String(lockSnapshot.data()?.caseId || "") === incident.id
                ) {
                  transaction.delete(lockRef);
                }
              }),
            );
          }
        });

        await Promise.allSettled(cleanupTasks);
      }

      Alert.alert(
        "Case Updated",
        nextStatus === "in_progress"
          ? "LGU response is now marked In Progress. Volunteer support remains optional."
          : `Status changed to ${labelOfStatus(nextStatus)}.`
      );
    } catch (error) {
      console.log("Case status error:", error);
      Alert.alert("Error", "Unable to update the case status.");
    }
  };

  const reviewVolunteerFieldReport = async (
    report: VolunteerFieldReport,
    action: "reviewed" | "dismissed"
  ) => {
    const adminUser = getAuth().currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    const note = (
      fieldReportNotes[report.id] ?? report.adminReviewNote ?? ""
    ).trim();

    if (action === "dismissed" && note.length < 5) {
      Alert.alert(
        "Review Note Required",
        "Enter a clear reason before dismissing the field report."
      );
      return;
    }

    if (note.length > 1500) {
      Alert.alert(
        "Review Note Too Long",
        "Admin review note must be 1500 characters or fewer."
      );
      return;
    }

    const busyId = `field_${action}_${report.id}`;
    setBusyKey(busyId);

    try {
      const reportRef = doc(db, "volunteerFieldReports", report.id);
      const activityLogRef = doc(collection(db, "adminActivityLogs"));

      await runTransaction(db, async (transaction) => {
        const reportSnapshot = await transaction.get(reportRef);

        if (!reportSnapshot.exists()) {
          throw new Error("The Volunteer field report no longer exists.");
        }

        const current: any = reportSnapshot.data();
        const currentStatus = String(current.reportStatus || "submitted");

        if (!["submitted", "reviewed"].includes(currentStatus)) {
          throw new Error(
            "This field report has already been incorporated or dismissed."
          );
        }

        transaction.update(reportRef, {
          reportStatus: action,
          adminReviewNote: note,
          reviewedAt: serverTimestamp(),
          reviewedBy: adminUser.uid,
          updatedAt: serverTimestamp(),
        });

        transaction.set(activityLogRef, {
          action:
            action === "reviewed"
              ? "Volunteer Field Report Reviewed"
              : "Volunteer Field Report Dismissed",
          caseId: report.caseId,
          assignmentId: report.assignmentId,
          volunteerUid: report.volunteerId,
          performedBy: adminUser.uid,
          note,
          timestamp: serverTimestamp(),
        });
      });

      Alert.alert(
        action === "reviewed" ? "Field Report Reviewed" : "Field Report Dismissed",
        action === "reviewed"
          ? "The report was reviewed. LGU may now incorporate verified remaining needs into the barangay assessment."
          : "The report was dismissed and will not be used as an official barangay need assessment."
      );
    } catch (error) {
      console.log("Volunteer field report review error:", error);
      Alert.alert(
        "Review Failed",
        error instanceof Error
          ? error.message
          : "Unable to review the Volunteer field report."
      );
    } finally {
      setBusyKey("");
    }
  };

  const incorporateFieldReportIntoBarangayNeeds = async (
    incident: DisasterCase,
    report: VolunteerFieldReport
  ) => {
    const adminUser = getAuth().currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    const draft = needDrafts[report.id] || emptyNeedDraft(incident, report);
    const barangay = String(
      incident.reporterBarangay || report.barangay || ""
    ).trim();

    if (!barangay) {
      Alert.alert(
        "Barangay Required",
        "The emergency case must have a barangay before its needs can be consolidated."
      );
      return;
    }

    const parseWhole = (value: string) => Number(String(value || "").trim());

    const affectedHouseholds = parseWhole(draft.affectedHouseholds);
    const affectedPeople = parseWhole(draft.affectedPeople);
    const peopleNeedingFood = parseWhole(draft.peopleNeedingFood);
    const peopleNeedingWater = parseWhole(draft.peopleNeedingWater);
    const peopleNeedingClothing = parseWhole(draft.peopleNeedingClothing);
    const peopleNeedingMedical = parseWhole(draft.peopleNeedingMedical);
    const householdsNeedingShelter = parseWhole(draft.householdsNeedingShelter);
    const householdsNeedingHygiene = parseWhole(draft.householdsNeedingHygiene);

    const numericValues = [
      affectedHouseholds,
      affectedPeople,
      peopleNeedingFood,
      peopleNeedingWater,
      peopleNeedingClothing,
      peopleNeedingMedical,
      householdsNeedingShelter,
      householdsNeedingHygiene,
    ];

    if (numericValues.some((value) => !Number.isInteger(value) || value < 0)) {
      Alert.alert(
        "Invalid Need Counts",
        "Use whole numbers only. Affected households and affected people must be at least 1."
      );
      return;
    }

    if (affectedHouseholds < 2 || affectedPeople < 1) {
      Alert.alert(
        "Community Relief Required",
        "This Volunteer field-report path is for a verified multi-household or community-level relief need. For one severe household, use this case's Relief Assessment and choose Affected Household."
      );
      return;
    }

    if (
      peopleNeedingFood > affectedPeople ||
      peopleNeedingWater > affectedPeople ||
      peopleNeedingClothing > affectedPeople ||
      peopleNeedingMedical > affectedPeople
    ) {
      Alert.alert(
        "People Count Mismatch",
        "Food, water, clothing, and medical need counts cannot exceed affected people."
      );
      return;
    }

    if (
      householdsNeedingShelter > affectedHouseholds ||
      householdsNeedingHygiene > affectedHouseholds
    ) {
      Alert.alert(
        "Household Count Mismatch",
        "Shelter and hygiene household counts cannot exceed affected households."
      );
      return;
    }

    const otherNeedDescription = draft.otherNeedDescription.trim();
    const adminNote = draft.adminNote.trim();

    if (otherNeedDescription.length > 1000 || adminNote.length > 1500) {
      Alert.alert(
        "Text Too Long",
        "Other need details are limited to 1000 characters and Admin notes to 1500 characters."
      );
      return;
    }

    const hasVerifiedNeed =
      peopleNeedingFood > 0 ||
      peopleNeedingWater > 0 ||
      peopleNeedingClothing > 0 ||
      peopleNeedingMedical > 0 ||
      householdsNeedingShelter > 0 ||
      householdsNeedingHygiene > 0 ||
      otherNeedDescription.length >= 3;

    if (!hasVerifiedNeed) {
      Alert.alert(
        "No Remaining Need Recorded",
        "Enter at least one verified remaining need before adding this report to Community Relief."
      );
      return;
    }

    const assessmentId = `field_${report.id}`;
    const busyId = `incorporate_${report.id}`;
    setBusyKey(busyId);

    try {
      const reportRef = doc(db, "volunteerFieldReports", report.id);
      const assessmentRef = doc(
        db,
        "barangayNeedAssessments",
        assessmentId
      );
      const activityLogRef = doc(collection(db, "adminActivityLogs"));

      await runTransaction(db, async (transaction) => {
        const [reportSnapshot, assessmentSnapshot] = await Promise.all([
          transaction.get(reportRef),
          transaction.get(assessmentRef),
        ]);

        if (!reportSnapshot.exists()) {
          throw new Error("The Volunteer field report no longer exists.");
        }

        const currentReport: any = reportSnapshot.data();
        const currentStatus = String(
          currentReport.reportStatus || "submitted"
        );

        if (!["submitted", "reviewed"].includes(currentStatus)) {
          throw new Error(
            "This field report has already been incorporated or dismissed."
          );
        }

        if (assessmentSnapshot.exists()) {
          throw new Error(
            "A Community Relief assessment already exists for this field report."
          );
        }

        transaction.set(assessmentRef, {
          assessmentId,
          barangay,
          sourceType: "volunteer_field_report",
          sourceCaseId: report.caseId,
          sourceFieldReportId: report.id,

          affectedHouseholds,
          affectedPeople,

          peopleNeedingFood,
          peopleNeedingWater,
          peopleNeedingClothing,
          peopleNeedingMedical,

          householdsNeedingShelter,
          householdsNeedingHygiene,

          otherNeedDescription,
          status: "verified",
          adminNote,

          createdBy: adminUser.uid,
          createdAt: serverTimestamp(),
          updatedBy: adminUser.uid,
          updatedAt: serverTimestamp(),
          closedAt: null,
        });

        transaction.update(reportRef, {
          reportStatus: "incorporated",
          adminReviewNote:
            (fieldReportNotes[report.id] ?? report.adminReviewNote ?? "").trim(),
          reviewedAt: serverTimestamp(),
          reviewedBy: adminUser.uid,
          updatedAt: serverTimestamp(),
        });

        transaction.set(activityLogRef, {
          action: "Field Report Incorporated into Community Relief",
          caseId: report.caseId,
          assignmentId: report.assignmentId,
          fieldReportId: report.id,
          assessmentId,
          barangay,
          performedBy: adminUser.uid,
          timestamp: serverTimestamp(),
        });
      });

      setNeedDraftReportId("");

      Alert.alert(
        "Community Relief Need Recorded",
        `Verified community-level remaining needs were added for ${barangay}. Relief Operations can now include them in centralized planning and allocation.`
      );
    } catch (error) {
      console.log("Barangay needs incorporation error:", error);
      Alert.alert(
        "Unable to Record Need",
        error instanceof Error
          ? error.message
          : "Unable to incorporate this field report into Community Relief."
      );
    } finally {
      setBusyKey("");
    }
  };

  const createDirectBarangayNeed = async (
    incident: DisasterCase
  ) => {
    const adminUser = getAuth().currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    if (incident.verificationStatus !== "validated") {
      Alert.alert(
        "Validated Case Required",
        "Validate the emergency report before recording an official LGU relief need."
      );
      return;
    }

    if (!["in_progress", "resolved"].includes(incident.status)) {
      Alert.alert(
        "Start LGU Response First",
        "Start the LGU response before creating a relief assessment."
      );
      return;
    }

    const draft =
      directNeedDrafts[incident.id] || emptyDirectNeedDraft(incident);

    const barangay = draft.barangay.trim();
    const reliefScope: ReliefScope =
      draft.reliefScope === "community" ? "community" : "household";

    if (barangay.length < 2 || barangay.length > 120) {
      Alert.alert(
        "Barangay Required",
        "Enter the LGU-verified barangay for this assessment."
      );
      return;
    }

    const parseWhole = (value: string) =>
      Number(String(value || "").trim());

    const affectedHouseholds = parseWhole(draft.affectedHouseholds);
    const affectedPeople = parseWhole(draft.affectedPeople);
    const peopleNeedingFood = parseWhole(draft.peopleNeedingFood);
    const peopleNeedingWater = parseWhole(draft.peopleNeedingWater);
    const peopleNeedingClothing = parseWhole(draft.peopleNeedingClothing);
    const peopleNeedingMedical = parseWhole(draft.peopleNeedingMedical);
    const householdsNeedingShelter = parseWhole(
      draft.householdsNeedingShelter
    );
    const householdsNeedingHygiene = parseWhole(
      draft.householdsNeedingHygiene
    );

    const numericValues = [
      affectedHouseholds,
      affectedPeople,
      peopleNeedingFood,
      peopleNeedingWater,
      peopleNeedingClothing,
      peopleNeedingMedical,
      householdsNeedingShelter,
      householdsNeedingHygiene,
    ];

    if (
      numericValues.some(
        (value) => !Number.isInteger(value) || value < 0
      )
    ) {
      Alert.alert(
        "Invalid Need Counts",
        "Use whole numbers only. Affected households and affected people must be at least 1."
      );
      return;
    }

    if (affectedPeople < 1) {
      Alert.alert(
        "Assessment Required",
        "Enter at least 1 affected person based on LGU verification."
      );
      return;
    }

    if (reliefScope === "household" && affectedHouseholds !== 1) {
      Alert.alert(
        "Household Relief Scope",
        "Household relief must represent exactly 1 verified affected household."
      );
      return;
    }

    if (reliefScope === "community" && affectedHouseholds < 2) {
      Alert.alert(
        "Community Relief Scope",
        "Community relief requires at least 2 verified affected households."
      );
      return;
    }

    if (
      peopleNeedingFood > affectedPeople ||
      peopleNeedingWater > affectedPeople ||
      peopleNeedingClothing > affectedPeople ||
      peopleNeedingMedical > affectedPeople
    ) {
      Alert.alert(
        "People Count Mismatch",
        "Food, water, clothing, and medical need counts cannot exceed affected people."
      );
      return;
    }

    if (
      householdsNeedingShelter > affectedHouseholds ||
      householdsNeedingHygiene > affectedHouseholds
    ) {
      Alert.alert(
        "Household Count Mismatch",
        "Shelter and hygiene household counts cannot exceed affected households."
      );
      return;
    }

    const otherNeedDescription =
      draft.otherNeedDescription.trim();
    const verificationMethod: VerificationMethod | "" =
      VERIFICATION_METHOD_OPTIONS.some(
        (item) => item.value === draft.verificationMethod
      )
        ? (draft.verificationMethod as VerificationMethod)
        : "";
    const verificationMethodOther =
      draft.verificationMethodOther.trim();
    const adminNoteBody = draft.adminNote.trim();

    if (!verificationMethod) {
      Alert.alert(
        "Verification Method Required",
        "Select how the LGU or barangay verified this relief need."
      );
      return;
    }

    if (
      verificationMethod === "other" &&
      verificationMethodOther.length < 3
    ) {
      Alert.alert(
        "Verification Method Required",
        "Describe the official LGU or barangay verification method used for this assessment."
      );
      return;
    }

    if (adminNoteBody.length < 5) {
      Alert.alert(
        "LGU Verification Note Required",
        reliefScope === "household"
          ? "Briefly record what the LGU confirmed about the household's damage and remaining material need."
          : "Briefly record what the LGU confirmed about the affected households and remaining community-level needs."
      );
      return;
    }

    const verificationLabel =
      verificationMethod === "other"
        ? `Other official verification — ${verificationMethodOther}`
        : verificationMethodLabel(verificationMethod);
    const adminNote = `${verificationLabel}: ${adminNoteBody}`;

    if (
      otherNeedDescription.length > 1000 ||
      adminNote.length > 1500
    ) {
      Alert.alert(
        "Text Too Long",
        "Other need details are limited to 1000 characters and the complete LGU verification record to 1500 characters."
      );
      return;
    }

    const hasVerifiedNeed =
      peopleNeedingFood > 0 ||
      peopleNeedingWater > 0 ||
      peopleNeedingClothing > 0 ||
      peopleNeedingMedical > 0 ||
      householdsNeedingShelter > 0 ||
      householdsNeedingHygiene > 0 ||
      otherNeedDescription.length >= 3;

    if (!hasVerifiedNeed) {
      Alert.alert(
        "No Relief Need Recorded",
        "Enter at least one LGU-verified remaining material need before sending this case to Relief Operations."
      );
      return;
    }

    const assessmentId = `direct_${incident.id}`;
    const busyId = `direct_need_${incident.id}`;
    setBusyKey(busyId);

    try {
      const caseRef = doc(db, "disasterCases", incident.id);
      const assessmentRef = doc(
        db,
        "barangayNeedAssessments",
        assessmentId
      );
      const activityLogRef = doc(
        collection(db, "adminActivityLogs")
      );

      await runTransaction(db, async (transaction) => {
        const [caseSnapshot, assessmentSnapshot] =
          await Promise.all([
            transaction.get(caseRef),
            transaction.get(assessmentRef),
          ]);

        if (!caseSnapshot.exists()) {
          throw new Error(
            "The emergency case no longer exists."
          );
        }

        if (assessmentSnapshot.exists()) {
          throw new Error(
            "A verified LGU relief need already exists for this case."
          );
        }

        const currentCase: any = caseSnapshot.data();
        const currentVerification = String(
          currentCase.verificationStatus || ""
        );
        const currentStatus = String(
          currentCase.status || ""
        );

        if (currentVerification !== "validated") {
          throw new Error(
            "The emergency report is no longer in a validated state."
          );
        }

        if (!["in_progress", "resolved"].includes(currentStatus)) {
          throw new Error(
            "Start the LGU response before creating a verified relief need."
          );
        }

        transaction.set(assessmentRef, {
          assessmentId,
          barangay,
          sourceType: "lgu_direct_assessment",
          sourceCaseId: incident.id,
          sourceFieldReportId: "",

          affectedHouseholds,
          affectedPeople,

          peopleNeedingFood,
          peopleNeedingWater,
          peopleNeedingClothing,
          peopleNeedingMedical,

          householdsNeedingShelter,
          householdsNeedingHygiene,

          otherNeedDescription,
          status: "verified",
          adminNote,

          createdBy: adminUser.uid,
          createdAt: serverTimestamp(),
          updatedBy: adminUser.uid,
          updatedAt: serverTimestamp(),
          closedAt: null,
        });

        transaction.set(activityLogRef, {
          action: "Emergency Relief Need Verified",
          caseId: incident.id,
          assessmentId,
          barangay,
          performedBy: adminUser.uid,
          timestamp: serverTimestamp(),
        });
      });

      setBarangayNeedAssessmentIds((current) => {
        const next = new Set(current);
        next.add(assessmentId);
        return next;
      });

      setDirectNeedCaseId("");

      Alert.alert(
        "Relief Need Created",
        reliefScope === "household"
          ? `The verified household relief need in ${barangay} was added to Relief Operations. LGU resources should be checked before any Donation Support is requested.`
          : `The verified community relief need for ${barangay} was added to Relief Operations. LGU resources should be checked before any Donation Support is requested.`
      );
    } catch (error) {
      console.log(
        "LGU direct relief assessment error:",
        error
      );
      Alert.alert(
        "Unable to Record Need",
        error instanceof Error
          ? error.message
          : "Unable to save the LGU relief assessment."
      );
    } finally {
      setBusyKey("");
    }
  };

  const assignLguPersonnelToCase = async (
    incident: DisasterCase,
    personnel: LguPersonnelCandidate
  ) => {
    const adminUser = getAuth().currentUser;

    if (!adminUser) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }

    const verificationStatus = String(
      incident.verificationStatus || "pending_verification"
    );

    if (verificationStatus !== "validated") {
      Alert.alert(
        "Validate Case First",
        "The emergency report must be validated before official LGU Personnel can be assigned."
      );
      return;
    }

    if (!["validated", "assigned", "in_progress"].includes(incident.status)) {
      Alert.alert(
        "Assignment Unavailable",
        "This emergency case is not currently eligible for an LGU Personnel assignment."
      );
      return;
    }

    if (incident.activeLguResponderUid) {
      Alert.alert(
        "Official Responder Already Assigned",
        `${incident.activeLguResponderName || "An LGU responder"} is already assigned to this emergency.`
      );
      return;
    }

    const assignable =
      personnel.verificationStatus === "verified" &&
      personnel.employmentStatus === "active" &&
      personnel.dutyStatus === "on_duty" &&
      personnel.availabilityStatus === "available" &&
      !personnel.activeCaseId &&
      !personnel.activeAssignmentId;

    if (!assignable) {
      Alert.alert(
        "Personnel Not Available",
        "Only verified LGU Personnel who are On Duty and Available with no active emergency assignment can be assigned."
      );
      return;
    }

    const busyId = `lgu_assign_${incident.id}_${personnel.uid}`;
    setBusyKey(busyId);

    try {
      const token = await adminUser.getIdToken(true);
      const response = await fetch(`${BACKEND_URL}/api/admin/lgu/assignments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseId: incident.id,
          personnelUid: personnel.uid,
        }),
      });

      const raw = await response.text();
      let payload: any = {};

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        throw new Error(
          payload?.message ||
            `Unable to assign LGU Personnel (status ${response.status}).`
        );
      }

      await loadLguPersonnel(true);

      Alert.alert(
        "LGU Personnel Assigned",
        `${personnel.fullName} is now the official LGU responder for this emergency. The personnel and resident were notified.`
      );
    } catch (error) {
      console.log("Assign LGU Personnel error:", error);
      Alert.alert(
        "Assignment Failed",
        error instanceof Error
          ? error.message
          : "Unable to assign this LGU Personnel."
      );
    } finally {
      setBusyKey("");
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

    if (volunteer.uid === incident.reporterUid) {
      Alert.alert(
        "Assignment Blocked",
        "The resident who reported this emergency cannot be assigned as a responder to their own case."
      );
      return;
    }

    const activeCount = activeAssignmentsForCase(incident.id).length;

    // Emergency Volunteer support is optional and limited to one active
    // Volunteer assignment at a time. LGU response never depends on it.
    if (activeCount >= 1) {
      Alert.alert(
        "Volunteer Support Already Active",
        "This emergency already has an active Volunteer support assignment. Finish or cancel it before assigning another Volunteer."
      );
      return;
    }

    const eligibility = volunteerEligibilityForCase(incident, volunteer);
    if (!eligibility.eligible) {
      Alert.alert("Volunteer Not Eligible", eligibility.reason);
      return;
    }

    const requiredSkillList = (incident.requiredSkills || []).filter(Boolean);
    const requiresSpecializedSkill = requiredSkillList.some(
      (skill) => !String(skill).toLowerCase().includes("general volunteer"),
    );
    const matchedSkills = skillMatchCount(incident, volunteer);

    if (requiresSpecializedSkill && matchedSkills <= 0) {
      Alert.alert(
        "Skill Match Required",
        `${volunteer.fullName} does not have a verified skill matching this emergency. Choose a qualified responder for ${requiredSkillList.join(", ")}.`,
      );
      return;
    }

    const busyId = `${incident.id}_${volunteer.uid}`;
    setBusyKey(busyId);

    try {
      const caseRef = doc(db, "disasterCases", incident.id);
      const volunteerRef = doc(db, "users", volunteer.uid);
      const responderLockRef = doc(db, "responderLocks", volunteer.uid);
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
      const residentNotificationRef = doc(
        db,
        "notifications",
        `resident_assignment_${incident.id}_${volunteer.uid}`
      );
      const activityLogRef = doc(collection(db, "adminActivityLogs"));

      await runTransaction(db, async (transaction) => {
        const [
          caseSnapshot,
          volunteerSnapshot,
          assignmentSnapshot,
          responderLockSnapshot,
        ] = await Promise.all([
          transaction.get(caseRef),
          transaction.get(volunteerRef),
          transaction.get(assignmentRef),
          transaction.get(responderLockRef),
        ]);

        if (!caseSnapshot.exists()) {
          throw new Error("The disaster case no longer exists.");
        }

        if (!volunteerSnapshot.exists()) {
          throw new Error("The selected volunteer account no longer exists.");
        }

        const currentCase: any = caseSnapshot.data();
        const currentVolunteer: any = volunteerSnapshot.data();

        const currentCaseBarangayRaw = String(
          currentCase.incidentBarangay ||
            currentCase.emergencyBarangay ||
            currentCase.barangay ||
            currentCase.reporterBarangay ||
            ""
        ).trim();
        const currentCaseBarangay = normalizeBarangay(
          currentCaseBarangayRaw
        );
        const currentVolunteerBarangay = normalizeBarangay(
          currentVolunteer.barangay ||
            currentVolunteer.addressBarangay ||
            ""
        );

        if (!currentCaseBarangay) {
          throw new Error(
            "This emergency case has no barangay. Add or verify the case barangay before requesting local Volunteer support."
          );
        }

        if (!currentVolunteerBarangay) {
          throw new Error(
            "This Volunteer profile has no barangay. Update the Volunteer profile before assigning local emergency support."
          );
        }

        if (currentVolunteerBarangay !== currentCaseBarangay) {
          throw new Error(
            `${volunteer.fullName} is registered in ${
              volunteer.barangay || "another barangay"
            } and cannot be assigned to this ${
              currentCaseBarangayRaw || "case"
            } emergency.`
          );
        }

        if (responderLockSnapshot.exists()) {
          const lock: any = responderLockSnapshot.data();
          throw new Error(
            `${volunteer.fullName} is already active on another emergency response (${String(
              lock.caseId || "active case",
            )}). Choose another available qualified responder.`,
          );
        }

        // Volunteer support is independent from the official LGU responder.
        // LGU remains the primary authority even when optional support is offered.

        if (
          String(currentCase.reporterUid || "").trim() ===
          String(volunteer.uid || "").trim()
        ) {
          throw new Error(
            "The resident who reported this emergency cannot be assigned as a responder to their own case."
          );
        }

        const volunteerRole = String(currentVolunteer.role || "")
          .trim()
          .toLowerCase();

        const accountStatus = String(currentVolunteer.status || "")
          .trim()
          .toLowerCase();

        const volunteerStatus = String(
          currentVolunteer.volunteerStatus || ""
        )
          .trim()
          .toLowerCase();

        const blockedSystemRole =
          volunteerRole === "admin" || volunteerRole === "superadmin";
        const explicitlyBlockedAccount =
          accountStatus === "rejected" ||
          accountStatus === "suspended" ||
          accountStatus === "disabled" ||
          accountStatus === "deactivated";
        const explicitlyRejectedVolunteer =
          volunteerStatus === "rejected" || volunteerStatus === "revoked";
        const identityStatus = String(currentVolunteer.identityStatus || "")
          .trim()
          .toLowerCase();
        const explicitlyRejectedIdentity =
          identityStatus === "rejected" || identityStatus === "failed";

        // The candidate originates from an Admin-approved Volunteer
        // Application. Do not reject older approved test accounts merely
        // because a newer mirrored users/{uid} flag is absent.
        if (
          blockedSystemRole ||
          explicitlyBlockedAccount ||
          explicitlyRejectedVolunteer ||
          explicitlyRejectedIdentity
        ) {
          throw new Error(
            "This approved Volunteer profile is no longer eligible for emergency support."
          );
        }

        const currentRequiredSkills = normalizeStringArray(
          currentCase.requiredSkills,
        );
        const currentVolunteerSkills = Array.from(
          new Set([
            ...normalizeStringArray(currentVolunteer.skills),
            ...normalizeStringArray(currentVolunteer.volunteerSkills),
            ...normalizeStringArray(volunteer.skills),
          ]),
        );
        const specializedSkills = currentRequiredSkills.filter(
          (skill) => !skill.toLowerCase().includes("general volunteer"),
        );
        const hasCurrentSkillMatch = specializedSkills.length === 0 ||
          specializedSkills.some((needed) =>
            currentVolunteerSkills.some((skill) => {
              const a = skill.toLowerCase();
              const b = needed.toLowerCase();
              return a === b || a.includes(b) || b.includes(a);
            }),
          );

        if (!hasCurrentSkillMatch) {
          throw new Error(
            "Assignment blocked because this responder does not match the verified skills required by the emergency.",
          );
        }

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
          activeVolunteerSupportUid: volunteer.uid,
          activeVolunteerSupportName: volunteer.fullName,
          activeVolunteerSupportAssignmentId: assignmentRef.id,
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

        const severityLabel =
          String(currentCase.severity || "low") === "critical"
            ? "CRITICAL"
            : String(currentCase.severity || "low") === "medium"
              ? "URGENT"
              : String(currentCase.severity || "low") === "high"
                ? "HIGH"
                : "STANDARD";

        transaction.set(notificationRef, {
          userId: volunteer.uid,
          audience: "volunteer",
          type: "response_assignment",
          caseId: incident.id,
          assignmentId: assignmentRef.id,
          severity: currentCase.severity || "low",
          title: `${severityLabel} emergency assignment`,
          message: `You were assigned to ${
            currentCase.title || incident.title || "an emergency case"
          }. Required skills: ${currentRequiredSkills.join(", ") || "General response"}. Open Volunteer Tasks to accept or decline.`,
          read: false,
          createdAt: serverTimestamp(),
        });

        if (currentCase.reporterUid) {
          transaction.set(residentNotificationRef, {
            userId: currentCase.reporterUid,
            audience: "resident",
            type: "responder_assigned",
            caseId: incident.id,
            volunteerId: volunteer.uid,
            volunteerName: volunteer.fullName,
            title: "Optional Volunteer Support Offered",
            message: `LGU/Admin offered ${volunteer.fullName} as optional Volunteer support for your emergency. The Volunteer must accept before support becomes active or appears on live tracking.`,
            read: false,
            createdAt: serverTimestamp(),
          });
        }

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
        "Volunteer Support Offered",
        `${volunteer.fullName} received an optional Volunteer support offer. LGU remains the official primary responder, and the Volunteer appears on Resident tracking only after accepting.`
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
      const assignmentRef = doc(
        db,
        "responseAssignments",
        assignment.id
      );
      const caseRef = doc(
        db,
        "disasterCases",
        assignment.caseId
      );
      const responderLockRef = assignment.volunteerId
        ? doc(db, "responderLocks", assignment.volunteerId)
        : null;

      await runTransaction(db, async (transaction) => {
        const reads = [
          transaction.get(assignmentRef),
          transaction.get(caseRef),
          ...(responderLockRef ? [transaction.get(responderLockRef)] : []),
        ];
        const results = await Promise.all(reads);
        const assignmentSnapshot = results[0];
        const caseSnapshot = results[1];
        const responderLockSnapshot = responderLockRef ? results[2] : null;

        if (!assignmentSnapshot.exists()) {
          throw new Error("The responder assignment no longer exists.");
        }

        const currentStatus = String(
          assignmentSnapshot.data()?.status || ""
        );

        if (currentStatus === "completed") {
          throw new Error(
            "A completed responder assignment cannot be cancelled."
          );
        }

        transaction.update(assignmentRef, {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        });

        if (
          responderLockRef &&
          responderLockSnapshot?.exists() &&
          String(responderLockSnapshot.data()?.assignmentId || "") === assignment.id
        ) {
          transaction.delete(responderLockRef);
        }

        if (caseSnapshot.exists()) {
          const currentCase: any = caseSnapshot.data();
          const legacyCount = Math.max(
            Number(currentCase.assignedVolunteersCount || 0) - 1,
            0
          );

          const casePatch: any = {
            assignedVolunteerIds: arrayRemove(assignment.volunteerId),
            assignedVolunteersCount: legacyCount,
            updatedAt: serverTimestamp(),
          };

          if (
            String(currentCase.activeVolunteerSupportAssignmentId || "") ===
            assignment.id
          ) {
            casePatch.activeVolunteerSupportUid = "";
            casePatch.activeVolunteerSupportName = "";
            casePatch.activeVolunteerSupportAssignmentId = "";
          }

          // Clean up legacy Volunteer-as-primary fields only when they point to
          // this same assignment. Official LGU fields are never touched here.
          if (
            String(currentCase.activeResponderAssignmentId || "") === assignment.id
          ) {
            casePatch.activeResponderUid = "";
            casePatch.activeResponderName = "";
            casePatch.activeResponderAssignmentId = "";
            casePatch.activeResponderKind = "";
          }

          transaction.update(caseRef, casePatch);
        }
      });

      Alert.alert(
        "Cancelled",
        "The volunteer assignment was cancelled and case access was removed."
      );
    } catch (error) {
      console.log("Cancel assignment error:", error);
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Unable to cancel the assignment."
      );
    }
  };

  const severityLabel = (severity: Severity) => {
    if (severity === "critical") return "CRITICAL";
    if (severity === "medium") return "URGENT";
    if (severity === "high") return "HIGH";
    return "STANDARD";
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
        <Text style={styles.denied}>
          {role === "superadmin"
            ? "Operational cases are managed by Admin accounts."
            : "Access Denied"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={true}
    >
      <AdminReviewHero
        eyebrow="LGU OPERATIONS / EMERGENCY & ASSISTANCE"
        title="Emergency Reports"
        subtitle="Review resident incident reports, verify evidence, coordinate authorized LGU responders, and track case resolution."
        icon="warning-outline"
        tag="INCIDENT RESPONSE"
      />
      <View style={styles.pageHeader}>
        <View style={styles.headerTools}>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                value={caseSearch}
                onChangeText={value => { setCaseSearch(value); setRecordPage(1); }}
                placeholder="Search case, resident, location…"
                placeholderTextColor="#94a3b8"
                style={styles.searchInput}
              />
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
                    onPress={() => { setFilterStatus(status); setRecordPage(1); }}
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
                      onPress={() => { setFilterSeverity(severity); setRecordPage(1); }}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          active && styles.pillTextActive,
                        ]}
                      >
                        {severity === "low" ? "STANDARD" : severity === "medium" ? "URGENT" : severity.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>
          </View>
        </View>

      <ListPagination page={activeCasePage} total={visibleCases.length} pageSize={5} onChange={setRecordPage} />
      {visibleCases.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No emergency cases found</Text>
          <Text style={styles.emptyText}>
            Try another filter or search term.
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.caseWorkspace,
            compact && styles.caseWorkspaceCompact,
          ]}
        >
          <View style={[styles.caseListPane, compact && styles.caseListPaneCompact]}>
            <View style={styles.caseListHeader}>
              <View>
                <Text style={styles.caseListTitle}>All Emergency Cases</Text>
                <Text style={styles.caseListCount}>{visibleCases.length} case{visibleCases.length === 1 ? "" : "s"}</Text>
              </View>
              <Text style={styles.caseListSort}>Priority · Newest</Text>
            </View>

            <View style={styles.caseListItems}>
              {pagedCases.map((item) => {
                const active = selectedCase?.id === item.id;
                const thumb = firstIncidentImage(item.attachments);

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.86}
                    style={[styles.caseListItem, active && styles.caseListItemActive]}
                    onPress={() => setSelectedCaseId(item.id)}
                  >
                    <View style={styles.caseListThumb}>
                      {thumb ? (
                        <Image source={{ uri: thumb }} style={styles.caseListThumbImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.caseListThumbFallback}>
                          <Text style={styles.caseListThumbFallbackIcon}>{categoryIcon(item.category)}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.caseListBody}>
                      <View style={styles.caseListTitleRow}>
                        <Text numberOfLines={1} style={styles.caseListItemTitle}>{item.title}</Text>
                        <View style={[styles.caseListSeverity, severityStyle(item.severity)]}>
                          <Text style={styles.caseListSeverityText}>{severityLabel(item.severity)}</Text>
                        </View>
                      </View>
                      <Text numberOfLines={1} style={styles.caseListLocation}>⌖ {item.location || "Location pending"}</Text>
                      <View style={styles.caseListMetaRow}>
                        <Text numberOfLines={1} style={styles.caseListMeta}>♙ {item.reporterName || "Resident"}</Text>
                        <Text style={styles.caseListMeta}>◉ {item.affectedPeople || 0} affected</Text>
                      </View>
                    </View>

                    <View style={styles.caseListRight}>
                      <Text style={styles.caseListDate}>{formatDate(item.createdAt)}</Text>
                      <Text style={styles.caseListChevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.caseDetailPane}>
            {[selectedCase].map((incident) => {
          const incidentAssignments = assignmentsForCase(incident.id);
          const activeAssignments = activeAssignmentsForCase(incident.id);
          const incidentFieldReports = fieldReportsForCase(incident.id);
          const incidentLguFieldReports = lguFieldReports.filter(
            (report) => report.caseId === incident.id
          );
          const latestLguFieldReport =
            incidentLguFieldReports[0] || null;
          const officialLguResponseStatus = String(
            incident.officialLguResponseStatus || ""
          )
            .trim()
            .toLowerCase();
          const lguFieldReviewPending =
            officialLguResponseStatus ===
            "completed_pending_admin_review";
          const volunteerSupportAvailable = activeAssignments.length === 0;
          const photoUrl = firstIncidentImage(incident.attachments);
          const note = notes[incident.id] ?? incident.adminNote ?? "";

          const assignmentPanelOpen = assignmentCaseId === incident.id;
          const volunteerCandidates = volunteerCandidatesForCase(incident);
          const onDutyPersonnel = lguPersonnel.filter(personnel =>
            personnel.uid !== incident.activeLguResponderUid && personnel.dutyStatus === "on_duty"
          );
          const eligibleVolunteerCount = volunteerCandidates.filter(
            (volunteer) => volunteerEligibilityForCase(incident, volunteer).eligible
          ).length;
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

          const lguHeartbeatMs = timestampMillis(incident.activeLguHeartbeatAt);
          const lguOwnerFresh =
            Boolean(incident.activeLguResponderUid) &&
            lguHeartbeatMs > 0 &&
            Date.now() - lguHeartbeatMs < 120000;

          const activeLguProfile = lguPersonnel.find(
            (personnel) => personnel.uid === incident.activeLguResponderUid
          ) || null;

          const activeLguTrackingLabel = !activeLguProfile
            ? lguOwnerFresh
              ? "Live Tracking"
              : "Assigned"
            : activeLguProfile.availabilityStatus === "assigned"
            ? "Awaiting Response"
            : activeLguProfile.availabilityStatus === "responding"
            ? lguOwnerFresh
              ? "Live Tracking"
              : "Responding"
            : activeLguProfile.availabilityStatus === "on_site"
            ? "On Site"
            : labelOfStatus(activeLguProfile.availabilityStatus || "assigned");

          const directAssessmentId = `direct_${incident.id}`;
          const directAssessmentExists =
            barangayNeedAssessmentIds.has(directAssessmentId);
          const directDraftOpen = directNeedCaseId === incident.id;
          const directDraft =
            directNeedDrafts[incident.id] ||
            emptyDirectNeedDraft(incident);
          const directAssessmentBusy =
            busyKey === `direct_need_${incident.id}`;
          const directAffectedHouseholds = Math.max(
            Number(directDraft.affectedHouseholds || 0),
            0
          );
          const directAffectedPeople = Math.max(
            Number(directDraft.affectedPeople || 0),
            0
          );
          const directNeedReviewRows = [
            {
              key: "peopleNeedingFood",
              label: "Food",
              value: Math.max(Number(directDraft.peopleNeedingFood || 0), 0),
              unit: "people",
            },
            {
              key: "peopleNeedingWater",
              label: "Water",
              value: Math.max(Number(directDraft.peopleNeedingWater || 0), 0),
              unit: "people",
            },
            {
              key: "peopleNeedingClothing",
              label: "Clothing",
              value: Math.max(Number(directDraft.peopleNeedingClothing || 0), 0),
              unit: "people",
            },
            {
              key: "peopleNeedingMedical",
              label: "Medical",
              value: Math.max(Number(directDraft.peopleNeedingMedical || 0), 0),
              unit: "people",
            },
            {
              key: "householdsNeedingShelter",
              label: "Temporary shelter",
              value: Math.max(Number(directDraft.householdsNeedingShelter || 0), 0),
              unit: "households",
            },
            {
              key: "householdsNeedingHygiene",
              label: "Hygiene kits",
              value: Math.max(Number(directDraft.householdsNeedingHygiene || 0), 0),
              unit: "households",
            },
          ].filter((item) => item.value > 0);
          const directVerificationLabel =
            directDraft.verificationMethod === "other"
              ? String(directDraft.verificationMethodOther || "").trim() ||
                "Other official verification"
              : verificationMethodLabel(directDraft.verificationMethod);

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
                            {severityLabel(incident.severity)}
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

                  <View style={styles.caseHeaderHidden}>
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
                    <View style={styles.caseHeaderHidden}>
                      <Text style={styles.needsLabel}>
                        RESIDENT RESPONSE NOTE
                      </Text>
                      <Text style={styles.needsText}>
                        {incident.needsNote}
                      </Text>
                    </View>
                  )}

                  <View style={styles.caseHeaderHidden}>
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
                      <Text style={styles.metaLabel}>Volunteer Support</Text>
                      <Text style={styles.metaValue}>
                        {activeAssignments.length > 0
                          ? `${activeAssignments.length} active`
                          : "None active"}
                      </Text>
                    </View>

                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>LGU LIVE OWNER</Text>
                      <Text style={styles.metaValue}>
                        {incident.activeLguResponderUid
                          ? lguOwnerFresh
                            ? incident.activeLguResponderName || "Active LGU responder"
                            : "Takeover available · previous session stale"
                          : "Available"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.detailTabs}>
                {(
                  [
                    ["overview", "Overview"],
                    ["map", "Map & Route"],
                    ["evidence", `Evidence (${imageEvidence.length + videoEvidence.length})`],
                    ["response", "Response"],
                    ["personnel", "Assigned Personnel"],
                    ["history", "History"],
                  ] as const
                ).map(([key, label]) => {
                  const active = detailTab === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.detailTabButton,
                        active && styles.detailTabButtonActive,
                      ]}
                      onPress={() => {
                        setDetailTab(key);
                        if (key === "personnel") {
                          setAssignmentCaseId(incident.id);
                          setSkillFilter("");
                          setAvailabilityFilter("");
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.detailTabText,
                          active && styles.detailTabTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {detailTab === "overview" && (
                <View style={styles.overviewDashboard}>
                  <View style={styles.overviewCard}>
                    <View style={styles.overviewCardHeader}>
                      <Text style={styles.overviewCardIcon}>♙</Text>
                      <Text style={styles.overviewCardTitle}>Resident Information</Text>
                    </View>
                    <Text style={styles.overviewPrimary}>{incident.reporterName || "Resident"}</Text>
                    <Text style={styles.overviewLine}>{incident.contactNumber || "No contact number"}</Text>
                    <Text style={styles.overviewLine}>{incident.reporterEmail || "No email on file"}</Text>
                    <Text style={styles.overviewLine}>
                      {incident.reporterBarangay
                        ? `${incident.reporterBarangay}, San Jose del Monte, Bulacan`
                        : incident.reporterAddress || "Barangay not provided"}
                    </Text>
                    <View style={styles.overviewVerifiedPill}>
                      <Text style={styles.overviewVerifiedText}>
                        {incident.verification?.identityVerified
                          ? "✓ Verified Resident"
                          : "Resident account"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.overviewCard}>
                    <View style={styles.overviewCardHeader}>
                      <Text style={styles.overviewCardIcon}>◉</Text>
                      <Text style={styles.overviewCardTitle}>Case Status</Text>
                    </View>

                    {[
                      ["Reported", true, incident.createdAt],
                      ["Validated", verificationStatus === "validated", incident.validatedAt],
                      [
                        "LGU Response",
                        ["assigned", "in_progress", "resolved", "closed"].includes(incident.status),
                        incident.assignedAt || incident.updatedAt,
                      ],
                      [
                        "In Progress",
                        ["in_progress", "resolved", "closed"].includes(incident.status),
                        incident.status === "in_progress" ? incident.updatedAt : null,
                      ],
                      [
                        "Resolved",
                        ["resolved", "closed"].includes(incident.status),
                        incident.resolvedAt,
                      ],
                      ["Closed", incident.status === "closed", incident.closedAt],
                    ].map(([label, done, when], index) => (
                      <View key={`${label}-${index}`} style={styles.statusTimelineRow}>
                        <View
                          style={[
                            styles.statusTimelineDot,
                            done ? styles.statusTimelineDotDone : styles.statusTimelineDotPending,
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.statusTimelineLabel,
                              done && styles.statusTimelineLabelDone,
                            ]}
                          >
                            {String(label)}
                          </Text>
                          {done && when ? (
                            <Text style={styles.statusTimelineTime}>{formatDate(when)}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>

                  <View style={styles.overviewCard}>
                    <View style={styles.overviewCardHeader}>
                      <Text style={styles.overviewCardIcon}>⚑</Text>
                      <Text style={styles.overviewCardTitle}>Priority & Needs</Text>
                    </View>

                    <View style={styles.priorityRow}>
                      <View style={[styles.badge, severityStyle(incident.severity)]}>
                        <Text style={styles.badgeText}>{severityLabel(incident.severity)}</Text>
                      </View>
                      <Text style={styles.priorityPeople}>
                        {incident.affectedPeople || 0} affected
                      </Text>
                    </View>

                    <Text style={styles.overviewLabel}>Assistance Needed</Text>
                    <View style={styles.needChipRow}>
                      {(incident.assistanceTypes || []).length ? (
                        (incident.assistanceTypes || []).slice(0, 5).map((item) => (
                          <View key={item} style={styles.needChip}>
                            <Text style={styles.needChipText}>{item}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.overviewLine}>
                          {incident.needs || "Not specified"}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.overviewLabel}>Description</Text>
                    <Text style={styles.overviewDescription}>
                      {incident.details || "No additional incident description."}
                    </Text>
                  </View>
                </View>
              )}

              <View
                style={[
                  styles.locationActionCard,
                  !["overview", "map"].includes(detailTab) && styles.hiddenSection,
                ]}
              >
                <View style={styles.locationActionMain}>
                  <Text style={styles.sectionEyebrow}>LOCATION & ROUTE</Text>
                  <Text style={styles.locationActionTitle}>Resident response location</Text>
                  <Text style={styles.locationActionAddress}>
                    {incident.location || "Exact response location not provided"}
                  </Text>
                  <Text style={styles.locationActionCoords}>
                    {Number.isFinite(incident.latitude) && Number.isFinite(incident.longitude)
                      ? `${incident.latitude?.toFixed(6)}, ${incident.longitude?.toFixed(6)}`
                      : "GPS coordinates unavailable"}
                  </Text>
                </View>

                <View style={styles.locationActionButtons}>
                  <TouchableOpacity
                    style={styles.locationLiveButton}
                    disabled={
                      !Number.isFinite(incident.latitude) ||
                      !Number.isFinite(incident.longitude)
                    }
                    onPress={() =>
                      router.push(
                        `/(admin)/admin-live-map?caseId=${encodeURIComponent(incident.id)}` as any
                      )
                    }
                  >
                    <Text style={styles.locationLiveButtonText}>Open Live Map</Text>
                  </TouchableOpacity>

                </View>
              </View>

              {detailTab === "map" && Platform.OS === "web" &&
                Number.isFinite(incident.latitude) && Number.isFinite(incident.longitude) && (
                <View style={{ marginTop: 12, marginBottom: 18, borderRadius: 12, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E7DF" }}>
                  <Text style={{ padding: 13, color: "#173D32", fontWeight: "800", fontSize: 13 }}>
                    Live Response Map · This emergency report
                  </Text>
                  {React.createElement("iframe" as any, {
                    title: "Embedded authorized LGU live response map for selected emergency",
                    src: "/admin-live-map?caseId=" + encodeURIComponent(incident.id),
                    loading: "lazy",
                    allow: "geolocation",
                    style: { width: "100%", height: 480, border: 0, display: "block" },
                  })}
                </View>
              )}
              <View
                style={[
                  styles.verificationPanel,
                  detailTab !== "evidence" && styles.hiddenSection,
                ]}
              >
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
                      Photo evidence is required for new emergency reports.
                    </Text>
                  </View>
                </View>

                <View style={styles.severityReviewCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.metaLabel}>ADMIN FINAL SEVERITY</Text>
                      <Text style={styles.severityReviewText}>
                        Resident urgency is an initial indication. Admin confirms
                        the operational severity used for coordination.
                      </Text>
                    </View>

                    <View style={styles.severityChoiceRow}>
                      {(["low", "medium", "high", "critical"] as Severity[]).map(
                        (level) => {
                          const active = incident.severity === level;
                          const busy = busyKey === `severity_${incident.id}`;

                          return (
                            <TouchableOpacity
                              key={level}
                              disabled={busy}
                              style={[
                                styles.severityChoice,
                                active && severityStyle(level),
                                busy && styles.disabledButton,
                              ]}
                              onPress={() =>
                                void saveFinalSeverity(incident, level)
                              }
                            >
                              <Text
                                style={[
                                  styles.severityChoiceText,
                                  active && styles.severityChoiceTextActive,
                                ]}
                              >
                                {level === "low"
                                  ? "STANDARD"
                                  : level === "medium"
                                    ? "URGENT"
                                    : level.toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          );
                        }
                      )}
                    </View>
                  </View>

                  {incident.severity === "critical" &&
                    verificationStatus !== "rejected" && (
                    <View style={styles.criticalResponseNotice}>
                      <Text style={styles.criticalResponseTitle}>
                        Critical case — official LGU response takes priority
                      </Text>
                      <Text style={styles.criticalResponseText}>
                        Official LGU navigation may begin immediately while the
                        evidence review continues. Qualified community responder
                        assignment remains controlled by LGU verification.
                      </Text>
                      <TouchableOpacity
                        style={styles.criticalNavigateButton}
                        onPress={() =>
                          router.push(
                            `/(admin)/admin-live-map?caseId=${encodeURIComponent(
                              incident.id,
                            )}` as any,
                          )
                        }
                      >
                        <Text style={styles.criticalNavigateButtonText}>
                          Start / Open Critical LGU Live Response
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={styles.verificationChecks}>
                  <View style={styles.checkItem}>
                    <Text style={styles.checkIcon}>
                      {incident.verification?.accountApproved ? "✓" : "—"}
                    </Text>
                    <Text style={styles.checkText}>Active Basic account</Text>
                  </View>

                  <View style={styles.checkItem}>
                    <Text style={styles.checkIcon}>
                      {incident.verification?.identityVerified ? "✓" : "○"}
                    </Text>
                    <Text style={styles.checkText}>
                      {incident.verification?.identityVerified
                        ? "Verified Resident"
                        : "Unverified reporter"}
                    </Text>
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
                    <ListPagination page={Math.max(1, Math.min(photoPage, Math.ceil(imageEvidence.length / 5) || 1))} total={imageEvidence.length} pageSize={5} onChange={setPhotoPage} />
                    {pageFive(imageEvidence, photoPage).map((attachment, index) => (
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
                    <ListPagination page={Math.max(1, Math.min(videoPage, Math.ceil(videoEvidence.length / 5) || 1))} total={videoEvidence.length} pageSize={5} onChange={setVideoPage} />
                    {pageFive(videoEvidence, videoPage).map((attachment, index) => (
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
                            ✓ Validate Report
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
                            Reject Report
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                {verificationStatus === "needs_more_evidence" && (
                  <View style={styles.reviewNotice}>
                    <Text style={styles.warningTitle}>
                      {incident.evidenceReviewStatus === "resubmitted"
                        ? "New resident evidence submitted — review again"
                        : "Waiting for additional resident evidence"}
                    </Text>
                    <Text style={styles.warningText}>
                      {incident.evidenceReviewStatus === "resubmitted"
                        ? "The Resident added new photo evidence to the same Case ID. Review the updated attachments above, then Validate or request another clarification."
                        : incident.evidenceRequestReason ||
                          "The resident was asked to provide more evidence."}
                    </Text>
                  </View>
                )}

                {verificationStatus === "rejected" && (
                  <View style={styles.rejectNotice}>
                    <Text style={styles.rejectNoticeTitle}>
                      Dispatch blocked — report rejected
                    </Text>
                    <Text style={styles.rejectNoticeText}>
                      {incident.rejectionReason || "No rejection reason saved."}
                    </Text>
                  </View>
                )}
              </View>

              {detailTab === "response" && (dispatchReady ? (
                <View style={styles.adminSection}>
                  <View style={styles.responseControlHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionEyebrow}>ACTIVE RESPONSE</Text>
                      <Text style={styles.responseControlTitle}>
                        LGU Response Control
                      </Text>
                      <Text style={styles.responseControlSubtitle}>
                        Assign the official LGU response first. Request Volunteer support only when additional qualified help is needed.
                      </Text>
                    </View>

                    <View style={styles.responseStatusPill}>
                      <Text style={styles.responseStatusDot}>●</Text>
                      <Text style={styles.responseStatusText}>
                        {lguFieldReviewPending
                          ? "LGU REPORT PENDING REVIEW"
                          : officialLguResponseStatus === "reviewed" &&
                              incident.status === "in_progress"
                            ? "READY FOR ADMIN DECISION"
                            : incident.status === "validated"
                              ? "READY FOR RESPONSE"
                              : incident.status === "assigned"
                                ? "SUPPORT REQUESTED"
                                : incident.status === "in_progress"
                                  ? "LGU RESPONSE ACTIVE"
                                  : incident.status === "resolved"
                                    ? "RESOLVED"
                                    : "CLOSED"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.responseActionGrid}>
                    <TouchableOpacity
                      disabled={lguFieldReviewPending}
                      style={[
                        styles.assignLguButton,
                        lguFieldReviewPending && styles.disabledButton,
                      ]}
                      onPress={() => setDetailTab("personnel")}
                    >
                      <Text style={styles.assignLguButtonIcon}>♙</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.assignLguButtonTitle}>
                          {lguFieldReviewPending
                            ? "Review LGU Report First"
                            : "Assign LGU Personnel"}
                        </Text>
                        <Text style={styles.assignLguButtonSub}>
                          {lguFieldReviewPending
                            ? "Official field response completed and is awaiting Admin review"
                            : "View official responder / attendance status"}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.supportButton,
                        !volunteerSupportAvailable && styles.supportButtonActive,
                      ]}
                      onPress={() => {
                        setAssignmentCaseId(incident.id);
                        setSkillFilter("");
                        setAvailabilityFilter("");
                        setDetailTab("personnel");
                      }}
                    >
                      <Text style={styles.supportButtonTitle}>
                        {assignmentPanelOpen
                          ? "Hide Volunteer Support"
                          : activeAssignments.length > 0
                            ? "View Volunteer Support"
                            : "Request Volunteer Support"}
                      </Text>
                      <Text style={styles.supportButtonSub}>
                        {activeAssignments.length > 0
                          ? `${activeAssignments.length} active support assignment`
                          : `${eligibleVolunteerCount} eligible candidate${eligibleVolunteerCount === 1 ? "" : "s"}`}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {(lguFieldReportsLoading ||
                    lguFieldReportsError ||
                    latestLguFieldReport ||
                    lguFieldReviewPending) && (
                    <View style={styles.lguOfficialReportSection}>
                      <View style={styles.lguOfficialReportHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lguOfficialReportEyebrow}>
                            OFFICIAL LGU FIELD REPORT
                          </Text>
                          <Text style={styles.lguOfficialReportTitle}>
                            Field Response Review
                          </Text>
                          <Text style={styles.lguOfficialReportSubtitle}>
                            Review the official responder's completed field report before deciding whether the emergency can be resolved or needs follow-up.
                          </Text>
                        </View>

                        <TouchableOpacity
                          disabled={lguFieldReportsLoading}
                          style={[
                            styles.lguReportRefreshButton,
                            lguFieldReportsLoading && styles.disabledButton,
                          ]}
                          onPress={() =>
                            void loadLguFieldReports(incident.id)
                          }
                        >
                          <Text style={styles.lguReportRefreshText}>
                            {lguFieldReportsLoading
                              ? "Loading…"
                              : "Refresh"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {!!lguFieldReportsError && (
                        <View style={styles.lguReportErrorBox}>
                          <Text style={styles.lguReportErrorTitle}>
                            Unable to load official field report
                          </Text>
                          <Text style={styles.lguReportErrorText}>
                            {lguFieldReportsError}
                          </Text>
                        </View>
                      )}

                      {!lguFieldReportsLoading &&
                        !lguFieldReportsError &&
                        lguFieldReviewPending &&
                        !latestLguFieldReport && (
                          <View style={styles.lguReportWaitingBox}>
                            <Text style={styles.lguReportWaitingTitle}>
                              Field report is pending
                            </Text>
                            <Text style={styles.lguReportWaitingText}>
                              The case is marked as awaiting Admin review, but the official field report is not available yet. Refresh this section before taking a final action.
                            </Text>
                          </View>
                        )}

                      {latestLguFieldReport && (() => {
                        const report = latestLguFieldReport;
                        const reviewStatus = String(
                          report.adminReviewStatus || "pending"
                        )
                          .trim()
                          .toLowerCase();
                        const reviewed = reviewStatus === "reviewed";
                        const reviewBusy =
                          busyKey ===
                          `lgu_field_review_${report.id}`;
                        const reviewNote =
                          lguFieldReviewNotes[report.id] ??
                          report.adminReviewNote ??
                          "";
                        const followUpOutcome = [
                          "referred",
                          "needs_follow_up",
                        ].includes(
                          String(report.outcome || "")
                            .trim()
                            .toLowerCase()
                        );

                        return (
                          <View style={styles.lguOfficialReportCard}>
                            <View style={styles.lguOfficialReportTopRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.lguOfficialResponderName}>
                                  {report.personnelName ||
                                    "Official LGU Responder"}
                                </Text>
                                <Text style={styles.lguOfficialResponderMeta}>
                                  {[report.department, report.position]
                                    .filter(Boolean)
                                    .join(" · ") ||
                                    "Official LGU Personnel"}
                                </Text>
                                <Text style={styles.lguOfficialReportMeta}>
                                  Submitted {formatApiDate(report.submittedAt)}
                                  {" · "}Assignment {report.assignmentId}
                                </Text>
                              </View>

                              <View
                                style={[
                                  styles.lguOfficialReviewBadge,
                                  reviewed
                                    ? styles.lguOfficialReviewBadgeDone
                                    : styles.lguOfficialReviewBadgePending,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.lguOfficialReviewBadgeText,
                                    reviewed &&
                                      styles.lguOfficialReviewBadgeTextDone,
                                  ]}
                                >
                                  {reviewed
                                    ? "REVIEWED"
                                    : "PENDING REVIEW"}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.lguOfficialReportGrid}>
                              <View style={styles.lguOfficialReportInfoCard}>
                                <Text style={styles.metaLabel}>
                                  Situation Summary
                                </Text>
                                <Text style={styles.lguOfficialReportValue}>
                                  {report.situationSummary ||
                                    "No situation summary submitted."}
                                </Text>
                              </View>

                              <View style={styles.lguOfficialReportInfoCard}>
                                <Text style={styles.metaLabel}>
                                  Actions Taken
                                </Text>
                                <Text style={styles.lguOfficialReportValue}>
                                  {report.actionsTaken ||
                                    "No response actions recorded."}
                                </Text>
                              </View>

                              <View style={styles.lguOfficialReportInfoCard}>
                                <Text style={styles.metaLabel}>
                                  People Assisted
                                </Text>
                                <Text style={styles.lguOfficialReportValueStrong}>
                                  {report.peopleAssisted}
                                </Text>
                              </View>

                              <View style={styles.lguOfficialReportInfoCard}>
                                <Text style={styles.metaLabel}>
                                  Field Outcome
                                </Text>
                                <Text style={styles.lguOfficialReportValueStrong}>
                                  {lguFieldOutcomeLabel(report.outcome)}
                                </Text>
                              </View>
                            </View>

                            {followUpOutcome && (
                              <View style={styles.lguFollowUpWarning}>
                                <Text style={styles.lguFollowUpWarningTitle}>
                                  Follow-up is still indicated
                                </Text>
                                <Text style={styles.lguFollowUpWarningText}>
                                  The responder marked this field outcome as{" "}
                                  {lguFieldOutcomeLabel(report.outcome)}.
                                  Review the remaining need before resolving the case.
                                </Text>
                              </View>
                            )}

                            {!!report.remainingNeeds && (
                              <View style={styles.lguOfficialNeedsBox}>
                                <Text style={styles.metaLabel}>
                                  REMAINING NEEDS / REFERRAL
                                </Text>
                                <Text style={styles.lguOfficialNeedsText}>
                                  {report.remainingNeeds}
                                </Text>
                              </View>
                            )}

                            {!!report.notes && (
                              <View style={styles.lguOfficialNotesBox}>
                                <Text style={styles.metaLabel}>
                                  ADDITIONAL FIELD NOTES
                                </Text>
                                <Text style={styles.lguOfficialNotesText}>
                                  {report.notes}
                                </Text>
                              </View>
                            )}

                            {!reviewed ? (
                              <View style={styles.lguOfficialReviewArea}>
                                <Text style={styles.controlLabel}>
                                  Admin review note · optional
                                </Text>
                                <TextInput
                                  style={[
                                    styles.input,
                                    styles.lguOfficialReviewInput,
                                  ]}
                                  multiline
                                  maxLength={1500}
                                  value={reviewNote}
                                  placeholder="Record follow-up instructions, verification details, or the basis for the Admin decision…"
                                  placeholderTextColor="#94a3b8"
                                  onChangeText={(value) =>
                                    setLguFieldReviewNotes(
                                      (current) => ({
                                        ...current,
                                        [report.id]: value,
                                      })
                                    )
                                  }
                                />

                                <View style={styles.lguOfficialReviewActions}>
                                  <TouchableOpacity
                                    disabled={reviewBusy}
                                    style={[
                                      styles.lguMarkReviewedButton,
                                      reviewBusy && styles.disabledButton,
                                    ]}
                                    onPress={() =>
                                      void reviewLguFieldReport(report)
                                    }
                                  >
                                    <Text style={styles.primaryButtonText}>
                                      {reviewBusy
                                        ? "Saving Review…"
                                        : "Mark Official Report Reviewed"}
                                    </Text>
                                  </TouchableOpacity>

                                  <Text style={styles.lguReviewDecisionHint}>
                                    Reviewing the report does not close the emergency. After review, choose Resolve Case only if the incident is fully handled.
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <View style={styles.lguReviewedSummary}>
                                <Text style={styles.lguReviewedSummaryTitle}>
                                  ✓ Official report reviewed
                                </Text>
                                <Text style={styles.lguReviewedSummaryText}>
                                  Reviewed {formatApiDate(report.reviewedAt)}.
                                  {report.adminReviewNote
                                    ? ` Admin note: ${report.adminReviewNote}`
                                    : " No additional Admin note was recorded."}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                  )}

                  <View style={styles.responseLifecycleRow}>
                    {["validated", "assigned"].includes(incident.status) && (
                      <TouchableOpacity
                        style={styles.progressButton}
                        onPress={() =>
                          changeCaseStatus(incident, "in_progress")
                        }
                      >
                        <Text style={styles.primaryButtonText}>
                          Start LGU Response
                        </Text>
                      </TouchableOpacity>
                    )}

                    {incident.status === "in_progress" && (
                      <TouchableOpacity
                        disabled={lguFieldReviewPending}
                        style={[
                          styles.resolveButton,
                          lguFieldReviewPending && styles.disabledButton,
                        ]}
                        onPress={() =>
                          changeCaseStatus(incident, "resolved")
                        }
                      >
                        <Text style={styles.primaryButtonText}>
                          {lguFieldReviewPending
                            ? "Review LGU Report First"
                            : "Resolve Case"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {incident.status === "resolved" && (
                      <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => changeCaseStatus(incident, "closed")}
                      >
                        <Text style={styles.primaryButtonText}>Close Case</Text>
                      </TouchableOpacity>
                    )}

                    {incident.status === "closed" && (
                      <View style={styles.closedState}>
                        <Text style={styles.closedStateText}>
                          ✓ Emergency workflow completed
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.coordinationCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coordinationLabel}>
                        Coordination note · optional
                      </Text>
                      <TextInput
                        style={styles.coordinationInput}
                        value={note}
                        multiline
                        placeholder="Add a short LGU coordination note…"
                        placeholderTextColor="#94a3b8"
                        onChangeText={(value) =>
                          setNotes((current) => ({
                            ...current,
                            [incident.id]: value,
                          }))
                        }
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.saveNoteButton}
                      onPress={() => saveAdminNote(incident)}
                    >
                      <Text style={styles.saveNoteButtonText}>Save note</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.dispatchLocked}>
                  <Text style={styles.dispatchLockedTitle}>
                    Response controls locked
                  </Text>
                  <Text style={styles.dispatchLockedText}>
                    Validate the emergency report first. Rejected or unverified reports cannot dispatch Volunteer support.
                  </Text>
                </View>
              ))}

              {false && dispatchReady &&
                (directAssessmentExists ||
                  ["resolved", "closed"].includes(
                    incident.status
                  )) && (
                  <View style={styles.directAssessmentSection}>
                    <View style={styles.escalationSummaryRow}>
                      <View style={styles.reliefSummaryIcon}>
                        <Text style={styles.reliefSummaryIconText}>+</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.sectionEyebrow}>
                          RELIEF DECISION
                        </Text>
                        <Text style={styles.sectionTitle}>
                          Relief Assessment
                        </Text>
                        <Text style={styles.escalationSummaryText}>
                          Use this only when a validated emergency still has a verified material need, such as food, water, clothing, shelter, medical support, or housing-repair materials. Creating a relief need does not automatically create a donation campaign. Relief Operations must check LGU resources first.
                        </Text>
                      </View>

                      {!directAssessmentExists && (
                        <TouchableOpacity
                          disabled={directAssessmentBusy}
                          style={[
                            styles.directAssessmentButton,
                            directAssessmentBusy && styles.disabledButton,
                          ]}
                          onPress={() => openDirectNeedDraft(incident)}
                        >
                          <Text style={styles.directAssessmentButtonText}>
                            {directDraftOpen
                              ? "Cancel Assessment"
                              : "Assess Relief Need"}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {directAssessmentExists ? (
                      <View style={styles.directAssessmentDone}>
                        <Text style={styles.directAssessmentDoneText}>
                          ✓ A verified relief need already exists for this case. Open Relief Operations to check LGU stock, verify beneficiaries, allocate resources, and request Donation Support only if a shortage remains.
                        </Text>
                      </View>
                    ) : (
                      directDraftOpen && (
                        <View style={styles.directFormCard}>
                          <View style={styles.directFormHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.directFormTitle}>
                                LGU Relief Assessment
                              </Text>
                              <Text style={styles.directFormSubtitle}>
                                Confirm the relief scope and record only the material needs that remain after the LGU has verified the situation. A serious single-household case may qualify, while broader incidents use the community scope.
                              </Text>
                            </View>
                            <View style={styles.directFormBadge}>
                              <Text style={styles.directFormBadgeText}>
                                {directDraft.reliefScope === "community"
                                  ? "COMMUNITY RELIEF"
                                  : "HOUSEHOLD RELIEF"}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.reliefPolicyBox}>
                            <Text style={styles.reliefPolicyTitle}>
                              Donation is not automatic
                            </Text>
                            <Text style={styles.reliefPolicyText}>
                              This assessment only confirms that material relief is needed. Relief Operations will check existing LGU stock and resources first. Donation Support should be requested only when a verified shortage remains.
                            </Text>
                          </View>

                          <View style={styles.directGroupCard}>
                            <Text style={styles.directGroupNumber}>1</Text>
                            <View style={styles.directGroupContent}>
                              <Text style={styles.directGroupTitle}>
                                Choose Relief Scope
                              </Text>
                              <Text style={styles.directGroupHint}>
                                Choose whether this verified need is for one household or a wider community. This does not open Donation Support automatically.
                              </Text>

                              <FormSelect
                                label="Relief type"
                                placeholder="Select relief scope"
                                value={directDraft.reliefScope}
                                options={RELIEF_SCOPE_OPTIONS}
                                onSelect={(value) =>
                                  setDirectReliefScope(
                                    incident,
                                    value as ReliefScope
                                  )
                                }
                              />

                              <View style={styles.directInfoStrip}>
                                <Text style={styles.directInfoStripTitle}>
                                  {directDraft.reliefScope === "community"
                                    ? "Community Relief"
                                    : "Household Relief"}
                                </Text>
                                <Text style={styles.directInfoStripText}>
                                  {directDraft.reliefScope === "community"
                                    ? "Use this only when 2 or more households or a broader community-level need were officially verified."
                                    : "Use this for one verified household with serious remaining material needs after the emergency response."}
                                </Text>
                              </View>
                            </View>
                          </View>

                          <View style={styles.directGroupCard}>
                            <Text style={styles.directGroupNumber}>2</Text>
                            <View style={styles.directGroupContent}>
                              <Text style={styles.directGroupTitle}>
                                Confirm Who Needs Help
                              </Text>
                              <Text style={styles.directGroupHint}>
                                Confirm the barangay and the exact number of households and people covered by this verified relief need.
                              </Text>

                              <Text style={styles.directFieldLabel}>
                                Affected barangay
                              </Text>
                              <TextInput
                                style={styles.input}
                                value={directDraft.barangay}
                                maxLength={120}
                                onChangeText={(value) =>
                                  updateDirectNeedDraft(
                                    incident.id,
                                    "barangay",
                                    value
                                  )
                                }
                                placeholder="Verified barangay"
                              />
                              <Text style={styles.directFieldHelp}>
                                Pre-filled from the emergency case. Change it only if LGU verification confirmed a different barangay for this relief assessment.
                              </Text>

                              <View style={styles.directTwoColumn}>
                                <View style={styles.directSmallField}>
                                  <Text style={styles.directFieldLabel}>
                                    Affected households
                                  </Text>
                                  <TextInput
                                    style={[
                                      styles.input,
                                      directDraft.reliefScope === "household" &&
                                        styles.directLockedInput,
                                    ]}
                                    editable={directDraft.reliefScope === "community"}
                                    keyboardType="number-pad"
                                    value={directDraft.affectedHouseholds}
                                    onChangeText={(value) =>
                                      updateDirectNeedDraft(
                                        incident.id,
                                        "affectedHouseholds",
                                        value.replace(/[^0-9]/g, "").slice(0, 7)
                                      )
                                    }
                                    placeholder={
                                      directDraft.reliefScope === "community"
                                        ? "At least 2"
                                        : "1"
                                    }
                                  />
                                  <Text style={styles.directFieldHelp}>
                                    {directDraft.reliefScope === "community"
                                      ? "Enter only the households actually confirmed by LGU/barangay verification."
                                      : "Household Relief is fixed to exactly 1 verified household."}
                                  </Text>
                                </View>

                                <View style={styles.directSmallField}>
                                  <Text style={styles.directFieldLabel}>
                                    Affected people
                                  </Text>
                                  <TextInput
                                    style={styles.input}
                                    keyboardType="number-pad"
                                    value={directDraft.affectedPeople}
                                    onChangeText={(value) =>
                                      updateDirectNeedDraft(
                                        incident.id,
                                        "affectedPeople",
                                        value.replace(/[^0-9]/g, "").slice(0, 8)
                                      )
                                    }
                                    placeholder="Verified people count"
                                  />
                                  <Text style={styles.directFieldHelp}>
                                    Use the verified number of people covered by this relief need.
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>

                          <View style={styles.directGroupCard}>
                            <Text style={styles.directGroupNumber}>3</Text>
                            <View style={styles.directGroupContent}>
                              <Text style={styles.directGroupTitle}>
                                Select What They Still Need
                              </Text>
                              <Text style={styles.directGroupHint}>
                                Select only the material needs that still remain after the immediate emergency response. Choose a category, then enter the verified count. Unselected categories stay at 0.
                              </Text>

                              <Text style={styles.directSubheading}>
                                PEOPLE-BASED NEEDS
                              </Text>
                              <View style={styles.directNeedChoiceRow}>
                                {([
                                  ["peopleNeedingFood", "Food", "people"],
                                  ["peopleNeedingWater", "Water", "people"],
                                  ["peopleNeedingClothing", "Clothing", "people"],
                                  ["peopleNeedingMedical", "Medical", "people"],
                                ] as [
                                  DirectNeedCountField,
                                  string,
                                  "people" | "households"
                                ][]).map(([field, label, basis]) => {
                                  const selected =
                                    Number(directDraft[field] || 0) > 0;

                                  return (
                                    <TouchableOpacity
                                      key={field}
                                      style={[
                                        styles.directNeedChoice,
                                        selected &&
                                          styles.directNeedChoiceActive,
                                      ]}
                                      activeOpacity={0.84}
                                      onPress={() =>
                                        toggleDirectNeedCategory(
                                          incident,
                                          field,
                                          basis
                                        )
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.directNeedChoiceMark,
                                          selected &&
                                            styles.directNeedChoiceMarkActive,
                                        ]}
                                      >
                                        {selected ? "✓" : "+"}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.directNeedChoiceText,
                                          selected &&
                                            styles.directNeedChoiceTextActive,
                                        ]}
                                      >
                                        {label}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>

                              <Text style={styles.directSubheading}>
                                HOUSEHOLD-BASED NEEDS
                              </Text>
                              <View style={styles.directNeedChoiceRow}>
                                {([
                                  [
                                    "householdsNeedingShelter",
                                    "Temporary shelter",
                                    "households",
                                  ],
                                  [
                                    "householdsNeedingHygiene",
                                    "Hygiene kits",
                                    "households",
                                  ],
                                ] as [
                                  DirectNeedCountField,
                                  string,
                                  "people" | "households"
                                ][]).map(([field, label, basis]) => {
                                  const selected =
                                    Number(directDraft[field] || 0) > 0;

                                  return (
                                    <TouchableOpacity
                                      key={field}
                                      style={[
                                        styles.directNeedChoice,
                                        selected &&
                                          styles.directNeedChoiceActive,
                                      ]}
                                      activeOpacity={0.84}
                                      onPress={() =>
                                        toggleDirectNeedCategory(
                                          incident,
                                          field,
                                          basis
                                        )
                                      }
                                    >
                                      <Text
                                        style={[
                                          styles.directNeedChoiceMark,
                                          selected &&
                                            styles.directNeedChoiceMarkActive,
                                        ]}
                                      >
                                        {selected ? "✓" : "+"}
                                      </Text>
                                      <Text
                                        style={[
                                          styles.directNeedChoiceText,
                                          selected &&
                                            styles.directNeedChoiceTextActive,
                                        ]}
                                      >
                                        {label}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>

                              {directNeedReviewRows.length > 0 && (
                                <View style={styles.directSelectedNeedsPanel}>
                                  <Text style={styles.directSelectedNeedsTitle}>
                                    Enter verified counts
                                  </Text>
                                  <Text style={styles.directSelectedNeedsHint}>
                                    Counts cannot exceed the verified people or household totals above.
                                  </Text>

                                  <View style={styles.directNeedGrid}>
                                    {([
                                      ["peopleNeedingFood", "Food", "people"],
                                      ["peopleNeedingWater", "Water", "people"],
                                      ["peopleNeedingClothing", "Clothing", "people"],
                                      ["peopleNeedingMedical", "Medical", "people"],
                                      [
                                        "householdsNeedingShelter",
                                        "Temporary shelter",
                                        "households",
                                      ],
                                      [
                                        "householdsNeedingHygiene",
                                        "Hygiene kits",
                                        "households",
                                      ],
                                    ] as [
                                      DirectNeedCountField,
                                      string,
                                      "people" | "households"
                                    ][])
                                      .filter(
                                        ([field]) =>
                                          Number(directDraft[field] || 0) > 0
                                      )
                                      .map(([field, label, basis]) => (
                                        <View
                                          key={field}
                                          style={styles.directNeedField}
                                        >
                                          <Text style={styles.directNeedLabel}>
                                            {label}
                                          </Text>
                                          <Text style={styles.directNeedUnit}>
                                            {basis === "people"
                                              ? `people · max ${directAffectedPeople || 0}`
                                              : `households · max ${
                                                  directAffectedHouseholds || 0
                                                }`}
                                          </Text>
                                          <TextInput
                                            style={styles.directNeedInput}
                                            keyboardType="number-pad"
                                            value={String(
                                              directDraft[field]
                                            )}
                                            onChangeText={(value) =>
                                              updateDirectNeedDraft(
                                                incident.id,
                                                field,
                                                value
                                                  .replace(/[^0-9]/g, "")
                                                  .slice(0, 8)
                                              )
                                            }
                                            placeholder="0"
                                          />
                                        </View>
                                      ))}
                                  </View>
                                </View>
                              )}

                              <Text style={styles.directFieldLabel}>
                                Other verified material need (optional)
                              </Text>
                              <TextInput
                                style={[styles.input, styles.directNotesInput]}
                                multiline
                                maxLength={1000}
                                value={directDraft.otherNeedDescription}
                                onChangeText={(value) =>
                                  updateDirectNeedDraft(
                                    incident.id,
                                    "otherNeedDescription",
                                    value
                                  )
                                }
                                placeholder="e.g. Roofing sheets, lumber, bedding, baby supplies, transport support, or another verified material need"
                              />
                            </View>
                          </View>

                          <View style={styles.directGroupCard}>
                            <Text style={styles.directGroupNumber}>4</Text>
                            <View style={styles.directGroupContent}>
                              <Text style={styles.directGroupTitle}>
                                Confirm How the Need Was Verified
                              </Text>
                              <Text style={styles.directGroupHint}>
                                Choose the official verification source, then record what the LGU or barangay actually confirmed. This becomes the audit basis used by Relief Operations.
                              </Text>

                              <FormSelect
                                label="How was this need verified?"
                                placeholder="Select verification method"
                                value={directDraft.verificationMethod}
                                options={VERIFICATION_METHOD_OPTIONS}
                                onSelect={(value) => {
                                  updateDirectNeedDraft(
                                    incident.id,
                                    "verificationMethod",
                                    value
                                  );
                                  if (value !== "other") {
                                    updateDirectNeedDraft(
                                      incident.id,
                                      "verificationMethodOther",
                                      ""
                                    );
                                  }
                                }}
                              />

                              {directDraft.verificationMethod === "other" && (
                                <>
                                  <Text style={styles.directFieldLabel}>
                                    Other official verification method
                                  </Text>
                                  <TextInput
                                    style={styles.input}
                                    value={directDraft.verificationMethodOther}
                                    maxLength={160}
                                    onChangeText={(value) =>
                                      updateDirectNeedDraft(
                                        incident.id,
                                        "verificationMethodOther",
                                        value
                                      )
                                    }
                                    placeholder="e.g. City engineering inspection"
                                  />
                                </>
                              )}

                              <Text style={styles.directFieldLabel}>
                                LGU verification note *
                              </Text>
                              <TextInput
                                style={[styles.input, styles.directNotesInput]}
                                multiline
                                maxLength={1200}
                                value={directDraft.adminNote}
                                onChangeText={(value) =>
                                  updateDirectNeedDraft(
                                    incident.id,
                                    "adminNote",
                                    value
                                  )
                                }
                                placeholder={
                                  directDraft.reliefScope === "household"
                                    ? "e.g. The household was inspected after the fire. The roof and essential belongings were damaged, and the listed material needs remain after immediate response."
                                    : "e.g. Barangay and LGU verification confirmed the affected households and the listed remaining needs after initial response."
                                }
                              />
                            </View>
                          </View>

                          <View style={styles.directGroupCard}>
                            <Text style={styles.directGroupNumber}>5</Text>
                            <View style={styles.directGroupContent}>
                              <Text style={styles.directGroupTitle}>
                                Review & Send to Relief Operations
                              </Text>
                              <Text style={styles.directGroupHint}>
                                Check the verified scope, needs, and verification method before creating the official Relief Operations record.
                              </Text>

                              <View style={styles.directReviewCard}>
                                <View style={styles.directReviewHeader}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.directReviewEyebrow}>
                                      READY FOR RELIEF OPERATIONS
                                    </Text>
                                    <Text style={styles.directReviewTitle}>
                                      {directDraft.reliefScope === "community"
                                        ? "Community Relief"
                                        : "Household Relief"}{" "}
                                      — {directDraft.barangay || "Barangay not set"}
                                    </Text>
                                  </View>
                                  <View style={styles.directReviewBadge}>
                                    <Text style={styles.directReviewBadgeText}>
                                      LGU VERIFIED
                                    </Text>
                                  </View>
                                </View>

                                <View style={styles.directReviewStats}>
                                  <View style={styles.directReviewStat}>
                                    <Text style={styles.directReviewStatLabel}>
                                      HOUSEHOLDS
                                    </Text>
                                    <Text style={styles.directReviewStatValue}>
                                      {directAffectedHouseholds || "—"}
                                    </Text>
                                  </View>
                                  <View style={styles.directReviewStat}>
                                    <Text style={styles.directReviewStatLabel}>
                                      PEOPLE
                                    </Text>
                                    <Text style={styles.directReviewStatValue}>
                                      {directAffectedPeople || "—"}
                                    </Text>
                                  </View>
                                  <View style={styles.directReviewStat}>
                                    <Text style={styles.directReviewStatLabel}>
                                      VERIFICATION
                                    </Text>
                                    <Text
                                      style={styles.directReviewStatValueSmall}
                                    >
                                      {directVerificationLabel}
                                    </Text>
                                  </View>
                                </View>

                                <Text style={styles.directReviewSectionLabel}>
                                  REMAINING NEEDS
                                </Text>
                                <View style={styles.directReviewNeedRow}>
                                  {directNeedReviewRows.length > 0 ? (
                                    directNeedReviewRows.map((item) => (
                                      <View
                                        key={item.key}
                                        style={styles.directReviewNeedPill}
                                      >
                                        <Text
                                          style={
                                            styles.directReviewNeedPillText
                                          }
                                        >
                                          {item.label}: {item.value} {item.unit}
                                        </Text>
                                      </View>
                                    ))
                                  ) : (
                                    <Text style={styles.directReviewEmpty}>
                                      No standard need category selected yet.
                                    </Text>
                                  )}
                                  {!!directDraft.otherNeedDescription.trim() && (
                                    <View style={styles.directReviewNeedPill}>
                                      <Text
                                        style={
                                          styles.directReviewNeedPillText
                                        }
                                      >
                                        Other:{" "}
                                        {directDraft.otherNeedDescription.trim()}
                                      </Text>
                                    </View>
                                  )}
                                </View>

                                <View style={styles.directReviewNotice}>
                                  <Text style={styles.directReviewNoticeTitle}>
                                    What happens next?
                                  </Text>
                                  <Text style={styles.directReviewNoticeText}>
                                    This creates a verified relief need only. Relief Operations will check LGU inventory and resources first. Donation Support can be requested later only if a confirmed shortage remains.
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>

                          <View style={styles.directActionBar}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.directActionTitle}>
                                Ready to send this verified need to Relief Operations?
                              </Text>
                              <Text style={styles.directActionHint}>
                                Relief Operations will check LGU stock first, allocate available resources, and open Donation Support only if a verified shortage remains.
                              </Text>
                            </View>
                            <TouchableOpacity
                              disabled={directAssessmentBusy}
                              style={[
                                styles.directSaveButton,
                                directAssessmentBusy && styles.disabledButton,
                              ]}
                              onPress={() => createDirectBarangayNeed(incident)}
                            >
                              <Text style={styles.primaryButtonText}>
                                {directAssessmentBusy
                                  ? "Saving..."
                                  : "Create Verified Relief Need"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )
                    )}
                  </View>
                )}

              {detailTab === "personnel" && (
                <View style={styles.personnelReferenceLayout}>
                  <View style={styles.personnelReferenceMain}>
                    <View style={styles.personnelCleanCard}>
                      <View style={styles.personnelCleanHeader}>
                        <View style={styles.personnelCleanHeaderLeft}>
                          <View style={styles.personnelSectionIconBlue}>
                            <Text style={styles.personnelSectionIconText}>♙</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.personnelCleanTitle}>LGU Primary Responder</Text>
                            <Text style={styles.personnelCleanSubtitle}>
                              Official LGU responders are the main response for this emergency case.
                            </Text>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.personnelCleanStatusPill,
                            !incident.activeLguResponderUid && styles.personnelCleanStatusPillMuted,
                          ]}
                        >
                          <Text
                            style={[
                              styles.personnelCleanStatusText,
                              !incident.activeLguResponderUid && styles.personnelCleanStatusTextMuted,
                            ]}
                          >
                            {incident.activeLguResponderUid ? "ASSIGNED" : "NOT ASSIGNED"}
                          </Text>
                        </View>
                      </View>

                      {incident.activeLguResponderUid ? (
                        <View style={styles.primaryResponderCompactRow}>
                          <View style={styles.personnelAvatarCompact}>
                            <Text style={styles.personnelAvatarCompactText}>
                              {(incident.activeLguResponderName || "LGU")
                                .split(" ")
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase())
                                .join("") || "LG"}
                            </Text>
                          </View>

                          <View style={styles.personnelCompactIdentity}>
                            <View style={styles.personnelCompactNameRow}>
                              <Text style={styles.personnelCompactName}>
                                {incident.activeLguResponderName || "LGU Responder"}
                              </Text>
                              {activeLguProfile?.isTestAccount && (
                                <View style={styles.personnelMiniBadgeBlue}>
                                  <Text style={styles.personnelMiniBadgeBlueText}>TEST</Text>
                                </View>
                              )}
                            </View>

                            <Text style={styles.personnelCompactMeta}>
                              {[activeLguProfile?.department, activeLguProfile?.position]
                                .filter(Boolean)
                                .join(" · ") || "Official LGU responder"}
                            </Text>

                            <View style={styles.personnelCompactChipRow}>
                              <View style={styles.personnelMiniBadgeGood}>
                                <Text style={styles.personnelMiniBadgeGoodText}>
                                  {labelOfStatus(activeLguProfile?.dutyStatus || "on_duty")}
                                </Text>
                              </View>
                              <View style={styles.personnelMiniBadgeGood}>
                                <Text style={styles.personnelMiniBadgeGoodText}>
                                  {activeLguTrackingLabel}
                                </Text>
                              </View>
                              {(activeLguProfile?.capabilities || []).slice(0, 2).map((capability) => (
                                <View
                                  key={`primary_${activeLguProfile?.uid || "lgu"}_${capability}`}
                                  style={styles.personnelSkillPill}
                                >
                                  <Text style={styles.personnelSkillPillText}>{capability}</Text>
                                </View>
                              ))}
                            </View>
                          </View>

                          <TouchableOpacity
                            style={styles.personnelPrimaryAction}
                            onPress={() =>
                              router.push(
                                `/(admin)/admin-live-map?caseId=${encodeURIComponent(incident.id)}` as any
                              )
                            }
                          >
                            <Text style={styles.personnelPrimaryActionText}>View Live Map ↗</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.personnelCleanEmptyRow}>
                          <Text style={styles.personnelCleanEmptyTitle}>No official LGU responder assigned</Text>
                          <Text style={styles.personnelCleanEmptyText}>
                            Assign one verified LGU personnel who is currently On Duty and Available.
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.personnelCleanCard}>
                      <View style={styles.personnelCleanHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.personnelCleanTitleRow}>
                            <Text style={styles.personnelCleanTitle}>On-Duty LGU Personnel</Text>
                            <View style={styles.personnelCountBadge}>
                              <Text style={styles.personnelCountBadgeText}>
                                {lguPersonnel.filter(
                                  (personnel) =>
                                    personnel.uid !== incident.activeLguResponderUid &&
                                    personnel.dutyStatus === "on_duty" &&
                                    personnel.availabilityStatus === "available" &&
                                    !personnel.activeCaseId &&
                                    !personnel.activeAssignmentId,
                                ).length} available
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.personnelCleanSubtitle}>
                            Only verified personnel who are On Duty and Available can be assigned as the official responder.
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.personnelRefreshCompact}
                          disabled={lguPersonnelLoading}
                          onPress={() => void loadLguPersonnel()}
                        >
                          <Text style={styles.personnelRefreshCompactText}>
                            {lguPersonnelLoading ? "Loading…" : "Refresh"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {!!lguPersonnelError && (
                        <View style={styles.lguPersonnelError}>
                          <Text style={styles.lguPersonnelErrorText}>{lguPersonnelError}</Text>
                        </View>
                      )}

                      {lguPersonnelLoading && lguPersonnel.length === 0 ? (
                        <View style={styles.personnelCleanEmptyRow}>
                          <Text style={styles.personnelCleanEmptyTitle}>Loading LGU Personnel…</Text>
                        </View>
                      ) : lguPersonnel.filter(
                          (personnel) =>
                            personnel.uid !== incident.activeLguResponderUid &&
                            personnel.dutyStatus === "on_duty",
                        ).length === 0 ? (
                        <View style={styles.personnelCleanEmptyRow}>
                          <Text style={styles.personnelCleanEmptyTitle}>No other On-Duty LGU personnel</Text>
                          <Text style={styles.personnelCleanEmptyText}>
                            Personnel will appear here after Time In.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.personnelCompactList}>
                          <ListPagination page={Math.max(1, Math.min(personnelPage, Math.ceil(onDutyPersonnel.length / 5) || 1))} total={onDutyPersonnel.length} pageSize={5} onChange={setPersonnelPage} />
                          {pageFive(onDutyPersonnel, personnelPage).map((personnel) => {
                              const assignable =
                                personnel.verificationStatus === "verified" &&
                                personnel.employmentStatus === "active" &&
                                personnel.dutyStatus === "on_duty" &&
                                personnel.availabilityStatus === "available" &&
                                !personnel.activeCaseId &&
                                !personnel.activeAssignmentId;

                              const caseReady =
                                verificationStatus === "validated" &&
                                ["validated", "assigned", "in_progress"].includes(incident.status);
                              const busyId = `${incident.id}_${personnel.uid}`;
                              const disabled =
                                Boolean(incident.activeLguResponderUid) ||
                                !assignable ||
                                !caseReady ||
                                busyKey === busyId;

                              let actionLabel = "Assign";
                              if (busyKey === busyId) actionLabel = "Assigning…";
                              else if (incident.activeLguResponderUid) actionLabel = "Case Assigned";
                              else if (!assignable) actionLabel = "Not Available";
                              else if (!caseReady) actionLabel = "Case Not Ready";

                              return (
                                <View key={personnel.uid} style={styles.personnelCompactRow}>
                                  <View style={styles.personnelAvatarCompact}>
                                    <Text style={styles.personnelAvatarCompactText}>
                                      {personnel.fullName
                                        .split(" ")
                                        .filter(Boolean)
                                        .slice(0, 2)
                                        .map((part) => part[0]?.toUpperCase())
                                        .join("") || "LG"}
                                    </Text>
                                  </View>

                                  <View style={styles.personnelCompactIdentity}>
                                    <View style={styles.personnelCompactNameRow}>
                                      <Text style={styles.personnelCompactName}>{personnel.fullName}</Text>
                                      {personnel.isTestAccount && (
                                        <View style={styles.personnelMiniBadgeBlue}>
                                          <Text style={styles.personnelMiniBadgeBlueText}>TEST</Text>
                                        </View>
                                      )}
                                    </View>
                                    <Text style={styles.personnelCompactMeta}>
                                      {[personnel.department, personnel.position]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </Text>
                                  </View>

                                  <View style={styles.personnelCompactChipRowWide}>
                                    <View style={styles.personnelMiniBadgeGood}>
                                      <Text style={styles.personnelMiniBadgeGoodText}>On Duty</Text>
                                    </View>
                                    <View
                                      style={
                                        personnel.availabilityStatus === "available"
                                          ? styles.personnelMiniBadgeGood
                                          : styles.personnelMiniBadgeMuted
                                      }
                                    >
                                      <Text
                                        style={
                                          personnel.availabilityStatus === "available"
                                            ? styles.personnelMiniBadgeGoodText
                                            : styles.personnelMiniBadgeMutedText
                                        }
                                      >
                                        {labelOfStatus(personnel.availabilityStatus || "unavailable")}
                                      </Text>
                                    </View>
                                    {(personnel.capabilities || []).slice(0, 2).map((capability) => (
                                      <View
                                        key={`${personnel.uid}_${capability}`}
                                        style={styles.personnelSkillPill}
                                      >
                                        <Text style={styles.personnelSkillPillText}>{capability}</Text>
                                      </View>
                                    ))}
                                  </View>

                                  <TouchableOpacity
                                    disabled={disabled}
                                    style={[
                                      styles.personnelAssignCompact,
                                      disabled && styles.personnelAssignCompactDisabled,
                                    ]}
                                    onPress={() => void assignLguPersonnelToCase(incident, personnel)}
                                  >
                                    <Text
                                      style={[
                                        styles.personnelAssignCompactText,
                                        disabled && styles.personnelAssignCompactTextDisabled,
                                      ]}
                                    >
                                      {actionLabel}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              );
                            })}
                        </View>
                      )}
                    </View>

                    <View style={styles.personnelCleanCard}>
                      <View style={styles.personnelCleanHeader}>
                        <View style={styles.personnelCleanHeaderLeft}>
                          <View style={styles.personnelSectionIconPurple}>
                            <Text style={styles.personnelSectionIconText}>♧</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={styles.personnelCleanTitleRow}>
                              <Text style={styles.personnelCleanTitle}>Optional Volunteer Support</Text>
                              <View style={styles.personnelCountBadgePurple}>
                                <Text style={styles.personnelCountBadgePurpleText}>
                                  {eligibleVolunteerCount} eligible
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.personnelCleanSubtitle}>
                              All approved Volunteers are listed, including offline profiles. Local qualified candidates can receive an offer after case verification; Volunteers must accept before responding.
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.personnelBarangayStrip}>
                        <View>
                          <Text style={styles.personnelNeedLabel}>CASE BARANGAY</Text>
                          <Text style={styles.personnelBarangayValue}>
                            {barangayDisplay(caseBarangayValue(incident))}
                          </Text>
                        </View>
                        <Text style={styles.personnelBarangayHint}>
                          Local Volunteers appear first; out-of-barangay profiles are visible but cannot be assigned to this case.
                        </Text>
                      </View>

                      {!volunteerSupportAvailable && (
                        <View style={styles.personnelSupportNotice}>
                          <Text style={styles.personnelSupportNoticeTitle}>
                            One Volunteer support assignment is already active
                          </Text>
                          <Text style={styles.personnelSupportNoticeText}>
                            Finish or cancel it before offering support to another Volunteer. LGU response continues independently.
                          </Text>
                        </View>
                      )}

                      <View style={styles.personnelVolunteerToolbar}>
                        <Text style={styles.personnelListHeading}>
                          Suggested Volunteers ({barangayDisplay(caseBarangayValue(incident))})
                        </Text>

                        <View style={styles.personnelVolunteerFilters}>
                          <TextInput
                            style={styles.personnelCompactFilter}
                            value={skillFilter}
                            placeholder="Search volunteers / skills"
                            placeholderTextColor="#94a3b8"
                            onChangeText={value => { setSkillFilter(value); setVolunteerPage(1); }}
                          />
                          <TextInput
                            style={styles.personnelCompactFilter}
                            value={availabilityFilter}
                            placeholder="Filter availability (optional)"
                            placeholderTextColor="#94a3b8"
                            onChangeText={value => { setAvailabilityFilter(value); setVolunteerPage(1); }}
                          />
                        </View>
                      </View>

                      {!dispatchReady && (
                        <View style={styles.personnelCleanEmptyRow}>
                          <Text style={styles.personnelCleanEmptyTitle}>Review approved volunteers before dispatch</Text>
                          <Text style={styles.personnelCleanEmptyText}>
                            Volunteers remain visible even when offline. Validate this emergency before sending an official support offer.
                          </Text>
                        </View>
                      )}
                      {volunteerCandidates.length === 0 ? (
                        <View style={styles.personnelCleanEmptyRow}>
                          <Text style={styles.personnelCleanEmptyTitle}>
                            {caseBarangayValue(incident)
                              ? `No approved Volunteers in ${barangayDisplay(caseBarangayValue(incident))}`
                              : "Emergency barangay is missing"}
                          </Text>
                          <Text style={styles.personnelCleanEmptyText}>
                            The Resident who filed this emergency is excluded automatically from this pool.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.personnelCompactList}>
                          <ListPagination page={Math.max(1, Math.min(volunteerPage, Math.ceil(volunteerCandidates.length / 5) || 1))} total={volunteerCandidates.length} pageSize={5} onChange={setVolunteerPage} />
                          {pageFive(volunteerCandidates, volunteerPage).map((volunteer) => {
                            const key = `${incident.id}_${volunteer.uid}`;
                            const eligibility = volunteerEligibilityForCase(incident, volunteer);
                            const caseOpenForSupport = ["validated", "assigned", "in_progress"].includes(
                              incident.status,
                            );
                            const disabled =
                              !eligibility.eligible ||
                              !volunteerSupportAvailable ||
                              !caseOpenForSupport ||
                              busyKey === key;
                            const reasonLower = eligibility.reason.toLowerCase();
                            const availabilityText = volunteer.availability.join(" ").toLowerCase();
                            const offline = /offline|unavailable|off.?duty/.test(availabilityText);
                            const availabilityLabel = reasonLower.includes("busy") ? "Busy" :
                              !eligibility.eligible ? "Restricted" :
                              offline ? "Offline · offer allowed" : "Eligible";

                            return (
                              <View key={volunteer.uid} style={styles.personnelCompactRow}>
                                <View style={styles.volunteerAvatarCompact}>
                                  <Text style={styles.volunteerAvatarCompactText}>
                                    {volunteer.fullName
                                      .split(" ")
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .map((part) => part[0]?.toUpperCase())
                                      .join("") || "V"}
                                  </Text>
                                </View>

                                <View style={styles.personnelCompactIdentity}>
                                  <Text style={styles.personnelCompactName}>{volunteer.fullName}</Text>
                                  <Text style={styles.personnelCompactMeta}>
                                    {barangayDisplay(volunteer.barangay)}
                                  </Text>
                                </View>

                                <View style={styles.personnelCompactChipRowWide}>
                                  <View
                                    style={
                                      availabilityLabel === "Available"
                                        ? styles.personnelMiniBadgeGood
                                        : availabilityLabel === "Busy"
                                          ? styles.personnelMiniBadgeBusy
                                          : styles.personnelMiniBadgeMuted
                                    }
                                  >
                                    <Text
                                      style={
                                        availabilityLabel === "Available"
                                          ? styles.personnelMiniBadgeGoodText
                                          : availabilityLabel === "Busy"
                                            ? styles.personnelMiniBadgeBusyText
                                            : styles.personnelMiniBadgeMutedText
                                      }
                                    >
                                      {availabilityLabel}
                                    </Text>
                                  </View>

                                  {volunteer.skills.slice(0, 2).map((skill) => (
                                    <View
                                      key={`${volunteer.uid}_${skill}`}
                                      style={styles.personnelSkillPillBlue}
                                    >
                                      <Text style={styles.personnelSkillPillBlueText}>{skill}</Text>
                                    </View>
                                  ))}
                                </View>

                                <TouchableOpacity
                                  disabled={disabled}
                                  style={[
                                    styles.personnelAssignCompact,
                                    disabled && styles.personnelAssignCompactDisabled,
                                  ]}
                                  onPress={() => assignVolunteerToCase(incident, volunteer)}
                                >
                                  <Text
                                    style={[
                                      styles.personnelAssignCompactText,
                                      disabled && styles.personnelAssignCompactTextDisabled,
                                    ]}
                                  >
                                    {busyKey === key
                                      ? "Sending…"
                                      : eligibility.eligible && volunteerSupportAvailable && caseOpenForSupport
                                        ? "Offer Support"
                                        : "Not Eligible"}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      <View style={styles.personnelSupportDivider} />

                      <View style={styles.personnelActiveSupportHeader}>
                        <Text style={styles.personnelListHeading}>Assigned Volunteer Support</Text>
                        <View style={styles.personnelCountBadgeMuted}>
                          <Text style={styles.personnelCountBadgeMutedText}>{activeAssignments.length}</Text>
                        </View>
                      </View>

                      {activeAssignments.length === 0 ? (
                        <View style={styles.personnelSupportEmpty}>
                          <Text style={styles.personnelSupportEmptyIcon}>♧</Text>
                          <View>
                            <Text style={styles.personnelCleanEmptyTitle}>No Volunteer support assigned yet</Text>
                            <Text style={styles.personnelCleanEmptyText}>
                              Send a support offer to an approved, qualified local Volunteer, even when offline. The Volunteer must accept to respond.
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.personnelCompactList}>
                          <ListPagination page={Math.max(1, Math.min(activeAssignmentPage, Math.ceil(activeAssignments.length / 5) || 1))} total={activeAssignments.length} pageSize={5} onChange={setActiveAssignmentPage} />
                          {pageFive(activeAssignments, activeAssignmentPage).map((assignment) => {
                            const currentVolunteer = approvedVolunteers.find(
                              (item) => item.uid === assignment.volunteerId,
                            );
                            const displayName =
                              currentVolunteer?.fullName || assignment.volunteerName || "Volunteer";

                            return (
                              <View key={assignment.id} style={styles.personnelActiveSupportRow}>
                                <View style={styles.volunteerAvatarCompact}>
                                  <Text style={styles.volunteerAvatarCompactText}>
                                    {displayName
                                      .split(" ")
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .map((part) => part[0]?.toUpperCase())
                                      .join("") || "V"}
                                  </Text>
                                </View>

                                <View style={styles.personnelCompactIdentity}>
                                  <Text style={styles.personnelCompactName}>{displayName}</Text>
                                  <Text style={styles.personnelCompactMeta}>
                                    {currentVolunteer?.barangay
                                      ? barangayDisplay(currentVolunteer.barangay)
                                      : `Updated ${formatDate(assignment.updatedAt)}`}
                                  </Text>
                                </View>

                                <View style={[styles.assignmentStatus, statusStyle(String(assignment.status))]}>
                                  <Text style={styles.badgeText}>
                                    {labelOfStatus(String(assignment.status))}
                                  </Text>
                                </View>

                                {!["completed"].includes(String(assignment.status)) && (
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
                  </View>

                </View>
              )}

              {detailTab === "history" && (
                <View style={styles.historyPanel}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>CASE HISTORY</Text>
                      <Text style={styles.sectionTitle}>Emergency Activity Timeline</Text>
                    </View>
                  </View>

                  {[
                    ["Report submitted", incident.createdAt],
                    ["Report validated", incident.validatedAt],
                    ["Responder assigned / response updated", incident.assignedAt],
                    ["Case resolved", incident.resolvedAt],
                    ["Case closed", incident.closedAt],
                  ].filter(([, when]) => Boolean(when)).map(([label, when], index) => (
                    <View key={`${label}-${index}`} style={styles.historyRow}>
                      <View style={styles.historyDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle}>{String(label)}</Text>
                        <Text style={styles.historyTime}>{formatDate(when)}</Text>
                      </View>
                    </View>
                  ))}

                  {incidentAssignments.length > 0 && (
                    <View style={styles.historyAssignments}>
                      <Text style={styles.overviewLabel}>Volunteer support history</Text>
                      <ListPagination page={Math.max(1, Math.min(historyAssignmentPage, Math.ceil(incidentAssignments.length / 5) || 1))} total={incidentAssignments.length} pageSize={5} onChange={setHistoryAssignmentPage} />
                      {pageFive(incidentAssignments, historyAssignmentPage).map((assignment) => (
                        <View key={assignment.id} style={styles.historyAssignmentRow}>
                          <Text style={styles.historyAssignmentName}>
                            {assignment.volunteerName || "Volunteer"}
                          </Text>
                          <Text style={styles.historyAssignmentStatus}>
                            {labelOfStatus(String(assignment.status))}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}


              {false && incidentFieldReports.length > 0 && (
                <View style={styles.fieldReportsSection}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionEyebrow}>
                        VOLUNTEER → LGU FIELD REPORT
                      </Text>
                      <Text style={styles.sectionTitle}>
                        Ground Situation & Remaining Needs
                      </Text>
                    </View>

                    <Text style={styles.volunteerCount}>
                      {incidentFieldReports.length} report
                      {incidentFieldReports.length === 1 ? "" : "s"}
                    </Text>
                  </View>

                  <View style={styles.fieldAuthorityNotice}>
                    <Text style={styles.fieldAuthorityTitle}>
                      Volunteer reports are operational input — not final LGU findings.
                    </Text>
                    <Text style={styles.fieldAuthorityText}>
                      Admin/LGU reviews the on-ground report first. Only verified remaining
                      needs are incorporated into an official Community Relief assessment.
                    </Text>
                  </View>

                  {incidentFieldReports.map((report) => {
                    const reportStatus = String(report.reportStatus || "submitted");
                    const noteValue =
                      fieldReportNotes[report.id] ?? report.adminReviewNote ?? "";
                    const canReview = ["submitted", "reviewed"].includes(
                      reportStatus
                    );
                    const draftOpen = needDraftReportId === report.id;
                    const draft =
                      needDrafts[report.id] || emptyNeedDraft(incident, report);
                    const reviewBusy =
                      busyKey === `field_reviewed_${report.id}` ||
                      busyKey === `field_dismissed_${report.id}` ||
                      busyKey === `incorporate_${report.id}`;

                    return (
                      <View key={report.id} style={styles.fieldReportCard}>
                        <View style={styles.fieldReportTopRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.fieldVolunteerName}>
                              {report.volunteerName || "Volunteer"}
                            </Text>
                            <Text style={styles.fieldReportMeta}>
                              Submitted {formatDate(report.createdAt)} · Assignment {report.assignmentId}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.fieldReportStatus,
                              reportStatus === "incorporated"
                                ? styles.fieldStatusIncorporated
                                : reportStatus === "dismissed"
                                ? styles.fieldStatusDismissed
                                : reportStatus === "reviewed"
                                ? styles.fieldStatusReviewed
                                : styles.fieldStatusSubmitted,
                            ]}
                          >
                            <Text style={styles.fieldReportStatusText}>
                              {labelOfStatus(reportStatus)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.fieldReportGrid}>
                          <View style={styles.fieldReportInfoCard}>
                            <Text style={styles.metaLabel}>Situation Observed</Text>
                            <Text style={styles.fieldReportValue}>
                              {report.situationSummary || "No situation summary."}
                            </Text>
                          </View>

                          <View style={styles.fieldReportInfoCard}>
                            <Text style={styles.metaLabel}>Assistance Provided</Text>
                            <Text style={styles.fieldReportValue}>
                              {report.assistanceProvided || "No assistance summary."}
                            </Text>
                          </View>

                          <View style={styles.fieldReportInfoCard}>
                            <Text style={styles.metaLabel}>People Helped</Text>
                            <Text style={styles.fieldReportValue}>
                              {report.peopleHelped}
                            </Text>
                          </View>

                          <View style={styles.fieldReportInfoCard}>
                            <Text style={styles.metaLabel}>LGU Follow-up</Text>
                            <Text style={styles.fieldReportValue}>
                              {report.lguFollowUpRequired ? "Required" : "Not flagged"}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.remainingNeedsBox}>
                          <Text style={styles.metaLabel}>REPORTED REMAINING NEEDS</Text>
                          <Text style={styles.remainingNeedsText}>
                            {report.remainingNeeds.length
                              ? report.remainingNeeds.join(" · ")
                              : "No category selected"}
                          </Text>
                          {!!report.remainingNeedsNote && (
                            <Text style={styles.remainingNeedsNote}>
                              {report.remainingNeedsNote}
                            </Text>
                          )}
                        </View>

                        {canReview && (
                          <>
                            <Text style={styles.controlLabel}>LGU/Admin review note</Text>
                            <TextInput
                              style={[styles.input, styles.fieldReviewInput]}
                              multiline
                              maxLength={1500}
                              value={noteValue}
                              placeholder="Verification note, field coordination, or reason for dismissal…"
                              onChangeText={(value) =>
                                setFieldReportNotes((current) => ({
                                  ...current,
                                  [report.id]: value,
                                }))
                              }
                            />

                            <View style={styles.fieldReportActions}>
                              {reportStatus === "submitted" && (
                                <TouchableOpacity
                                  disabled={reviewBusy}
                                  style={[
                                    styles.reviewFieldButton,
                                    reviewBusy && styles.disabledButton,
                                  ]}
                                  onPress={() =>
                                    reviewVolunteerFieldReport(report, "reviewed")
                                  }
                                >
                                  <Text style={styles.primaryButtonText}>
                                    Mark Reviewed
                                  </Text>
                                </TouchableOpacity>
                              )}

                              <TouchableOpacity
                                disabled={reviewBusy}
                                style={[
                                  styles.incorporateButton,
                                  reviewBusy && styles.disabledButton,
                                ]}
                                onPress={() => openNeedDraft(incident, report)}
                              >
                                <Text style={styles.incorporateButtonText}>
                                  {draftOpen
                                    ? "Hide Community Relief Form"
                                    : "Prepare Community Relief"}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                disabled={reviewBusy}
                                style={[
                                  styles.dismissFieldButton,
                                  reviewBusy && styles.disabledButton,
                                ]}
                                onPress={() =>
                                  reviewVolunteerFieldReport(report, "dismissed")
                                }
                              >
                                <Text style={styles.dismissFieldButtonText}>
                                  Dismiss
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}

                        {draftOpen && canReview && (
                          <View style={styles.needAssessmentPanel}>
                            <Text style={styles.needAssessmentEyebrow}>
                              LGU VERIFIED COMMUNITY RELIEF
                            </Text>
                            <Text style={styles.needAssessmentTitle}>
                              {incident.reporterBarangay || report.barangay || "Barangay"}
                            </Text>
                            <Text style={styles.needAssessmentHint}>
                              Do not copy the Volunteer report blindly. Enter only quantities
                              verified by LGU/Admin assessment.
                            </Text>

                            <View style={styles.needInputGrid}>
                              <View style={styles.needInputBlock}>
                                <Text style={styles.controlLabel}>Affected households *</Text>
                                <TextInput
                                  style={styles.input}
                                  keyboardType="number-pad"
                                  value={draft.affectedHouseholds}
                                  onChangeText={(value) =>
                                    updateNeedDraft(
                                      report.id,
                                      "affectedHouseholds",
                                      value.replace(/[^0-9]/g, "").slice(0, 7)
                                    )
                                  }
                                  placeholder="e.g. 12"
                                />
                              </View>

                              <View style={styles.needInputBlock}>
                                <Text style={styles.controlLabel}>Affected people *</Text>
                                <TextInput
                                  style={styles.input}
                                  keyboardType="number-pad"
                                  value={draft.affectedPeople}
                                  onChangeText={(value) =>
                                    updateNeedDraft(
                                      report.id,
                                      "affectedPeople",
                                      value.replace(/[^0-9]/g, "").slice(0, 8)
                                    )
                                  }
                                  placeholder="e.g. 48"
                                />
                              </View>

                              {([
                                ["peopleNeedingFood", "People needing food"],
                                ["peopleNeedingWater", "People needing water"],
                                ["peopleNeedingClothing", "People needing clothing"],
                                ["peopleNeedingMedical", "People needing medical support"],
                                ["householdsNeedingShelter", "Households needing shelter"],
                                ["householdsNeedingHygiene", "Households needing hygiene kits"],
                              ] as [keyof BarangayNeedDraft, string][]).map(
                                ([field, label]) => (
                                  <View key={field} style={styles.needInputBlock}>
                                    <Text style={styles.controlLabel}>{label}</Text>
                                    <TextInput
                                      style={styles.input}
                                      keyboardType="number-pad"
                                      value={draft[field]}
                                      onChangeText={(value) =>
                                        updateNeedDraft(
                                          report.id,
                                          field,
                                          value.replace(/[^0-9]/g, "").slice(0, 8)
                                        )
                                      }
                                      placeholder="0"
                                    />
                                  </View>
                                )
                              )}
                            </View>

                            <Text style={styles.controlLabel}>Other verified need / details</Text>
                            <TextInput
                              style={[styles.input, styles.needMultiline]}
                              multiline
                              maxLength={1000}
                              value={draft.otherNeedDescription}
                              onChangeText={(value) =>
                                updateNeedDraft(
                                  report.id,
                                  "otherNeedDescription",
                                  value
                                )
                              }
                              placeholder="Other verified recovery need, item details, or special requirement…"
                            />

                            <Text style={styles.controlLabel}>LGU assessment note</Text>
                            <TextInput
                              style={[styles.input, styles.needMultiline]}
                              multiline
                              maxLength={1500}
                              value={draft.adminNote}
                              onChangeText={(value) =>
                                updateNeedDraft(report.id, "adminNote", value)
                              }
                              placeholder="How LGU verified these quantities…"
                            />

                            <TouchableOpacity
                              disabled={reviewBusy}
                              style={[
                                styles.saveBarangayNeedButton,
                                reviewBusy && styles.disabledButton,
                              ]}
                              onPress={() =>
                                incorporateFieldReportIntoBarangayNeeds(
                                  incident,
                                  report
                                )
                              }
                            >
                              <Text style={styles.primaryButtonText}>
                                Verify & Add to Community Relief
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {reportStatus === "incorporated" && (
                          <View style={styles.fieldFinalNotice}>
                            <Text style={styles.fieldFinalNoticeText}>
                              ✓ LGU verified and incorporated this report into Community Relief.
                            </Text>
                          </View>
                        )}

                        {reportStatus === "dismissed" && (
                          <View style={styles.fieldDismissedNotice}>
                            <Text style={styles.fieldDismissedNoticeText}>
                              This field report was reviewed but not incorporated into official Community Relief.
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

          </View>
        </View>
      )}
    </ScrollView>
  );

}

function FormSelect({
  label,
  placeholder,
  value,
  options,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);

  return (
    <View style={styles.formSelectWrap}>
      <Text style={styles.directFieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.formSelectButton,
          open && styles.formSelectButtonOpen,
        ]}
        activeOpacity={0.84}
        onPress={() => setOpen((current) => !current)}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.formSelectValue,
              !selected && styles.formSelectPlaceholder,
            ]}
          >
            {selected?.label || placeholder}
          </Text>
          {!!selected?.description && (
            <Text style={styles.formSelectDescription}>
              {selected.description}
            </Text>
          )}
        </View>
        <Text style={styles.formSelectChevron}>
          {open ? "⌃" : "⌄"}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.formSelectMenu}>
          {options.map((option) => {
            const active = option.value === value;

            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.formSelectOption,
                  active && styles.formSelectOptionActive,
                ]}
                activeOpacity={0.82}
                onPress={() => {
                  onSelect(option.value);
                  setOpen(false);
                }}
              >
                <View style={styles.formSelectOptionMark}>
                  <Text
                    style={[
                      styles.formSelectOptionMarkText,
                      active && styles.formSelectOptionMarkTextActive,
                    ]}
                  >
                    {active ? "✓" : ""}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.formSelectOptionLabel,
                      active && styles.formSelectOptionLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {!!option.description && (
                    <Text style={styles.formSelectOptionDescription}>
                      {option.description}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F6F8F7",
    scrollbarWidth: "thin",
    scrollbarColor: "#8CAA9A #F6F8F7",
  } as any,
  container: {
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 22,
  },
  center: {
    flex: 1,
    minHeight: 520,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F6F8F7",
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
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 14,
  },
  eyebrow: {
    color: "#078f82",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    maxWidth: 760,
    color: "#64748b",
    fontSize: 13.5,
    lineHeight: 20,
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
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
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

  headerTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchBox: {
    width: 300,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 12,
  },
  searchIcon: {
    color: "#64748b",
    fontSize: 20,
    fontWeight: "700",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#0f172a",
    fontSize: 13,
  },

  hiddenSection: {
    display: "none",
  },
  caseHeaderHidden: {
    display: "none",
  },
  detailTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e8eef4",
    backgroundColor: "#ffffff",
  },
  detailTabButton: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  detailTabButtonActive: {
    borderBottomColor: "#2563eb",
  },
  detailTabText: {
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "800",
  },
  detailTabTextActive: {
    color: "#1d4ed8",
  },
  overviewDashboard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 12,
    paddingBottom: 0,
  },
  overviewCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 210,
    borderWidth: 1,
    borderColor: "#e3eaf0",
    borderRadius: 11,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  overviewCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 10,
  },
  overviewCardIcon: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "900",
  },
  overviewCardTitle: {
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "900",
  },
  overviewPrimary: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  overviewLine: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 10.5,
    lineHeight: 16,
  },
  overviewVerifiedPill: {
    alignSelf: "flex-start",
    marginTop: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#eafaf4",
  },
  overviewVerifiedText: {
    color: "#0f766e",
    fontSize: 9.5,
    fontWeight: "800",
  },
  statusTimelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 5,
  },
  statusTimelineDot: {
    width: 9,
    height: 9,
    marginTop: 3,
    borderRadius: 99,
    borderWidth: 2,
  },
  statusTimelineDotDone: {
    backgroundColor: "#0f9f84",
    borderColor: "#0f9f84",
  },
  statusTimelineDotPending: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
  },
  statusTimelineLabel: {
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "700",
  },
  statusTimelineLabelDone: {
    color: "#0f172a",
    fontWeight: "800",
  },
  statusTimelineTime: {
    marginTop: 1,
    color: "#94a3b8",
    fontSize: 8.5,
  },
  priorityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  priorityPeople: {
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "800",
  },
  overviewLabel: {
    marginTop: 11,
    color: "#64748b",
    fontSize: 9.5,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  needChipRow: {
    marginTop: 7,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  needChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  needChipText: {
    color: "#475569",
    fontSize: 9.5,
    fontWeight: "700",
  },
  overviewDescription: {
    marginTop: 6,
    color: "#475569",
    fontSize: 10.5,
    lineHeight: 16,
  },
  assignLguButton: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0f766e",
  },
  assignLguButtonIcon: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  assignLguButtonTitle: {
    color: "#ffffff",
    fontSize: 12.5,
    fontWeight: "900",
  },
  assignLguButtonSub: {
    marginTop: 2,
    color: "#ccfbf1",
    fontSize: 9.5,
  },
  personnelCleanWorkspace: {
    gap: 12,
    padding: 12,
  },
  personnelReferenceLayout: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  personnelReferenceMain: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    gap: 8,
  },
  personnelReferenceAside: {
    width: 365,
    flexShrink: 0,
    gap: 12,
  },
  personnelCleanCard: {
    width: "100%",
    padding: 8,
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },
  personnelCleanHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  personnelCleanHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  personnelSectionIconBlue: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  personnelSectionIconPurple: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5b4fe8",
  },
  personnelSectionIconText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  personnelCleanTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  personnelCleanTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  personnelCleanSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 8.4,
    lineHeight: 12,
  },
  personnelCleanStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ecfdf5",
  },
  personnelCleanStatusPillMuted: {
    backgroundColor: "#f1f5f9",
  },
  personnelCleanStatusText: {
    color: "#047857",
    fontSize: 8,
    fontWeight: "900",
  },
  personnelCleanStatusTextMuted: {
    color: "#64748b",
  },
  primaryResponderCompactRow: {
    width: "100%",
    marginTop: 8,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#cfe8e1",
    borderRadius: 9,
    backgroundColor: "#f5fffb",
  },
  personnelAvatarCompact: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dbeafe",
  },
  personnelAvatarCompactText: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "900",
  },
  volunteerAvatarCompact: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ede9fe",
  },
  volunteerAvatarCompactText: {
    color: "#6d28d9",
    fontSize: 9.5,
    fontWeight: "900",
  },
  personnelCompactIdentity: {
    flex: 1,
    minWidth: 118,
    alignItems: "flex-start",
  },
  personnelCompactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  personnelCompactName: {
    color: "#0f172a",
    fontSize: 9.4,
    fontWeight: "900",
    textAlign: "left",
  },
  personnelCompactMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 7.7,
    lineHeight: 11,
    textAlign: "left",
  },
  personnelCompactChipRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 4,
  },
  personnelCompactChipRowWide: {
    flex: 1,
    minWidth: 125,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 4,
  },
  personnelMiniBadgeGood: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#e6f8f1",
  },
  personnelMiniBadgeGoodText: {
    color: "#087f5b",
    fontSize: 7.5,
    fontWeight: "900",
  },
  personnelMiniBadgeBusy: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#fff1e7",
  },
  personnelMiniBadgeBusyText: {
    color: "#c2410c",
    fontSize: 7.5,
    fontWeight: "900",
  },
  personnelMiniBadgeMuted: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  personnelMiniBadgeMutedText: {
    color: "#64748b",
    fontSize: 7.5,
    fontWeight: "900",
  },
  personnelMiniBadgeBlue: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
  },
  personnelMiniBadgeBlueText: {
    color: "#4338ca",
    fontSize: 7,
    fontWeight: "900",
  },
  personnelSkillPill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "#f1f5f9",
  },
  personnelSkillPillText: {
    color: "#475569",
    fontSize: 7.4,
    fontWeight: "800",
  },
  personnelSkillPillBlue: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "#eff6ff",
  },
  personnelSkillPillBlueText: {
    color: "#2563eb",
    fontSize: 7.4,
    fontWeight: "800",
  },
  personnelPrimaryAction: {
    width: 84,
    minHeight: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 7,
    backgroundColor: "#2563eb",
  },
  personnelPrimaryActionText: {
    color: "#ffffff",
    fontSize: 7.2,
    fontWeight: "900",
  },
  personnelCleanEmptyRow: {
    marginTop: 9,
    paddingHorizontal: 11,
    paddingVertical: 11,
    borderRadius: 9,
    backgroundColor: "#f8fafc",
  },
  personnelCleanEmptyTitle: {
    color: "#334155",
    fontSize: 9.8,
    fontWeight: "900",
  },
  personnelCleanEmptyText: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 8.7,
    lineHeight: 13,
  },
  personnelCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
  },
  personnelCountBadgeText: {
    color: "#4338ca",
    fontSize: 7.5,
    fontWeight: "900",
  },
  personnelCountBadgePurple: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#f3e8ff",
  },
  personnelCountBadgePurpleText: {
    color: "#7e22ce",
    fontSize: 7.5,
    fontWeight: "900",
  },
  personnelCountBadgeMuted: {
    minWidth: 24,
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  personnelCountBadgeMutedText: {
    color: "#64748b",
    fontSize: 7.5,
    fontWeight: "900",
  },
  personnelRefreshCompact: {
    minHeight: 31,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  personnelRefreshCompactText: {
    color: "#0f766e",
    fontSize: 8.2,
    fontWeight: "900",
  },
  personnelNeedStrip: {
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 9,
    backgroundColor: "#f8fbff",
  },
  personnelNeedLabel: {
    color: "#94a3b8",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  personnelNeedValue: {
    marginTop: 3,
    color: "#1e3a8a",
    fontSize: 9.2,
    fontWeight: "900",
  },
  personnelCompactList: {
    marginTop: 7,
    width: "100%",
    borderWidth: 1,
    borderColor: "#edf1f5",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  personnelCompactRow: {
    width: "100%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f5",
    backgroundColor: "#ffffff",
  },
  personnelAssignCompact: {
    minWidth: 105,
    minHeight: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 7,
    backgroundColor: "#0f8f80",
  },
  personnelAssignCompactDisabled: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  personnelAssignCompactText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  personnelAssignCompactTextDisabled: {
    color: "#94a3b8",
  },
  personnelBarangayStrip: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#f0fdf9",
    borderWidth: 1,
    borderColor: "#ccfbf1",
  },
  personnelBarangayValue: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 10.5,
    fontWeight: "900",
  },
  personnelBarangayHint: {
    color: "#0f766e",
    fontSize: 10.5,
    fontWeight: "600",
  },
  personnelSupportNotice: {
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  personnelSupportNoticeTitle: {
    color: "#1d4ed8",
    fontSize: 9.3,
    fontWeight: "900",
  },
  personnelSupportNoticeText: {
    marginTop: 2,
    color: "#475569",
    fontSize: 8.2,
    lineHeight: 12,
  },
  personnelVolunteerToolbar: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  personnelListHeading: {
    color: "#0f172a",
    fontSize: 10.2,
    fontWeight: "900",
  },
  personnelVolunteerFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  personnelCompactFilter: {
    width: 154,
    minHeight: 36,
    borderWidth: 1,
    borderColor: "#d9e1e8",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    color: "#0f172a",
    backgroundColor: "#ffffff",
    fontSize: 10.5,
  },
  personnelSupportDivider: {
    marginTop: 11,
    marginBottom: 10,
    height: 1,
    backgroundColor: "#edf1f5",
  },
  personnelActiveSupportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  personnelSupportEmpty: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 9,
    backgroundColor: "#fbfcfd",
  },
  personnelSupportEmptyIcon: {
    color: "#94a3b8",
    fontSize: 22,
    fontWeight: "900",
  },
  personnelActiveSupportRow: {
    width: "100%",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f5",
    backgroundColor: "#fcfbff",
  },
  personnelAsideCard: {
    width: "100%",
    padding: 13,
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  personnelAsideTitle: {
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "900",
  },
  personnelAsideHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  personnelAsideMiniStatus: {
    color: "#0f766e",
    fontSize: 7.5,
    fontWeight: "900",
  },
  personnelAsideCaseTop: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  personnelAsideSplit: {
    marginTop: 9,
    flexDirection: "row",
    gap: 10,
  },
  personnelAsideLabel: {
    marginTop: 9,
    color: "#64748b",
    fontSize: 7.8,
    fontWeight: "800",
  },
  personnelAsideValue: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  personnelAsideStrong: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 10.8,
    fontWeight: "900",
  },
  personnelAsideMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 8.5,
  },
  personnelAsideThumb: {
    width: 96,
    height: 72,
    borderRadius: 9,
    backgroundColor: "#e8eef2",
  },
  personnelAsideThumbFallback: {
    width: 96,
    height: 72,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf2f7",
  },
  personnelAsideThumbFallbackText: {
    fontSize: 24,
  },
  personnelAsideSeverityPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  personnelMiniMap: {
    marginTop: 10,
    minHeight: 122,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dce5ec",
    backgroundColor: "#f3f7f9",
  },
  personnelMiniMapPin: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#fee2e2",
  },
  personnelMiniMapPinText: {
    color: "#dc2626",
    fontSize: 18,
    fontWeight: "900",
  },
  personnelMiniMapLocation: {
    marginTop: 8,
    color: "#0f172a",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  personnelMiniMapSub: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 8,
  },
  personnelAsideActionRow: {
    marginTop: 9,
    flexDirection: "row",
    gap: 7,
  },
  personnelAsidePrimaryButton: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#0f8f80",
  },
  personnelAsidePrimaryButtonText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "900",
  },
  personnelAsideSecondaryButton: {
    minWidth: 100,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  personnelAsideSecondaryButtonText: {
    color: "#2563eb",
    fontSize: 8,
    fontWeight: "900",
  },
  personnelTimelineRow: {
    minHeight: 42,
    flexDirection: "row",
    gap: 10,
  },
  personnelTimelineRail: {
    width: 14,
    alignItems: "center",
  },
  personnelTimelineDot: {
    width: 10,
    height: 10,
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  personnelTimelineDotDone: {
    borderColor: "#0f8f80",
    backgroundColor: "#0f8f80",
  },
  personnelTimelineLine: {
    width: 2,
    flex: 1,
    marginTop: 2,
    backgroundColor: "#e2e8f0",
  },
  personnelTimelineLineDone: {
    backgroundColor: "#99f6e4",
  },
  personnelTimelineBody: {
    flex: 1,
    paddingBottom: 7,
  },
  personnelTimelineLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
  },
  personnelTimelineLabelDone: {
    color: "#0f172a",
  },
  personnelTimelineTime: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 7.7,
  },

  personnelWorkspace: {
    gap: 12,
    padding: 12,
  },
  personnelOverviewStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#dbe5ea",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
  },
  personnelOverviewItem: {
    flexGrow: 1,
    flexBasis: 155,
    minWidth: 135,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  personnelOverviewLabel: {
    color: "#94a3b8",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  personnelOverviewValue: {
    marginTop: 3,
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "800",
  },
  personnelVolunteerButton: {
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#eef2ff",
  },
  personnelVolunteerButtonText: {
    color: "#4338ca",
    fontSize: 9.2,
    fontWeight: "900",
  },
  personnelPanel: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 11,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  attendancePanel: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 11,
    backgroundColor: "#ffffff",
    padding: 12,
  },
  lguRefreshButton: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  lguRefreshButtonText: {
    color: "#0f766e",
    fontSize: 9.5,
    fontWeight: "900",
  },
  lguPersonnelError: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 9,
    backgroundColor: "#fef2f2",
  },
  lguPersonnelErrorText: {
    color: "#b91c1c",
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  lguCandidateList: {
    marginTop: 10,
    gap: 8,
  },
  lguCandidateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  lguCandidateRowAvailable: {
    borderColor: "#9bd9ca",
    backgroundColor: "#f8fffd",
  },
  lguCandidateBody: {
    flex: 1,
    minWidth: 180,
  },
  lguCandidateTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  lguCandidateNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  lguTestBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
  },
  lguTestBadgeText: {
    color: "#4338ca",
    fontSize: 7.5,
    fontWeight: "900",
  },
  lguCapabilityText: {
    marginTop: 4,
    color: "#475569",
    fontSize: 8.8,
    lineHeight: 13,
  },
  lguFieldRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  lguFieldBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  lguFieldBadgeText: {
    color: "#1d4ed8",
    fontSize: 8.2,
    fontWeight: "900",
    letterSpacing: 0.25,
  },
  lguEmployeeIdText: {
    color: "#64748b",
    fontSize: 8.8,
    fontWeight: "800",
  },
  lguProfileGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  lguProfileItem: {
    flexGrow: 1,
    flexBasis: 120,
    minWidth: 105,
    padding: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  lguProfileLabel: {
    color: "#94a3b8",
    fontSize: 7.4,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  lguProfileValue: {
    marginTop: 3,
    color: "#0f172a",
    fontSize: 9.5,
    fontWeight: "800",
    lineHeight: 13,
  },
  lguSkillsSection: {
    marginTop: 10,
  },
  lguSkillChips: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  lguSkillChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#eefbf7",
    borderWidth: 1,
    borderColor: "#c7eadf",
  },
  lguSkillChipText: {
    color: "#0f766e",
    fontSize: 7.8,
    fontWeight: "800",
  },
  lguNoSkillsText: {
    marginTop: 5,
    color: "#94a3b8",
    fontSize: 8.6,
    fontWeight: "700",
  },
  lguActionButton: {
    minWidth: 96,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
  },
  lguActionButtonReady: {
    borderColor: "#0f766e",
    backgroundColor: "#0f766e",
  },
  lguActionButtonAssigned: {
    borderColor: "#bbf7d0",
    backgroundColor: "#ecfdf5",
  },
  lguActionButtonBlocked: {
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  lguActionButtonText: {
    fontSize: 8.8,
    fontWeight: "900",
  },
  lguActionButtonTextReady: {
    color: "#ffffff",
  },
  lguActionButtonTextAssigned: {
    color: "#047857",
  },
  lguActionButtonTextBlocked: {
    color: "#94a3b8",
  },
  lguStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
  },
  lguStatusChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  lguStatusChipGood: {
    backgroundColor: "#dcfce7",
  },
  lguStatusChipMuted: {
    backgroundColor: "#e2e8f0",
  },
  lguStatusChipBusy: {
    backgroundColor: "#fef3c7",
  },
  lguStatusChipText: {
    color: "#334155",
    fontSize: 7.8,
    fontWeight: "900",
  },
  personnelPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  personnelPanelTitle: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  personnelPanelSubtitle: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
  },
  personnelStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ecfdf5",
  },
  personnelStatusText: {
    color: "#047857",
    fontSize: 8.5,
    fontWeight: "900",
  },
  personnelMemberRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  personnelAvatar: {
    width: 38,
    height: 38,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dbeafe",
  },
  personnelAvatarText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
  },
  personnelName: {
    color: "#0f172a",
    fontSize: 11.5,
    fontWeight: "900",
  },
  personnelMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 9.5,
  },
  personnelActiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#eafaf4",
  },
  personnelActiveBadgeText: {
    color: "#0f766e",
    fontSize: 8.5,
    fontWeight: "800",
  },
  personnelEmpty: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  personnelEmptyTitle: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
  },
  personnelEmptyText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 15,
  },
  attendanceEmpty: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
  },
  attendanceEmptyTitle: {
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "900",
  },
  attendanceEmptyText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 15,
  },
  lguCaseNeedBox: {
    marginTop: 11,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f8fbff",
  },
  lguCaseNeedLabel: {
    color: "#2563eb",
    fontSize: 7.8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  lguCaseNeedValue: {
    marginTop: 4,
    color: "#1e3a8a",
    fontSize: 10.5,
    fontWeight: "900",
    lineHeight: 15,
  },
  lguCaseNeedHint: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 8.6,
    lineHeight: 13,
  },
  assignedResponderCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#cfe8e2",
    backgroundColor: "#fbfffd",
  },
  assignedResponderTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  lguAssignedStatusRow: {
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: "#e5eee9",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  historyPanel: {
    padding: 12,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f6",
  },
  historyDot: {
    width: 9,
    height: 9,
    marginTop: 4,
    borderRadius: 99,
    backgroundColor: "#0f9f84",
  },
  historyTitle: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
  },
  historyTime: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 9.5,
  },
  historyAssignments: {
    marginTop: 12,
    paddingTop: 2,
  },
  historyAssignmentRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    padding: 9,
    borderRadius: 9,
    backgroundColor: "#f8fafc",
  },
  historyAssignmentName: {
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "800",
  },
  historyAssignmentStatus: {
    color: "#64748b",
    fontSize: 9.5,
    fontWeight: "700",
  },

  caseWorkspace: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  caseWorkspaceCompact: {
    flexDirection: "column",
  },
  caseListPane: {
    width: 400,
    flexShrink: 0,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 14,
    overflow: "hidden",
  },
  caseListPaneCompact: {
    width: "100%",
  },
  caseListHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f5",
  },
  caseListTitle: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  caseListCount: {
    marginTop: 2,
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "800",
  },
  caseListSort: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
  },
  caseListItems: {
    padding: 8,
    gap: 6,
  },
  caseListItem: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 10,
  },
  caseListItemActive: {
    backgroundColor: "#effcf9",
    borderColor: "#37b8aa",
  },
  caseListThumb: {
    width: 70,
    height: 58,
    flexShrink: 0,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#e8eef2",
  },
  caseListThumbImage: {
    width: "100%",
    height: "100%",
  },
  caseListThumbFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  caseListThumbFallbackIcon: {
    fontSize: 24,
  },
  caseListBody: {
    flex: 1,
    minWidth: 0,
  },
  caseListTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  caseListItemTitle: {
    flex: 1,
    minWidth: 0,
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "900",
  },
  caseListSeverity: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  caseListSeverityText: {
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: "900",
  },
  caseListLocation: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
  },
  caseListMetaRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  caseListMeta: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "700",
  },
  caseListRight: {
    width: 78,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  caseListDate: {
    color: "#64748b",
    fontSize: 8.5,
    textAlign: "right",
    fontWeight: "700",
  },
  caseListChevron: {
    color: "#475569",
    fontSize: 22,
    fontWeight: "400",
  },
  caseDetailPane: {
    flex: 1,
    minWidth: 0,
  },

  caseCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 14,
    marginBottom: 0,
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
    width: 112,
    height: 96,
    minHeight: 96,
    margin: 12,
    marginRight: 0,
    borderRadius: 10,
    overflow: "hidden",
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
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
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
    padding: 14,
  },
  caseTopRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  caseTitle: {
    color: "#0f172a",
    fontSize: 18.5,
    lineHeight: 24,
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
    marginTop: 8,
    color: "#0f766e",
    fontSize: 11.5,
    fontWeight: "800",
  },
  details: {
    marginTop: 6,
    color: "#64748b",
    lineHeight: 18,
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
    fontSize: 14,
    fontWeight: "600",
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

  locationActionCard: {
    margin: 12,
    marginBottom: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#dfe7ee",
    borderRadius: 11,
    backgroundColor: "#f8fafc",
  },
  locationActionMain: {
    flex: 1,
    minWidth: 240,
  },
  locationActionTitle: {
    marginTop: 3,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  locationActionAddress: {
    marginTop: 5,
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  locationActionCoords: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "600",
  },
  locationActionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  locationLiveButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: 9,
    backgroundColor: "#0f766e",
  },
  locationLiveButtonText: {
    color: "#ffffff",
    fontSize: 11.5,
    fontWeight: "900",
  },
  locationGoogleButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#bfd7e8",
    backgroundColor: "#ffffff",
  },
  locationGoogleButtonText: {
    color: "#1d4ed8",
    fontSize: 11.5,
    fontWeight: "800",
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
  severityReviewCard: {
    marginTop: 11,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#dfe7ee",
    backgroundColor: "#f8fafc",
    gap: 10,
  },
  severityReviewText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
  },
  severityChoiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  severityChoice: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  severityChoiceText: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
  },
  severityChoiceTextActive: {
    color: "#ffffff",
  },
  criticalResponseNotice: {
    marginTop: 11,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#f2b8b5",
    backgroundColor: "#fff1f0",
  },
  criticalResponseTitle: {
    color: "#b42318",
    fontSize: 12.5,
    fontWeight: "800",
  },
  criticalResponseText: {
    marginTop: 4,
    color: "#9f2f25",
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
    fontSize: 12.5,
    fontWeight: "800",
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  moreEvidenceButton: {
    backgroundColor: "#fff7e6",
    borderWidth: 1,
    borderColor: "#f4d28e",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  moreEvidenceText: {
    color: "#9a6700",
    fontSize: 12.5,
    fontWeight: "800",
  },
  rejectButton: {
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#f2c7c2",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rejectButtonText: {
    color: "#b42318",
    fontSize: 12.5,
    fontWeight: "800",
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
    fontSize: 12.5,
    fontWeight: "800",
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
    padding: 22,
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
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  sectionTitle: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
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
    fontSize: 14,
    fontWeight: "600",
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 11.5,
    fontWeight: "800",
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
    fontSize: 12.5,
    fontWeight: "800",
  },
  assignButton: {
    backgroundColor: "#e7f7f3",
    borderWidth: 1,
    borderColor: "#bde7dd",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  assignButtonText: {
    color: "#078f82",
    fontSize: 12.5,
    fontWeight: "800",
  },
  progressButton: {
    backgroundColor: "#0284c7",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
  },
  resolveButton: {
    backgroundColor: "#15803d",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
  },
  closeButton: {
    backgroundColor: "#1f2937",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 9,
  },
  completedText: {
    color: "#15803d",
    fontSize: 11,
    fontWeight: "900",
    paddingVertical: 8,
  },

  responseControlHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  responseControlTitle: {
    marginTop: 4,
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "800",
  },
  responseControlSubtitle: {
    marginTop: 7,
    maxWidth: 760,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 21,
  },
  responseStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cfe8e2",
    backgroundColor: "#f1faf7",
  },
  responseStatusDot: {
    color: "#078f82",
    fontSize: 11,
  },
  responseStatusText: {
    color: "#0f766e",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  responseActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mapPrimaryButton: {
    flexGrow: 2,
    flexBasis: 420,
    minWidth: 280,
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#0f766e",
  },
  mapPrimaryButtonIcon: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  mapPrimaryButtonTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  mapPrimaryButtonSub: {
    marginTop: 3,
    color: "#ccfbf1",
    fontSize: 11.5,
    lineHeight: 16,
  },
  supportButton: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  supportButtonActive: {
    borderColor: "#a7f3d0",
    backgroundColor: "#f0fdf4",
  },
  supportButtonTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
  supportButtonSub: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 11.5,
  },
  lguOfficialReportSection: {
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D7EAE5",
    borderRadius: 14,
    backgroundColor: "#F7FCFA",
  },
  lguOfficialReportHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  lguOfficialReportEyebrow: {
    color: "#0F766E",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  lguOfficialReportTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
  },
  lguOfficialReportSubtitle: {
    maxWidth: 720,
    marginTop: 4,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 16,
  },
  lguReportRefreshButton: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#BDE7DD",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  lguReportRefreshText: {
    color: "#0F766E",
    fontSize: 10,
    fontWeight: "900",
  },
  lguReportErrorBox: {
    marginTop: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: "#FECDCA",
    borderRadius: 10,
    backgroundColor: "#FEF3F2",
  },
  lguReportErrorTitle: {
    color: "#B42318",
    fontSize: 11,
    fontWeight: "900",
  },
  lguReportErrorText: {
    marginTop: 3,
    color: "#B42318",
    fontSize: 10,
    lineHeight: 15,
  },
  lguReportWaitingBox: {
    marginTop: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: "#FEDF89",
    borderRadius: 10,
    backgroundColor: "#FFFAEB",
  },
  lguReportWaitingTitle: {
    color: "#B54708",
    fontSize: 11,
    fontWeight: "900",
  },
  lguReportWaitingText: {
    marginTop: 3,
    color: "#7A2E0E",
    fontSize: 10,
    lineHeight: 15,
  },
  lguOfficialReportCard: {
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DDE7E4",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  lguOfficialReportTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  lguOfficialResponderName: {
    color: "#0F172A",
    fontSize: 13.5,
    fontWeight: "900",
  },
  lguOfficialResponderMeta: {
    marginTop: 2,
    color: "#475569",
    fontSize: 10.5,
    fontWeight: "800",
  },
  lguOfficialReportMeta: {
    marginTop: 3,
    color: "#94A3B8",
    fontSize: 9,
    lineHeight: 13,
  },
  lguOfficialReviewBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  lguOfficialReviewBadgePending: {
    borderColor: "#FEDF89",
    backgroundColor: "#FFFAEB",
  },
  lguOfficialReviewBadgeDone: {
    borderColor: "#ABEFC6",
    backgroundColor: "#ECFDF3",
  },
  lguOfficialReviewBadgeText: {
    color: "#B54708",
    fontSize: 8.5,
    fontWeight: "900",
  },
  lguOfficialReviewBadgeTextDone: {
    color: "#067647",
  },
  lguOfficialReportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  lguOfficialReportInfoCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 180,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  lguOfficialReportValue: {
    marginTop: 4,
    color: "#334155",
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  lguOfficialReportValueStrong: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },
  lguFollowUpWarning: {
    marginTop: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: "#FEDF89",
    borderRadius: 10,
    backgroundColor: "#FFFAEB",
  },
  lguFollowUpWarningTitle: {
    color: "#B54708",
    fontSize: 11,
    fontWeight: "900",
  },
  lguFollowUpWarningText: {
    marginTop: 3,
    color: "#7A2E0E",
    fontSize: 10,
    lineHeight: 15,
  },
  lguOfficialNeedsBox: {
    marginTop: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: "#D6E4F0",
    borderRadius: 10,
    backgroundColor: "#F8FBFE",
  },
  lguOfficialNeedsText: {
    marginTop: 4,
    color: "#334155",
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  lguOfficialNotesBox: {
    marginTop: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#FAFAFA",
  },
  lguOfficialNotesText: {
    marginTop: 4,
    color: "#475569",
    fontSize: 10.5,
    lineHeight: 16,
  },
  lguOfficialReviewArea: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  lguOfficialReviewInput: {
    minHeight: 66,
    textAlignVertical: "top",
  },
  lguOfficialReviewActions: {
    marginTop: 9,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  lguMarkReviewedButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 15,
    borderRadius: 9,
    backgroundColor: "#0F766E",
  },
  lguReviewDecisionHint: {
    flex: 1,
    minWidth: 220,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14,
  },
  lguReviewedSummary: {
    marginTop: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: "#ABEFC6",
    borderRadius: 10,
    backgroundColor: "#ECFDF3",
  },
  lguReviewedSummaryTitle: {
    color: "#067647",
    fontSize: 11,
    fontWeight: "900",
  },
  lguReviewedSummaryText: {
    marginTop: 3,
    color: "#24704E",
    fontSize: 10,
    lineHeight: 15,
  },
  responseLifecycleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  coordinationCard: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  coordinationLabel: {
    marginBottom: 7,
    color: "#475569",
    fontSize: 11.5,
    fontWeight: "700",
  },
  coordinationInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#d7e0e8",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0f172a",
    fontSize: 12.5,
    lineHeight: 18,
    textAlignVertical: "top",
  },
  saveNoteButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#bde7dd",
    backgroundColor: "#e7f7f3",
  },
  saveNoteButtonText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
  },
  closedState: {
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: "#ecfdf3",
  },
  closedStateText: {
    color: "#15803d",
    fontSize: 12,
    fontWeight: "800",
  },
  supportPanelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 14,
  },
  supportPanelTitle: {
    marginTop: 3,
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  supportPanelSubtitle: {
    marginTop: 4,
    maxWidth: 760,
    color: "#64748b",
    fontSize: 10,
    lineHeight: 15,
  },
  eligibleCountBox: {
    minWidth: 78,
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  eligibleCountNumber: {
    color: "#15803d",
    fontSize: 20,
    fontWeight: "800",
  },
  eligibleCountLabel: {
    marginTop: 1,
    color: "#166534",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  supportRequirementCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe5ea",
    backgroundColor: "#f8fafc",
  },
  supportRequirementLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  supportRequirementValue: {
    marginTop: 4,
    color: "#0f172a",
    fontSize: 13.5,
    fontWeight: "700",
  },
  supportBarangayHint: {
    marginTop: 4,
    color: "#0f766e",
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  supportRequirementSeverity: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
  },
  infoBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  infoBoxTitle: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
  },
  infoBoxText: {
    marginTop: 3,
    color: "#475569",
    fontSize: 11,
    lineHeight: 16,
  },
  volunteerCandidateCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 8,
    padding: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  volunteerCandidateEligible: {
    borderColor: "#b7e4d8",
    backgroundColor: "#fbfffd",
  },
  volunteerCandidateBody: {
    flex: 1,
    minWidth: 180,
  },
  volunteerCandidateTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  eligibilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  eligibilityBadgeGood: {
    backgroundColor: "#dcfce7",
  },
  eligibilityBadgeMuted: {
    backgroundColor: "#f1f5f9",
  },
  eligibilityBadgeText: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  eligibilityBadgeTextGood: {
    color: "#166534",
  },
  eligibilityBadgeTextMuted: {
    color: "#64748b",
  },
  eligibilityReason: {
    marginTop: 7,
    color: "#64748b",
    fontSize: 10.5,
    fontWeight: "700",
  },
  eligibilityReasonGood: {
    color: "#0f766e",
  },
  assignSmallButtonDisabled: {
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  assignSmallButtonTextDisabled: {
    color: "#94a3b8",
  },

  assignmentPanel: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
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
    fontSize: 14,
    fontWeight: "800",
  },
  volunteerMeta: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 16,
  },
  assignSmallButton: {
    minWidth: 112,
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assignSmallButtonText: {
    color: "#ffffff",
    fontSize: 10.5,
    fontWeight: "800",
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

  lguDoctrineNotice: {
    marginBottom: 12,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cfe8e2",
    backgroundColor: "#f1faf7",
  },
  lguDoctrineTitle: {
    color: "#087f74",
    fontSize: 12.5,
    fontWeight: "800",
  },
  lguDoctrineText: {
    marginTop: 3,
    color: "#4f6b67",
    fontSize: 9.5,
    lineHeight: 14,
  },

  escalationSummaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  escalationSummaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7E6",
    borderWidth: 1,
    borderColor: "#F4D7A1",
  },

  escalationSummaryIconText: {
    color: "#9A6700",
    fontSize: 18,
    fontWeight: "900",
  },

  reliefSummaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF7F4",
    borderWidth: 1,
    borderColor: "#BDE7DD",
  },
  reliefSummaryIconText: {
    color: "#078F82",
    fontSize: 24,
    fontWeight: "800",
  },

  escalationSummaryText: {
    marginTop: 5,
    maxWidth: 760,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 16,
  },

  escalationRuleBox: {
    marginBottom: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: "#F4D7A1",
    borderRadius: 10,
    backgroundColor: "#FFFDF5",
  },

  escalationRuleTitle: {
    color: "#7A4B00",
    fontSize: 12.5,
    fontWeight: "800",
  },

  escalationRuleText: {
    marginTop: 4,
    color: "#795C2D",
    fontSize: 10,
    lineHeight: 15,
  },

  reliefPolicyBox: {
    marginBottom: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
  },
  reliefPolicyTitle: {
    color: "#1D4ED8",
    fontSize: 12.5,
    fontWeight: "800",
  },
  reliefPolicyText: {
    marginTop: 4,
    color: "#475569",
    fontSize: 10,
    lineHeight: 15,
  },

  directAssessmentSection: {
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    padding: 16,
    backgroundColor: "#f7fbfa",
  },
  directAssessmentButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#bde7dd",
    borderRadius: 9,
    backgroundColor: "#e7f7f3",
  },
  directAssessmentButtonText: {
    color: "#078f82",
    fontSize: 10,
    fontWeight: "900",
  },
  directAssessmentDone: {
    marginTop: 10,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#edf8f3",
  },
  directAssessmentDoneText: {
    color: "#15803d",
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "800",
  },

  directFormCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe8e4",
    backgroundColor: "#ffffff",
  },
  directFormHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  directFormTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900",
  },
  directFormSubtitle: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
  },
  directFormBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ecfdf5",
  },
  directFormBadgeText: {
    color: "#0f766e",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  formSelectWrap: {
    marginTop: 2,
    marginBottom: 8,
  },
  formSelectButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#D7E1E8",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  formSelectButtonOpen: {
    borderColor: "#078F82",
    backgroundColor: "#F8FFFD",
  },
  formSelectValue: {
    color: "#0F172A",
    fontSize: 12.5,
    fontWeight: "800",
  },
  formSelectPlaceholder: {
    color: "#94A3B8",
  },
  formSelectDescription: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.5,
    lineHeight: 12,
  },
  formSelectChevron: {
    color: "#0F766E",
    fontSize: 18,
    fontWeight: "900",
  },
  formSelectMenu: {
    marginTop: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D7E1E8",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  formSelectOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F4",
  },
  formSelectOptionActive: {
    backgroundColor: "#ECFDF5",
  },
  formSelectOptionMark: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFD7D1",
    backgroundColor: "#FFFFFF",
  },
  formSelectOptionMarkText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "900",
  },
  formSelectOptionMarkTextActive: {
    color: "#0F766E",
  },
  formSelectOptionLabel: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900",
  },
  formSelectOptionLabelActive: {
    color: "#0F766E",
  },
  formSelectOptionDescription: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.5,
    lineHeight: 12,
  },
  directInfoStrip: {
    marginTop: 3,
    padding: 10,
    borderWidth: 1,
    borderColor: "#D9EEE8",
    borderRadius: 9,
    backgroundColor: "#F0FDFA",
  },
  directInfoStripTitle: {
    color: "#0F766E",
    fontSize: 9.5,
    fontWeight: "900",
  },
  directInfoStripText: {
    marginTop: 3,
    color: "#52706A",
    fontSize: 8.8,
    lineHeight: 13,
  },
  directGroupCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "#eef2f4",
  },
  directGroupNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: "center",
    lineHeight: 24,
    color: "#ffffff",
    backgroundColor: "#0f766e",
    fontSize: 9.5,
    fontWeight: "900",
  },
  directGroupContent: {
    flex: 1,
  },
  reliefScopeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  reliefScopeOption: {
    flexGrow: 1,
    flexBasis: 260,
    minWidth: 220,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  reliefScopeOptionActive: {
    borderColor: "#078F82",
    backgroundColor: "#ECFDF5",
  },
  reliefScopeTitle: {
    color: "#334155",
    fontSize: 12.5,
    fontWeight: "800",
  },
  reliefScopeTitleActive: {
    color: "#0F766E",
  },
  reliefScopeText: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
  },
  directGroupTitle: {
    color: "#183448",
    fontSize: 11.5,
    fontWeight: "900",
  },
  directGroupHint: {
    marginTop: 2,
    marginBottom: 9,
    color: "#7b8d9d",
    fontSize: 9,
    lineHeight: 13,
  },
  directTopGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  directTwoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  directWideField: {
    flexGrow: 2,
    flexBasis: 280,
    minWidth: 220,
  },
  directSmallField: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 145,
  },
  directFieldLabel: {
    marginTop: 7,
    marginBottom: 5,
    color: "#475569",
    fontSize: 9.5,
    fontWeight: "800",
  },
  directFieldHelp: {
    marginTop: 4,
    color: "#94A3B8",
    fontSize: 8.5,
    lineHeight: 12,
  },
  directLockedInput: {
    backgroundColor: "#F1F5F9",
    color: "#475569",
  },
  directSubheading: {
    marginTop: 5,
    marginBottom: 6,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  directNeedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },

  directNeedChoiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 9,
  },
  directNeedChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#D7E1E8",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  directNeedChoiceActive: {
    borderColor: "#078F82",
    backgroundColor: "#ECFDF5",
  },
  directNeedChoiceMark: {
    width: 18,
    height: 18,
    textAlign: "center",
    lineHeight: 17,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    color: "#64748B",
    fontSize: 10,
    fontWeight: "900",
    backgroundColor: "#FFFFFF",
  },
  directNeedChoiceMarkActive: {
    borderColor: "#078F82",
    color: "#FFFFFF",
    backgroundColor: "#078F82",
  },
  directNeedChoiceText: {
    color: "#475569",
    fontSize: 9.3,
    fontWeight: "900",
  },
  directNeedChoiceTextActive: {
    color: "#0F766E",
  },
  directSelectedNeedsPanel: {
    marginTop: 2,
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  directSelectedNeedsTitle: {
    color: "#334155",
    fontSize: 9.8,
    fontWeight: "900",
  },
  directSelectedNeedsHint: {
    marginTop: 2,
    marginBottom: 7,
    color: "#64748B",
    fontSize: 8.5,
    lineHeight: 12,
  },
  directNeedField: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 135,
    padding: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 9,
    backgroundColor: "#f8fafc",
  },
  directNeedLabel: {
    color: "#334155",
    fontSize: 9.5,
    fontWeight: "900",
  },
  directNeedUnit: {
    marginTop: 1,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "700",
  },
  directNeedInput: {
    minHeight: 36,
    marginTop: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: "#dbe3ea",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
  },
  directNotesInput: {
    minHeight: 58,
    textAlignVertical: "top",
    marginBottom: 4,
  },

  directReviewCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE7E4",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  directReviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    backgroundColor: "#F8FCFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E9F0EE",
  },
  directReviewEyebrow: {
    color: "#078F82",
    fontSize: 7.8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  directReviewTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 11.5,
    fontWeight: "900",
  },
  directReviewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
  },
  directReviewBadgeText: {
    color: "#15803D",
    fontSize: 7.5,
    fontWeight: "900",
  },
  directReviewStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 11,
  },
  directReviewStat: {
    flexGrow: 1,
    flexBasis: 130,
    minWidth: 120,
    padding: 9,
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
  },
  directReviewStatLabel: {
    color: "#94A3B8",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  directReviewStatValue: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
  },
  directReviewStatValueSmall: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 9.2,
    lineHeight: 13,
    fontWeight: "900",
  },
  directReviewSectionLabel: {
    paddingHorizontal: 11,
    marginTop: 1,
    color: "#94A3B8",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  directReviewNeedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 11,
  },
  directReviewNeedPill: {
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#EEF8F5",
  },
  directReviewNeedPillText: {
    color: "#0F766E",
    fontSize: 8.5,
    fontWeight: "800",
  },
  directReviewEmpty: {
    color: "#94A3B8",
    fontSize: 8.8,
    fontStyle: "italic",
  },
  directReviewNotice: {
    margin: 11,
    marginTop: 0,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F1DFC0",
    borderRadius: 9,
    backgroundColor: "#FFFBEB",
  },
  directReviewNoticeTitle: {
    color: "#92400E",
    fontSize: 9.2,
    fontWeight: "900",
  },
  directReviewNoticeText: {
    marginTop: 3,
    color: "#9A6700",
    fontSize: 8.5,
    lineHeight: 12.5,
  },
  directActionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#eef2f4",
  },
  directActionTitle: {
    color: "#183448",
    fontSize: 12.5,
    fontWeight: "800",
  },
  directActionHint: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 9,
    lineHeight: 13,
  },
  directSaveButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    borderRadius: 9,
    backgroundColor: "#078f82",
  },

  fieldReportsSection: {
    borderTopWidth: 1,
    borderTopColor: "#edf1f5",
    padding: 16,
    backgroundColor: "#f9fcfb",
  },
  fieldAuthorityNotice: {
    marginBottom: 12,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe9e5",
    backgroundColor: "#ffffff",
  },
  fieldAuthorityTitle: {
    color: "#183448",
    fontSize: 12.5,
    fontWeight: "800",
  },
  fieldAuthorityText: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
  },
  fieldReportCard: {
    marginTop: 10,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dfe8e5",
    backgroundColor: "#ffffff",
  },
  fieldReportTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  fieldVolunteerName: {
    color: "#0f172a",
    fontSize: 12.5,
    fontWeight: "900",
  },
  fieldReportMeta: {
    marginTop: 2,
    color: "#7b8d9d",
    fontSize: 9,
    lineHeight: 13,
  },
  fieldReportStatus: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  fieldStatusSubmitted: { backgroundColor: "#d97706" },
  fieldStatusReviewed: { backgroundColor: "#2563eb" },
  fieldStatusIncorporated: { backgroundColor: "#15803d" },
  fieldStatusDismissed: { backgroundColor: "#64748b" },
  fieldReportStatusText: {
    color: "#ffffff",
    fontSize: 8.5,
    fontWeight: "900",
  },
  fieldReportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  fieldReportInfoCard: {
    flexGrow: 1,
    flexBasis: 210,
    minWidth: 180,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  fieldReportValue: {
    marginTop: 4,
    color: "#334155",
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "700",
  },
  remainingNeedsBox: {
    marginTop: 9,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f0dfb6",
    backgroundColor: "#fffaf0",
  },
  remainingNeedsText: {
    marginTop: 4,
    color: "#7c5410",
    fontSize: 12.5,
    fontWeight: "800",
  },
  remainingNeedsNote: {
    marginTop: 4,
    color: "#7a6740",
    fontSize: 9.5,
    lineHeight: 14,
  },
  fieldReviewInput: {
    minHeight: 66,
    textAlignVertical: "top",
  },
  fieldReportActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  reviewFieldButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
  },
  incorporateButton: {
    backgroundColor: "#e7f7f3",
    borderWidth: 1,
    borderColor: "#bde7dd",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
  },
  incorporateButtonText: {
    color: "#078f82",
    fontSize: 10,
    fontWeight: "900",
  },
  dismissFieldButton: {
    backgroundColor: "#fff1f0",
    borderWidth: 1,
    borderColor: "#f2c7c2",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
  },
  dismissFieldButtonText: {
    color: "#b42318",
    fontSize: 10,
    fontWeight: "900",
  },
  needAssessmentPanel: {
    marginTop: 12,
    padding: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#cfe4df",
    backgroundColor: "#fbfefd",
  },
  needAssessmentEyebrow: {
    color: "#078f82",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  needAssessmentTitle: {
    marginTop: 2,
    color: "#183448",
    fontSize: 14,
    fontWeight: "900",
  },
  needAssessmentHint: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
  },
  needInputGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 9,
  },
  needInputBlock: {
    flexGrow: 1,
    flexBasis: 190,
    minWidth: 165,
  },
  needMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 9,
  },
  saveBarangayNeedButton: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#078f82",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  fieldFinalNotice: {
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#edf8f3",
  },
  fieldFinalNoticeText: {
    color: "#15803d",
    fontSize: 9.5,
    fontWeight: "900",
  },
  fieldDismissedNotice: {
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#f1f4f7",
  },
  fieldDismissedNoticeText: {
    color: "#64748b",
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "700",
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
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 11,
    textAlign: "center",
  },
  criticalNavigateButton: { marginTop: 12, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#b91c1c", paddingHorizontal: 14 },
  criticalNavigateButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
});