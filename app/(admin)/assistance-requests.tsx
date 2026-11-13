import { getSafeVolunServeBackendBaseUrl } from "../../lib/stagingExpoServiceIsolation";
import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { liveUi as designUi } from "../../constants/volunserveLiveUi";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import ListPagination from "../../components/ui/ListPagination";
import AdminReviewHero from "../../components/admin/AdminReviewHero";
import {
  validateAssistanceReview,
  validateAssistanceReason,
  validateAssistanceSupport,
  validateAssistanceLocation,
  type AssistanceValidationMode,
} from "../../lib/assistanceReviewValidation";
import {
  filterAndSortAssistanceQueue,
  type AssistanceQueueSort,
} from "../../lib/assistanceReviewQueue";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type ReviewFilter =
  | "all"
  | "pending"
  | "under_review"
  | "verified"
  | "rejected"
  | "completed";

type ReviewTab =
  | "case"
  | "evidence"
  | "resident"
  | "decision";

type ReviewStage = "checks" | "costs" | "residency" | "decision" | "support";
type ReviewStageFocus = { stage: ReviewStage; ticket: number };
type DonationBudgetDraft = { total: string; alreadyReceived: string; basis: string };

type StoredDocument = {
  documentType?: string;
  label?: string;
  url?: string;
  fileName?: string;
};

type AssistanceRequest = {
  id: string;

  requestId?: string;
  requesterUid?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterBarangay?: string;
  requesterAddress?: string;
  contactNumber?: string;

  beneficiaryType?: string;
  beneficiaryName?: string;
  relationshipToBeneficiary?: string;

  requestGroup?: string;
  category?: string;
  categoryLabel?: string;
  title?: string;
  description?: string;
  estimatedAmount?: number;
  currentSituation?: string;
  preferredAssistanceTypes?: string[];
  documents?: StoredDocument[];

  publicCampaignPhotoUrl?: string;
  publicCampaignPhotoConsent?: boolean;
  publicCampaignPhotoFileName?: string;
  publicCampaignPhotoSetAt?: any;

  status?: string;
  verificationStatus?: string;
  supportDecision?: string;
  remainingAmount?: number;

  assignedLocationType?: string;
  assignedLocationName?: string;
  assignedLocationAddress?: string;
  assignedLocationNotes?: string;
  assignedLocationSetBy?: string;
  assignedLocationSetAt?: any;

  donationCampaignId?: string;
  adminNote?: string;

  reviewedAt?: any;
  reviewedBy?: string;
  verifiedAt?: any;
  verifiedBy?: string;
  rejectedAt?: any;
  rejectionReason?: string;

  createdAt?: any;
  updatedAt?: any;
};

type ResidentProfile = {
  uid?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  barangay?: string;
  address?: string;
  city?: string;
  province?: string;

  role?: string;
  status?: string;
  residentAccess?: boolean;

  identityStatus?: string;
  identityVerified?: boolean;
  identityVerifiedAt?: any;

  createdAt?: any;
};

type VerificationChecks = {
  documentsReviewed: boolean;
  residentIdentityChecked: boolean;
  detailsConsistent: boolean;
  locationResidencyChecked: boolean;
  duplicateHistoryChecked: boolean;
  beneficiaryRelationshipChecked: boolean;
};

const EMPTY_CHECKS: VerificationChecks = {
  documentsReviewed: false,
  residentIdentityChecked: false,
  detailsConsistent: false,
  locationResidencyChecked: false,
  duplicateHistoryChecked: false,
  beneficiaryRelationshipChecked: false,
};


type PrivateReviewDraft = {
  documentConsistencyStatus: string;
  documentConsistencyNotes: string;
  duplicateCheckStatus: string;
  duplicateRequestIds: string;
  duplicateCheckNotes: string;
  beneficiaryCheckStatus: string;
  beneficiaryCheckNotes: string;
  facilityVerificationRequired: boolean;
  facilityVerificationStatus: string;
  facilityName: string;
  facilityType: string;
  facilityDepartment: string;
  professionalName: string;
  facilityReferenceNumber: string;
  facilityVerificationMethod: string;
  facilityVerifiedWith: string;
  facilityNotes: string;
  costVerificationRequired: boolean;
  verifiedGrossCost: string;
  confirmedExistingAssistanceAmount: string;
  costVerificationStatus: string;
  costReferenceNumber: string;
  costNotes: string;
  residencyVerificationStatus: string;
  residencyVerificationMethod: string;
  privateAddressSnapshot: string;
  privateLatitude: string;
  privateLongitude: string;
  residencyNotes: string;
  videoVerificationRequired: boolean;
  videoVerificationStatus: string;
  videoVerificationNotes: string;
  siteVisitRequired: boolean;
  siteVisitStatus: string;
  siteVisitNotes: string;
  riskFlags: string;
  internalNotes: string;
};

const PRIVATE_REVIEW_COLLECTION = "assistanceVerificationReviews";
const SECURE_ASSISTANCE_BACKEND = getSafeVolunServeBackendBaseUrl();

const needsFacilityVerification = (category?: string) =>
  [
    "medical_health",
    "surgery_treatment",
    "cancer_serious_illness",
    "animal_pet_welfare",
  ].includes(String(category || ""));

const safeNumber = (value: string | number | undefined) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const confirmAdminAction = (
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void | Promise<void>,
  destructive = false,
) => {
  if (Platform.OS === "web") {
    const browserConfirm = (globalThis as any).confirm;

    if (typeof browserConfirm !== "function") {
      Alert.alert(
        "Confirmation Unavailable",
        "This browser cannot open the confirmation dialog. Refresh the page and try again.",
      );
      return;
    }

    const accepted = browserConfirm(`${title}\n\n${message}`);
    if (accepted) {
      void onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: confirmText,
      style: destructive ? "destructive" : "default",
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
};

const createPrivateReviewDraft = (
  request: AssistanceRequest,
  data?: Record<string, any> | null,
): PrivateReviewDraft => {
  const facilityRequired = needsFacilityVerification(request.category);
  const costRequired = Number(request.estimatedAmount || 0) > 0;

  return {
    documentConsistencyStatus: String(data?.documentConsistencyStatus || "pending"),
    documentConsistencyNotes: String(data?.documentConsistencyNotes || ""),
    duplicateCheckStatus: String(data?.duplicateCheckStatus || "pending"),
    duplicateRequestIds: Array.isArray(data?.duplicateRequestIds)
      ? data.duplicateRequestIds.join(", ")
      : "",
    duplicateCheckNotes: String(data?.duplicateCheckNotes || ""),
    beneficiaryCheckStatus: String(data?.beneficiaryCheckStatus || "pending"),
    beneficiaryCheckNotes: String(data?.beneficiaryCheckNotes || ""),
    facilityVerificationRequired:
      typeof data?.facilityVerificationRequired === "boolean"
        ? data.facilityVerificationRequired
        : facilityRequired,
    facilityVerificationStatus: String(
      data?.facilityVerificationStatus || (facilityRequired ? "pending" : "not_required"),
    ),
    facilityName: String(data?.facilityName || ""),
    facilityType: String(data?.facilityType || ""),
    facilityDepartment: String(data?.facilityDepartment || ""),
    professionalName: String(data?.professionalName || ""),
    facilityReferenceNumber: String(data?.facilityReferenceNumber || ""),
    facilityVerificationMethod: String(data?.facilityVerificationMethod || "not_applicable"),
    facilityVerifiedWith: String(data?.facilityVerifiedWith || ""),
    facilityNotes: String(data?.facilityNotes || ""),
    costVerificationRequired:
      typeof data?.costVerificationRequired === "boolean"
        ? data.costVerificationRequired
        : costRequired,
    verifiedGrossCost: String(data?.verifiedGrossCost ?? ""),
    confirmedExistingAssistanceAmount: String(data?.confirmedExistingAssistanceAmount ?? ""),
    costVerificationStatus: String(
      data?.costVerificationStatus || (costRequired ? "pending" : "not_required"),
    ),
    costReferenceNumber: String(data?.costReferenceNumber || ""),
    costNotes: String(data?.costNotes || ""),
    residencyVerificationStatus: String(data?.residencyVerificationStatus || "pending"),
    residencyVerificationMethod: String(data?.residencyVerificationMethod || "profile_address"),
    privateAddressSnapshot: String(
      data?.privateAddressSnapshot || request.requesterAddress || "",
    ),
    privateLatitude:
      typeof data?.privateLatitude === "number" ? String(data.privateLatitude) : "",
    privateLongitude:
      typeof data?.privateLongitude === "number" ? String(data.privateLongitude) : "",
    residencyNotes: String(data?.residencyNotes || ""),
    videoVerificationRequired: Boolean(data?.videoVerificationRequired || false),
    videoVerificationStatus: String(data?.videoVerificationStatus || "not_required"),
    videoVerificationNotes: String(data?.videoVerificationNotes || ""),
    siteVisitRequired: Boolean(data?.siteVisitRequired || false),
    siteVisitStatus: String(data?.siteVisitStatus || "not_required"),
    siteVisitNotes: String(data?.siteVisitNotes || ""),
    riskFlags: Array.isArray(data?.riskFlags) ? data.riskFlags.join("\n") : "",
    internalNotes: String(data?.internalNotes || ""),
  };
};

const reviewReadyForVerification = (draft: PrivateReviewDraft | null) => {
  if (!draft) return false;

  const riskFlags = draft.riskFlags
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    draft.documentConsistencyStatus === "consistent" &&
    draft.duplicateCheckStatus === "clear" &&
    draft.beneficiaryCheckStatus === "confirmed" &&
    draft.residencyVerificationStatus === "verified" &&
    (!draft.facilityVerificationRequired || draft.facilityVerificationStatus === "confirmed") &&
    (!draft.costVerificationRequired || draft.costVerificationStatus === "confirmed") &&
    ["not_required", "completed"].includes(draft.videoVerificationStatus) &&
    ["not_required", "completed"].includes(draft.siteVisitStatus) &&
    riskFlags.length === 0
  );
};

const LOCATION_TYPES = [
  {
    value: "barangay_hall",
    label: "Barangay Hall / Assistance Desk",
  },
  {
    value: "lgu_office",
    label: "LGU / City Assistance Office",
  },
  {
    value: "hospital_social_service",
    label: "Hospital Social Service Desk",
  },
  {
    value: "social_welfare_office",
    label: "Social Welfare Office",
  },
  {
    value: "vet_clinic",
    label: "Authorized Veterinary Clinic",
  },
  {
    value: "authorized_public_point",
    label: "Other Authorized Public Point",
  },
];

const SUPPORT_OPTIONS = [
  {
    value: "internal_support",
    label: "LGU / Partner Support Available",
    icon: "business-outline" as const,
  },
  {
    value: "donation_support",
    label: "Donation Support Needed",
    icon: "heart-outline" as const,
  },
  {
    value: "not_required",
    label: "No Additional Support Required",
    icon: "checkmark-circle-outline" as const,
  },
];

const timestampMillis = (value: any) => {
  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  return 0;
};

const readableDate = (value: any) => {
  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
  } catch {
    // Keep the UI stable if a legacy timestamp is malformed.
  }

  return "Not recorded";
};

const money = (value?: number) => {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "Not specified";
  }

  return `PHP ${amount.toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })}`;
};

const statusMeta = (value?: string) => {
  const status = String(value || "pending").toLowerCase();

  if (status === "under_review") {
    return {
      label: "Under Review",
      color: "#1D4ED8",
      soft: "#EAF2FF",
      icon: "search-outline" as const,
    };
  }

  if (status === "verified") {
    return {
      label: "Verified Need",
      color: "#15803D",
      soft: "#EAF8EF",
      icon: "shield-checkmark-outline" as const,
    };
  }

  if (status === "campaign_created") {
    return {
      label: "Campaign Created",
      color: "#7C3AED",
      soft: "#F3EDFF",
      icon: "heart-outline" as const,
    };
  }

  if (
    status === "assistance_provided" ||
    status === "closed"
  ) {
    return {
      label: "Assistance Provided",
      color: "#0F766E",
      soft: "#E9F8F5",
      icon: "checkmark-circle-outline" as const,
    };
  }

  if (status === "rejected") {
    return {
      label: "Rejected",
      color: "#B42318",
      soft: "#FFF0EE",
      icon: "close-circle-outline" as const,
    };
  }

  return {
    label: "Pending Review",
    color: "#A16207",
    soft: "#FFF8D8",
    icon: "time-outline" as const,
  };
};

const documentName = (
  item: StoredDocument,
  index: number,
) => {
  return (
    item.label ||
    item.fileName ||
    item.documentType ||
    `Supporting document ${index + 1}`
  );
};

const buildChecklistSummary = (
  checks: VerificationChecks,
  note: string,
) => {
  const rows = [
    `Evidence reviewed: ${checks.documentsReviewed ? "YES" : "NO"}`,
    `Resident identity/account checked: ${
      checks.residentIdentityChecked ? "YES" : "NO"
    }`,
    `Request details checked for consistency: ${
      checks.detailsConsistent ? "YES" : "NO"
    }`,
    `Barangay/address/residency checked: ${
      checks.locationResidencyChecked ? "YES" : "NO"
    }`,
    `Duplicate/history check completed: ${
      checks.duplicateHistoryChecked ? "YES" : "NO"
    }`,
    `Beneficiary relationship checked: ${
      checks.beneficiaryRelationshipChecked ? "YES" : "NO"
    }`,
  ];

  const trimmedNote = note.trim();

  return [
    "[LGU VERIFICATION CHECKLIST]",
    ...rows,
    "",
    trimmedNote
      ? `Verification notes: ${trimmedNote}`
      : "Verification notes: None entered.",
  ]
    .join("\n")
    .slice(0, 2000);
};

const assistanceCategoryMeta = (
  value?: string,
) => {
  const category = String(value || "");

  const map: Record<
    string,
    {
      icon: React.ComponentProps<
        typeof Ionicons
      >["name"];
      color: string;
      soft: string;
    }
  > = {
    disaster_recovery: {
      icon: "home-outline",
      color: "#B45309",
      soft: "#FFF7ED",
    },
    medical_health: {
      icon: "medkit-outline",
      color: "#E11D48",
      soft: "#FFF1F2",
    },
    surgery_treatment: {
      icon: "fitness-outline",
      color: "#2563EB",
      soft: "#EFF6FF",
    },
    cancer_serious_illness: {
      icon: "ribbon-outline",
      color: "#7C3AED",
      soft: "#F5F3FF",
    },
    animal_pet_welfare: {
      icon: "paw-outline",
      color: "#059669",
      soft: "#ECFDF5",
    },
    elderly_assistance: {
      icon: "person-outline",
      color: "#EA580C",
      soft: "#FFF7ED",
    },
    homeless_basic_needs: {
      icon: "home-outline",
      color: "#92400E",
      soft: "#FEF3C7",
    },
    other_community_assistance: {
      icon: "people-outline",
      color: "#475569",
      soft: "#F1F5F9",
    },
  };

  return (
    map[category] || {
      icon: "hand-left-outline" as const,
      color: "#2563EB",
      soft: "#EFF6FF",
    }
  );
};

export default function AssistanceRequestsAdmin() {
  const router = useRouter();
  const {
    loading: sessionLoading,
    user,
    profile,
  } = useUserSession();

  const { width } = useWindowDimensions();

  const wide = width >= 1120;

  const [requests, setRequests] =
    useState<AssistanceRequest[]>([]);
  const [loadingRequests, setLoadingRequests] =
    useState(true);
  const [listenerError, setListenerError] =
    useState("");

  const [filter, setFilter] =
    useState<ReviewFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOrder, setSortOrder] =
    useState<AssistanceQueueSort>("newest");
  const [search, setSearch] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const [reviewFocusStage, setReviewFocusStage] = useState<ReviewStageFocus | null>(null);
  const [quickAction, setQuickAction] = useState<"more_info" | "reject" | null>(null);
  const [simpleReviewMode, setSimpleReviewMode] = useState(true);

  const [selected, setSelected] =
    useState<AssistanceRequest | null>(null);
  const [screenMode, setScreenMode] =
    useState<"queue" | "detail">("queue");
  const [reviewTab, setReviewTab] =
    useState<ReviewTab>("case");

  const [residentProfile, setResidentProfile] =
    useState<ResidentProfile | null>(null);
  const [residentLoading, setResidentLoading] =
    useState(false);

  const [checks, setChecks] =
    useState<VerificationChecks>(EMPTY_CHECKS);
  const [adminNote, setAdminNote] =
    useState("");
  const [rejectionReason, setRejectionReason] =
    useState("");
  const [validationIntent, setValidationIntent] = useState<AssistanceValidationMode | null>(null);
  const [reasonAttempt, setReasonAttempt] = useState<"more_information" | "reject" | null>(null);
  const [supportValidationAttempt, setSupportValidationAttempt] = useState<"support" | "location" | null>(null);

  const [supportDecision, setSupportDecision] =
    useState("pending");
  const [remainingAmount, setRemainingAmount] =
    useState("");

  const [locationType, setLocationType] =
    useState("");
  const [locationName, setLocationName] =
    useState("");
  const [locationAddress, setLocationAddress] =
    useState("");
  const [locationNotes, setLocationNotes] =
    useState("");

  const [savingAction, setSavingAction] =
    useState("");

  const [previewDocument, setPreviewDocument] =
    useState<StoredDocument | null>(null);
  const [previewAccessUrl, setPreviewAccessUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [verificationReview, setVerificationReview] = useState<Record<string, any> | null>(null);
  const [verificationReviewLoading, setVerificationReviewLoading] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<PrivateReviewDraft | null>(null);

  const role =
    typeof profile?.role === "string"
      ? profile.role.toLowerCase()
      : "";

  const isOperationalAdmin =
    !!user &&
    !!profile &&
    role === "admin" &&
    profile.status === "approved";

  useEffect(() => {
    if (
      sessionLoading ||
      !isOperationalAdmin
    ) {
      setRequests([]);
      setLoadingRequests(false);
      return;
    }

    setLoadingRequests(true);
    setListenerError("");

    const unsubscribe = onSnapshot(
      collection(db, "assistanceRequests"),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              AssistanceRequest,
              "id"
            >),
          }))
          .filter((item) => {
            const validCategories = [
              "disaster_recovery",
              "medical_health",
              "surgery_treatment",
              "cancer_serious_illness",
              "animal_pet_welfare",
              "elderly_assistance",
              "homeless_basic_needs",
              "other_community_assistance",
            ];

            return (
              typeof item.requesterUid === "string" &&
              item.requesterUid.trim().length > 0 &&
              typeof item.title === "string" &&
              item.title.trim().length >= 3 &&
              typeof item.category === "string" &&
              validCategories.includes(item.category) &&
              Array.isArray(item.documents)
            );
          })
          .sort(
            (a, b) =>
              timestampMillis(b.createdAt) -
              timestampMillis(a.createdAt),
          );

        setRequests(rows);
        setLoadingRequests(false);

        setSelected((current) => {
          if (!current) {
            return null;
          }

          return (
            rows.find(
              (item) => item.id === current.id,
            ) || null
          );
        });
      },
      (error) => {
        console.log(
          "assistance requests listener error",
          error,
        );

        setListenerError(
          "Unable to load Assistance Requests. Check Firestore rules and connection.",
        );
        setLoadingRequests(false);
      },
    );

    return unsubscribe;
  }, [
    sessionLoading,
    isOperationalAdmin,
  ]);

  useEffect(() => {
    setReviewTab("case");
    setChecks(EMPTY_CHECKS);
    setAdminNote(selected?.adminNote || "");
    setRejectionReason(
      selected?.rejectionReason || "",
    );

    setSupportDecision(
      selected?.supportDecision || "pending",
    );
    setRemainingAmount(
      selected?.remainingAmount
        ? String(selected.remainingAmount)
        : "",
    );

    setLocationType(
      selected?.assignedLocationType || "",
    );
    setLocationName(
      selected?.assignedLocationName || "",
    );
    setLocationAddress(
      selected?.assignedLocationAddress || "",
    );
    setLocationNotes(
      selected?.assignedLocationNotes || "",
    );
  }, [selected?.id]);

  useEffect(() => {
    let mounted = true;

    const loadResident = async () => {
      const uid = selected?.requesterUid;

      if (!uid) {
        setResidentProfile(null);
        return;
      }

      try {
        setResidentLoading(true);

        const snapshot = await getDoc(
          doc(db, "users", uid),
        );

        if (!mounted) return;

        if (!snapshot.exists()) {
          setResidentProfile(null);
          return;
        }

        setResidentProfile(
          snapshot.data() as ResidentProfile,
        );
      } catch (error) {
        console.log(
          "assistance resident profile error",
          error,
        );

        if (mounted) {
          setResidentProfile(null);
        }
      } finally {
        if (mounted) {
          setResidentLoading(false);
        }
      }
    };

    void loadResident();

    return () => {
      mounted = false;
    };
  }, [selected?.requesterUid]);

  useEffect(() => {
    let mounted = true;

    const loadVerificationReview = async () => {
      if (!selected || !isOperationalAdmin) {
        setVerificationReview(null);
        setReviewDraft(null);
        return;
      }

      try {
        setVerificationReviewLoading(true);
        const snapshot = await getDoc(
          doc(db, PRIVATE_REVIEW_COLLECTION, selected.id),
        );

        if (!mounted) return;

        const data = snapshot.exists()
          ? (snapshot.data() as Record<string, any>)
          : null;

        setVerificationReview(data);
        setReviewDraft(createPrivateReviewDraft(selected, data));
      } catch (error) {
        console.log("private assistance verification review load error", error);
        if (mounted) {
          setVerificationReview(null);
          setReviewDraft(createPrivateReviewDraft(selected, null));
        }
      } finally {
        if (mounted) setVerificationReviewLoading(false);
      }
    };

    void loadVerificationReview();

    return () => {
      mounted = false;
    };
  }, [selected?.id, isOperationalAdmin]);

  const stats = useMemo(() => {
    const pending = requests.filter(
      (item) =>
        String(item.status || "pending") ===
        "pending",
    ).length;

    const underReview = requests.filter(
      (item) =>
        String(item.status || "") ===
        "under_review",
    ).length;

    const verified = requests.filter(
      (item) =>
        String(item.status || "") ===
        "verified",
    ).length;

    const rejected = requests.filter(
      (item) =>
        String(item.status || "") ===
        "rejected",
    ).length;

    return {
      total: requests.length,
      pending,
      underReview,
      verified,
      rejected,
    };
  }, [requests]);

  const filteredRequests = useMemo(
    () => filterAndSortAssistanceQueue(
      requests,
      {
        status: filter,
        category: categoryFilter,
        sort: sortOrder,
        search,
      },
      timestampMillis,
    ),
    [requests, filter, categoryFilter, sortOrder, search],
  );
  const requestPages = Math.max(1, Math.ceil(filteredRequests.length / 5));
  const activeRequestPage = Math.max(1, Math.min(recordPage, requestPages));
  const pagedRequests = filteredRequests.slice((activeRequestPage - 1) * 5, activeRequestPage * 5);

  const resetProtectedReviewView = () => {
    // Prevent the previous Resident's private review and evidence from
    // appearing while the next request is loading.
    setResidentProfile(null);
    setResidentLoading(false);
    setReviewDraft(null);
    setVerificationReview(null);
    setVerificationReviewLoading(true);
    setPreviewDocument(null);
    setPreviewAccessUrl("");
    setPreviewError("");
    setValidationIntent(null);
    setReasonAttempt(null);
    setSupportValidationAttempt(null);
    setSimpleReviewMode(true);
  };

  useEffect(() => {
    if (!wide || loadingRequests || sessionLoading || !isOperationalAdmin || !!savingAction) return;
    const visibleSelected = pagedRequests.some((item) => item.id === selected?.id);
    if (!visibleSelected) {
      resetProtectedReviewView();
      setSelected(pagedRequests[0] || null);
      setReviewTab("case");
      setReviewFocusStage(null);
      setQuickAction(null);
    }
  }, [wide, loadingRequests, sessionLoading, isOperationalAdmin, filteredRequests, activeRequestPage, selected?.id, savingAction]);

  const relatedRequests = useMemo(() => {
    if (!selected) return [];

    return requests.filter(
      (item) =>
        item.id !== selected.id &&
        item.requesterUid ===
          selected.requesterUid,
    );
  }, [
    requests,
    selected,
  ]);

  const sameBeneficiaryRequests =
    useMemo(() => {
      if (!selected?.beneficiaryName) {
        return [];
      }

      const name =
        selected.beneficiaryName
          .trim()
          .toLowerCase();

      if (!name) return [];

      return requests.filter(
        (item) =>
          item.id !== selected.id &&
          String(
            item.beneficiaryName || "",
          )
            .trim()
            .toLowerCase() === name,
      );
    }, [
      requests,
      selected,
    ]);

  const allChecksComplete =
    reviewReadyForVerification(reviewDraft);

  const selectRequest = (
    item: AssistanceRequest,
  ) => {
    if (savingAction) {
      Alert.alert("Update in Progress", "Finish saving the current review before opening another request.");
      return;
    }
    if (selected?.id !== item.id) {
      resetProtectedReviewView();
    }
    setSelected(item);
    setReviewTab("case");
    setReviewFocusStage(null);
    setQuickAction(null);
    setSimpleReviewMode(true);
    setScreenMode("detail");
  };

  const backToQueue = () => {
    if (savingAction) {
      Alert.alert("Update in Progress", "Finish saving the current review before returning to the list.");
      return;
    }
    resetProtectedReviewView();
    setSelected(null);
    setReviewTab("case");
    setReviewFocusStage(null);
    setQuickAction(null);
    setScreenMode("queue");
  };

  const updateCheck = (
    key: keyof VerificationChecks,
  ) => {
    setChecks((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const updateReviewDraft = <K extends keyof PrivateReviewDraft>(
    key: K,
    value: PrivateReviewDraft[K],
  ) => {
    setReviewDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  };

  const buildPrivateReviewPayload = (
    finalDecision: "pending" | "needs_more_information" | "verified" | "rejected" = "pending",
    decisionReason = "",
  ) => {
    if (!selected || !user || !reviewDraft) {
      throw new Error("Private LGU verification review is not ready.");
    }

    const grossCost = safeNumber(reviewDraft.verifiedGrossCost);
    const existingAssistance = safeNumber(
      reviewDraft.confirmedExistingAssistanceAmount,
    );
    const uncoveredAmount = Math.max(0, grossCost - existingAssistance);

    const riskFlags = reviewDraft.riskFlags
      .split(/[\n,]/)
      .map((item) => item.trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, 20);

    const duplicateRequestIds = reviewDraft.duplicateRequestIds
      .split(/[\n,]/)
      .map((item) => item.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 20);

    const latitude = reviewDraft.privateLatitude.trim();
    const longitude = reviewDraft.privateLongitude.trim();
    const hasCoordinates = latitude.length > 0 && longitude.length > 0;

    const privateLatitude = hasCoordinates ? Number(latitude) : null;
    const privateLongitude = hasCoordinates ? Number(longitude) : null;

    if (
      hasCoordinates &&
      (!Number.isFinite(privateLatitude) ||
        !Number.isFinite(privateLongitude) ||
        Number(privateLatitude) < -90 ||
        Number(privateLatitude) > 90 ||
        Number(privateLongitude) < -180 ||
        Number(privateLongitude) > 180)
    ) {
      throw new Error("Private verification coordinates are invalid.");
    }

    const facilityRequired =
      needsFacilityVerification(selected.category) ||
      reviewDraft.facilityVerificationRequired;

    const costRequired =
      Number(selected.estimatedAmount || 0) > 0 || reviewDraft.costVerificationRequired;

    const reviewStatus =
      finalDecision === "verified"
        ? "verified"
        : finalDecision === "rejected"
          ? "rejected"
          : finalDecision === "needs_more_information"
            ? "needs_more_information"
            : "in_progress";

    return {
      requestId: selected.id,
      requesterUid: selected.requesterUid || "",
      category: selected.category || "",

      reviewStatus,

      documentConsistencyStatus: reviewDraft.documentConsistencyStatus,
      documentConsistencyNotes: reviewDraft.documentConsistencyNotes.trim().slice(0, 2000),

      duplicateCheckStatus: reviewDraft.duplicateCheckStatus,
      duplicateRequestIds,
      duplicateCheckNotes: reviewDraft.duplicateCheckNotes.trim().slice(0, 2000),

      beneficiaryCheckStatus: reviewDraft.beneficiaryCheckStatus,
      beneficiaryCheckNotes: reviewDraft.beneficiaryCheckNotes.trim().slice(0, 2000),

      facilityVerificationRequired: facilityRequired,
      facilityVerificationStatus: facilityRequired
        ? reviewDraft.facilityVerificationStatus === "not_required"
          ? "pending"
          : reviewDraft.facilityVerificationStatus
        : "not_required",
      facilityName: reviewDraft.facilityName.trim().slice(0, 160),
      facilityType: reviewDraft.facilityType.trim().slice(0, 80),
      facilityDepartment: reviewDraft.facilityDepartment.trim().slice(0, 160),
      professionalName: reviewDraft.professionalName.trim().slice(0, 160),
      facilityReferenceNumber: reviewDraft.facilityReferenceNumber.trim().slice(0, 160),
      facilityVerificationMethod: facilityRequired
        ? reviewDraft.facilityVerificationMethod
        : "not_applicable",
      facilityVerifiedWith: reviewDraft.facilityVerifiedWith.trim().slice(0, 160),
      facilityVerifiedAt:
        facilityRequired && reviewDraft.facilityVerificationStatus === "confirmed"
          ? verificationReview?.facilityVerifiedAt || serverTimestamp()
          : null,
      facilityNotes: reviewDraft.facilityNotes.trim().slice(0, 2000),

      costVerificationRequired: costRequired,
      residentEstimatedAmount: Number(selected.estimatedAmount || 0),
      verifiedGrossCost: costRequired ? grossCost : 0,
      confirmedExistingAssistanceAmount: costRequired ? existingAssistance : 0,
      verifiedUncoveredAmount: costRequired ? uncoveredAmount : 0,
      costVerificationStatus: costRequired
        ? reviewDraft.costVerificationStatus === "not_required"
          ? "pending"
          : reviewDraft.costVerificationStatus
        : "not_required",
      costReferenceNumber: reviewDraft.costReferenceNumber.trim().slice(0, 160),
      costNotes: reviewDraft.costNotes.trim().slice(0, 2000),

      residencyVerificationStatus: reviewDraft.residencyVerificationStatus,
      residencyVerificationMethod: reviewDraft.residencyVerificationMethod,
      privateAddressSnapshot: reviewDraft.privateAddressSnapshot.trim().slice(0, 300),
      privateLatitude,
      privateLongitude,
      locationVerifiedAt:
        reviewDraft.residencyVerificationStatus === "verified"
          ? verificationReview?.locationVerifiedAt || serverTimestamp()
          : null,
      locationVerifiedBy:
        reviewDraft.residencyVerificationStatus === "verified" ? user.uid : "",
      residencyNotes: reviewDraft.residencyNotes.trim().slice(0, 2000),

      videoVerificationRequired: reviewDraft.videoVerificationRequired,
      videoVerificationStatus: reviewDraft.videoVerificationRequired
        ? reviewDraft.videoVerificationStatus === "not_required"
          ? "pending"
          : reviewDraft.videoVerificationStatus
        : "not_required",
      videoVerificationAt:
        reviewDraft.videoVerificationRequired &&
        reviewDraft.videoVerificationStatus === "completed"
          ? verificationReview?.videoVerificationAt || serverTimestamp()
          : null,
      videoVerificationNotes: reviewDraft.videoVerificationNotes.trim().slice(0, 2000),

      siteVisitRequired: reviewDraft.siteVisitRequired,
      siteVisitStatus: reviewDraft.siteVisitRequired
        ? reviewDraft.siteVisitStatus === "not_required"
          ? "pending"
          : reviewDraft.siteVisitStatus
        : "not_required",
      siteVisitAt:
        reviewDraft.siteVisitRequired && reviewDraft.siteVisitStatus === "completed"
          ? verificationReview?.siteVisitAt || serverTimestamp()
          : null,
      siteVisitBy:
        reviewDraft.siteVisitRequired && reviewDraft.siteVisitStatus === "completed"
          ? user.uid
          : "",
      siteVisitNotes: reviewDraft.siteVisitNotes.trim().slice(0, 2000),

      riskFlags,
      internalNotes: reviewDraft.internalNotes.trim().slice(0, 3000),

      finalDecision,
      finalDecisionReason:
        finalDecision === "pending" ? "" : decisionReason.trim().slice(0, 2000),
      finalDecisionAt:
        finalDecision === "pending" ? null : serverTimestamp(),
      finalDecisionBy:
        finalDecision === "pending" ? "" : user.uid,

      createdAt: verificationReview?.createdAt || serverTimestamp(),
      createdBy: verificationReview?.createdBy || user.uid,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    };
  };

  const persistPrivateReview = async (
    action: "save_progress" | "more_information" | "verify" | "reject",
    decisionReason = "",
  ) => {
    if (!selected || !user || !reviewDraft) {
      throw new Error("Private LGU verification review is not ready.");
    }

    const token = await user.getIdToken(true);

    const response = await fetch(
      `${SECURE_ASSISTANCE_BACKEND}/api/admin/assistance/requests/${encodeURIComponent(
        selected.id,
      )}/review`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          review: reviewDraft,
          decisionReason,
          adminNote: adminNote.trim(),
        }),
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      const backendError: any = new Error(
        result?.message ||
          result?.error ||
          `LGU review update failed with HTTP ${response.status}.`,
      );

      backendError.code =
        result?.error ||
        `http_${response.status}`;

      throw backendError;
    }

    const refreshed = await getDoc(
      doc(db, PRIVATE_REVIEW_COLLECTION, selected.id),
    );

    const data = refreshed.exists()
      ? (refreshed.data() as Record<string, any>)
      : null;

    setVerificationReview(data);

    if (data) {
      setReviewDraft(
        createPrivateReviewDraft(
          selected,
          data,
        ),
      );
    }

    return data;
  };

  const saveVerificationDraft = async () => {
    if (!selected || !reviewDraft || savingAction) return;
    setValidationIntent("draft");
    const errors = validateAssistanceReview(reviewDraft, "draft", selected.category);
    if (errors.length) {
      setReviewTab("decision");
      setReviewFocusStage((current) => ({
        stage: errors[0].stage,
        ticket: (current?.ticket ?? 0) + 1,
      }));
      return;
    }

    try {
      setSavingAction("save_private_review");
      await persistPrivateReview("save_progress");

      const message =
        "Private LGU verification progress has been saved.";

      if (Platform.OS === "web") {
        const browserAlert = (globalThis as any).alert;
        if (typeof browserAlert === "function") {
          browserAlert(message);
        } else {
          Alert.alert("Saved", message);
        }
      } else {
        Alert.alert("Saved", message);
      }
    } catch (error: any) {
      const message =
        error?.message ||
        "The private LGU verification record could not be saved.";

      console.error("Verification progress save failed", error);

      if (Platform.OS === "web") {
        const browserAlert = (globalThis as any).alert;
        if (typeof browserAlert === "function") {
          browserAlert(
            `Verification Save Failed\n\n${message}`,
          );
        } else {
          Alert.alert("Verification Save Failed", message);
        }
      } else {
        Alert.alert("Verification Save Failed", message);
      }
    } finally {
      setSavingAction("");
    }
  };

  const updateRequest = async (
    actionKey: string,
    values: Record<string, any>,
    quiet = false,
  ): Promise<boolean> => {
    if (
      !selected ||
      !user ||
      !isOperationalAdmin ||
      savingAction
    ) {
      return false;
    }

    try {
      setSavingAction(actionKey);

      const token = await user.getIdToken(true);

      let payload: Record<string, any> = {};

      if (actionKey === "approve_donation_budget") {
        payload = {
          approvedGrossCost: Number(values.approvedGrossCost),
          confirmedExistingAssistanceAmount: Number(values.confirmedExistingAssistanceAmount || 0),
          budgetEvidenceNote: String(values.budgetEvidenceNote || "").trim(),
        };
      } else if (actionKey === "resource_assessment") {
        payload = {
          supportDecision: String(values.supportDecision || ""),
          remainingAmount: Number(values.remainingAmount || 0),
          adminNote: String(values.adminNote || ""),
        };
      } else if (actionKey === "assistance_provided") {
        payload = {
          supportDecision: String(values.supportDecision || ""),
          remainingAmount: Number(values.remainingAmount || 0),
          adminNote: String(values.adminNote || ""),
        };
      } else if (actionKey === "save_location") {
        payload = {
          assignedLocationType: String(values.assignedLocationType || ""),
          assignedLocationName: String(values.assignedLocationName || ""),
          assignedLocationAddress: String(values.assignedLocationAddress || ""),
          assignedLocationNotes: String(values.assignedLocationNotes || ""),
          adminNote: String(values.adminNote || ""),
        };
      } else if (actionKey === "clear_location") {
        payload = {
          adminNote: String(values.adminNote || ""),
        };
      } else {
        throw new Error("Unsupported Assistance Request operation.");
      }

      const response = await fetch(
        `${SECURE_ASSISTANCE_BACKEND}/api/admin/assistance/requests/${encodeURIComponent(
          selected.id,
        )}/operation`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: actionKey,
            ...payload,
          }),
        },
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        const backendError: any = new Error(
          result?.message ||
            result?.error ||
            `Assistance operation failed with HTTP ${response.status}.`,
        );

        backendError.code =
          result?.error ||
          `http_${response.status}`;

        throw backendError;
      }

      const successMessages: Record<string, string> = {
        resource_assessment:
          "LGU resource assessment has been saved.",
        assistance_provided:
          "Assistance has been marked as provided.",
        save_location:
          "Official public service location has been saved.",
        clear_location:
          "Official public service location has been cleared.",
      };

      const message =
        successMessages[actionKey] ||
        "Assistance Request update has been saved.";

      if (!quiet) {
        if (Platform.OS === "web") {
          const browserAlert = (globalThis as any).alert;
          if (typeof browserAlert === "function") {
            browserAlert(message);
          } else {
            Alert.alert("Saved", message);
          }
        } else {
          Alert.alert("Saved", message);
        }
      }
      return true;
    } catch (error: any) {
      console.error(
        "assistance request operation error",
        error,
      );

      const message =
        error?.message ||
        "The Assistance Request could not be updated.";

      if (Platform.OS === "web") {
        const browserAlert = (globalThis as any).alert;
        if (typeof browserAlert === "function") {
          browserAlert(
            `Update Failed\n\n${message}`,
          );
        } else {
          Alert.alert("Update Failed", message);
        }
      } else {
        Alert.alert("Update Failed", message);
      }
      return false;
    } finally {
      setSavingAction("");
    }
  };

  const continueToDonationCampaign = async (
    publicOfficeName: string,
    publicOfficeAddress: string,
    budget: DonationBudgetDraft,
  ): Promise<boolean> => {
    if (!selected || selected.verificationStatus !== "verified" || !verificationReview) {
      Alert.alert("Review first", "This request must be verified before setting up donations.");
      return false;
    }
    if (selected.donationCampaignId) {
      router.push({ pathname: "/donation-list", params: { assistanceRequestId: selected.id } } as any);
      return true;
    }
    let verifiedAmount = Number(verificationReview.verifiedUncoveredAmount || 0);
    if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
      const previousGross = Number(verificationReview.verifiedGrossCost || 0);
      const previousHelp = Number(verificationReview.confirmedExistingAssistanceAmount || 0);
      const canApprove = !selected.donationCampaignId &&
        String(selected.status || "verified").toLowerCase() === "verified" &&
        Number(selected.remainingAmount || 0) <= 0 &&
        previousGross >= 0 && previousHelp >= 0 &&
        Math.abs(previousGross - previousHelp) < 0.01 &&
        !verificationReview.postApprovalBudgetAt;
      if (!canApprove) {
        if (Platform.OS === "web" && typeof (globalThis as any).alert === "function") {
          (globalThis as any).alert("Donation budget is not editable. This request may already have a published campaign or an approved additional budget.");
        } else {
          Alert.alert("Budget unavailable", "This request already has a campaign or approved additional budget.");
        }
        return false;
      }
      const gross = Number(budget.total);
      const previous = Number(budget.alreadyReceived || 0);
      const basis = budget.basis.trim();
      const centsOk = (amount: number) => Math.abs(amount * 100 - Math.round(amount * 100)) < 0.00001;
      if (!Number.isFinite(gross) || gross <= 0 || gross > 100000000 ||
          !Number.isFinite(previous) || previous < 0 || previous >= gross ||
          !centsOk(gross) || !centsOk(previous) || basis.length < 20 || basis.length > 800) {
        Alert.alert("Check donation budget", "Enter the item total, other assistance received and an itemized price explanation.");
        return false;
      }
      const approved = await updateRequest("approve_donation_budget", {
        approvedGrossCost: gross, confirmedExistingAssistanceAmount: previous, budgetEvidenceNote: basis,
      }, true);
      if (!approved) return false;
      verifiedAmount = Math.round((gross - previous) * 100) / 100;
    }
    const savedPlace = String(selected.assignedLocationName || "").trim();
    const savedAddress = String(selected.assignedLocationAddress || "").trim();
    if (!savedPlace || !savedAddress) {
      const locIssue = validateAssistanceLocation(
        locationType || "lgu_office",
        publicOfficeName,
        publicOfficeAddress,
      );
      if (locIssue.length) {
        Alert.alert("Public office details needed", "Enter the official LGU office or partner location and its public address. Do not enter the resident's home.");
        return false;
      }
      const saved = await updateRequest(
        "save_location",
        {
          assignedLocationType: locationType || "lgu_office",
          assignedLocationName: publicOfficeName.trim(),
          assignedLocationAddress: publicOfficeAddress.trim(),
          assignedLocationNotes: "",
        },
        true,
      );
      if (!saved) return false;
    }
    const supportAlreadySaved =
      selected.supportDecision === "donation_support" &&
      Number(selected.remainingAmount || 0) === verifiedAmount;
    if (!supportAlreadySaved) {
      const supportSaved = await updateRequest(
        "resource_assessment",
        { supportDecision: "donation_support", remainingAmount: verifiedAmount },
        true,
      );
      if (!supportSaved) return false;
    }
    router.push({ pathname: "/donation-list", params: { assistanceRequestId: selected.id } } as any);
    return true;
  };

  const saveSimpleSupportChoice = async (choice: string): Promise<boolean> => {
    if (!selected || selected.verificationStatus !== "verified" ||
        !["internal_support", "not_required"].includes(choice)) return false;
    return updateRequest("resource_assessment", { supportDecision: choice, remainingAmount: 0 });
  };

  const startReview = () => {
    if (!selected || !reviewDraft || savingAction) return;

    confirmAdminAction(
      "Start LGU Review",
      "Move this request to Under Review and create its private verification record?",
      "Start Review",
      async () => {
        try {
          setSavingAction("start_review");

          if (!user) {
            throw new Error("Admin session is not available.");
          }

          const token = await user.getIdToken(true);
          const response = await fetch(
            `${SECURE_ASSISTANCE_BACKEND}/api/admin/assistance/requests/${encodeURIComponent(
              selected.id,
            )}/start-review`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({}),
            },
          );

          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.ok) {
            const backendError: any = new Error(
              result?.message ||
                result?.error ||
                `Start Review failed with HTTP ${response.status}.`,
            );

            backendError.code =
              result?.error ||
              `http_${response.status}`;

            throw backendError;
          }

          const refreshed = await getDoc(
            doc(db, PRIVATE_REVIEW_COLLECTION, selected.id),
          );

          const data = refreshed.exists()
            ? (refreshed.data() as Record<string, any>)
            : null;

          setVerificationReview(data);

          if (data) {
            setReviewDraft(
              createPrivateReviewDraft(
                selected,
                data,
              ),
            );
          }
        } catch (error: any) {
          console.error("Start LGU Review failed", error);

          const errorCode = String(error?.code || "unknown_error");
          const errorMessage = String(
            error?.message ||
              "The private verification record could not be created.",
          );
          const diagnosticMessage =
            `Start Review failed.\n\nCode: ${errorCode}\nMessage: ${errorMessage}\n\n` +
            `The request was not moved to Under Review.`;

          if (Platform.OS === "web") {
            const browserAlert = (globalThis as any).alert;
            if (typeof browserAlert === "function") {
              browserAlert(diagnosticMessage);
            } else {
              Alert.alert("Unable to Start Review", diagnosticMessage);
            }
          } else {
            Alert.alert("Unable to Start Review", diagnosticMessage);
          }
        } finally {
          setSavingAction("");
        }
      },
    );
  };

  const requestMoreInformation = async () => {
    if (!selected || !reviewDraft || savingAction) return;

    const note = adminNote.trim();

    setReasonAttempt("more_information");
    if (validateAssistanceReason("more_information", note)) {
      setReviewTab((current) => current === "decision" ? current : "case");
      setQuickAction("more_info");
      return;
    }

    try {
      setSavingAction("more_info");
      await persistPrivateReview(
        "more_information",
        note,
      );
    } catch (error: any) {
      Alert.alert(
        "Request More Information Failed",
        error?.message || "The review could not be updated.",
      );
    } finally {
      setSavingAction("");
    }
  };

  const verifyNeed = () => {
    if (!selected || !reviewDraft || savingAction) return;
    setValidationIntent("verify");
    const issues = validateAssistanceReview(reviewDraft, "verify", selected.category);
    if (issues.length) {
      setReviewTab("decision");
      setReviewFocusStage((current) => ({
        stage: issues[0].stage,
        ticket: (current?.ticket ?? 0) + 1,
      }));
      return;
    }
    if (!verificationReview || !reviewReadyForVerification(reviewDraft)) {
      setReviewTab("decision");
      Alert.alert("Verification Incomplete", "Start Review and complete all required private checks before verifying the request.");
      return;
    }

    const gross = safeNumber(reviewDraft.verifiedGrossCost);
    const existing = safeNumber(reviewDraft.confirmedExistingAssistanceAmount);
    const uncovered = Math.max(0, gross - existing);

    confirmAdminAction(
      "Verify Assistance Need",
      `Confirm this case as a legitimate verified need?${reviewDraft.costVerificationRequired ? `

Verified gross cost: PHP ${gross.toLocaleString("en-PH")}
Existing confirmed assistance: PHP ${existing.toLocaleString("en-PH")}
Verified uncovered amount: PHP ${uncovered.toLocaleString("en-PH")}` : ""}

This still does not automatically create a Donation Campaign.`,
      "Verify Need",
      async () => {
        try {
          setSavingAction("verify");
          await persistPrivateReview(
            "verify",
            adminNote.trim() || "LGU verification completed.",
          );
        } catch (error: any) {
          Alert.alert(
            "Verification Failed",
            error?.message || "The private verification could not be finalized.",
          );
        } finally {
          setSavingAction("");
        }
      },
    );
  };

  const rejectRequest = () => {
    if (!selected || !reviewDraft) return;

    const reason = rejectionReason.trim();

    setReasonAttempt("reject");
    if (validateAssistanceReason("reject", reason)) {
      if (reviewTab !== "decision") setQuickAction("reject");
      return;
    }

    confirmAdminAction(
      "Reject Assistance Request",
      "Reject this request after LGU review? The private verification record and reason will be preserved for audit.",
      "Reject",
      async () => {
        try {
          setSavingAction("reject");
          await persistPrivateReview(
            "reject",
            reason,
          );
        } catch (error: any) {
          Alert.alert(
            "Rejection Failed",
            error?.message || "The review could not be rejected.",
          );
        } finally {
          setSavingAction("");
        }
      },
      true,
    );
  };

  const saveResourceAssessment = () => {
    if (!selected || selected.verificationStatus !== "verified") {
      Alert.alert(
        "Verified Need Required",
        "Complete LGU verification before recording the support decision.",
      );
      return;
    }

    setSupportValidationAttempt("support");
    const verifiedCap = Number(verificationReview?.verifiedUncoveredAmount || 0);
    if (validateAssistanceSupport(supportDecision, remainingAmount, verifiedCap).length) {
      setReviewTab("decision");
      setReviewFocusStage((current) => ({ stage: "support", ticket: (current?.ticket ?? 0) + 1 }));
      return;
    }
    const amount = Number(remainingAmount || 0);

    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert("Invalid Remaining Amount", "Enter a valid remaining unmet amount, or 0 if none.");
      return;
    }

    if (supportDecision === "donation_support" && amount > verifiedCap) {
      Alert.alert(
        "Amount Exceeds Verified Need",
        `Donation support cannot exceed the private LGU-verified uncovered amount of PHP ${verifiedCap.toLocaleString("en-PH")}.`,
      );
      return;
    }

    if (supportDecision === "donation_support" && amount <= 0) {
      Alert.alert(
        "Remaining Need Required",
        "Enter the verified remaining unmet amount before opening Donation Support.",
      );
      return;
    }

    void updateRequest("resource_assessment", {
      status: "verified",
      verificationStatus: "verified",
      supportDecision,
      remainingAmount: supportDecision === "donation_support" ? amount : 0,
      adminNote: adminNote.trim().slice(0, 2000),
    });
  };

  const markAssistanceProvided =
    () => {
      if (!selected) return;

      if (
        ![
          "internal_support",
          "not_required",
        ].includes(
          selected.supportDecision ||
            supportDecision,
        )
      ) {
        Alert.alert(
          "Support Decision",
          "Mark Assistance Provided only when LGU/partner support has been provided or no additional external support is required.",
        );
        return;
      }

      confirmAdminAction(
        "Mark Assistance Provided",
        "Confirm that the verified assistance has been provided or otherwise completed without opening a public Donation Campaign.",
        "Confirm",
        async () => {
          await updateRequest(
            "assistance_provided",
            {
              status:
                "assistance_provided",
              verificationStatus:
                "verified",
              supportDecision:
                selected.supportDecision ||
                supportDecision,
              remainingAmount:
                Number(
                  selected.remainingAmount ||
                    remainingAmount ||
                    0,
                ),
              adminNote:
                adminNote
                  .trim()
                  .slice(0, 2000),
            },
          );
        },
      );
    };

  const saveOfficialLocation =
    () => {
      if (
        !selected ||
        selected.verificationStatus !==
          "verified"
      ) {
        Alert.alert(
          "Verified Need Required",
          "Set the official public service location only after the request is verified.",
        );
        return;
      }

      setSupportValidationAttempt("location");
      if (validateAssistanceLocation(locationType, locationName, locationAddress).length) {
        setReviewTab("decision");
        setReviewFocusStage((current) => ({ stage: "support", ticket: (current?.ticket ?? 0) + 1 }));
        return;
      }

      void updateRequest(
        "save_location",
        {
          status:
            selected.status ||
            "verified",
          verificationStatus:
            "verified",
          supportDecision:
            selected.supportDecision ||
            "pending",
          remainingAmount:
            Number(
              selected.remainingAmount ||
                0,
            ),
          assignedLocationType:
            locationType,
          assignedLocationName:
            locationName
              .trim()
              .slice(0, 160),
          assignedLocationAddress:
            locationAddress
              .trim()
              .slice(0, 300),
          assignedLocationNotes:
            locationNotes
              .trim()
              .slice(0, 1000),
          assignedLocationSetBy:
            user?.uid || "",
          assignedLocationSetAt:
            serverTimestamp(),
          adminNote:
            adminNote
              .trim()
              .slice(0, 2000),
        },
      );
    };

  const clearOfficialLocation =
    () => {
      if (
        !selected ||
        selected.verificationStatus !==
          "verified"
      ) {
        return;
      }

      void updateRequest(
        "clear_location",
        {
          status:
            selected.status ||
            "verified",
          verificationStatus:
            "verified",
          supportDecision:
            selected.supportDecision ||
            "pending",
          remainingAmount:
            Number(
              selected.remainingAmount ||
                0,
            ),
          assignedLocationType: "",
          assignedLocationName: "",
          assignedLocationAddress: "",
          assignedLocationNotes: "",
          assignedLocationSetBy: "",
          assignedLocationSetAt: null,
          adminNote:
            adminNote
              .trim()
              .slice(0, 2000),
        },
      );
    };

  const openDocument = async (
    item: StoredDocument,
  ) => {
    if (!item.url || !user) {
      Alert.alert(
        "Document Unavailable",
        "This document does not have a valid secure evidence reference.",
      );
      return;
    }

    if (!item.url.startsWith(`${SECURE_ASSISTANCE_BACKEND}/api/assistance/evidence/`)) {
      Alert.alert(
        "Legacy Evidence Blocked",
        "This document uses an older unprotected URL. Re-submit the test request using the secured Request Assistance flow before reviewing evidence.",
      );
      return;
    }

    setPreviewDocument(item);
    setPreviewAccessUrl("");
    setPreviewError("");
    setPreviewLoading(true);

    try {
      const token = await user.getIdToken(true);
      const response = await fetch(item.url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.accessUrl) {
        throw new Error(
          result?.message || result?.error || `Secure evidence access failed with HTTP ${response.status}.`,
        );
      }

      setPreviewAccessUrl(String(result.accessUrl));
    } catch (error: any) {
      setPreviewError(
        error?.message || "The private supporting document could not be opened.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeDocumentPreview = () => {
    setPreviewDocument(null);
    setPreviewAccessUrl("");
    setPreviewError("");
    setPreviewLoading(false);
  };

  const openExternalDocument = async () => {
    if (!previewAccessUrl) return;

    try {
      const supported = await Linking.canOpenURL(previewAccessUrl);

      if (!supported) {
        throw new Error("Unsupported private document URL.");
      }

      await Linking.openURL(previewAccessUrl);
    } catch {
      Alert.alert(
        "Unable to Open",
        "The temporary private evidence link could not be opened in a new browser window.",
      );
    }
  };

  if (sessionLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#4F46E5"
        />
        <Text style={styles.loadingText}>
          Checking administrator access...
        </Text>
      </View>
    );
  }

  if (!isOperationalAdmin) {
    return (
      <View style={styles.center}>
        <View style={styles.accessCard}>
          <Ionicons
            name="shield-outline"
            size={34}
            color="#B42318"
          />
          <Text style={styles.accessTitle}>
            Admin Access Required
          </Text>
          <Text style={styles.accessText}>
            Assistance Request verification is
            available only to an approved
            operational Admin account.
          </Text>
        </View>
      </View>
    );
  }


  const openReviewStage = (stage: ReviewStage = "checks") => {
    setSimpleReviewMode(false);
    // A new ticket makes even a repeated click on the same checklist entry
    // navigate back to its corresponding verification step.
    setReviewFocusStage((current) => ({ stage, ticket: (current?.ticket ?? 0) + 1 }));
    setReviewTab("decision");
    setQuickAction(null);
  };

  const quickChecklist: { label: string; done: boolean; stage: ReviewStage }[] = [
    {
      label: "Documents reviewed and consistent",
      done: reviewDraft?.documentConsistencyStatus === "consistent",
      stage: "checks" as ReviewStage,
    },
    {
      label: "No confirmed duplicate request",
      done: reviewDraft?.duplicateCheckStatus === "clear",
      stage: "checks" as ReviewStage,
    },
    {
      label: "Beneficiary and resident address verified",
      done: reviewDraft?.beneficiaryCheckStatus === "confirmed" &&
        reviewDraft?.residencyVerificationStatus === "verified",
      stage: (reviewDraft?.beneficiaryCheckStatus === "confirmed" ? "residency" : "checks") as ReviewStage,
    },
    {
      label: "Required amount, facility, and extra checks complete",
      done: !!reviewDraft &&
        (!reviewDraft.costVerificationRequired || reviewDraft.costVerificationStatus === "confirmed") &&
        (!reviewDraft.facilityVerificationRequired || reviewDraft.facilityVerificationStatus === "confirmed") &&
        ["not_required", "completed"].includes(reviewDraft.videoVerificationStatus) &&
        ["not_required", "completed"].includes(reviewDraft.siteVisitStatus) &&
        reviewDraft.riskFlags.trim().length === 0,
      stage: (!reviewDraft ||
        (reviewDraft.facilityVerificationRequired && reviewDraft.facilityVerificationStatus !== "confirmed") ||
        (reviewDraft.costVerificationRequired && reviewDraft.costVerificationStatus !== "confirmed"))
          ? "costs"
          : (!["not_required", "completed"].includes(reviewDraft.videoVerificationStatus) ||
            !["not_required", "completed"].includes(reviewDraft.siteVisitStatus))
            ? "residency"
            : reviewDraft.riskFlags.trim().length > 0
              ? "decision"
              : "costs" as ReviewStage,
    },
  ];

  const renderQuickChecklist = () => {
    if (!selected) return null;
    const completed = quickChecklist.filter((check) => check.done).length;
    const locked = selected.verificationStatus === "verified" || selected.verificationStatus === "rejected";
    return (
      <View style={styles.assistanceQuickChecklist}>
        <View style={styles.assistanceChecklistHeading}>
          <Ionicons name="shield-checkmark-outline" size={21} color="#047857" />
          <View style={{ flex: 1 }}>
            <Text style={styles.assistanceSectionTitle}>Verification Checklist</Text>
            <Text style={styles.assistanceSubtext}>
              {verificationReviewLoading
                ? "Loading the protected review record..."
                : `${completed} of ${quickChecklist.length} verification groups complete`}
            </Text>
          </View>
        </View>
        {quickChecklist.map((check) => (
          <TouchableOpacity
            key={check.label}
            disabled={verificationReviewLoading || locked}
            accessibilityRole="button"
            accessibilityLabel={`${check.label}: ${check.done ? "verified" : "not verified"}. Open review.`}
            onPress={() => openReviewStage(check.stage)}
            style={styles.assistanceChecklistRow}
          >
            <Ionicons
              name={check.done ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={check.done ? "#047857" : "#94A3B8"}
            />
            <Text style={styles.assistanceChecklistText}>{check.label}</Text>
            {!locked && <Ionicons name="chevron-forward" size={16} color="#94A3B8" />}
          </TouchableOpacity>
        ))}
        <Text style={styles.assistanceChecklistHelp}>
          The checks reflect saved or current private review details. Opening a check lets the Admin verify its evidence; a tick does not approve a request.
        </Text>
        {!locked && (
          <TouchableOpacity accessibilityRole="button" onPress={() => openReviewStage("checks")} style={styles.assistanceTextLink}>
            <Text style={styles.assistanceLinkText}>Open detailed verification</Text>
            <Ionicons name="arrow-forward" size={15} color="#047857" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderQuickActions = () => {
    if (!selected || ["verified", "rejected"].includes(String(selected.verificationStatus || ""))) return null;
    return (
      <View style={styles.assistanceQuickActions}>
        {selected.status === "pending" && !verificationReview && (
          <ActionButton label="Start Review" icon="play-outline" variant="secondary" loading={savingAction === "start_review"} onPress={startReview} />
        )}
        <View style={styles.assistanceQuickButtons}>
          <ActionButton
            label="Request More Info"
            icon="chatbox-ellipses-outline"
            variant="secondary"
            loading={savingAction === "more_info"}
            onPress={() => setQuickAction(quickAction === "more_info" ? null : "more_info")}
          />
          <ActionButton
            label="Reject"
            icon="close-circle-outline"
            variant="danger"
            loading={savingAction === "reject"}
            onPress={() => setQuickAction(quickAction === "reject" ? null : "reject")}
          />
          <ActionButton
            label={allChecksComplete ? "Verify Need" : "Complete Checks"}
            icon="shield-checkmark-outline"
            variant="success"
            loading={savingAction === "verify"}
            onPress={verifyNeed}
          />
        </View>
        {quickAction && (
          <View style={styles.assistanceQuickNote}>
            <Text style={styles.assistanceSectionTitle}>
              {quickAction === "reject" ? "Reason for rejection" : "Information needed from the Resident"}
            </Text>
            <Text style={styles.assistanceSubtext}>
              {quickAction === "reject"
                ? "Give a clear, evidence-based reason. The final rejection requires confirmation."
                : "Specify the missing proof or information before sending the request."}
              <Text style={styles.assistanceRequiredAsterisk}> *</Text>
            </Text>
            <TextInput
              value={quickAction === "reject" ? rejectionReason : adminNote}
              onChangeText={quickAction === "reject" ? setRejectionReason : setAdminNote}
              placeholder={quickAction === "reject" ? "Enter a rejection reason" : "What details or evidence are missing?"}
              placeholderTextColor="#94A3B8"
              style={[styles.textArea, reasonAttempt === (quickAction === "reject" ? "reject" : "more_information") &&
                validateAssistanceReason(quickAction === "reject" ? "reject" : "more_information", quickAction === "reject" ? rejectionReason : adminNote)
                  ? styles.assistanceFieldInvalid : null]}
              multiline
              maxLength={1000}
            />
            {reasonAttempt === (quickAction === "reject" ? "reject" : "more_information") && (
              <ReviewValidationHint message={validateAssistanceReason(
                quickAction === "reject" ? "reject" : "more_information",
                quickAction === "reject" ? rejectionReason : adminNote,
              )} />
            )}
            {!verificationReview && (
              <Text style={styles.assistanceWarning}>
                Start Review first to create the protected record before submitting a decision.
              </Text>
            )}
            <View style={styles.assistanceQuickButtons}>
              <ActionButton label="Cancel" icon="close-outline" variant="secondary" loading={false} onPress={() => setQuickAction(null)} />
              <ActionButton
                label={quickAction === "reject" ? "Confirm Rejection" : "Send Request"}
                icon={quickAction === "reject" ? "close-circle-outline" : "send-outline"}
                variant={quickAction === "reject" ? "danger" : "primary"}
                loading={savingAction === (quickAction === "reject" ? "reject" : "more_info")}
                disabled={!verificationReview || !!savingAction}
                onPress={quickAction === "reject" ? rejectRequest : requestMoreInformation}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderReviewMain = () => {
    if (!selected) return null;

    return (
      <>
        {reviewTab === "case" && (
          <>
            <CaseReviewTab request={selected} />
            {!["verified","rejected"].includes(String(selected.verificationStatus || "")) && (
              <View style={styles.simpleSummaryAction}>
                <Text style={styles.simpleCopy}>Review the documents and resident details, then record your decision in one short form.</Text>
                <ActionButton label="Review & Decide" icon="shield-checkmark-outline" variant="success" loading={false}
                  onPress={() => {setReviewTab("decision");setSimpleReviewMode(true);}} />
              </View>
            )}
          </>
        )}

        {reviewTab === "evidence" && (
          <EvidenceTab
            request={selected}
            onOpen={openDocument}
          />
        )}

        {reviewTab === "resident" && (
          <ResidentReviewTab
            request={selected}
            profile={residentProfile}
            loading={residentLoading}
            relatedRequests={relatedRequests}
            sameBeneficiaryRequests={sameBeneficiaryRequests}
          />
        )}

        {reviewTab === "decision" && renderDecisionRail()}
      </>
    );
  };

  const renderDecisionRail = () => {
    if (!selected) return null;
    if (selected.verificationStatus === "verified") {
      return <CompactVerifiedAssistance
        key={selected.id}
        request={selected}
        reviewRecord={verificationReview}
        reviewLoading={verificationReviewLoading}
        publicOfficeName={locationName}
        setPublicOfficeName={setLocationName}
        publicOfficeAddress={locationAddress}
        setPublicOfficeAddress={setLocationAddress}
        savingAction={savingAction}
        onDonation={continueToDonationCampaign}
        onSaveOtherSupport={saveSimpleSupportChoice}
        onOpenCampaign={() => router.push({
          pathname: "/donation-list",
          params: { assistanceRequestId: selected.id },
        } as any)}
      />;
    }
    if (simpleReviewMode && !["verified","rejected"].includes(String(selected.verificationStatus || ""))) {
      return <CompactAssistanceReview
        key={selected.id}
        request={selected} reviewDraft={reviewDraft} reviewRecord={verificationReview}
        reviewLoading={verificationReviewLoading} validationIntent={validationIntent}
        reasonAttempt={reasonAttempt} adminNote={adminNote} setAdminNote={setAdminNote}
        rejectionReason={rejectionReason} setRejectionReason={setRejectionReason}
        savingAction={savingAction} onReviewChange={updateReviewDraft}
        onStartReview={startReview} onVerify={verifyNeed}
        onMoreInfo={requestMoreInformation} onReject={rejectRequest}
        onDocuments={() => setReviewTab("evidence")} onResident={() => setReviewTab("resident")}
        onAdditional={() => {setSimpleReviewMode(false);setReviewFocusStage({stage:"checks",ticket:1});}}
      />;
    }
    return (
      <>
      {!["verified","rejected"].includes(String(selected.verificationStatus || "")) && (
        <TouchableOpacity accessibilityRole="button" style={styles.simpleReturnButton}
          onPress={() => setSimpleReviewMode(true)}>
          <Ionicons name="arrow-back-outline" size={17} color="#0F766E" />
          <Text style={styles.simpleReturnText}>Back to simple review</Text>
        </TouchableOpacity>
      )}
      <DecisionTab
        request={selected}
        reviewDraft={reviewDraft}
        reviewRecord={verificationReview}
        reviewLoading={verificationReviewLoading}
        focusStage={reviewFocusStage}
        validationIntent={validationIntent}
        reasonAttempt={reasonAttempt}
        supportValidationAttempt={supportValidationAttempt}
        onReviewChange={updateReviewDraft}
        allChecksComplete={allChecksComplete}
        onSaveVerificationDraft={saveVerificationDraft}
        adminNote={adminNote}
        setAdminNote={setAdminNote}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        supportDecision={supportDecision}
        setSupportDecision={setSupportDecision}
        remainingAmount={remainingAmount}
        setRemainingAmount={setRemainingAmount}
        locationType={locationType}
        setLocationType={setLocationType}
        locationName={locationName}
        setLocationName={setLocationName}
        locationAddress={locationAddress}
        setLocationAddress={setLocationAddress}
        locationNotes={locationNotes}
        setLocationNotes={setLocationNotes}
        savingAction={savingAction}
        onStartReview={startReview}
        onRequestMoreInfo={requestMoreInformation}
        onVerify={verifyNeed}
        onReject={rejectRequest}
        onSaveResourceAssessment={saveResourceAssessment}
        onMarkAssistanceProvided={markAssistanceProvided}
        onSaveLocation={saveOfficialLocation}
        onClearLocation={clearOfficialLocation}
      />
      </>
    );
  };

  const renderDetailChrome = () => {
    if (!selected) return null;

    return (
      <>
        {!wide && <View style={styles.detailBreadcrumbRow}>
          <TouchableOpacity
            style={styles.mockBackLink}
            onPress={backToQueue}
          >
            <Ionicons
              name="arrow-back"
              size={17}
              color="#2563EB"
            />
            <Text style={styles.mockBackLinkText}>
              Assistance Requests
            </Text>
          </TouchableOpacity>

          <View style={styles.detailSecurityBadge}>
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color="#475569"
            />
            <Text style={styles.detailSecurityBadgeText}>
              Authorized LGU Review
            </Text>
          </View>
        </View>}

        <View style={styles.detailHeaderCard}>
          <RequestReviewHeader request={selected} />
        </View>

        <View style={styles.mockDetailTabs}>
          <ReviewTabButton
            label="Overview"
            icon="document-text-outline"
            active={reviewTab === "case"}
            onPress={() => setReviewTab("case")}
          />
          <ReviewTabButton
            label={`Evidence (${selected.documents?.length || 0})`}
            icon="images-outline"
            active={reviewTab === "evidence"}
            onPress={() => setReviewTab("evidence")}
          />
          <ReviewTabButton
            label="Resident"
            icon="person-outline"
            active={reviewTab === "resident"}
            onPress={() => setReviewTab("resident")}
          />
          <ReviewTabButton
            label="Decision"
            icon="shield-checkmark-outline"
            active={reviewTab === "decision"}
            onPress={() => setReviewTab("decision")}
          />
        </View>
      </>
    );
  };

  const categoryOptions = [
    { value: "all", label: "All Types" },
    { value: "disaster_recovery", label: "Disaster Recovery" },
    { value: "medical_health", label: "Medical / Health" },
    { value: "surgery_treatment", label: "Surgery / Treatment" },
    { value: "cancer_serious_illness", label: "Serious Illness" },
    { value: "animal_pet_welfare", label: "Animal / Pet Welfare" },
    { value: "elderly_assistance", label: "Elderly Assistance" },
    { value: "homeless_basic_needs", label: "Basic Needs" },
    { value: "other_community_assistance", label: "Other Assistance" },
  ];
  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "pending", label: "Pending Review" },
    { value: "under_review", label: "Under Review" },
    { value: "verified", label: "Verified" },
    { value: "rejected", label: "Rejected" },
    { value: "completed", label: "Completed" },
  ];
  const sortingOptions = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
    { value: "resident_az", label: "Resident A–Z" },
    { value: "resident_za", label: "Resident Z–A" },
    { value: "title_az", label: "Request A–Z" },
    { value: "title_za", label: "Request Z–A" },
  ];

  const changeStatusFilter = (value: ReviewFilter) => {
    // Keep every existing status choice while resetting pagination deterministically.
    switch (value) {
      case "all": setFilter("all"); setRecordPage(1); break;
      case "pending": setFilter("pending"); setRecordPage(1); break;
      case "under_review": setFilter("under_review"); setRecordPage(1); break;
      case "verified": setFilter("verified"); setRecordPage(1); break;
      case "rejected": setFilter("rejected"); setRecordPage(1); break;
      case "completed": setFilter("completed"); setRecordPage(1); break;
    }
  };

  const renderCompactQueue = () => (
    <View style={styles.assistanceQueueCard}>
      <View style={styles.assistanceQueueHeading}>
        <Text style={styles.assistanceQueueTitle}>Requests ({filteredRequests.length})</Text>
        {loadingRequests && <ActivityIndicator color="#047857" />}
      </View>
      <View style={styles.assistanceSearchField}>
        <Ionicons name="search-outline" size={19} color="#64748B" />
        <TextInput
          value={search}
          onChangeText={(value) => { setSearch(value); setRecordPage(1); }}
          placeholder="Search request, resident, or reference no."
          placeholderTextColor="#94A3B8"
          style={styles.assistanceSearchText}
        />
        {!!search && (
          <TouchableOpacity accessibilityLabel="Clear search" onPress={() => { setSearch(""); setRecordPage(1); }}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.assistanceFilterRow}>
        <ReviewPicker
          label="Category"
          value={categoryFilter}
          options={categoryOptions}
          onChange={(value) => { setCategoryFilter(value); setRecordPage(1); }}
        />
        <ReviewPicker
          label="Status"
          value={filter}
          options={statusOptions}
          onChange={(value) => changeStatusFilter(value as ReviewFilter)}
        />
      </View>
      <ReviewPicker
        label="Sort"
        value={sortOrder}
        options={sortingOptions}
        onChange={(value) => { setSortOrder(value as typeof sortOrder); setRecordPage(1); }}
      />
      {!!listenerError && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={17} color="#B42318" />
          <Text style={styles.errorText}>{listenerError}</Text>
        </View>
      )}
      {!loadingRequests && pagedRequests.length === 0 && (
        <View style={styles.assistanceEmptyQueue}>
          <Ionicons name="file-tray-outline" size={30} color="#94A3B8" />
          <Text style={styles.assistanceSubtext}>No requests match these filters.</Text>
        </View>
      )}
      {pagedRequests.map((item) => (
        <MockQueueRow
          key={item.id}
          request={item}
          active={selected?.id === item.id}
          onPress={() => selectRequest(item)}
        />
      ))}
      <View style={styles.assistancePageControl}>
        <ListPagination
          page={activeRequestPage}
          total={filteredRequests.length}
          pageSize={5}
          onChange={(page) => { setRecordPage(page); setQuickAction(null); }}
        />
      </View>
      <Text style={styles.assistanceListFootnote}>5 requests per page</Text>
    </View>
  );

  const renderSelectedWorkspace = () => !selected ? (
    <View style={styles.assistanceNoSelection}>
      <Ionicons name="document-text-outline" size={40} color="#94A3B8" />
      <Text style={styles.assistanceSectionTitle}>Choose a request to review</Text>
      <Text style={styles.assistanceSubtext}>
        Select a case to view its details, evidence, and available actions.
      </Text>
    </View>
  ) : (
    <>
      {renderDetailChrome()}
      <ScrollView
        key={selected.id + ":" + reviewTab}
        style={styles.assistanceReviewScroll}
        contentContainerStyle={styles.assistanceReviewContent}
        showsVerticalScrollIndicator
      >
        {renderReviewMain()}
      </ScrollView>
    </>
  );

  return (
    <View style={styles.page}>
      {wide ? (
        <View style={styles.assistanceDesktop}>
          <AdminReviewHero
            eyebrow="LGU WORKSPACE / RESIDENT ASSISTANCE"
            title="Assistance Requests"
            subtitle="Review requests, check supporting details, and plan assistance."
            icon="hand-left-outline"
            tag="REQUEST MANAGEMENT"
          />
          <View style={styles.assistanceSplitWorkspace}>
            <ScrollView
              style={styles.assistanceListPanel}
              contentContainerStyle={styles.assistanceListContent}
              showsVerticalScrollIndicator
            >
              {renderCompactQueue()}
            </ScrollView>
            <View style={styles.assistanceSelectedPanel}>
              {renderSelectedWorkspace()}
            </View>
          </View>
        </View>
      ) : screenMode === "queue" ? (
        <ScrollView style={styles.pageScroll} contentContainerStyle={styles.assistanceMobilePage}>
          <AdminReviewHero
            eyebrow="LGU WORKSPACE / RESIDENT ASSISTANCE"
            title="Assistance Requests"
            subtitle="Review requests, check supporting details, and plan assistance."
            icon="hand-left-outline"
            tag="REQUEST MANAGEMENT"
          />
          {renderCompactQueue()}
        </ScrollView>
      ) : (
        <ScrollView style={styles.pageScroll} contentContainerStyle={styles.assistanceMobilePage}>
          {renderDetailChrome()}
          {renderReviewMain()}
        </ScrollView>
      )}

      <DocumentPreviewModal
        item={previewDocument}
        secureUrl={previewAccessUrl}
        loading={previewLoading}
        error={previewError}
        onClose={closeDocumentPreview}
        onOpenExternal={openExternalDocument}
      />
    </View>
  );
}

function ReviewPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label || label;
  return (
    <View style={styles.assistancePicker}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedLabel}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={styles.assistancePickerButton}
      >
        <Text numberOfLines={1} style={styles.assistancePickerValue}>{selectedLabel}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#475569" />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.assistancePickerChoices}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: value === option.value }}
              onPress={() => { onChange(option.value); setExpanded(false); }}
              style={[styles.assistancePickerChoice, value === option.value && styles.assistancePickerChoiceSelected]}
            >
              <Text style={styles.assistancePickerChoiceText}>{option.label}</Text>
              {value === option.value && <Ionicons name="checkmark" size={16} color="#047857" />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function MockStatusTab({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.mockStatusTab,
        active && styles.mockStatusTabActive,
      ]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Text
        style={[
          styles.mockStatusTabText,
          active &&
            styles.mockStatusTabTextActive,
        ]}
      >
        {label} ({count})
      </Text>
    </TouchableOpacity>
  );
}

function MockQueueRow({
  request,
  active = false,
  onPress,
}: {
  request: AssistanceRequest;
  active?: boolean;
  onPress: () => void;
}) {
  const category = assistanceCategoryMeta(
    request.category,
  );
  const status = statusMeta(request.status);

  return (
    <TouchableOpacity
      style={[styles.mockQueueRow, active && styles.mockQueueRowSelected]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View
        style={[
          styles.mockQueueIcon,
          {
            backgroundColor: category.soft,
          },
        ]}
      >
        <Ionicons
          name={category.icon}
          size={22}
          color={category.color}
        />
      </View>

      <View style={styles.mockQueueMain}>
        <Text style={styles.mockQueueId}>
          {request.requestId || request.id}
        </Text>
        <Text
          style={styles.mockQueueTitle}
          numberOfLines={1}
        >
          {request.title ||
            "Assistance Request"}
        </Text>

        <View style={styles.mockQueueMetaLine}>
          <Ionicons
            name="person-outline"
            size={13}
            color="#64748B"
          />
          <Text style={styles.mockQueueMeta}>
            {request.requesterName ||
              "Resident"}
          </Text>
        </View>

        <View style={styles.mockQueueMetaLine}>
          <View
            style={[
              styles.mockQueueDot,
              {
                backgroundColor:
                  category.color,
              },
            ]}
          />
          <Text style={styles.mockQueueMeta}>
            {request.categoryLabel ||
              request.category ||
              "Community Assistance"}
          </Text>
        </View>
      </View>

      <View style={styles.mockQueueRight}>
        <View
          style={[
            styles.mockQueueStatus,
            {
              backgroundColor: status.soft,
            },
          ]}
        >
          <Text
            style={[
              styles.mockQueueStatusText,
              {
                color: status.color,
              },
            ]}
          >
            {status.label}
          </Text>
        </View>

        <Text style={styles.mockQueueDate}>
          {readableDate(request.createdAt)}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color="#94A3B8"
      />
    </TouchableOpacity>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons
          name={icon}
          size={20}
          color="#4338CA"
        />
      </View>
      <View>
        <Text style={styles.statValue}>
          {value}
        </Text>
        <Text style={styles.statLabel}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        active &&
          styles.filterChipActive,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text
        style={[
          styles.filterChipText,
          active &&
            styles.filterChipTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function RequestReviewHeader({
  request,
}: {
  request: AssistanceRequest;
}) {
  const meta =
    statusMeta(request.status);

  return (
    <View style={styles.reviewHeader}>
      <View style={styles.reviewHeaderCopy}>
        <Text style={styles.panelEyebrow}>
          REQUEST REVIEW
        </Text>

        <Text style={styles.reviewTitle}>
          {request.title ||
            "Assistance Request"}
        </Text>

        <Text style={styles.reviewSubtitle}>
          {request.requestId ||
            request.id}
          {"  |  "}
          {request.categoryLabel ||
            request.category ||
            "Community Assistance"}
        </Text>
      </View>

      <View
        style={[
          styles.largeStatusPill,
          {
            backgroundColor:
              meta.soft,
          },
        ]}
      >
        <Ionicons
          name={meta.icon}
          size={16}
          color={meta.color}
        />
        <Text
          style={[
            styles.largeStatusText,
            {
              color: meta.color,
            },
          ]}
        >
          {meta.label}
        </Text>
      </View>
    </View>
  );
}

function ReviewTabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.tabButton,
        active &&
          styles.tabButtonActive,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons
        name={icon}
        size={16}
        color={
          active
            ? "#4338CA"
            : "#64748B"
        }
      />
      <Text
        style={[
          styles.tabButtonText,
          active &&
            styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function CaseReviewTab({ request }: { request: AssistanceRequest }) {
  return (
    <View style={styles.tabContent}>
      <SectionCard title="Request Overview" subtitle="Information provided by the resident." icon="document-text-outline">
        <InfoGrid>
          <InfoItem label="Description" value={request.description || "No description provided"} />
          <InfoItem label="Resident Cost Estimate" value={money(request.estimatedAmount)} />
          <InfoItem label="Assistance Type" value={request.categoryLabel || request.category || "Not recorded"} />
          <InfoItem label="Date Requested" value={readableDate(request.createdAt)} />
          <InfoItem label="Beneficiary" value={request.beneficiaryName || "Not recorded"} />
          <InfoItem label="Current Situation" value={request.currentSituation || "Not recorded"} />
        </InfoGrid>
      </SectionCard>
    </View>
  );
}

function EvidenceTab({
  request,
  onOpen,
}: {
  request: AssistanceRequest;
  onOpen: (
    item: StoredDocument,
  ) => void;
}) {
  const documents =
    request.documents || [];

  const publicPhotoUrl =
    String(
      request.publicCampaignPhotoUrl ||
        "",
    ).trim();

  return (
    <View style={styles.tabContent}>
      <SectionCard
        title="Public Campaign Photo"
        subtitle="Required transparency photo submitted separately from private evidence. It may appear publicly only if the LGU verifies the request and later publishes Donation Support."
        icon="image-outline"
      >
        {publicPhotoUrl.startsWith("https://") ? (
          <View
            style={
              styles.publicCampaignPhotoCard
            }
          >
            <Image
              source={{
                uri: publicPhotoUrl,
              }}
              style={
                styles.publicCampaignPhotoImage
              }
              resizeMode="cover"
            />

            <View
              style={
                styles.publicCampaignPhotoCopy
              }
            >
              <View
                style={
                  styles.publicCampaignPhotoBadge
                }
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={14}
                  color="#15803D"
                />
                <Text
                  style={
                    styles.publicCampaignPhotoBadgeText
                  }
                >
                  {request.publicCampaignPhotoConsent === true
                    ? "RESIDENT CONSENT RECORDED"
                    : "CONSENT NOT CONFIRMED"}
                </Text>
              </View>

              <Text
                style={
                  styles.publicCampaignPhotoTitle
                }
              >
                {request.publicCampaignPhotoFileName ||
                  "Resident public campaign photo"}
              </Text>

              <Text
                style={
                  styles.publicCampaignPhotoText
                }
              >
                Review this image for privacy and relevance before publishing a Donation Campaign. Private medical documents, IDs, bills, and other evidence below must remain private.
              </Text>

              <TouchableOpacity
                style={
                  styles.publicCampaignPhotoOpenButton
                }
                onPress={() =>
                  void Linking.openURL(
                    publicPhotoUrl,
                  )
                }
              >
                <Ionicons
                  name="open-outline"
                  size={15}
                  color="#4338CA"
                />
                <Text
                  style={
                    styles.publicCampaignPhotoOpenButtonText
                  }
                >
                  Open Full Photo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View
            style={
              styles.emptyInner
            }
          >
            <Ionicons
              name="image-outline"
              size={30}
              color="#B42318"
            />
            <Text
              style={
                styles.emptyText
              }
            >
              No public campaign photo was submitted.
            </Text>
          </View>
        )}
      </SectionCard>

      <SectionCard
        title="Private Supporting Evidence"
        subtitle="Private LGU verification files. Review names, dates, facility details, estimates, and other relevant information."
        icon="images-outline"
      >
        {documents.length === 0 ? (
          <View style={styles.emptyInner}>
            <Ionicons
              name="image-outline"
              size={30}
              color="#94A3B8"
            />
            <Text
              style={styles.emptyText}
            >
              No supporting evidence was
              attached.
            </Text>
          </View>
        ) : (
          documents.map(
            (item, index) => (
              <TouchableOpacity
                key={`${item.url}-${index}`}
                style={
                  styles.documentRow
                }
                onPress={() =>
                  onOpen(item)
                }
                activeOpacity={0.8}
              >
                <View
                  style={
                    styles.documentIcon
                  }
                >
                  <Ionicons
                    name="image-outline"
                    size={20}
                    color="#4338CA"
                  />
                </View>

                <View
                  style={
                    styles.documentCopy
                  }
                >
                  <Text
                    style={
                      styles.documentTitle
                    }
                    numberOfLines={1}
                  >
                    {documentName(
                      item,
                      index,
                    )}
                  </Text>

                  <Text
                    style={
                      styles.documentMeta
                    }
                    numberOfLines={1}
                  >
                    {item.fileName ||
                      item.documentType ||
                      "Uploaded evidence"}
                  </Text>
                </View>

                <Ionicons
                  name="open-outline"
                  size={18}
                  color="#64748B"
                />
              </TouchableOpacity>
            ),
          )
        )}
      </SectionCard>

      <View style={styles.warningCard}>
        <Ionicons
          name="shield-checkmark-outline"
          size={21}
          color="#9A6700"
        />
        <View style={styles.noteCopy}>
          <Text style={styles.warningTitle}>
            Manual authenticity check required
          </Text>
          <Text style={styles.warningText}>
            A photo or screenshot alone does not
            prove that a medical certificate,
            hospital bill, veterinary quotation,
            government document, or other evidence
            is authentic. LGU staff should verify
            relevant names, dates, facility details,
            contact information, and supporting
            records when necessary.
          </Text>
        </View>
      </View>
    </View>
  );
}

function ResidentReviewTab({
  request,
  profile,
  loading,
  relatedRequests,
  sameBeneficiaryRequests,
}: {
  request: AssistanceRequest;
  profile: ResidentProfile | null;
  loading: boolean;
  relatedRequests: AssistanceRequest[];
  sameBeneficiaryRequests:
    AssistanceRequest[];
}) {
  return (
    <View style={styles.tabContent}>
      <SectionCard
        title="Resident Account"
        subtitle="Use only account and system history relevant to verifying this request."
        icon="person-circle-outline"
      >
        {loading ? (
          <ActivityIndicator
            color="#4F46E5"
          />
        ) : (
          <>
            <InfoGrid>
              <InfoItem
                label="Resident"
                value={
                  profile?.fullName ||
                  request.requesterName ||
                  "Not recorded"
                }
              />
              <InfoItem
                label="Account Status"
                value={
                  profile?.status ||
                  "Not recorded"
                }
              />
              <InfoItem
                label="Identity Status"
                value={
                  profile?.identityVerified
                    ? "Verified"
                    : profile?.identityStatus ||
                      "Not verified"
                }
              />
              <InfoItem
                label="Account Created"
                value={readableDate(
                  profile?.createdAt,
                )}
              />
              <InfoItem
                label="Email"
                value={
                  profile?.email ||
                  request.requesterEmail ||
                  "Not recorded"
                }
              />
              <InfoItem
                label="Phone"
                value={
                  profile?.phoneNumber ||
                  request.contactNumber ||
                  "Not recorded"
                }
              />
            </InfoGrid>
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Private Residency / Location Context"
        subtitle="This is private LGU review information. Do not publish the Resident's home address or live location on a Donation page."
        icon="location-outline"
      >
        <InfoGrid>
          <InfoItem
            label="Barangay"
            value={
              profile?.barangay ||
              request.requesterBarangay ||
              "Not recorded"
            }
          />
          <InfoItem
            label="Declared Address"
            value={
              profile?.address ||
              request.requesterAddress ||
              "Not recorded"
            }
          />
          <InfoItem
            label="City"
            value={
              profile?.city ||
              "City of San Jose del Monte"
            }
          />
          <InfoItem
            label="Province"
            value={
              profile?.province ||
              "Bulacan"
            }
          />
        </InfoGrid>

        <View style={styles.infoNotice}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color="#0369A1"
          />
          <Text
            style={styles.infoNoticeText}
          >
            Location verification here means
            checking the declared address,
            barangay/residency records, or an
            authorized LGU/barangay confirmation
            when necessary. Request Assistance
            does not continuously track the
            Resident's GPS.
          </Text>
        </View>
      </SectionCard>

      <SectionCard
        title="Request History / Duplicate Check"
        subtitle="Review previous records before approving another need for the same account or beneficiary."
        icon="copy-outline"
      >
        <HistoryBlock
          title="Other requests from this Resident"
          requests={relatedRequests}
        />

        <HistoryBlock
          title="Other requests using the same beneficiary name"
          requests={
            sameBeneficiaryRequests
          }
        />
      </SectionCard>
    </View>
  );
}




function CompactVerifiedAssistance({
  request, reviewRecord, reviewLoading, publicOfficeName, setPublicOfficeName,
  publicOfficeAddress, setPublicOfficeAddress, savingAction,
  onDonation, onSaveOtherSupport, onOpenCampaign,
}: {
  request: AssistanceRequest;
  reviewRecord: Record<string, any> | null;
  reviewLoading: boolean;
  publicOfficeName: string;
  setPublicOfficeName: (value: string) => void;
  publicOfficeAddress: string;
  setPublicOfficeAddress: (value: string) => void;
  savingAction: string;
  onDonation: (name: string, address: string, budget: DonationBudgetDraft) => Promise<boolean>;
  onSaveOtherSupport: (choice: string) => Promise<boolean>;
  onOpenCampaign: () => void;
}) {
  const [choice, setChoice] = useState<"donation" | "lgu" | "none">(
    request.supportDecision === "internal_support" ? "lgu" :
      request.supportDecision === "not_required" ? "none" : "donation",
  );
  const [submitting, setSubmitting] = useState(false);
  const [locationAttempted, setLocationAttempted] = useState(false);
  const [budgetAttempted, setBudgetAttempted] = useState(false);
  const [budgetTotal, setBudgetTotal] = useState("");
  const [alreadyReceived, setAlreadyReceived] = useState("0");
  const [budgetBasis, setBudgetBasis] = useState("");
  const cap = Number(reviewRecord?.verifiedUncoveredAmount || 0);
  const originalGross = Number(reviewRecord?.verifiedGrossCost || 0);
  const originalHelp = Number(reviewRecord?.confirmedExistingAssistanceAmount || 0);
  const canSetBudget = cap <= 0 && !request.donationCampaignId &&
    String(request.status || "verified").toLowerCase() === "verified" &&
    Number(request.remainingAmount || 0) <= 0 &&
    originalGross >= 0 && originalHelp >= 0 &&
    Math.abs(originalGross - originalHelp) < 0.01 &&
    !reviewRecord?.postApprovalBudgetAt;
  const numericTotal = Number(budgetTotal);
  const numericAlreadyReceived = Number(alreadyReceived || 0);
  const currencyOk = (amount: number) => Math.abs(amount * 100 - Math.round(amount * 100)) < 0.00001;
  const budgetIsValid = Number.isFinite(numericTotal) && numericTotal > 0 &&
    numericTotal <= 100000000 && Number.isFinite(numericAlreadyReceived) &&
    numericAlreadyReceived >= 0 && numericAlreadyReceived < numericTotal &&
    currencyOk(numericTotal) && currencyOk(numericAlreadyReceived) &&
    budgetBasis.trim().length >= 20 && budgetBasis.trim().length <= 800;
  const hasOffice = String(request.assignedLocationName || "").trim().length >= 3 &&
    String(request.assignedLocationAddress || "").trim().length >= 5;
  const locationError = locationAttempted &&
    (!hasOffice && (publicOfficeName.trim().length < 3 || publicOfficeAddress.trim().length < 5));
  const busy = submitting || !!savingAction;
  const submit = async () => {
    if (busy) return;
    if (choice === "donation" && cap <= 0) {
      setBudgetAttempted(true);
      if (!canSetBudget || !budgetIsValid) return;
    }
    if (choice === "donation" && !hasOffice) {
      setLocationAttempted(true);
      if (publicOfficeName.trim().length < 3 || publicOfficeAddress.trim().length < 5) return;
    }
    setSubmitting(true);
    try {
      if (choice === "donation") await onDonation(publicOfficeName, publicOfficeAddress, { total: budgetTotal, alreadyReceived, basis: budgetBasis });
      else await onSaveOtherSupport(choice === "lgu" ? "internal_support" : "not_required");
    } finally {
      setSubmitting(false);
    }
  };

  if (reviewLoading || !reviewRecord) {
    return <View style={styles.simplePanel}>
      <ActivityIndicator color="#059669" />
      <Text style={styles.simpleCopy}>Checking the approved request...</Text>
    </View>;
  }
  return (
    <View style={styles.simplePanel}>
      <View style={styles.simpleHead}>
        <View style={styles.simpleIcon}>
          <Ionicons name="checkmark-circle" size={21} color="#047857" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.simpleTitle}>Request Verified</Text>
          <Text style={styles.simpleCopy}>Choose the next support action. A campaign is not published automatically.</Text>
        </View>
      </View>

      {request.donationCampaignId ? (
        <View style={styles.simpleField}>
          <Text style={styles.simpleSection}>Donation campaign linked</Text>
          <ActionButton label="Open Donation Campaign" icon="heart-outline" variant="success"
            loading={false} onPress={onOpenCampaign} />
        </View>
      ) : (
        <>
          <Text style={styles.simpleSection}>Choose a support plan</Text>
          <View style={styles.simpleOptions}>
            {([
              ["donation", "Create Donation Campaign"],
              ["lgu", "LGU or Partner Support"],
              ["none", "No Further Support"],
            ] as const).map(([key,label]) => (
              <TouchableOpacity
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: choice === key }}
                disabled={busy}
                onPress={() => setChoice(key)}
                style={[styles.simpleOption, choice === key && styles.simpleOptionYes]}
              >
                <Ionicons name={choice === key ? "radio-button-on" : "radio-button-off"}
                  size={16} color={choice === key ? "#047857" : "#64748B"} />
                <Text style={styles.simpleOptionLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {choice === "donation" && (
            <View style={styles.simpleField}>
              <Text style={styles.simpleSection}>Approved donation amount</Text>
              {cap > 0 ? (
                <Text style={styles.simpleVerifiedAmount}>{money(cap)}</Text>
              ) : (
                <View style={styles.simpleField}>
                  <Text style={styles.simpleCopy}>
                    {canSetBudget
                      ? "Add only NEW confirmed items or expenses not covered by earlier assistance. Use prices or supplier quotations; a hospital bill is not required for food or supplies."
                      : "This case cannot start a monetary campaign. It may already have an approved budget or a completed assistance record."}
                  </Text>
                  {budgetAttempted && !canSetBudget && (
                    <ReviewValidationHint message="Donation setup is unavailable because the case has no eligible new budget. Review the request status or choose LGU/Partner Support." />
                  )}
                  {canSetBudget && (
                    <View style={styles.assistanceBudgetFields}>
                      <Text style={styles.simpleCheckTitle}>Additional item cost (PHP) *</Text>
                      <TextInput
                        value={budgetTotal}
                        onChangeText={(value) => setBudgetTotal(value.replace(/[^0-9.]/g, ""))}
                        editable={!busy}
                        keyboardType="decimal-pad"
                        placeholder="Example: 3600"
                        placeholderTextColor="#94A3B8"
                        style={[styles.input, budgetAttempted && !budgetIsValid && styles.assistanceFieldInvalid]}
                      />
                      <Text style={styles.simpleCheckTitle}>Support already received for these NEW items (PHP)</Text>
                      <TextInput
                        value={alreadyReceived}
                        onChangeText={(value) => setAlreadyReceived(value.replace(/[^0-9.]/g, ""))}
                        editable={!busy}
                        keyboardType="decimal-pad"
                        placeholder="Enter 0 if none"
                        placeholderTextColor="#94A3B8"
                        style={styles.input}
                      />
                      <Text style={styles.simpleCheckTitle}>NEW items, quantities and price basis *</Text>
                      <TextInput
                        value={budgetBasis}
                        onChangeText={setBudgetBasis}
                        editable={!busy}
                        multiline
                        maxLength={800}
                        placeholder="Example: 12 NEW bags of dog food x PHP 300, checked at a local supplier."
                        placeholderTextColor="#94A3B8"
                        style={[styles.textArea, budgetAttempted && !budgetIsValid && styles.assistanceFieldInvalid]}
                      />
                      {budgetAttempted && !budgetIsValid && (
                        <ReviewValidationHint message="Please enter the additional item costs, any support received for those items, and a clear explanation of prices (at least 20 characters)." />
                      )}
                      {budgetIsValid && (
                        <Text style={styles.simpleVerifiedAmount}>
                          Amount to raise: {money(Math.round((numericTotal - numericAlreadyReceived) * 100) / 100)}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
              {cap > 0 && (
                <Text style={styles.simpleCopy}>
                  Approved amount from the LGU review. No need to enter it again.
                </Text>
              )}

              {hasOffice ? (
                <View style={styles.simpleReviewOfficeCard}>
                  <Ionicons name="business-outline" size={17} color="#047857" />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.simpleCheckTitle}>Coordination office</Text>
                    <Text style={styles.simpleCopy}>
                      {request.assignedLocationName} — {request.assignedLocationAddress}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.simpleField}>
                  <Text style={styles.simpleSection}>Public coordination location</Text>
                  <Text style={styles.simpleCopy}>
                    Enter the public office or partner location where donors can coordinate. Do not use the resident’s home address.
                  </Text>
                  <Text style={styles.simpleCheckTitle}>Office or partner name</Text>
                  <TextInput
                    value={publicOfficeName}
                    onChangeText={setPublicOfficeName}
                    editable={!busy}
                    placeholder="e.g. Barangay Hall or partner organization"
                    placeholderTextColor="#94A3B8"
                    style={[styles.input, locationError && styles.assistanceFieldInvalid]}
                  />
                  <Text style={styles.simpleCheckTitle}>Public office address</Text>
                  <TextInput
                    value={publicOfficeAddress}
                    onChangeText={setPublicOfficeAddress}
                    editable={!busy}
                    placeholder="Street, barangay, city"
                    placeholderTextColor="#94A3B8"
                    style={[styles.input, locationError && styles.assistanceFieldInvalid]}
                  />
                  {locationError && <ReviewValidationHint message="Enter the actual public office name and address before continuing." />}
                </View>
              )}
            </View>
          )}

          <View style={styles.simpleDecision}>
            <ActionButton
              label={choice === "donation" ? "Set Up Donation Campaign" : "Save Support Plan"}
              icon={choice === "donation" ? "heart-outline" : "checkmark-circle-outline"}
              variant="success"
              disabled={busy}
              loading={submitting}
              onPress={() => { void submit(); }}
            />
            {choice === "donation" && <Text style={styles.simpleCopy}>
              Review the campaign draft before publishing. Donations do not start automatically.
            </Text>}
          </View>
        </>
      )}
    </View>
  );
}

function CompactReviewSelect({
  value, options, onChange, disabled = false, error = false,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(([key]) => key === value)?.[1] || "Choose an option";
  return (
    <View style={styles.clearReviewDropdownWrap}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={selected}
        accessibilityState={{ expanded: open, disabled }}
        activeOpacity={0.82}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={[styles.clearReviewDropdown, error && styles.assistanceFieldInvalid, disabled && { opacity: 0.6 }]}
      >
        <Text numberOfLines={1} style={styles.clearReviewDropdownValue}>{selected}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={17} color="#64748B" />
      </TouchableOpacity>
      {open && !disabled && (
        <View style={styles.clearReviewDropdownOptions}>
          {options.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: value === key }}
              onPress={() => { onChange(key); setOpen(false); }}
              style={[styles.clearReviewDropdownOption, value === key && styles.clearReviewDropdownActive]}
            >
              <Text style={[styles.clearReviewDropdownOptionText, value === key && styles.clearReviewDropdownOptionChosen]}>
                {label}
              </Text>
              {value === key && <Ionicons name="checkmark" size={16} color="#047857" />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function CompactAssistanceReview({
  request, reviewDraft, reviewRecord, reviewLoading, validationIntent, reasonAttempt,
  adminNote, setAdminNote, rejectionReason, setRejectionReason, savingAction,
  onReviewChange, onStartReview, onVerify, onMoreInfo, onReject,
  onDocuments, onResident, onAdditional,
}: {
  request: AssistanceRequest;
  reviewDraft: PrivateReviewDraft | null;
  reviewRecord: Record<string, any> | null;
  reviewLoading: boolean;
  validationIntent: AssistanceValidationMode | null;
  reasonAttempt: "more_information" | "reject" | null;
  adminNote: string;
  setAdminNote: (value: string) => void;
  rejectionReason: string;
  setRejectionReason: (value: string) => void;
  savingAction: string;
  onReviewChange: <K extends keyof PrivateReviewDraft>(key: K, value: PrivateReviewDraft[K]) => void;
  onStartReview: () => void;
  onVerify: () => void;
  onMoreInfo: () => void;
  onReject: () => void;
  onDocuments: () => void;
  onResident: () => void;
  onAdditional: () => void;
}) {
  const [action, setAction] = useState<"more_info" | "reject" | null>(null);
  const locked = !!savingAction || ["verified", "rejected"].includes(String(reviewRecord?.finalDecision || ""));
  const facilityRequired = needsFacilityVerification(request.category) || !!reviewDraft?.facilityVerificationRequired;
  const costRequired = !!reviewDraft?.costVerificationRequired;
  const isPetCase = String(request.category || "") === "animal_pet_welfare";

  if (reviewLoading || !reviewDraft) {
    return <View style={styles.simplePanel}>
      <ActivityIndicator color="#047857" />
      <Text style={styles.simpleCopy}>Preparing the request review...</Text>
    </View>;
  }

  const attempted = validationIntent === "verify";
  const issues = attempted ? validateAssistanceReview(reviewDraft, "verify", request.category) : [];
  const error = (key: string) => issues.find((item) => item.field === key)?.message || "";
  const checkItems: {
    key: "documentConsistencyStatus" | "duplicateCheckStatus" | "beneficiaryCheckStatus" | "residencyVerificationStatus";
    title: string; help: string; yes: string; no: string; open: () => void;
  }[] = [
    { key: "documentConsistencyStatus", title: "Request details match the evidence", help: "Check the uploaded evidence and receipts.", yes: "consistent", no: "needs_more_information", open: onDocuments },
    { key: "duplicateCheckStatus", title: "No duplicate request found", help: "Compare the resident's case history.", yes: "clear", no: "potential_duplicate", open: onResident },
    { key: "beneficiaryCheckStatus", title: "Resident and beneficiary details match", help: "Confirm the requester's identity and relationship.", yes: "confirmed", no: "needs_more_information", open: onResident },
    { key: "residencyVerificationStatus", title: "Resident address confirmed", help: "Use reliable records or official proof, not just a map pin.", yes: "verified", no: "unable_to_verify", open: onResident },
  ];
  const extraRequired = reviewDraft.videoVerificationRequired || reviewDraft.siteVisitRequired || !!reviewDraft.riskFlags.trim();
  const actionType = action === "reject" ? "reject" : "more_information";
  const note = action === "reject" ? rejectionReason : adminNote;
  const noteIssue = reasonAttempt === actionType ? validateAssistanceReason(actionType, note) : "";

  return (
    <View style={styles.simplePanel}>
      <View style={styles.simpleHead}>
        <View style={styles.simpleIcon}><Ionicons name="shield-checkmark-outline" size={20} color="#047857" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.simpleTitle}>Review and Decide</Text>
          <Text style={styles.simpleCopy}>Confirm the essentials, then approve, reject, or request more details.</Text>
        </View>
      </View>

      {!reviewRecord && <View style={styles.simpleStart}>
        <Text style={styles.simpleCopy}>Start the review before making a decision.</Text>
        <ActionButton label="Start Review" icon="play-circle-outline" variant="primary"
          loading={savingAction === "start_review"} disabled={!!savingAction} onPress={onStartReview} />
      </View>}

      <View style={styles.assistanceCaseSnapshot}>
        <Text style={styles.assistanceContextLabel}>REQUEST AT A GLANCE</Text>
        <Text style={styles.assistanceContextTitle} numberOfLines={2}>{request.title || "Assistance Request"}</Text>
        <Text style={styles.assistanceContextMeta}>{request.requesterName || "Resident"}  ·  {request.categoryLabel || request.category || "Community assistance"}</Text>
        <Text style={styles.assistanceContextDesc} numberOfLines={4}>{request.description || request.currentSituation || "No request description provided."}</Text>
      </View>

      <View style={styles.simpleLinks}>
        <TouchableOpacity accessibilityRole="button" onPress={onDocuments} style={styles.simpleLink}>
          <Ionicons name="document-text-outline" color="#0F766E" size={17} />
          <Text style={styles.simpleLinkText}>View Evidence ({request.documents?.length || 0})</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={onResident} style={styles.simpleLink}>
          <Ionicons name="person-outline" color="#0F766E" size={17} />
          <Text style={styles.simpleLinkText}>Resident Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.simpleReviewSectionHeading}>
        <Text style={styles.simpleSection}>1. Check the information</Text>
        <Text style={styles.simpleCopy}>Confirm each item using the attached evidence and resident profile.</Text>
      </View>
      <View style={styles.simpleChecks}>
        {checkItems.map((item) => (
          <View key={item.key} style={styles.simpleCheck}>
            <Text style={styles.simpleCheckTitle}>{item.title}</Text>
            <View style={styles.simpleOptions}>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{selected:reviewDraft[item.key]===item.yes}}
                disabled={locked} onPress={() => onReviewChange(item.key,item.yes)}
                style={[styles.simpleOption,reviewDraft[item.key]===item.yes&&styles.simpleOptionYes]}>
                <Ionicons name="checkmark-circle-outline" color="#047857" size={16} />
                <Text style={styles.simpleOptionLabel}>Confirmed</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityState={{selected:reviewDraft[item.key]===item.no}}
                disabled={locked} onPress={() => onReviewChange(item.key,item.no)}
                style={[styles.simpleOption,reviewDraft[item.key]===item.no&&styles.simpleOptionIssue]}>
                <Text style={styles.simpleOptionLabel}>Needs review</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="View supporting evidence"
                onPress={item.open} style={styles.simpleViewIcon}>
                <Ionicons name="open-outline" size={17} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ReviewValidationHint message={error(item.key)} />
          </View>
        ))}

        {reviewDraft.residencyVerificationStatus === "verified" && <View style={styles.simpleField}>
          <LabelText required>How was the address checked?</LabelText>
          <CompactReviewSelect value={reviewDraft.residencyVerificationMethod} disabled={locked}
            error={!!error("residencyVerificationMethod")}
            options={[
              ["profile_address","Profile and supporting document"],
              ["barangay_confirmation","Barangay confirmation"],
              ["resident_confirmation","Resident confirmation with proof"],
              ["site_visit","LGU site visit"],
              ["other","Other valid evidence"],
            ]}
            onChange={(value) => onReviewChange("residencyVerificationMethod",value)} />
          <ReviewValidationHint message={error("residencyVerificationMethod")} />
          <Text style={styles.simpleCopy}>Address on record: {reviewDraft.privateAddressSnapshot || request.requesterAddress || "Not recorded"}</Text>
          {!reviewDraft.privateAddressSnapshot.trim() && <TextInput
            value={reviewDraft.privateAddressSnapshot}
            onChangeText={(value) => onReviewChange("privateAddressSnapshot",value)}
            editable={!locked} placeholder="Enter address from verified proof"
            placeholderTextColor="#94A3B8"
            style={[styles.input,!!error("privateAddressSnapshot")&&styles.assistanceFieldInvalid]} />}
          <ReviewValidationHint message={error("privateAddressSnapshot")} />
        </View>}
      </View>

      {(facilityRequired || costRequired) && <View style={styles.simpleFinancial}>
        <Text style={styles.simpleSection}>2. Confirm provider and budget</Text>
        {facilityRequired && <View style={styles.simpleField}>
          <LabelText required>{isPetCase ? "Animal care provider or welfare partner confirmed?" : "Clinic or assistance provider confirmed?"}</LabelText>
          <CompactReviewSelect value={reviewDraft.facilityVerificationStatus} disabled={locked}
            error={!!error("facilityVerificationStatus")}
            options={[["pending","Not checked yet"],["confirmed","Confirmed using supporting information"],["unable_to_confirm","More provider details needed"],["inconsistent","Provider details do not match"]]}
            onChange={(value) => onReviewChange("facilityVerificationStatus",value)} />
          <ReviewValidationHint message={error("facilityVerificationStatus")} />
          {reviewDraft.facilityVerificationStatus === "confirmed" && <>
            <LabelText required>{isPetCase ? "Vet clinic, supplier, or welfare partner" : "Clinic or provider name"}</LabelText>
            <TextInput value={reviewDraft.facilityName} onChangeText={(value) => onReviewChange("facilityName",value)}
              placeholder={isPetCase ? "Confirmed provider or partner" : "Confirmed clinic or provider"} placeholderTextColor="#94A3B8" editable={!locked}
              style={[styles.input,!!error("facilityName")&&styles.assistanceFieldInvalid]} />
            <ReviewValidationHint message={error("facilityName")} />
            <LabelText required>How did you confirm it?</LabelText>
            <CompactReviewSelect value={reviewDraft.facilityVerificationMethod} disabled={locked}
              error={!!error("facilityVerificationMethod")}
              options={[["official_phone","Contacted the provider"],["official_email","Email confirmation"],["official_record","Reviewed supporting documents"],["in_person","Verified in person"],["other","Other reliable information"]]}
              onChange={(value) => onReviewChange("facilityVerificationMethod",value)} />
            <ReviewValidationHint message={error("facilityVerificationMethod")} />
          </>}
        </View>}
        {costRequired && <View style={styles.simpleField}>
          <LabelText required>Is the requested amount supported by evidence?</LabelText>
          <CompactReviewSelect value={reviewDraft.costVerificationStatus} disabled={locked}
            error={!!error("costVerificationStatus")}
            options={[["pending","Not checked yet"],["confirmed","Confirmed using prices or documents"],["inconsistent","The amount needs clarification"]]}
            onChange={(value) => onReviewChange("costVerificationStatus",value)} />
          <ReviewValidationHint message={error("costVerificationStatus")} />
          {reviewDraft.costVerificationStatus === "confirmed" && <>
            <Text style={styles.simpleCopy}>Resident estimate: {money(request.estimatedAmount)} (not verified)</Text>
            <LabelText required>Confirmed total needed (PHP)</LabelText>
            <TextInput value={reviewDraft.verifiedGrossCost} onChangeText={(value)=>onReviewChange("verifiedGrossCost",value)}
              keyboardType="decimal-pad" placeholder="e.g. 3500.00" placeholderTextColor="#94A3B8"
              editable={!locked} style={[styles.input,!!error("verifiedGrossCost")&&styles.assistanceFieldInvalid]} />
            <ReviewValidationHint message={error("verifiedGrossCost")} />
            <LabelText>Assistance already received (PHP)</LabelText>
            <TextInput value={reviewDraft.confirmedExistingAssistanceAmount}
              onChangeText={(value)=>onReviewChange("confirmedExistingAssistanceAmount",value)}
              keyboardType="decimal-pad" placeholder="0 if no other assistance was received" placeholderTextColor="#94A3B8"
              editable={!locked} style={[styles.input,!!error("confirmedExistingAssistanceAmount")&&styles.assistanceFieldInvalid]} />
            <ReviewValidationHint message={error("confirmedExistingAssistanceAmount")} />
          </>}
        </View>}
      </View>}

      {(extraRequired || (attempted && issues.length > 0)) && <View style={styles.simpleNotice}>
        <Ionicons name="alert-circle-outline" color="#92400E" size={18} />
        <View style={{flex:1,gap:7}}>
          <Text style={styles.simpleNoticeTitle}>{extraRequired?"Additional checks are required":"Review the highlighted items"}</Text>
          {attempted && issues.slice(0,4).map((x)=><Text key={x.field} style={styles.simpleNoticeText}>• {x.message}</Text>)}
          <TouchableOpacity onPress={onAdditional} accessibilityRole="button">
            <Text style={styles.simpleLinkText}>Review additional details</Text>
          </TouchableOpacity>
        </View>
      </View>}

      <View style={styles.simpleDecision}>
        <Text style={styles.simpleSection}>3. Make a decision</Text>
        <Text style={styles.simpleCopy}>Your decision is saved when confirmed.</Text>
        <View style={styles.simpleButtons}>
          <ActionButton
            label="Approve Request"
            icon="shield-checkmark-outline"
            variant="success"
            loading={savingAction === "verify"}
            disabled={!reviewRecord || locked}
            onPress={onVerify}
          />
          <ActionButton
            label="Reject Request"
            icon="close-circle-outline"
            variant="danger"
            loading={savingAction === "reject"}
            disabled={!reviewRecord || locked}
            onPress={() => setAction((current) => current === "reject" ? null : "reject")}
          />
        </View>
        <Text style={styles.simpleCopy}>
          Approved requests can proceed to support planning. Publishing a campaign is a separate action.
        </Text>
        {!reviewRecord && <Text style={styles.simpleCopy}>Select Start Review above to enable decisions.</Text>}
        <View style={styles.simpleSecondary}>
          <TouchableOpacity accessibilityRole="button" disabled={!!savingAction}
            onPress={() => setAction((current) => current === "more_info" ? null : "more_info")}>
            <Text style={styles.simpleLinkText}>Request more information</Text>
          </TouchableOpacity>
        </View>
        {action && <View style={styles.simpleField}>
          <LabelText required>{action==="reject"?"Why is this request rejected?":"What details should the resident provide?"}</LabelText>
          <TextInput value={note} onChangeText={action==="reject"?setRejectionReason:setAdminNote}
            multiline maxLength={1000} placeholder="Write a clear, short reason"
            placeholderTextColor="#94A3B8"
            style={[styles.textArea,!!noteIssue&&styles.assistanceFieldInvalid]} />
          <ReviewValidationHint message={noteIssue} />
          <View style={styles.simpleButtons}>
            <ActionButton label="Cancel" icon="close-outline" variant="secondary" loading={false}
              onPress={()=>setAction(null)} />
            <ActionButton label={action==="reject"?"Confirm Rejection":"Send Request"}
              icon={action==="reject"?"close-circle-outline":"send-outline"}
              variant={action==="reject"?"danger":"primary"}
              loading={savingAction===(action==="reject"?"reject":"more_info")}
              disabled={!reviewRecord||!!savingAction}
              onPress={action==="reject"?onReject:onMoreInfo} />
          </View>
        </View>}
      </View>

      {(extraRequired || (attempted && issues.some((entry) =>
        ["riskFlags", "videoVerificationStatus", "siteVisitStatus"].includes(entry.field)
      ))) && (
        <TouchableOpacity accessibilityRole="button" style={styles.simpleMore} onPress={onAdditional}>
          <Ionicons name="options-outline" size={17} color="#64748B" />
          <Text style={{flex:1,color:"#64748B",fontSize: vsType.size.meta, fontFamily: vsType.family,fontWeight:"600"}}>
            Special case details (only if needed)
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#64748B" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function DecisionTab({
  request,
  reviewDraft,
  reviewRecord,
  reviewLoading,
  focusStage,
  validationIntent,
  reasonAttempt,
  supportValidationAttempt,
  onReviewChange,
  allChecksComplete,
  onSaveVerificationDraft,
  adminNote,
  setAdminNote,
  rejectionReason,
  setRejectionReason,
  supportDecision,
  setSupportDecision,
  remainingAmount,
  setRemainingAmount,
  locationType,
  setLocationType,
  locationName,
  setLocationName,
  locationAddress,
  setLocationAddress,
  locationNotes,
  setLocationNotes,
  savingAction,
  onStartReview,
  onRequestMoreInfo,
  onVerify,
  onReject,
  onSaveResourceAssessment,
  onMarkAssistanceProvided,
  onSaveLocation,
  onClearLocation,
}: {
  request: AssistanceRequest;
  reviewDraft: PrivateReviewDraft | null;
  reviewRecord: Record<string, any> | null;
  reviewLoading: boolean;
  focusStage: ReviewStageFocus | null;
  validationIntent: AssistanceValidationMode | null;
  reasonAttempt: "more_information" | "reject" | null;
  supportValidationAttempt: "support" | "location" | null;
  onReviewChange: <K extends keyof PrivateReviewDraft>(
    key: K,
    value: PrivateReviewDraft[K],
  ) => void;
  allChecksComplete: boolean;
  onSaveVerificationDraft: () => void;
  adminNote: string;
  setAdminNote: (value: string) => void;
  rejectionReason: string;
  setRejectionReason: (value: string) => void;
  supportDecision: string;
  setSupportDecision: (value: string) => void;
  remainingAmount: string;
  setRemainingAmount: (value: string) => void;
  locationType: string;
  setLocationType: (value: string) => void;
  locationName: string;
  setLocationName: (value: string) => void;
  locationAddress: string;
  setLocationAddress: (value: string) => void;
  locationNotes: string;
  setLocationNotes: (value: string) => void;
  savingAction: string;
  onStartReview: () => void;
  onRequestMoreInfo: () => void;
  onVerify: () => void;
  onReject: () => void;
  onSaveResourceAssessment: () => void;
  onMarkAssistanceProvided: () => void;
  onSaveLocation: () => void;
  onClearLocation: () => void;
}) {
  const router = useRouter();
  const verified = request.verificationStatus === "verified";
  const rejected = request.verificationStatus === "rejected";
  const [reviewStage, setReviewStage] = useState<ReviewStage>(
    request.verificationStatus === "verified" ? "support" :
    request.verificationStatus === "rejected" ? "decision" : "checks",
  );

  useEffect(() => {
    setReviewStage(
      request.verificationStatus === "verified" ? "support" :
      request.verificationStatus === "rejected" ? "decision" : "checks",
    );
  }, [request.id, request.verificationStatus]);

  useEffect(() => {
    if (focusStage) setReviewStage(focusStage.stage);
  }, [focusStage]);

  const reviewStages: { id: ReviewStage; label: string }[] = [
    { id: "checks", label: "1. Basic Checks" },
    { id: "costs", label: "2. Facility & Amount" },
    { id: "residency", label: "3. Address & Extra Checks" },
    { id: "decision", label: "4. Decision" },
    ...(verified ? [{ id: "support" as ReviewStage, label: "5. Support Plan" }] : []),
  ];
  const currentStageIndex = reviewStages.findIndex((stage) => stage.id === reviewStage);
  const nextStage = reviewStages[currentStageIndex + 1];
  const previousStage = reviewStages[currentStageIndex - 1];
  const reviewLocked = ["verified", "rejected"].includes(
    String(reviewRecord?.finalDecision || ""),
  );
  const donationCampaignReady =
    verified &&
    request.supportDecision === "donation_support" &&
    Number(request.remainingAmount || 0) > 0 &&
    String(request.assignedLocationName || "").trim().length >= 3 &&
    String(request.assignedLocationAddress || "").trim().length >= 5;

  const openDonationCampaign = () => {
    router.push({
      pathname: "/donation-list",
      params: { assistanceRequestId: request.id },
    } as any);
  };

  if (reviewLoading || !reviewDraft) {
    return (
      <View style={styles.tabContent}>
        <SectionCard
          title="LGU Verification"
          subtitle="Loading the protected verification record."
          icon="shield-checkmark-outline"
        >
          <ActivityIndicator color="#4F46E5" />
        </SectionCard>
      </View>
    );
  }

  const validationIssues = validateAssistanceReview(
    reviewDraft,
    validationIntent === "verify" ? "verify" : "draft",
    request.category,
  );
  const issue = (field: string) => validationIssues.find((entry) => entry.field === field)?.message || "";
  const noteIssue = reasonAttempt === "more_information"
    ? validateAssistanceReason("more_information", adminNote) : "";
  const rejectionIssue = reasonAttempt === "reject"
    ? validateAssistanceReason("reject", rejectionReason) : "";
  const supportIssues = supportValidationAttempt === "support"
    ? validateAssistanceSupport(supportDecision, remainingAmount, Number(reviewRecord?.verifiedUncoveredAmount || 0))
    : supportValidationAttempt === "location"
      ? validateAssistanceLocation(locationType, locationName, locationAddress)
      : [];
  const supportIssue = (field: string) => supportIssues.find((entry) => entry.field === field)?.message || "";

  const grossCost = safeNumber(reviewDraft.verifiedGrossCost);
  const existingAssistance = safeNumber(reviewDraft.confirmedExistingAssistanceAmount);
  const verifiedUncoveredAmount = Math.max(0, grossCost - existingAssistance);

  const confirmResidencyAtAddress = () => {
    if (reviewLocked) return;
    if (reviewDraft.privateAddressSnapshot.trim().length < 5) {
      Alert.alert("Address needed", "Enter the address found on the supporting document.");
      return;
    }
    if (!reviewDraft.residencyVerificationMethod ||
        reviewDraft.residencyVerificationMethod === "not_applicable") {
      Alert.alert("Choose proof", "Select how the LGU confirmed the Resident's address.");
      return;
    }
    onReviewChange("residencyVerificationStatus", "verified");
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.reviewJourney}>
        <View style={styles.reviewJourneyHeading}>
          <Ionicons name="checkbox-outline" size={20} color="#0F766E" />
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewJourneyTitle}>Review this request step by step</Text>
            <Text style={styles.reviewJourneySubtitle}>
              Check the Resident's request and documents in the tabs above, then complete the LGU review here. Only verified needs may proceed to support.
            </Text>
          </View>
        </View>
        <View style={styles.reviewStepBar}>
          {reviewStages.map((stage) => (
            <TouchableOpacity
              key={stage.id}
              accessibilityRole="button"
              accessibilityState={{ selected: reviewStage === stage.id }}
              disabled={!!savingAction}
              onPress={() => setReviewStage(stage.id)}
              style={[
                styles.reviewStepPill,
                reviewStage === stage.id && styles.reviewStepPillActive,
              ]}
            >
              <Text style={[
                styles.reviewStepText,
                reviewStage === stage.id && styles.reviewStepTextActive,
              ]}>
                {stage.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {!reviewRecord && !verified && !rejected && request.status === "pending" && (
          <View style={styles.reviewStartPrompt}>
            <Text style={styles.reviewJourneySubtitle}>
              Start the LGU review to create a private record before saving verification details.
            </Text>
            <ActionButton
              label="Start Review"
              icon="play-circle-outline"
              variant="primary"
              loading={savingAction === "start_review"}
              onPress={onStartReview}
            />
          </View>
        )}
        <Text style={styles.reviewJourneyHint}>
          Switching steps keeps your draft on this page. Select Save Progress to store it securely before leaving the request.
        </Text>
      </View>

      {validationIssues.length > 0 && (
        <View style={styles.assistanceValidationSummary} accessibilityRole="alert">
          <Text style={styles.assistanceValidationSummaryTitle}>
            {validationIssues.length} item{validationIssues.length === 1 ? "" : "s"} need attention
          </Text>
          {validationIssues.slice(0, 5).map((entry) => (
            <TouchableOpacity
              key={entry.field}
              accessibilityRole="button"
              onPress={() => setReviewStage(entry.stage)}
              style={styles.assistanceValidationSummaryLink}
            >
              <Ionicons name="alert-circle-outline" color="#B42318" size={14} />
              <Text style={styles.assistanceValidationSummaryLinkText}>{entry.message}</Text>
              <Ionicons name="chevron-forward" color="#B42318" size={15} />
            </TouchableOpacity>
          ))}
          {validationIssues.length > 5 && (
            <Text style={styles.assistanceValidationSummaryLinkText}>
              +{validationIssues.length - 5} more — open the relevant review steps.
            </Text>
          )}
        </View>
      )}

      {reviewStage === "checks" && (
        <>
          <SectionCard
        title="Private Verification"
        subtitle="Check the evidence, duplicate history, beneficiary, residency, and any required facility or cost details before making a decision."
        icon="shield-checkmark-outline"
      >
        {!reviewRecord && !verified && !rejected && (
          <View style={styles.infoNotice}>
            <Ionicons name="information-circle-outline" size={18} color="#0369A1" />
            <Text style={styles.infoNoticeText}>
              Start Review opens the protected verification record. Complete the required checks before Verify Need becomes available.
            </Text>
          </View>
        )}

        <LabelText required>Document consistency</LabelText>
        <StatusChoiceRow
          value={reviewDraft.documentConsistencyStatus}
          error={!!issue("documentConsistencyStatus")}
          options={[
            ["pending", "Pending"],
            ["consistent", "Consistent"],
            ["inconsistent", "Inconsistent"],
            ["needs_more_information", "Needs More Info"],
          ]}
          disabled={reviewLocked}
          onChange={(value) => onReviewChange("documentConsistencyStatus", value)}
        />
        <ReviewValidationHint message={issue("documentConsistencyStatus")} />
        <TextInput
          value={reviewDraft.documentConsistencyNotes}
          onChangeText={(value) => onReviewChange("documentConsistencyNotes", value)}
          placeholder="Names, dates, facility details, document reference numbers, inconsistencies..."
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={2000}
          editable={!reviewLocked}
          style={styles.textArea}
        />

        <Divider />

        <LabelText required>Duplicate / history check</LabelText>
        <StatusChoiceRow
          value={reviewDraft.duplicateCheckStatus}
          error={!!issue("duplicateCheckStatus")}
          options={[
            ["pending", "Pending"],
            ["clear", "Clear"],
            ["potential_duplicate", "Potential Duplicate"],
            ["confirmed_duplicate", "Confirmed Duplicate"],
          ]}
          disabled={reviewLocked}
          onChange={(value) => onReviewChange("duplicateCheckStatus", value)}
        />
        <ReviewValidationHint message={issue("duplicateCheckStatus")} />
        <TextInput
          value={reviewDraft.duplicateRequestIds}
          onChangeText={(value) => onReviewChange("duplicateRequestIds", value)}
          placeholder="Related request IDs, comma separated — optional"
          placeholderTextColor="#94A3B8"
          editable={!reviewLocked}
          style={styles.input}
        />
        <TextInput
          value={reviewDraft.duplicateCheckNotes}
          onChangeText={(value) => onReviewChange("duplicateCheckNotes", value)}
          placeholder="Explain how prior requests and beneficiary history were checked."
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={2000}
          editable={!reviewLocked}
          style={styles.textArea}
        />

        <Divider />

        <LabelText required>Beneficiary verification</LabelText>
        <StatusChoiceRow
          value={reviewDraft.beneficiaryCheckStatus}
          error={!!issue("beneficiaryCheckStatus")}
          options={[
            ["pending", "Pending"],
            ["confirmed", "Confirmed"],
            ["needs_more_information", "Needs More Info"],
            ["inconsistent", "Inconsistent"],
          ]}
          disabled={reviewLocked}
          onChange={(value) => onReviewChange("beneficiaryCheckStatus", value)}
        />
        <ReviewValidationHint message={issue("beneficiaryCheckStatus")} />
        <TextInput
          value={reviewDraft.beneficiaryCheckNotes}
          onChangeText={(value) => onReviewChange("beneficiaryCheckNotes", value)}
          placeholder="Confirm requester/beneficiary identity or relationship and relevant supporting basis."
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={2000}
          editable={!reviewLocked}
          style={styles.textArea}
        />
      </SectionCard>

        </>
      )}
      {reviewStage === "costs" && (
        <>
          <SectionCard
        title="Facility / Hospital / Clinic Verification"
        subtitle={
          reviewDraft.facilityVerificationRequired
            ? "Required for this case. Confirm using an official facility contact or record — not only the Resident's uploaded image."
            : "Not automatically required for this category. Enable only when a facility must be independently confirmed."
        }
        icon="business-outline"
      >
        {!needsFacilityVerification(request.category) && !reviewLocked && (
          <ToggleChoice
            label="Require facility verification for this case"
            value={reviewDraft.facilityVerificationRequired}
            onChange={(value) => {
              onReviewChange("facilityVerificationRequired", value);
              onReviewChange(
                "facilityVerificationStatus",
                value ? "pending" : "not_required",
              );
              if (!value) onReviewChange("facilityVerificationMethod", "not_applicable");
            }}
          />
        )}

        {reviewDraft.facilityVerificationRequired && (
          <>
            <LabelText required>Facility verification status</LabelText>
        <StatusChoiceRow
              value={reviewDraft.facilityVerificationStatus}
          error={!!issue("facilityVerificationStatus")}
              options={[
                ["pending", "Pending"],
                ["confirmed", "Confirmed"],
                ["unable_to_confirm", "Unable to Confirm"],
                ["inconsistent", "Inconsistent"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("facilityVerificationStatus", value)}
            />
        <ReviewValidationHint message={issue("facilityVerificationStatus")} />

            <LabelText required={true}>Official facility name</LabelText>
            <TextInput
              value={reviewDraft.facilityName}
              onChangeText={(value) => onReviewChange("facilityName", value)}
              placeholder="Official hospital / clinic / vet facility name"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={[styles.input, !!issue("facilityName") && styles.assistanceFieldInvalid]}
            />
            <ReviewValidationHint message={issue("facilityName")} />
            <LabelText>Facility type</LabelText>
            <PresetOrOtherReviewField
              value={reviewDraft.facilityType}
              onChange={(value) => onReviewChange("facilityType", value)}
              disabled={reviewLocked}
              options={["Hospital", "Medical Clinic", "Veterinary Clinic", "Diagnostic Center", "Rehabilitation Facility"]}
              customPlaceholder="Specify the official facility type"
            />
            <TextInput
              value={reviewDraft.facilityDepartment}
              onChangeText={(value) => onReviewChange("facilityDepartment", value)}
              placeholder="Department / social service / billing office"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />
            <TextInput
              value={reviewDraft.professionalName}
              onChangeText={(value) => onReviewChange("professionalName", value)}
              placeholder="Doctor / veterinarian / authorized professional — if relevant"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />
            <TextInput
              value={reviewDraft.facilityReferenceNumber}
              onChangeText={(value) => onReviewChange("facilityReferenceNumber", value)}
              placeholder="Official case / billing / record reference number"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />

            <LabelText>Independent verification method</LabelText>
            <StatusChoiceRow
              value={reviewDraft.facilityVerificationMethod}
              options={[
                ["official_phone", "Official Phone"],
                ["official_email", "Official Email"],
                ["official_record", "Official Record"],
                ["in_person", "In Person"],
                ["other", "Other"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("facilityVerificationMethod", value)}
            />
            <TextInput
              value={reviewDraft.facilityVerifiedWith}
              onChangeText={(value) => onReviewChange("facilityVerifiedWith", value)}
              placeholder="Name / office / official contact verified with"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />
            <TextInput
              value={reviewDraft.facilityNotes}
              onChangeText={(value) => onReviewChange("facilityNotes", value)}
              placeholder="What exactly did the facility confirm?"
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={2000}
              editable={!reviewLocked}
              style={styles.textArea}
            />
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Verified Cost / Remaining Need"
        subtitle="Confirm costs using evidence appropriate to the request, such as item quantities, current price estimates, receipts, quotations, or provider confirmation. Deduct assistance already received."
        icon="calculator-outline"
      >
        <InfoGrid>
          <InfoItem label="Resident Estimate" value={money(request.estimatedAmount)} />
          <InfoItem label="LGU Verified Gross Cost" value={money(grossCost)} />
          <InfoItem label="Confirmed Existing Assistance" value={money(existingAssistance)} />
          <InfoItem label="Verified Uncovered Amount" value={money(verifiedUncoveredAmount)} />
        </InfoGrid>

        {reviewDraft.costVerificationRequired && (
          <>
            <LabelText required>Cost verification status</LabelText>
        <StatusChoiceRow
              value={reviewDraft.costVerificationStatus}
          error={!!issue("costVerificationStatus")}
              options={[
                ["pending", "Pending"],
                ["confirmed", "Confirmed"],
                ["inconsistent", "Inconsistent"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("costVerificationStatus", value)}
            />
        <ReviewValidationHint message={issue("costVerificationStatus")} />
            <LabelText required={true}>Verified gross cost (PHP)</LabelText>
            <TextInput
              value={reviewDraft.verifiedGrossCost}
              onChangeText={(value) => onReviewChange("verifiedGrossCost", value)}
              placeholder="Verified gross cost (PHP)"
              keyboardType="decimal-pad"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={[styles.input, !!issue("verifiedGrossCost") && styles.assistanceFieldInvalid]}
            />
            <ReviewValidationHint message={issue("verifiedGrossCost")} />
            <LabelText required={false}>Existing assistance (PHP)</LabelText>
            <TextInput
              value={reviewDraft.confirmedExistingAssistanceAmount}
              onChangeText={(value) => onReviewChange("confirmedExistingAssistanceAmount", value)}
              placeholder="Confirmed existing LGU / DSWD / NGO / other assistance (PHP)"
              keyboardType="decimal-pad"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={[styles.input, !!issue("confirmedExistingAssistanceAmount") && styles.assistanceFieldInvalid]}
            />
            <ReviewValidationHint message={issue("confirmedExistingAssistanceAmount")} />
            <TextInput
              value={reviewDraft.costReferenceNumber}
              onChangeText={(value) => onReviewChange("costReferenceNumber", value)}
              placeholder="Receipt, quotation, price estimate, or other reference (if available)"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />
            <TextInput
              value={reviewDraft.costNotes}
              onChangeText={(value) => onReviewChange("costNotes", value)}
              placeholder="Explain how the cost and existing assistance were independently confirmed."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={2000}
              editable={!reviewLocked}
              style={styles.textArea}
            />
          </>
        )}
      </SectionCard>

        </>
      )}
      {reviewStage === "residency" && (
        <>
          <SectionCard
        title="Residency / Address Verification"
        subtitle="Confirm the address using official records or supporting proof. Map lookup is not required."
        icon="location-outline"
      >
        <View style={styles.addressVerificationFlow}>
          <View style={styles.declaredAddressCard}>
            <View style={styles.declaredAddressIcon}>
              <Ionicons name="home-outline" size={18} color="#2563EB" />
            </View>
            <View style={styles.declaredAddressCopy}>
              <Text style={styles.declaredAddressLabel}>RESIDENT ADDRESS ON RECORD</Text>
              <Text style={styles.declaredAddressValue}>
                {String(request.requesterAddress || "").trim() ||
                  (request.requesterBarangay
                    ? `Barangay ${request.requesterBarangay}, City of San Jose del Monte, Bulacan`
                    : "No detailed Resident address was stored with this request.")}
              </Text>
            </View>
          </View>

          <View style={styles.addressSearchPanel}>
            <LabelText required>Address shown on supporting proof</LabelText>
            <TextInput
              value={reviewDraft.privateAddressSnapshot}
              onChangeText={(value) => onReviewChange("privateAddressSnapshot", value)}
              editable={!reviewLocked}
              maxLength={300}
              placeholder="Street, barangay, San Jose del Monte, Bulacan"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !!issue("privateAddressSnapshot") && styles.assistanceFieldInvalid]}
            />
            <ReviewValidationHint message={issue("privateAddressSnapshot")} />
            <Text style={styles.simpleCopy}>Check the submitted documents or LGU records. This is never a public donation address.</Text>
          </View>
          <Divider />

          <LabelText required>Residency verification method</LabelText>
          <StatusChoiceRow
            value={reviewDraft.residencyVerificationMethod}
          error={!!issue("residencyVerificationMethod")}
            options={[
              ["profile_address", "Profile + Evidence"],
              ["resident_confirmation", "Resident Confirmation"],
              ["barangay_confirmation", "Barangay Confirmation"],
              ["site_visit", "Site Visit"],
              ["other", "Other"],
            ]}
            disabled={reviewLocked}
            onChange={(value) =>
              onReviewChange("residencyVerificationMethod", value)
            }
          />
        <ReviewValidationHint message={issue("residencyVerificationMethod")} />

          <LabelText required>Residency status</LabelText>
          <StatusChoiceRow
            value={reviewDraft.residencyVerificationStatus}
          error={!!issue("residencyVerificationStatus")}
            options={[
              ["pending", "Pending"],
              ["verified", "Verified"],
              ["unable_to_verify", "Unable to Verify"],
              ["inconsistent", "Inconsistent"],
            ]}
            disabled={reviewLocked}
            onChange={(value) => {
              if (value === "verified") {
                confirmResidencyAtAddress();
                return;
              }

              onReviewChange("residencyVerificationStatus", value);
            }}
          />
        <ReviewValidationHint message={issue("residencyVerificationStatus")} />

          {reviewDraft.residencyVerificationStatus === "verified" && (
            <View style={styles.residencyVerifiedCard}>
              <Ionicons name="checkmark-circle" size={20} color="#15803D" />
              <View style={{ flex: 1 }}>
                <Text style={styles.residencyVerifiedTitle}>Residency marked verified</Text>
                <Text style={styles.residencyVerifiedText}>
                  Save the verification progress to record the address snapshot, verification method, reviewer, and verification timestamp.
                </Text>
              </View>
            </View>
          )}

          <TextInput
            value={reviewDraft.residencyNotes}
            onChangeText={(value) => onReviewChange("residencyNotes", value)}
            placeholder="Evidence checked, clarification requested, barangay confirmation if escalated, site visit findings, or address discrepancies."
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={2000}
            editable={!reviewLocked}
            style={styles.textArea}
          />

          <View style={styles.addressPrivacyNotice}>
            <Ionicons name="lock-closed-outline" size={17} color="#0F766E" />
            <Text style={styles.addressPrivacyNoticeText}>
              The Resident's exact home address stays inside authorized LGU review. Donation campaigns may display only a separate LGU-approved public service location.
            </Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Escalated Verification"
        subtitle="Use video verification or a site visit only when reasonably necessary for the case."
        icon="videocam-outline"
      >
        <ToggleChoice
          label="Require video verification"
          value={reviewDraft.videoVerificationRequired}
          disabled={reviewLocked}
          onChange={(value) => {
            onReviewChange("videoVerificationRequired", value);
            onReviewChange("videoVerificationStatus", value ? "pending" : "not_required");
          }}
        />
        {reviewDraft.videoVerificationRequired && (
          <>
            <LabelText required>Video verification status</LabelText>
        <StatusChoiceRow
              value={reviewDraft.videoVerificationStatus}
          error={!!issue("videoVerificationStatus")}
              options={[
                ["pending", "Pending"],
                ["requested", "Requested"],
                ["completed", "Completed"],
                ["unable_to_complete", "Unable to Complete"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("videoVerificationStatus", value)}
            />
        <ReviewValidationHint message={issue("videoVerificationStatus")} />
            <TextInput
              value={reviewDraft.videoVerificationNotes}
              onChangeText={(value) => onReviewChange("videoVerificationNotes", value)}
              placeholder="Document what was verified during the call. Do not record unnecessary sensitive content."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={2000}
              editable={!reviewLocked}
              style={styles.textArea}
            />
          </>
        )}

        <Divider />

        <ToggleChoice
          label="Require LGU / barangay site visit"
          value={reviewDraft.siteVisitRequired}
          disabled={reviewLocked}
          onChange={(value) => {
            onReviewChange("siteVisitRequired", value);
            onReviewChange("siteVisitStatus", value ? "pending" : "not_required");
          }}
        />
        {reviewDraft.siteVisitRequired && (
          <>
            <LabelText required>Site visit status</LabelText>
        <StatusChoiceRow
              value={reviewDraft.siteVisitStatus}
          error={!!issue("siteVisitStatus")}
              options={[
                ["pending", "Pending"],
                ["scheduled", "Scheduled"],
                ["completed", "Completed"],
                ["unable_to_complete", "Unable to Complete"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("siteVisitStatus", value)}
            />
        <ReviewValidationHint message={issue("siteVisitStatus")} />
            <TextInput
              value={reviewDraft.siteVisitNotes}
              onChangeText={(value) => onReviewChange("siteVisitNotes", value)}
              placeholder="Site visit findings relevant to verifying this case."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={2000}
              editable={!reviewLocked}
              style={styles.textArea}
            />
          </>
        )}
      </SectionCard>

        </>
      )}
      {reviewStage === "decision" && (
        <>
          <SectionCard
        title="Risk Flags & Internal LGU Notes"
        subtitle="Flags must describe concrete inconsistencies or unresolved verification issues. They are not a personality score and they block final verification until resolved."
        icon="warning-outline"
      >
        <TextInput
          value={reviewDraft.riskFlags}
          onChangeText={(value) => onReviewChange("riskFlags", value)}
          placeholder={'One flag per line, e.g. "Hospital reference number could not be confirmed"'}
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={2500}
          editable={!reviewLocked}
          style={[styles.textArea, !!issue("riskFlags") && styles.assistanceFieldInvalid]}
        />
        <ReviewValidationHint message={issue("riskFlags")} />
        <TextInput
          value={reviewDraft.internalNotes}
          onChangeText={(value) => onReviewChange("internalNotes", value)}
          placeholder="Private LGU notes relevant to this case only."
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={3000}
          editable={!reviewLocked}
          style={styles.textArea}
        />

      </SectionCard>

      <SectionCard
        title="Case Notes"
        subtitle="Add a short LGU note or resident-facing clarification. Keep unnecessary sensitive information out of this field."
        icon="create-outline"
      >
        <TextInput
          value={adminNote}
          onChangeText={setAdminNote}
          placeholder="Short case note or resident-facing clarification"
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={1800}
          style={[styles.textArea, !!noteIssue && styles.assistanceFieldInvalid]}
        />
        <ReviewValidationHint message={noteIssue} />
        <Text style={styles.counterText}>{adminNote.length}/1800</Text>
      </SectionCard>

      {!verified && !rejected && (
        <SectionCard
          title="Review Decision"
          subtitle="Complete the required checks, then request more information, verify the need, or reject the request. Verification does not automatically create a Donation Campaign."
          icon="shield-checkmark-outline"
        >
          {request.status === "pending" && (
            <ActionButton
              label="Start Review"
              icon="search-outline"
              variant="secondary"
              loading={savingAction === "start_review"}
              onPress={onStartReview}
            />
          )}

          <View style={styles.actionButtons}>
            <ActionButton
              label="Request More Information"
              icon="chatbox-ellipses-outline"
              variant="secondary"
              loading={savingAction === "more_info"}
              onPress={onRequestMoreInfo}
            />
            <ActionButton
              label="Verify Need"
              icon="shield-checkmark-outline"
              variant="success"
              disabled={!!savingAction}
              loading={savingAction === "verify"}
              onPress={onVerify}
            />
          </View>

          {!allChecksComplete && (
            <View style={styles.warningCard}>
              <Ionicons name="lock-closed-outline" size={19} color="#9A6700" />
              <View style={styles.noteCopy}>
                <Text style={styles.warningTitle}>Verify Need is locked</Text>
                <Text style={styles.warningText}>
                  Select Verify Need to see exactly which required checks still need attention.
                </Text>
              </View>
            </View>
          )}

          <LabelText required>Rejection reason</LabelText>
          <TextInput
            value={rejectionReason}
            onChangeText={setRejectionReason}
            placeholder="Evidence-based reason for rejection"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={1000}
            style={[styles.textArea, styles.rejectArea, !!rejectionIssue && styles.assistanceFieldInvalid]}
          />
          <ReviewValidationHint message={rejectionIssue} />
          <ActionButton
            label="Reject Request"
            icon="close-circle-outline"
            variant="danger"
            loading={savingAction === "reject"}
            onPress={onReject}
          />
        </SectionCard>
      )}

        </>
      )}
      {reviewStage === "support" && verified && (
        <>
          <SectionCard
            title="Choose Support"
            subtitle={`Choose LGU/partner support, Donation Support, or no additional support. Donation Support cannot exceed the verified uncovered amount: ${money(Number(reviewRecord?.verifiedUncoveredAmount || 0))}.`}
            icon="layers-outline"
          >
            <LabelText required>How will this need be handled?</LabelText>
            <StatusChoiceRow
              value={supportDecision}
              error={!!supportIssue("supportDecision")}
              options={SUPPORT_OPTIONS.map(
                (option) => [option.value, option.label] as [string, string],
              )}
              onChange={setSupportDecision}
            />
            <ReviewValidationHint message={supportIssue("supportDecision")} />

            {supportDecision === "donation_support" && (
              <>
                <LabelText required>Verified remaining unmet amount</LabelText>
                <TextInput
                  value={remainingAmount}
                  onChangeText={setRemainingAmount}
                  keyboardType="decimal-pad"
                  placeholder="Cannot exceed private verified uncovered amount"
                  placeholderTextColor="#94A3B8"
                  style={[styles.input, !!supportIssue("remainingAmount") && styles.assistanceFieldInvalid]}
                />
                <ReviewValidationHint message={supportIssue("remainingAmount")} />
              </>
            )}

            <ActionButton
              label="Save Support Decision"
              icon="save-outline"
              variant="primary"
              loading={savingAction === "resource_assessment"}
              onPress={onSaveResourceAssessment}
            />

            {supportDecision === "donation_support" && (
              <View style={styles.donationNotice}>
                <Ionicons
                  name={donationCampaignReady ? "heart-circle-outline" : "lock-closed-outline"}
                  size={18}
                  color="#6D28D9"
                />
                <View style={{ flex: 1, gap: 10 }}>
                  <Text style={styles.donationNoticeText}>
                    {request.donationCampaignId
                      ? "A Donation Campaign is already linked to this verified Assistance Request."
                      : donationCampaignReady
                        ? "The verified shortage and public service location are ready. You may now create the Donation Campaign."
                        : "Save the Donation Support decision and the public service location first. A campaign is never created automatically."}
                  </Text>

                  {(donationCampaignReady || request.donationCampaignId) && (
                    <ActionButton
                      label={request.donationCampaignId ? "Open Donation Campaign" : "Create Donation Campaign"}
                      icon="heart-outline"
                      variant="primary"
                      loading={false}
                      onPress={openDonationCampaign}
                    />
                  )}
                </View>
              </View>
            )}

            {["internal_support", "not_required"].includes(supportDecision) && (
              <ActionButton
                label="Mark Assistance Provided"
                icon="checkmark-done-outline"
                variant="success"
                loading={savingAction === "assistance_provided"}
                onPress={onMarkAssistanceProvided}
              />
            )}
          </SectionCard>

          <SectionCard
            title="Service / Coordination Location"
            subtitle="Set a public LGU-approved place only when assistance or donation coordination needs one. The Resident's home address stays private."
            icon="location-outline"
          >
            <LabelText required>Location type</LabelText>
            <StatusChoiceRow
              value={locationType}
              error={!!supportIssue("locationType")}
              options={LOCATION_TYPES.map(
                (option) => [option.value, option.label] as [string, string],
              )}
              onChange={setLocationType}
            />
            <ReviewValidationHint message={supportIssue("locationType")} />

            <LabelText required>Official location name</LabelText>
            <TextInput
              value={locationName}
              onChangeText={setLocationName}
              placeholder="e.g. Barangay Hall Assistance Desk"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !!supportIssue("locationName") && styles.assistanceFieldInvalid]}
            />
            <ReviewValidationHint message={supportIssue("locationName")} />
            <LabelText required>Public address</LabelText>
            <TextInput
              value={locationAddress}
              onChangeText={setLocationAddress}
              placeholder="Public service location address"
              placeholderTextColor="#94A3B8"
              style={[styles.input, !!supportIssue("locationAddress") && styles.assistanceFieldInvalid]}
            />
            <ReviewValidationHint message={supportIssue("locationAddress")} />

            <Text style={styles.simpleCopy}>No map required. Use an authorized public office address only.</Text>

            <LabelText>Instructions / schedule</LabelText>
            <TextInput
              value={locationNotes}
              onChangeText={setLocationNotes}
              placeholder="Public office hours or coordination instructions..."
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={1000}
              style={styles.textArea}
            />

            <View style={styles.actionButtons}>
              <ActionButton
                label="Save Official Location"
                icon="location-outline"
                variant="primary"
                loading={savingAction === "save_location"}
                onPress={onSaveLocation}
              />
              {(request.assignedLocationName || request.assignedLocationAddress) && (
                <ActionButton
                  label="Clear Location"
                  icon="trash-outline"
                  variant="secondary"
                  loading={savingAction === "clear_location"}
                  onPress={onClearLocation}
                />
              )}
            </View>
          </SectionCard>
        </>
      )}

      {reviewStage === "decision" && rejected && (
        <View style={styles.rejectedCard}>
          <Ionicons name="close-circle-outline" size={22} color="#B42318" />
          <View style={styles.noteCopy}>
            <Text style={styles.rejectedTitle}>Request Rejected</Text>
            <Text style={styles.rejectedText}>{request.rejectionReason || "No reason recorded."}</Text>
          </View>
        </View>
      )}

      <View style={styles.reviewStepFooter}>
        {previousStage && (
          <TouchableOpacity
            style={styles.reviewPreviousButton}
            onPress={() => setReviewStage(previousStage.id)}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={16} color="#475569" />
            <Text style={styles.reviewPreviousText}>Previous step</Text>
          </TouchableOpacity>
        )}
        {!reviewLocked && !!reviewRecord && reviewStage !== "support" && (
          <ActionButton
            label="Save Progress"
            icon="save-outline"
            variant="secondary"
            loading={savingAction === "save_private_review"}
            onPress={onSaveVerificationDraft}
          />
        )}
        {nextStage && (
          <TouchableOpacity
            style={styles.reviewNextButton}
            onPress={() => setReviewStage(nextStage.id)}
            accessibilityRole="button"
          >
            <Text style={styles.reviewNextText}>Next: {nextStage.label}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Guided choice keeps the existing Firestore string field and supports
// unusual accredited facilities without misclassifying them.
function PresetOrOtherReviewField({
  value, onChange, options, disabled, customPlaceholder,
}: {
  value: string; onChange: (value: string) => void; options: string[];
  disabled?: boolean; customPlaceholder: string;
}) {
  const custom = Boolean(value) && !options.includes(value);
  const [otherSelected, setOtherSelected] = useState(custom);
  useEffect(() => {
    if (value && !options.includes(value)) setOtherSelected(true);
  }, [value]);
  return (
    <View>
      <StatusChoiceRow
        value={otherSelected ? "other" : value}
        options={[...options.map((option): [string,string] => [option, option]), ["other", "Others — specify"]]}
        disabled={disabled}
        onChange={(choice) => {
          if (choice === "other") {
            setOtherSelected(true);
            onChange("");
          } else {
            setOtherSelected(false);
            onChange(choice);
          }
        }}
      />
      {otherSelected && (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={customPlaceholder}
          placeholderTextColor="#94A3B8"
          editable={!disabled}
          maxLength={160}
          style={[styles.input, { marginTop: 8 }]}
        />
      )}
    </View>
  );
}

function StatusChoiceRow({
  value,
  options,
  onChange,
  disabled,
  error = false,
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    options.find(([optionValue]) => optionValue === value)?.[1] || "";

  return (
    <>
      <TouchableOpacity
        style={[
          styles.adminDropdownButton,
          error && styles.assistanceFieldInvalid,
          disabled && styles.adminDropdownButtonDisabled,
        ]}
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        activeOpacity={0.82}
      >
        <Text
          style={[
            styles.adminDropdownButtonText,
            !selectedLabel && styles.adminDropdownPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selectedLabel || "Select an option"}
        </Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={disabled ? "#94A3B8" : "#475569"}
        />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.adminDropdownOverlay}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={styles.adminDropdownModal}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.adminDropdownModalHeader}>
              <Text style={styles.adminDropdownModalTitle}>Select an option</Text>
              <TouchableOpacity
                style={styles.adminDropdownCloseButton}
                onPress={() => setOpen(false)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={19} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.adminDropdownOptionList}
              contentContainerStyle={styles.adminDropdownOptionListContent}
              showsVerticalScrollIndicator={false}
            >
              {options.map(([optionValue, label]) => {
                const active = value === optionValue;

                return (
                  <TouchableOpacity
                    key={optionValue}
                    style={[
                      styles.adminDropdownOption,
                      active && styles.adminDropdownOptionActive,
                    ]}
                    onPress={() => {
                      onChange(optionValue);
                      setOpen(false);
                    }}
                    activeOpacity={0.82}
                  >
                    <Text
                      style={[
                        styles.adminDropdownOptionText,
                        active && styles.adminDropdownOptionTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={19}
                        color="#4338CA"
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ToggleChoice({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View>
      <LabelText>{label}</LabelText>
      <StatusChoiceRow
        value={value ? "yes" : "no"}
        options={[
          ["no", "No"],
          ["yes", "Yes"],
        ]}
        disabled={disabled}
        onChange={(nextValue) => onChange(nextValue === "yes")}
      />
    </View>
  );
}

function CheckRow({
  checked,
  title,
  text,
  onPress,
}: {
  checked: boolean;
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.checkRow,
        checked &&
          styles.checkRowChecked,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.checkBox,
          checked &&
            styles.checkBoxChecked,
        ]}
      >
        {checked && (
          <Ionicons
            name="checkmark"
            size={16}
            color="#FFFFFF"
          />
        )}
      </View>

      <View style={styles.checkCopy}>
        <Text style={styles.checkTitle}>
          {title}
        </Text>
        <Text style={styles.checkText}>
          {text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons
            name={icon}
            size={19}
            color="#4338CA"
          />
        </View>

        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>
            {title}
          </Text>
          <Text
            style={styles.sectionSubtitle}
          >
            {subtitle}
          </Text>
        </View>
      </View>

      {children}
    </View>
  );
}

function InfoGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoGrid}>
      {children}
    </View>
  );
}

function InfoItem({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: string;
  attention?: boolean;
}) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>
      <Text
        style={[
          styles.infoValue,
          attention && { color: "#B42318" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function LabelText({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Text style={styles.fieldLabel}>
      {children}{required ? <Text style={styles.assistanceRequiredAsterisk}> *</Text> : null}
    </Text>
  );
}

// A concise accessible error under the offending control, not a generic
// Firebase/backend error or a premature block on incomplete draft fields.
function ReviewValidationHint({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.assistanceValidationHint} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" color="#B42318" size={15} />
      <Text style={styles.assistanceValidationHintText}>{message}</Text>
    </View>
  );
}

function BodyText({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Text style={styles.bodyText}>
      {children}
    </Text>
  );
}

function Divider() {
  return (
    <View style={styles.innerDivider} />
  );
}

function SignalRow({
  label,
  value,
  attention,
}: {
  label: string;
  value: string;
  attention: boolean;
}) {
  return (
    <View style={styles.signalRow}>
      <Text style={styles.signalLabel}>
        {label}
      </Text>

      <View
        style={[
          styles.signalValueBox,
          attention &&
            styles.signalValueAttention,
        ]}
      >
        <Text
          style={[
            styles.signalValue,
            attention &&
              styles.signalValueTextAttention,
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function HistoryBlock({
  title,
  requests,
}: {
  title: string;
  requests: AssistanceRequest[];
}) {
  return (
    <View style={styles.historyBlock}>
      <Text style={styles.historyTitle}>
        {title}
      </Text>

      {requests.length === 0 ? (
        <Text style={styles.historyEmpty}>
          No matching prior request found in
          the current Assistance Requests
          collection.
        </Text>
      ) : (
        requests.slice(0, 6).map((item) => {
          const meta =
            statusMeta(item.status);

          return (
            <View
              key={item.id}
              style={styles.historyRow}
            >
              <View
                style={
                  styles.historyMain
                }
              >
                <Text
                  style={
                    styles.historyRequestTitle
                  }
                  numberOfLines={1}
                >
                  {item.title ||
                    "Assistance Request"}
                </Text>

                <Text
                  style={
                    styles.historyMeta
                  }
                  numberOfLines={1}
                >
                  {item.requestId ||
                    item.id}
                  {"  |  "}
                  {readableDate(
                    item.createdAt,
                  )}
                </Text>
              </View>

              <Text
                style={[
                  styles.historyStatus,
                  {
                    color: meta.color,
                  },
                ]}
              >
                {meta.label}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  variant,
  loading,
  disabled = false,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  variant:
    | "primary"
    | "secondary"
    | "danger"
    | "success";
  loading: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const palette = {
    primary: {
      backgroundColor: "#4F46E5",
      borderColor: "#4F46E5",
      textColor: "#FFFFFF",
    },
    secondary: {
      backgroundColor: "#FFFFFF",
      borderColor: "#CBD5E1",
      textColor: "#334155",
    },
    danger: {
      backgroundColor: "#B42318",
      borderColor: "#B42318",
      textColor: "#FFFFFF",
    },
    success: {
      backgroundColor: "#ECFDF3",
      borderColor: "#86EFAC",
      textColor: "#15803D",
    },
  }[variant];

  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        {
          backgroundColor:
            palette.backgroundColor,
          borderColor:
            palette.borderColor,
        },
        (loading || disabled) && { opacity: 0.55 },
      ]}
      onPress={onPress}
      activeOpacity={0.82}
      disabled={loading || disabled}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={palette.textColor}
        />
      ) : (
        <Ionicons
          name={icon}
          size={18}
          color={palette.textColor}
        />
      )}

      <Text
        style={[
          styles.actionButtonText,
          {
            color: palette.textColor,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function DocumentPreviewModal({
  item,
  secureUrl,
  loading,
  error,
  onClose,
  onOpenExternal,
}: {
  item: StoredDocument | null;
  secureUrl: string;
  loading: boolean;
  error: string;
  onClose: () => void;
  onOpenExternal: () => void;
}) {
  return (
    <Modal
      visible={!!item}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <View style={styles.previewHeaderCopy}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {item?.label || item?.fileName || "Supporting Document"}
              </Text>
              <Text style={styles.previewMeta} numberOfLines={1}>
                {item?.fileName || item?.documentType || "Private Resident evidence"}
              </Text>
            </View>

            <TouchableOpacity style={styles.previewClose} onPress={onClose}>
              <Ionicons name="close" size={22} color="#334155" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewImageWrap}>
            {loading ? (
              <View style={styles.emptyInner}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={styles.emptyText}>Requesting temporary private access...</Text>
              </View>
            ) : error ? (
              <View style={styles.emptyInner}>
                <Ionicons name="lock-closed-outline" size={32} color="#B42318" />
                <Text style={styles.emptyTitle}>Private evidence unavailable</Text>
                <Text style={styles.emptyText}>{error}</Text>
              </View>
            ) : secureUrl ? (
              <Image
                source={{ uri: secureUrl }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : null}
          </View>

          <View style={styles.previewActions}>
            <View style={styles.infoNotice}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#0369A1" />
              <Text style={styles.infoNoticeText}>
                This is a temporary private evidence link. Do not copy it into public campaign content or resident-facing public fields.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.previewOpenButton, (!secureUrl || loading) && { opacity: 0.55 }]}
              onPress={onOpenExternal}
              disabled={!secureUrl || loading}
            >
              <Ionicons name="open-outline" size={18} color="#FFFFFF" />
              <Text style={styles.previewOpenText}>Open Temporary Original</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  simpleVerifiedAmount: { fontSize: vsType.size.titleSmall, fontFamily: vsType.family, fontWeight: "800", color: "#047857", paddingVertical: 3 },
  assistanceBudgetFields: { gap: 10, padding: 15, borderWidth: 1, borderColor: "#D8E8DE", borderRadius: 12, backgroundColor: "#FAFCFA" },
  simpleReviewAmountNotice: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 9, borderColor: "#FDE68A", borderWidth: 1, backgroundColor: "#FFFBEB" },
  simpleReviewOfficeCard: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 9, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0" },

  simpleReviewSectionHeading: { gap: 5 },
  clearReviewDropdownWrap: { gap: 4 },
  clearReviewDropdown: { minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  clearReviewDropdownValue: { flex: 1, fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "700", color: "#334155" },
  clearReviewDropdownOptions: { borderRadius: 9, borderWidth: 1, borderColor: "#D8E2EA", backgroundColor: "#FFFFFF", overflow: "hidden", marginTop: 3 },
  clearReviewDropdownOption: { minHeight: 42, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  clearReviewDropdownActive: { backgroundColor: "#EFFAF3" },
  clearReviewDropdownOptionText: { flex: 1, fontSize: vsType.size.meta, fontFamily: vsType.family, color: "#334155", lineHeight: 18 },
  clearReviewDropdownOptionChosen: { color: "#047857", fontWeight: "800" },

  simplePanel: { padding: 20, gap: 20, backgroundColor: "#FFFFFF", borderRadius: 17, borderColor: "#DDE7E2", borderWidth: 1 },
  simpleHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  simpleIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF5", borderRadius: 10 },
  simpleTitle: { color: "#102A20", fontSize: vsType.size.section, fontFamily: vsType.family, fontWeight: "800" },
  simpleSection: { color: "#102A20", fontSize: vsType.size.bodyStrong, fontFamily: vsType.family, fontWeight: "800" },
  simpleCopy: { color: "#526477", fontSize: vsType.size.label, fontFamily: vsType.family, lineHeight: 20 },
  simpleStart: { gap: 10, padding: 13, borderRadius: 10, backgroundColor: "#F0FDF4" },
  simpleLinks: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  assistanceCaseSnapshot: { padding: 16, gap: 7, borderRadius: 12, backgroundColor: "#F7FAF8", borderWidth: 1, borderColor: "#E0EAE4" },
  assistanceContextLabel: { color: "#047857", fontSize: vsType.size.micro, fontFamily: vsType.family, fontWeight: "800", letterSpacing: 0.9 },
  assistanceContextTitle: { color: "#102A20", fontSize: vsType.size.card, fontFamily: vsType.family, fontWeight: "800", lineHeight: 22 },
  assistanceContextMeta: { color: "#526477", fontSize: designUi.type.meta.fontSize, fontWeight: designUi.type.meta.fontWeight, lineHeight: designUi.type.meta.lineHeight,},
  assistanceContextDesc: { color: "#334155", fontSize: vsType.size.label, fontFamily: vsType.family, lineHeight: 20 },
  simpleLink: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8E9DF" },
  simpleLinkText: { fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "700", color: "#0F766E" },
  simpleChecks: { borderColor: "#E2E8F0", borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  simpleCheck: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#E9EFEC", gap: 9 },
  simpleCheckTitle: { color: "#1E293B", fontSize: vsType.size.body, fontFamily: vsType.family, fontWeight: "700" },
  simpleOptions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  simpleOption: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, borderWidth: 1, borderRadius: 9, borderColor: "#D1DBD7", backgroundColor: "#FFFFFF", paddingHorizontal: 13, paddingVertical: 9 },
  simpleOptionYes: { backgroundColor: "#ECFDF5", borderColor: "#16A34A" },
  simpleOptionIssue: { backgroundColor: "#FFFBEB", borderColor: "#F59E0B" },
  simpleOptionLabel: { fontSize: vsType.size.label, fontFamily: vsType.family, color: "#334155", fontWeight: "700" },
  simpleViewIcon: { padding: 9 },
  simpleField: { gap: 8, paddingVertical: 9 },
  simpleFinancial: { gap: 14, padding: 16, borderWidth: 1, borderColor: "#E0EAE4", borderRadius: 12, backgroundColor: "#FBFCFB" },
  simpleNotice: { flexDirection: "row", gap: 9, backgroundColor: "#FFFBEB", borderColor: "#FDE68A", borderWidth: 1, borderRadius: 9, padding: 12 },
  simpleNoticeTitle: { color: "#92400E", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "800" },
  simpleNoticeText: { color: "#92400E", fontSize: designUi.type.body.fontSize, lineHeight: designUi.type.body.lineHeight, fontWeight: designUi.type.body.fontWeight,},
  simpleDecision: { gap: 14, borderTopWidth: 1, borderTopColor: "#E6EDE8", paddingTop: 20 },
  simpleButtons: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9 },
  simpleSecondary: { flexDirection: "row", flexWrap: "wrap", gap: 24, paddingVertical: 10 },
  simpleRejectText: { color: "#B42318", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "700" },
  simpleMore: { borderTopWidth: 1, borderTopColor: "#E2E8F0", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  simpleReturnButton: { flexDirection: "row", alignItems: "center", gap: 7, padding: 10, alignSelf: "flex-start" },
  simpleReturnText: { color: "#0F766E", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "700" },
  simpleSummaryAction: { gap: 11, padding: 14, marginHorizontal: 16, borderRadius: 10, borderColor: "#E2E8F0", borderWidth: 1, backgroundColor: "#F8FAFC" },

  assistanceRequiredAsterisk: {
    color: "#B42318",
    fontWeight: "800",
  },
  assistanceFieldInvalid: {
    borderColor: "#DC2626",
    borderWidth: 1.5,
    backgroundColor: "#FFF7F7",
  },
  assistanceValidationHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  assistanceValidationHintText: {
    flex: 1,
    color: "#B42318",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "600",
    lineHeight: 17,
  },
  assistanceValidationSummary: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF7F7",
    borderRadius: 12,
    padding: 12,
    gap: 7,
  },
  assistanceValidationSummaryTitle: {
    color: "#991B1B",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "800",
  },
  assistanceValidationSummaryLink: {
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  assistanceValidationSummaryLinkText: {
    flex: 1,
    color: "#B42318",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 17,
  },
  assistanceDesktop: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F6F8F7",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  assistanceDesktopHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 6,
  },
  assistanceHeadingIcon: {
    width: 51,
    height: 51,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E0F5EA",
  },
  assistancePageHeading: {
    fontSize: designUi.type.page.fontSize,
    fontWeight: designUi.type.page.fontWeight,
    color: "#101828",
    marginBottom: 4, lineHeight: designUi.type.page.lineHeight,},
  assistanceSubtext: {
    color: "#64748B",
    fontSize: designUi.type.body.fontSize,
    lineHeight: designUi.type.body.lineHeight, fontWeight: designUi.type.body.fontWeight,},
  assistanceSplitWorkspace: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    gap: 14,
  },
  assistanceListPanel: {
    width: 420,
    maxWidth: "38%",
    minWidth: 310,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  assistanceListContent: {
    paddingBottom: 18,
  },
  assistanceSelectedPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  assistanceQueueCard: {
    padding: 14,
    gap: 11,
  },
  assistanceQueueHeading: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", fontSize: designUi.type.section.fontSize, lineHeight: designUi.type.section.lineHeight, fontWeight: designUi.type.section.fontWeight,},
  assistanceQueueTitle: {
    fontSize: designUi.type.card.fontSize,
    fontWeight: designUi.type.card.fontWeight,
    color: "#101828", lineHeight: designUi.type.card.lineHeight,},
  assistanceSearchField: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 9,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
  },
  assistanceSearchText: {
    flex: 1,
    minWidth: 0,
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    color: "#101828",
    paddingVertical: 9,
  },
  assistanceFilterRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  assistancePicker: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  assistancePickerButton: {
    minHeight: 43,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  assistancePickerValue: {
    flex: 1,
    color: "#334155",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "700",
  },
  assistancePickerChoices: {
    borderWidth: 1,
    borderColor: "#D7E0EA",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  assistancePickerChoice: {
    minHeight: 38,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  assistancePickerChoiceSelected: {
    backgroundColor: "#EDF9F3",
  },
  assistancePickerChoiceText: {
    flex: 1,
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    color: "#334155",
  },
  assistanceEmptyQueue: {
    minHeight: 145,
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  assistancePageControl: {
    paddingTop: 6,
  },
  assistanceListFootnote: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
  },
  assistanceNoSelection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 22,
  },
  assistanceSectionTitle: {
    fontSize: designUi.type.section.fontSize,
    fontWeight: designUi.type.section.fontWeight,
    color: "#102A20", lineHeight: designUi.type.section.lineHeight,},
  assistanceReviewScroll: {
    flex: 1,
    minHeight: 0,
  },
  assistanceReviewContent: {
    gap: 12,
    paddingTop: 6,
    paddingBottom: 24,
  },
  assistanceMobilePage: {
    padding: 14,
    paddingBottom: 42,
    gap: 13,
  },
  assistanceQuickChecklist: {
    gap: 3,
    padding: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  assistanceChecklistHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  assistanceChecklistRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },
  assistanceChecklistText: {
    flex: 1,
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "600",
    color: "#334155",
  },
  assistanceChecklistHelp: {
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
    color: "#64748B",
    paddingTop: 8,
  },
  assistanceTextLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
  },
  assistanceLinkText: {
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
    color: "#047857",
  },
  assistanceQuickActions: {
    marginHorizontal: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 16,
    paddingBottom: 8,
  },
  assistanceQuickButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  assistanceQuickNote: {
    gap: 9,
    borderWidth: 1,
    borderColor: "#D1E7DB",
    borderRadius: 13,
    padding: 14,
    backgroundColor: "#F8FCFA",
  },
  assistanceWarning: {
    color: "#9A6700",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 17,
  },
  mockQueueRowSelected: {
    borderWidth: 1,
    borderColor: "#8FD5B1",
    borderRadius: 12,
    backgroundColor: "#F0FBF5",
  },

  page: {
    flex: 1,
    backgroundColor: "#F6F8F7",
  },

  pageScroll: {
    flex: 1,
  },

  pageContent: {
    padding: 24,
    paddingBottom: 48,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F6F8F7",
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "600",
  },

  accessCard: {
    width: "100%",
    maxWidth: 460,
    padding: 28,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  accessTitle: {
    marginTop: 12,
    color: "#0F172A",
    fontSize: vsType.size.titleSmall, fontFamily: vsType.family,
    fontWeight: "800",
  },

  accessText: {
    marginTop: 8,
    color: "#64748B",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    lineHeight: 20,
    textAlign: "center",
  },

  headerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
  },

  headerCopy: {
    flex: 1,
    minWidth: 320,
    maxWidth: 760,
  },

  eyebrow: {
    color: "#4F46E5",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 1.3,
  },

  pageTitle: {
    marginTop: 6,
    color: "#0F172A",
    fontSize: vsType.size.hero, fontFamily: vsType.family,
    fontWeight: "800",
  },

  pageSubtitle: {
    marginTop: 8,
    color: "#64748B",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    lineHeight: 20,
    maxWidth: 760,
  },

  separationNote: {
    width: 330,
    maxWidth: "100%",
    flexDirection: "row",
    gap: 11,
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
  },

  noteCopy: {
    flex: 1,
    minWidth: 0,
  },

  noteTitle: {
    color: "#312E81",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
  },

  noteText: {
    marginTop: 4,
    color: "#4B5563",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 17,
  },

  statsGrid: {
    marginTop: 22,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  statCard: {
    minWidth: 155,
    flexGrow: 1,
    flexBasis: 155,
    maxWidth: 250,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  statIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },

  statValue: {
    color: "#0F172A",
    fontSize: vsType.size.subheading, fontFamily: vsType.family,
    fontWeight: "800",
  },

  statLabel: {
    marginTop: 1,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },

  errorBox: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF1F2",
  },

  errorText: {
    flex: 1,
    color: "#B42318",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "700",
  },

  toolbar: {
    marginTop: 18,
    gap: 11,
  },

  searchBox: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE3EA",
    backgroundColor: "#FFFFFF",
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    color: "#0F172A",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    outlineStyle: "none" as any,
  },

  filtersRow: {
    gap: 8,
    paddingRight: 14,
  },

  filterChip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },

  filterChipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF",
  },

  filterChipText: {
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  filterChipTextActive: {
    color: "#4338CA",
  },

  workspace: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },

  workspaceStacked: {
    flexDirection: "column",
  },

  requestListPanel: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  requestListWide: {
    width: "34%",
    minWidth: 330,
    maxWidth: 440,
  },

  requestListStacked: {
    width: "100%",
  },

  reviewPanel: {
    minWidth: 0,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  reviewPanelWide: {
    flex: 1,
  },

  reviewPanelStacked: {
    width: "100%",
  },

  panelHeader: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 17,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F5",
  },

  panelEyebrow: {
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 1,
  },

  panelTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: vsType.size.bodyStrong, fontFamily: vsType.family,
    fontWeight: "800",
  },

  requestCard: {
    marginHorizontal: 10,
    marginTop: 9,
    padding: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#EDF1F5",
    backgroundColor: "#FFFFFF",
  },

  requestCardActive: {
    borderColor: "#818CF8",
    backgroundColor: "#F5F5FF",
  },

  requestTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  requestId: {
    flex: 1,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },

  statusText: {
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  requestTitle: {
    marginTop: 9,
    color: "#0F172A",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    lineHeight: 18,
    fontWeight: "800",
  },

  requestMeta: {
    marginTop: 5,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 15,
  },

  emptyState: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },

  emptyReview: {
    minHeight: 470,
    alignItems: "center",
    justifyContent: "center",
    padding: 34,
  },

  emptyTitle: {
    marginTop: 9,
    color: "#334155",
    fontSize: vsType.size.body, fontFamily: vsType.family,
    fontWeight: "800",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 5,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 17,
    textAlign: "center",
  },

  reviewHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F5",
  },

  reviewHeaderCopy: {
    flex: 1,
    minWidth: 250,
  },

  reviewTitle: {
    marginTop: 5,
    color: "#0F172A",
    fontSize: vsType.size.subheading, fontFamily: vsType.family,
    fontWeight: "800",
  },

  reviewSubtitle: {
    marginTop: 5,
    color: "#64748B",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 17,
  },

  largeStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },

  largeStatusText: {
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F5",
    backgroundColor: "#FBFCFE",
  },

  tabButton: {
    minHeight: 37,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
  },

  tabButtonActive: {
    backgroundColor: "#EAF7F0",
  },

  tabButtonText: {
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  tabButtonTextActive: {
    color: "#047857",
  },

  tabContent: {
    padding: 16,
    gap: 13,
  },
  reviewJourney: {
    backgroundColor: "#F8FAFC",
    borderColor: "#DCE6E5",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  reviewJourneyHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  reviewJourneyTitle: {
    fontSize: vsType.size.card, fontFamily: vsType.family,
    fontWeight: "800",
    color: "#12382D",
    marginBottom: 4,
  },
  reviewJourneySubtitle: {
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 19,
    color: "#52637A",
  },
  reviewJourneyHint: {
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 17,
    color: "#64748B",
  },
  reviewStepBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reviewStepPill: {
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  reviewStepPillActive: {
    borderColor: "#0F766E",
    backgroundColor: "#E7F5F1",
  },
  reviewStepText: {
    color: "#475569",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "700",
  },
  reviewStepTextActive: {
    color: "#115E59",
  },
  reviewStartPrompt: {
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#BFDCD1",
    borderRadius: 10,
    backgroundColor: "#F0FAF5",
  },
  reviewStepFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    paddingVertical: 10,
  },
  reviewPreviousButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 12,
  },
  reviewPreviousText: {
    color: "#475569",
    fontWeight: "700",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
  },
  reviewNextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 9,
    paddingHorizontal: 17,
    paddingVertical: 14,
    backgroundColor: "#0F766E",
  },
  reviewNextText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
  },

  sectionCard: {
    padding: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 15,
  },

  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },

  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },

  sectionTitle: {
    color: "#0F172A",
    fontSize: vsType.size.body, fontFamily: vsType.family,
    fontWeight: "800",
  },

  sectionSubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  infoItem: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 170,
    padding: 12,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
  },

  infoLabel: {
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  infoValue: {
    marginTop: 5,
    color: "#0F172A",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 17,
    fontWeight: "700",
  },

  innerDivider: {
    height: 1,
    marginVertical: 15,
    backgroundColor: "#E5E7EB",
  },

  fieldLabel: {
    marginTop: 9,
    marginBottom: 7,
    color: "#334155",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  bodyText: {
    color: "#475569",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 19,
  },

  inlineBadges: {
    marginTop: 13,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  softBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },

  softBadgeText: {
    color: "#475569",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  signalRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  signalLabel: {
    flex: 1,
    color: "#475569",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },

  signalValueBox: {
    minWidth: 34,
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#ECFDF3",
  },

  signalValueAttention: {
    backgroundColor: "#FFF7ED",
  },

  signalValue: {
    color: "#15803D",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  signalValueTextAttention: {
    color: "#C2410C",
  },

  documentRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  documentIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },

  documentCopy: {
    flex: 1,
    minWidth: 0,
  },

  documentTitle: {
    color: "#0F172A",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
  },

  documentMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
  },

  emptyInner: {
    minHeight: 130,
    alignItems: "center",
    justifyContent: "center",
  },

  publicCampaignPhotoCard: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },

  publicCampaignPhotoImage: {
    width: 180,
    height: 130,
    borderRadius: 12,
    backgroundColor: "#E2E8F0",
  },

  publicCampaignPhotoCopy: {
    flex: 1,
  },

  publicCampaignPhotoBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ECFDF3",
  },

  publicCampaignPhotoBadgeText: {
    color: "#15803D",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  publicCampaignPhotoTitle: {
    marginTop: 10,
    color: "#172033",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "800",
  },

  publicCampaignPhotoText: {
    marginTop: 5,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 17,
  },

  publicCampaignPhotoOpenButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
  },

  publicCampaignPhotoOpenButtonText: {
    color: "#4338CA",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  warningCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },

  warningTitle: {
    color: "#78350F",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  warningText: {
    marginTop: 4,
    color: "#92400E",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
  },

  infoNotice: {
    marginTop: 13,
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 11,
    backgroundColor: "#F0F9FF",
  },

  infoNoticeText: {
    flex: 1,
    color: "#075985",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
  },

  historyBlock: {
    marginTop: 8,
  },

  historyTitle: {
    color: "#334155",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  historyEmpty: {
    marginTop: 8,
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
  },

  historyRow: {
    minHeight: 50,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },

  historyMain: {
    flex: 1,
    minWidth: 0,
  },

  historyRequestTitle: {
    color: "#0F172A",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  historyMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
  },

  historyStatus: {
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  checkRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  checkRowChecked: {
    borderColor: "#86EFAC",
    backgroundColor: "#F0FDF4",
  },

  checkBox: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },

  checkBoxChecked: {
    borderColor: "#16A34A",
    backgroundColor: "#16A34A",
  },

  checkCopy: {
    flex: 1,
    minWidth: 0,
  },

  checkTitle: {
    color: "#0F172A",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
  },

  checkText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 15,
  },

  checkSummary: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
  },

  checkSummaryComplete: {
    backgroundColor: "#F0FDF4",
  },

  checkSummaryText: {
    flex: 1,
    color: "#92400E",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },

  checkSummaryTextComplete: {
    color: "#166534",
  },

  textArea: {
    minHeight: 112,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    color: "#0F172A",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    lineHeight: 18,
    textAlignVertical: "top",
    outlineStyle: "none" as any,
  },

  rejectArea: {
    minHeight: 85,
  },

  counterText: {
    marginTop: 5,
    color: "#94A3B8",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    textAlign: "right",
  },

  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  actionButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },

  actionButtonText: {
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  optionCard: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 170,
    minHeight: 74,
    justifyContent: "center",
    gap: 7,
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },

  optionCardActive: {
    borderColor: "#818CF8",
    backgroundColor: "#EEF2FF",
  },

  optionText: {
    color: "#475569",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  optionTextActive: {
    color: "#3730A3",
  },

  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    color: "#0F172A",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    backgroundColor: "#FFFFFF",
    outlineStyle: "none" as any,
  },

  donationNotice: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 11,
    backgroundColor: "#F5F3FF",
  },

  donationNoticeText: {
    flex: 1,
    color: "#5B21B6",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
  },

  locationOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  locationChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },

  locationChipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF",
  },

  locationChipText: {
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  locationChipTextActive: {
    color: "#4338CA",
  },

  rejectedCard: {
    flexDirection: "row",
    gap: 10,
    padding: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF1F2",
  },

  rejectedTitle: {
    color: "#B42318",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
  },

  rejectedText: {
    marginTop: 4,
    color: "#9F1239",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 16,
  },

  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(15,23,42,0.60)",
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },

  previewCard: {
    width: "100%",
    maxWidth: 920,
    maxHeight: "90%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },

  previewHeader: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 17,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },

  previewHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },

  previewTitle: {
    color: "#0F172A",
    fontSize: vsType.size.body, fontFamily: vsType.family,
    fontWeight: "800",
  },

  previewMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
  },

  previewClose: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },

  previewImageWrap: {
    height: 520,
    maxHeight: "70%",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    backgroundColor: "#F8FAFC",
  },

  previewImage: {
    width: "100%",
    height: "100%",
  },

  previewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },

  previewOpenButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
  },

  previewOpenText: {
    color: "#FFFFFF",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  previewSecondaryButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },

  previewSecondaryText: {
    color: "#334155",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  mockHeaderCopy: {
    flex: 1,
    maxWidth: 780,
  },

  mockTopTabsRow: {
    marginTop: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },

  mockStatusTab: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D6DEE8",
    backgroundColor: "#FFFFFF",
  },

  mockStatusTabActive: {
    borderColor: "#2563EB",
    backgroundColor: "#2563EB",
  },

  mockStatusTabText: {
    color: "#475569",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockStatusTabTextActive: {
    color: "#FFFFFF",
  },

  mockTopTabsSpacer: {
    flex: 1,
    minWidth: 16,
  },

  mockHistoryButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D6DEE8",
    backgroundColor: "#FFFFFF",
  },

  mockHistoryButtonActive: {
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },

  mockHistoryButtonText: {
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockHistoryButtonTextActive: {
    color: "#2563EB",
  },

  mockSearchRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  mockAllButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D6DEE8",
    backgroundColor: "#FFFFFF",
  },

  mockAllButtonActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },

  mockAllButtonText: {
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockAllButtonTextActive: {
    color: "#2563EB",
  },

  mockQueuePanel: {
    marginTop: 14,
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  mockQueueHeader: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 17,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },

  mockQueueEmpty: {
    minHeight: 310,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },

  mockQueueRow: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },

  mockQueueIcon: {
    width: 43,
    height: 43,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  mockQueueMain: {
    flex: 1,
    minWidth: 0,
  },

  mockQueueId: {
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockQueueTitle: {
    marginTop: 3,
    color: "#111827",
    fontSize: vsType.size.body, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockQueueMetaLine: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  mockQueueMeta: {
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
  },

  mockQueueDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  mockQueueRight: {
    minWidth: 170,
    alignItems: "flex-end",
    gap: 7,
  },

  mockQueueStatus: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },

  mockQueueStatusText: {
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockQueueDate: {
    color: "#64748B",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
  },

  mockBackLink: {
    alignSelf: "flex-start",
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  mockBackLinkText: {
    color: "#2563EB",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockBackPrimary: {
    marginTop: 16,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: "#2563EB",
  },

  mockBackPrimaryText: {
    color: "#FFFFFF",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mockDetailTabs: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },

  mockReviewGrid: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },

  mockReviewGridStacked: {
    flexDirection: "column",
  },

  mockReviewMain: {
    flex: 1,
    minWidth: 0,
  },

  mockEvaluationRail: {
    width: 390,
    maxWidth: "100%",
  },


  detailShell: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 18,
    backgroundColor: "#F6F8F7",
  },

  detailChrome: {
    flexShrink: 0,
  },

  detailBreadcrumbRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  detailSecurityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D8E0EA",
    backgroundColor: "#FFFFFF",
  },

  detailSecurityBadgeText: {
    color: "#475569",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  detailHeaderCard: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  detailWorkspace: {
    flex: 1,
    minHeight: 0,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
  },

  detailMainPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  detailPaneHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EEF5",
    backgroundColor: "#FBFCFE",
  },

  detailPaneHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },

  detailPaneHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },

  detailPaneEyebrow: {
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 1,
  },

  detailPaneTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: vsType.size.body, fontFamily: vsType.family,
    fontWeight: "800",
  },

  detailMainScroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F8FAFC",
  },

  detailMainContent: {
    padding: 2,
    paddingBottom: 28,
  },

  detailEvaluationPanel: {
    width: 438,
    minWidth: 390,
    maxWidth: "42%",
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE5EF",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  evaluationRailHeader: {
    flexShrink: 0,
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EEF5",
    backgroundColor: "#FBFCFE",
  },

  evaluationRailHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },

  evaluationRailHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },

  evaluationRailEyebrow: {
    color: "#4F46E5",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 1.1,
  },

  evaluationRailTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: vsType.size.body, fontFamily: vsType.family,
    fontWeight: "800",
  },

  evaluationRailSubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 14,
  },

  detailEvaluationScroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F8FAFC",
  },

  detailEvaluationContent: {
    padding: 0,
    paddingBottom: 28,
  },

  mobileDetailSection: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },

  mobileEvaluationSection: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE5EF",
    backgroundColor: "#F8FAFC",
    overflow: "hidden",
  },

  addressVerificationFlow: {
    gap: 12,
  },

  declaredAddressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FBFF",
  },

  declaredAddressIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
  },

  declaredAddressCopy: {
    flex: 1,
    minWidth: 0,
  },

  declaredAddressLabel: {
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 0.6,
  },

  declaredAddressValue: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    lineHeight: 15,
    fontWeight: "800",
  },

  addressSearchPanel: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8E2EE",
    backgroundColor: "#FBFCFE",
  },

  addressSearchLabel: {
    color: "#475569",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 0.55,
  },

  addressSearchRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    flexWrap: "wrap",
  },

  addressSearchInput: {
    flex: 1,
    minWidth: 220,
  },

  addressSearchButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: "#2563EB",
  },

  addressSearchButtonDisabled: {
    opacity: 0.48,
  },

  addressSearchButtonText: {
    color: "#FFFFFF",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  mapSearchStatus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 9,
    borderRadius: 9,
    backgroundColor: "#F0F9FF",
  },

  mapSearchStatusText: {
    flex: 1,
    color: "#075985",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 14,
  },

  residencyVerifiedCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
  },

  residencyVerifiedTitle: {
    color: "#166534",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },

  residencyVerifiedText: {
    marginTop: 2,
    color: "#15803D",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 13.5,
  },

  addressPrivacyNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
  },

  addressPrivacyNoticeText: {
    flex: 1,
    color: "#0F766E",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 14,
  },

  embeddedMapCard: {
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D8E2EE",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },

  embeddedMapHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EEF5",
    backgroundColor: "#FBFCFE",
  },

  embeddedMapTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  embeddedMapIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
  },

  embeddedMapTitleCopy: {
    flex: 1,
    minWidth: 0,
  },

  embeddedMapTitle: {
    color: "#0F172A",
    fontSize: vsType.size.meta, fontFamily: vsType.family,
    fontWeight: "800",
  },

  embeddedMapQuery: {
    marginTop: 2,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 14,
  },

  embeddedMapBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },

  embeddedMapBadgeText: {
    color: "#4338CA",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  embeddedMapFrame: {
    width: "100%",
    height: 265,
    backgroundColor: "#E2E8F0",
  },

  embeddedMapEmpty: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
    backgroundColor: "#F8FAFC",
  },

  embeddedMapEmptyText: {
    maxWidth: 320,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 15,
    textAlign: "center",
  },

  embeddedMapNativeFallback: {
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 20,
    backgroundColor: "#F8FAFC",
  },

  embeddedMapNativeFallbackTitle: {
    color: "#1D4ED8",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "800",
  },

  embeddedMapNativeFallbackText: {
    maxWidth: 320,
    color: "#64748B",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 14,
    textAlign: "center",
  },

  embeddedMapFooter: {
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#E9EEF5",
    backgroundColor: "#FFFFFF",
  },

  embeddedMapPrivacy: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },

  embeddedMapPrivacyText: {
    flex: 1,
    color: "#0F766E",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    lineHeight: 14,
  },

  embeddedMapExternalButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#D8E0EA",
    backgroundColor: "#F8FAFC",
  },

  embeddedMapExternalButtonText: {
    color: "#475569",
    fontSize: vsType.size.micro, fontFamily: vsType.family,
    fontWeight: "800",
  },


  adminDropdownButton: {
    minHeight: 46,
    marginTop: 7,
    marginBottom: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  adminDropdownButtonDisabled: {
    backgroundColor: "#F8FAFC",
    opacity: 0.7,
  },

  adminDropdownButtonText: {
    flex: 1,
    color: "#0F172A",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },

  adminDropdownPlaceholder: {
    color: "#94A3B8",
    fontWeight: "600",
  },

  adminDropdownOverlay: {
    flex: 1,
    padding: 20,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
  },

  adminDropdownModal: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "72%",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },

  adminDropdownModalHeader: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  adminDropdownModalTitle: {
    color: "#0F172A",
    fontSize: vsType.size.label, fontFamily: vsType.family,
    fontWeight: "800",
  },

  adminDropdownCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },

  adminDropdownOptionList: {
    maxHeight: 360,
  },

  adminDropdownOptionListContent: {
    padding: 8,
  },

  adminDropdownOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  adminDropdownOptionActive: {
    backgroundColor: "#EEF2FF",
  },

  adminDropdownOptionText: {
    flex: 1,
    color: "#334155",
    fontSize: vsType.size.caption, fontFamily: vsType.family,
    fontWeight: "700",
  },

  adminDropdownOptionTextActive: {
    color: "#4338CA",
    fontWeight: "800",
  },

});