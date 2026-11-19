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
const SECURE_ASSISTANCE_BACKEND = "https://volunserve.onrender.com";

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

const showAssistanceActionError = (title: string, message: string) => {
  if (Platform.OS === "web" && typeof (globalThis as any).alert === "function") {
    (globalThis as any).alert(title + "\n\n" + message);
    return;
  }
  Alert.alert(title, message);
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
    confirmedExistingAssistanceAmount: String(data?.confirmedExistingAssistanceAmount ?? "0"),
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
    (!draft.videoVerificationRequired ||
      draft.videoVerificationStatus === "completed") &&
    (!draft.siteVisitRequired ||
      draft.siteVisitStatus === "completed") &&
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

// Reference-design formatting only; existing money() and statusMeta() remain intact.
const referenceAmount = (value?: number) => {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `₱${n.toLocaleString("en-PH",{maximumFractionDigits:2})}` : "—";
};
const referenceSubmitted = (value: any) => {
  let date: Date | null = null;
  try {
    if (typeof value?.toDate === "function") date = value.toDate();
    else if (typeof value?.seconds === "number") date = new Date(value.seconds*1000);
    else if (value instanceof Date) date = value;
  } catch { /* Display only: invalid timestamps are allowed */ }
  if (!date || !Number.isFinite(date.getTime())) return {date:"Not recorded",time:""};
  return {
    date:date.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}),
    time:date.toLocaleTimeString("en-PH",{hour:"numeric",minute:"2-digit"}),
  };
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

// Screenshot-specific table presentation; never change the stored request status.
const referenceStatusMeta = (request: AssistanceRequest) => {
  const meta = statusMeta(request.status);
  const status = String(request.status || "pending").toLowerCase();
  if (status === "pending" || status === "under_review") {
    return {...meta,label:"For Review",color:"#956200",soft:"#FFF1BC"};
  }
  if (status === "assistance_provided" || status === "closed") {
    return {...meta,label:"Completed",color:"#334155",soft:"#E8EEF1"};
  }
  if (status === "campaign_created" ||
    (status === "verified" && request.supportDecision &&
    !["pending","not_required"].includes(request.supportDecision))) {
    return {...meta,label:"Approved",color:"#087C43",soft:"#DDF8E8"};
  }
  return meta;
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
  const [search, setSearch] = useState("");
  const [recordPage, setRecordPage] = useState(1);
  const [showReferenceFilter, setShowReferenceFilter] = useState(false);

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
  const [donationSubmitting, setDonationSubmitting] = useState(false);

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

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    return requests.filter((item) => {
      const status = String(
        item.status || "pending",
      );

      const matchesFilter =
        filter === "all" ||
        (filter === "pending" ? ["pending","under_review"].includes(status) : filter === "completed"
          ? [
              "assistance_provided",
              "campaign_created",
              "closed",
            ].includes(status)
          : status === filter);

      if (!matchesFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      const haystack = [
        item.requestId,
        item.requesterName,
        item.requesterEmail,
        item.requesterBarangay,
        item.beneficiaryName,
        item.categoryLabel,
        item.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [
    requests,
    filter,
    search,
  ]);

  const requestPages = Math.max(1, Math.ceil(filteredRequests.length / 5));
  const activeRequestPage = Math.max(1, Math.min(recordPage, requestPages));
  const pagedRequests = filteredRequests.slice((activeRequestPage - 1) * 5, activeRequestPage * 5);

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
    if (savingAction || donationSubmitting) {
      showAssistanceActionError("Save in Progress", "Finish saving before opening another request.");
      return;
    }
    setSelected(item);
    setReviewTab("case");
    setScreenMode("detail");
  };

  const backToQueue = () => {
    if (savingAction || donationSubmitting) return;
    setSelected(null);
    setReviewTab("case");
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
    silent = false,
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

      if (actionKey === "resource_assessment") {
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

      if (!silent && Platform.OS === "web") {
        const browserAlert = (globalThis as any).alert;
        if (typeof browserAlert === "function") {
          browserAlert(message);
        } else {
          Alert.alert("Saved", message);
        }
      } else if (!silent) {
        Alert.alert("Saved", message);
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

  // The secure review starts as part of the Admin's chosen decision.
  // No extra visible Start Review step or database permission changes.
  const ensurePrivateReviewStarted = async () => {
    if (verificationReview) return;
    if (!selected || !user) throw new Error("The Admin session or request is unavailable.");
    const token = await user.getIdToken(true);
    const response = await fetch(
      SECURE_ASSISTANCE_BACKEND + "/api/admin/assistance/requests/" +
        encodeURIComponent(selected.id) + "/start-review",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw new Error(result?.message || result?.error ||
        "Could not start the protected review (HTTP " + response.status + ").");
    }
    const snapshot = await getDoc(doc(db, PRIVATE_REVIEW_COLLECTION, selected.id));
    if (!snapshot.exists()) throw new Error("The protected review record was not available.");
    setVerificationReview(snapshot.data() as Record<string, any>);
    // Preserve selections already made in the current Admin review form.
  };

  const startReview = () => {
    if (savingAction) return;
    confirmAdminAction(
      "Start LGU Review", "Open the protected review record?", "Start Review",
      async () => {
        try {
          setSavingAction("start_review");
          await ensurePrivateReviewStarted();
        } catch (error: any) {
          showAssistanceActionError("Start Review Failed", error?.message || "Unable to start the review.");
        } finally { setSavingAction(""); }
      },
    );
  };

  const requestMoreInformation = async () => {
    if (!selected || !reviewDraft || savingAction) return;

    const note = adminNote.trim();

    if (note.length < 10) {
      showAssistanceActionError("Review Note Required", "Explain what information or evidence the resident must provide (at least 10 characters).");
      return;
    }

    try {
      setSavingAction("more_info");
      await ensurePrivateReviewStarted();
      await persistPrivateReview(
        "more_information",
        note,
      );
    } catch (error: any) {
      showAssistanceActionError("Request More Information Failed", error?.message || "The review could not be updated.");
    } finally {
      setSavingAction("");
    }
  };

  const verifyNeed = () => {
    if (!selected || !reviewDraft) return;

    if (!reviewReadyForVerification(reviewDraft)) {
      showAssistanceActionError("Complete Verification", "Confirm the evidence, resident, provider, and budget details in the short review form before approving.");
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
          await ensurePrivateReviewStarted();
          await persistPrivateReview(
            "verify",
            adminNote.trim() || "LGU verification completed.",
          );
        } catch (error: any) {
          showAssistanceActionError("Approval Failed", error?.message || "The review could not be finalized.");
        } finally {
          setSavingAction("");
        }
      },
    );
  };

  const rejectRequest = () => {
    if (!selected || !reviewDraft) return;

    const reason = rejectionReason.trim();

    if (reason.length < 3) {
      showAssistanceActionError("Rejection Reason Required", "Enter a clear reason (at least 3 characters).");
      return;
    }

    confirmAdminAction(
      "Reject Assistance Request",
      "Reject this request after LGU review? The private verification record and reason will be preserved for audit.",
      "Reject",
      async () => {
        try {
          setSavingAction("reject");
          await ensurePrivateReviewStarted();
          await persistPrivateReview(
            "reject",
            reason,
          );
        } catch (error: any) {
          showAssistanceActionError("Rejection Failed", error?.message || "The review could not be rejected.");
        } finally {
          setSavingAction("");
        }
      },
      true,
    );
  };

  const saveResourceAssessment = () => {
    if (!selected || selected.verificationStatus !== "verified") {
      showAssistanceActionError(
        "Verified Need Required",
        "Complete LGU verification before recording the support decision.",
      );
      return;
    }

    if (!["internal_support", "donation_support", "not_required"].includes(supportDecision)) {
      showAssistanceActionError("Support Decision Required", "Select how the verified need will be supported.");
      return;
    }

    const amount = Number(remainingAmount || 0);
    const verifiedCap = Number(verificationReview?.verifiedUncoveredAmount || 0);

    if (!Number.isFinite(amount) || amount < 0) {
      showAssistanceActionError("Invalid Remaining Amount", "Enter a valid remaining unmet amount, or 0 if none.");
      return;
    }

    if (supportDecision === "donation_support" && amount > verifiedCap) {
      showAssistanceActionError(
        "Amount Exceeds Verified Need",
        `Donation support cannot exceed the private LGU-verified uncovered amount of PHP ${verifiedCap.toLocaleString("en-PH")}.`,
      );
      return;
    }

    if (supportDecision === "donation_support" && amount <= 0) {
      showAssistanceActionError(
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
        !["internal_support", "not_required"].includes(selected.supportDecision || "") ||
        selected.supportDecision !== supportDecision ||
        selected.status === "assistance_provided"
      ) {
        Alert.alert(
          "Support Decision",
          "Save the selected support plan first. Confirm completion only after the LGU or partner has provided assistance, or the case is ready to close.",
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
                selected.supportDecision,
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

  // One Admin action, two existing authorized backend writes, then campaign
  // setup. Never publish, change donation records, or bypass private review.
  const saveAndContinueDonation = async () => {
    if (!selected || !user || !isOperationalAdmin || savingAction || donationSubmitting) return;
    if (selected.donationCampaignId) {
      router.push({pathname: "/donation-list", params: {assistanceRequestId: selected.id}} as any);
      return;
    }
    if (selected.verificationStatus !== "verified" ||
        supportDecision !== "donation_support") {
      showAssistanceActionError("Choose Donation Support", "Select Donation Campaign for a verified assistance request.");
      return;
    }
    const cap = Number(verificationReview?.verifiedUncoveredAmount || 0);
    const amountRaw = remainingAmount.trim();
    const amount = Number(amountRaw);
    const validAmount = /^\d+(?:\.\d{1,2})?$/.test(amountRaw) &&
      Number.isFinite(amount) && amount > 0 && amount <= cap && cap > 0;
    if (!validAmount) {
      showAssistanceActionError("Verified Amount Required",
        "Enter the supported amount greater than zero and no higher than the LGU-verified uncovered amount.");
      return;
    }
    const officeName = locationName.trim();
    const officeAddress = locationAddress.trim();
    if (officeName.length < 3 || officeAddress.length < 5) {
      showAssistanceActionError("Public Office Required",
        "Enter the public coordination office name and address. The Resident's private address must not be used.");
      return;
    }
    setDonationSubmitting(true);
    try {
      const planUpToDate = selected.supportDecision === "donation_support" &&
        Math.abs(Number(selected.remainingAmount || 0) - amount) < 0.009;
      if (!planUpToDate) {
        const savedPlan = await updateRequest("resource_assessment", {
          supportDecision: "donation_support", remainingAmount: amount,
          adminNote: adminNote.trim().slice(0, 2000),
        }, true);
        if (!savedPlan) return;
      }
      const locationUpToDate = String(selected.assignedLocationName || "").trim() === officeName &&
        String(selected.assignedLocationAddress || "").trim() === officeAddress;
      if (!locationUpToDate) {
        const savedOffice = await updateRequest("save_location", {
          assignedLocationType: selected.assignedLocationType || "lgu_office",
          assignedLocationName: officeName,
          assignedLocationAddress: officeAddress,
          assignedLocationNotes: locationNotes.trim().slice(0, 1000),
          adminNote: adminNote.trim().slice(0, 2000),
        }, true);
        if (!savedOffice) return;
      }
      router.push({pathname: "/donation-list",
        params: {assistanceRequestId: selected.id}} as any);
    } finally {
      setDonationSubmitting(false);
    }
  };

  const saveOfficialLocation =
    () => {
      if (
        !selected ||
        selected.verificationStatus !==
          "verified"
      ) {
        showAssistanceActionError(
          "Verified Need Required",
          "Set the official public service location only after the request is verified.",
        );
        return;
      }

      if (
        locationName.trim().length < 3 ||
        locationAddress.trim().length < 5
      ) {
        showAssistanceActionError(
          "Official Location Required",
          "Enter the public LGU or barangay office name and address. No map search is required.",
        );
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
            locationType || "lgu_office",
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


  const renderReviewMain = () => {
    if (!selected) return null;

    return (
      <>
        {reviewTab === "case" && (
          <CaseReviewTab
            request={selected}
            residentIdentityVerified={residentProfile?.identityVerified === true || residentProfile?.identityStatus === "verified"}
            relatedRequestCount={relatedRequests.length}
            sameBeneficiaryCount={sameBeneficiaryRequests.length}
          />
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

    return (
      <DecisionTab
        request={selected}
        reviewDraft={reviewDraft}
        reviewRecord={verificationReview}
        reviewLoading={verificationReviewLoading}
        residentIdentityVerified={residentProfile?.identityVerified === true || residentProfile?.identityStatus === "verified"}
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
        onContinueDonation={saveAndContinueDonation}
        donationSubmitting={donationSubmitting}
        onClearLocation={clearOfficialLocation}
      />
    );
  };

  const renderDetailChrome = () => {
    if (!selected) return null;

    return (
      <>
        <View style={styles.detailBreadcrumbRow}>
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
              Back to Assistance Requests
            </Text>
          </TouchableOpacity>

          <View style={{display:"none"}}>
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color="#475569"
            />
            <Text style={styles.detailSecurityBadgeText}>
              Authorized LGU Review
            </Text>
          </View>
        </View>

        <View style={styles.detailHeaderCard}>
          <RequestReviewHeader request={selected} />
        </View>

        <View style={styles.mockDetailTabs}>
          <ReviewTabButton
            label="Request Details"
            icon="document-text-outline"
            active={reviewTab === "case"}
            onPress={() => setReviewTab("case")}
          />
          <ReviewTabButton
            label={`Documents (${selected.documents?.length || 0})`}
            icon="images-outline"
            active={reviewTab === "evidence"}
            onPress={() => setReviewTab("evidence")}
          />
          <ReviewTabButton
            label="Resident Info"
            icon="person-outline"
            active={reviewTab === "resident"}
            onPress={() => setReviewTab("resident")}
          />
          <ReviewTabButton
            label="Review & Decision"
            icon="shield-checkmark-outline"
            active={reviewTab === "decision"}
            onPress={() => setReviewTab("decision")}
          />
        </View>
      </>
    );
  };

  return (
    <View style={styles.page}>
      {screenMode === "queue" ? (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
        >
          <>
            <View style={{gap:13}}>
              <View style={{flexDirection:"row",alignItems:"center",gap:13,paddingBottom:1}}>
                <Ionicons name="clipboard-outline" size={29} color="#07854A"/>
                <View style={{gap:3}}>
                  <Text style={{fontSize:24,fontWeight:"800",color:"#111827"}}>Assistance Requests</Text>
                  <Text style={{fontSize:12,color:"#61737D"}}>Review resident requests for support.</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, alignItems: "center" }}>
                <MockStatusTab label="All Requests" count={requests.length} active={filter === "all"}
                  onPress={() => { setFilter("all"); setRecordPage(1); }} />
                <MockStatusTab label="For Review" count={stats.pending + stats.underReview}
                  active={filter === "pending" || filter === "under_review"}
                  onPress={() => { setFilter("pending"); setRecordPage(1); }} />
                <MockStatusTab label="Approved" count={stats.verified} active={filter === "verified"}
                  onPress={() => { setFilter("verified"); setRecordPage(1); }} />
                <MockStatusTab label="Rejected" count={stats.rejected} active={filter === "rejected"}
                  onPress={() => { setFilter("rejected"); setRecordPage(1); }} />
                <MockStatusTab label="Completed" count={requests.filter(item =>
                  ["assistance_provided", "campaign_created", "closed"].includes(String(item.status || ""))).length}
                  active={filter === "completed"}
                  onPress={() => { setFilter("completed"); setRecordPage(1); }} />
              </View>
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:12,alignItems:"center",justifyContent:"space-between"}}>
                <View style={[styles.searchBox,{flex:1,minWidth:220,maxWidth:460}]}>
                  <Ionicons name="search-outline" size={18} color="#64748B"/>
                  <TextInput value={search}
                    onChangeText={value=>{setSearch(value);setRecordPage(1);}}
                    placeholder="Search request, resident, or category..."
                    placeholderTextColor="#94A3B8" style={styles.searchInput}/>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:showReferenceFilter}}
                  onPress={()=>setShowReferenceFilter(current=>!current)}
                  style={{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:15,paddingVertical:11,
                    backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#DDE7E5",borderRadius:8}}>
                  <Ionicons name="filter-outline" size={17} color="#03733F"/>
                  <Text style={{fontSize:12,fontWeight:"800",color:"#03733F"}}>Filter</Text>
                </TouchableOpacity>
              </View>
              {showReferenceFilter && <View style={{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                <MockStatusTab label="Under Review" count={stats.underReview} active={filter === "under_review"}
                  onPress={() => {setFilter("under_review");setRecordPage(1);}} />
                <Text style={{fontSize:11,color:"#64748B"}}>Showing newest requests first</Text>
              </View>}
              {!!listenerError && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={18} color="#B42318"/>
                  <Text style={styles.errorText}>{listenerError}</Text>
                </View>
              )}
              <View style={{
                borderRadius:16,backgroundColor:"#FFFFFF",borderWidth:1,
                borderColor:"#DDE8E4",overflow:"hidden",
              }}>
                <View style={{height:6}} />
                <ScrollView horizontal={!wide} showsHorizontalScrollIndicator={!wide}
                  nestedScrollEnabled style={{width:"100%"}}>
                <View style={wide ? {width:"100%"} : {width:890}}>
                <View style={{
                  flexDirection:"row",paddingHorizontal:20,paddingVertical:13,
                  backgroundColor:"#F1F6F4",borderTopWidth:1,borderBottomWidth:1,
                  borderColor:"#E4EBE7",gap:16,
                }}>
                  <Text style={{flex:3,minWidth:180,fontSize:10.5,fontWeight:"800",color:"#49665B"}}>REQUEST CASE</Text>
                  <Text style={{flex:2,minWidth:110,fontSize:10.5,fontWeight:"800",color:"#49665B"}}>RESIDENT</Text>
                  <Text style={{flex:1.6,minWidth:90,fontSize:10.5,fontWeight:"800",color:"#49665B"}}>CATEGORY</Text>
                  <Text style={{flex:1.2,minWidth:85,fontSize:10.5,fontWeight:"800",color:"#49665B"}}>REQUESTED AMOUNT</Text>
                  <Text style={{flex:1.2,minWidth:90,fontSize:10.5,fontWeight:"800",color:"#49665B"}}>STATUS</Text>
                  <Text style={{flex:1.2,minWidth:115,fontSize:10.5,fontWeight:"800",color:"#49665B"}}>SUBMITTED</Text>
                </View>
                {loadingRequests ? (
                  <View style={{padding:35,alignItems:"center"}}><ActivityIndicator color="#047857"/></View>
                ) : filteredRequests.length === 0 ? (
                  <View style={{padding:42,alignItems:"center",gap:10}}>
                    <Ionicons name="file-tray-outline" size={28} color="#94A3B8"/>
                    <Text style={{color:"#475569",fontSize:13}}>No matching assistance requests.</Text>
                  </View>
                ) : pagedRequests.map(item => (
                  <MockQueueRow key={item.id} request={item} onPress={()=>selectRequest(item)}/>
                ))}
                </View>
                </ScrollView>
                <View style={{
                  paddingHorizontal:18,paddingVertical:15,borderTopWidth:1,borderColor:"#E6ECE9",
                  flexDirection:"row",flexWrap:"wrap",alignItems:"center",
                  justifyContent:"space-between",gap:12,
                }}>
                  <Text style={{fontSize:11,color:"#64748B"}}>
                    {filteredRequests.length===0?0:(activeRequestPage-1)*5+1}–{Math.min(activeRequestPage*5,filteredRequests.length)} of {filteredRequests.length} requests  ·  5 per page
                  </Text>
                  <ListPagination page={activeRequestPage} total={filteredRequests.length}
                    pageSize={5} onChange={setRecordPage}/>
                </View>
              </View>
            </View>

          </>
        </ScrollView>
      ) : !selected ? (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mockQueueEmpty}>
            <Ionicons
              name="file-tray-outline"
              size={38}
              color="#94A3B8"
            />
            <Text style={styles.emptyTitle}>
              Request no longer available
            </Text>
            <Text style={styles.emptyText}>
              Return to Assistance Requests and
              select another record.
            </Text>
            <TouchableOpacity
              style={styles.mockBackPrimary}
              onPress={backToQueue}
            >
              <Text
                style={styles.mockBackPrimaryText}
              >
                Back to Assistance Requests
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : wide ? (
        <View style={styles.detailShell}>
          <View style={styles.detailChrome}>
            {renderDetailChrome()}
          </View>

          <View style={styles.detailWorkspace}>
            <View style={[styles.detailMainPane, { flex: 1, width: "100%", minWidth: 0 }]}>
              <View style={{display:"none"}}>
                <View style={styles.detailPaneHeaderIcon}>
                  <Ionicons
                    name={
                      reviewTab === "case"
                        ? "document-text-outline"
                        : reviewTab === "evidence"
                          ? "images-outline"
                          : reviewTab === "resident"
                            ? "person-outline"
                            : "shield-checkmark-outline"
                    }
                    size={17}
                    color="#4338CA"
                  />
                </View>
                <View style={styles.detailPaneHeaderCopy}>
                  <Text style={styles.detailPaneEyebrow}>
                    REQUEST WORKSPACE
                  </Text>
                  <Text style={styles.detailPaneTitle}>
                    {
                      reviewTab === "case"
                        ? "Case Details"
                        : reviewTab === "evidence"
                          ? "Supporting Documents"
                          : reviewTab === "resident"
                            ? "Resident Information"
                            : "Review & Decision"
                    }
                  </Text>
                </View>
              </View>

              <ScrollView
                style={styles.detailMainScroll}
                contentContainerStyle={styles.detailMainContent}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {renderReviewMain()}
              </ScrollView>
            </View>


          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator
        >
          {renderDetailChrome()}

          <View style={styles.mobileDetailSection}>
            {renderReviewMain()}
          </View>


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

function MockQueueRow({request,onPress}:{
  request: AssistanceRequest;
  onPress:()=>void;
}){
  const category=assistanceCategoryMeta(request.category);
  const meta=referenceStatusMeta(request);
  const submitted=referenceSubmitted(request.createdAt);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.82}
      style={{
        paddingHorizontal:15,paddingVertical:11,backgroundColor:"#FFFFFF",
        borderBottomWidth:1,borderBottomColor:"#EAEFEB",
        flexDirection:"row",alignItems:"center",gap:11,minHeight:70,
      }}>
      <View style={{flex:3,minWidth:165,flexDirection:"row",alignItems:"center",gap:10}}>
        <View style={{width:38,height:38,borderRadius:9,backgroundColor:category.soft,
          alignItems:"center",justifyContent:"center"}}>
          <Ionicons name={category.icon} size={22} color={category.color}/>
        </View>
        <View style={{flex:1,minWidth:0,gap:3}}>
          <Text style={{fontSize:12,fontWeight:"800",color:"#102A26"}} numberOfLines={2}>
            {request.title || "Assistance Request"}
          </Text>
          <Text style={{fontSize:10,color:"#73837E"}} numberOfLines={1}>
            {request.requestId || request.id}
          </Text>
        </View>
      </View>
      <View style={{flex:2,minWidth:105,gap:3}}>
        <Text numberOfLines={2} style={{fontSize:11.5,fontWeight:"700",color:"#172E27"}}>
          {request.requesterName || "Resident"}
        </Text>
        <Text style={{fontSize:10,color:"#73837E"}}>Resident</Text>
      </View>
      <View style={{flex:1.6,minWidth:90}}>
        <Text numberOfLines={2} style={{fontSize:12,color:"#334E45"}}>
          {request.categoryLabel || String(request.category || "Assistance").replaceAll("_"," ")}
        </Text>
      </View>
      <View style={{flex:1.2,minWidth:85}}>
        <Text style={{fontSize:12,fontWeight:"800",color:"#132D24"}}>{referenceAmount(request.estimatedAmount)}</Text>
      </View>
      <View style={{flex:1.2,minWidth:90}}>
        <View style={{alignSelf:"flex-start",paddingVertical:7,paddingHorizontal:12,
          borderRadius:99,backgroundColor:meta.soft}}>
          <Text style={{fontSize:11,color:meta.color,fontWeight:"800"}}>{meta.label}</Text>
        </View>
      </View>
      <View style={{flex:1.2,minWidth:115,flexDirection:"row",alignItems:"center",gap:7}}>
        <View style={{flex:1,minWidth:0,gap:2}}>
          <Text numberOfLines={1} style={{fontSize:10.5,color:"#334155",fontWeight:"700"}}>{submitted.date}</Text>
          <Text numberOfLines={1} style={{fontSize:10,color:"#64748B"}}>{submitted.time}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color="#047857"/>
      </View>
    </TouchableOpacity>
  );
}

function PrivateVerificationOverview({
  request,
  reviewDraft,
  reviewRecord,
  loading,
  ready,
}: {
  request: AssistanceRequest;
  reviewDraft: PrivateReviewDraft | null;
  reviewRecord: Record<string, any> | null;
  loading: boolean;
  ready: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.tabContent}>
        <SectionCard
          title="Private LGU Verification"
          subtitle="Loading the protected verification record."
          icon="shield-checkmark-outline"
        >
          <ActivityIndicator color="#4F46E5" />
        </SectionCard>
      </View>
    );
  }

  if (!reviewDraft) {
    return (
      <View style={styles.tabContent}>
        <SectionCard
          title="Private LGU Verification"
          subtitle="Start Review to create the protected verification record for this case."
          icon="shield-checkmark-outline"
        >
          <Text style={styles.emptyText}>No private verification record is loaded yet.</Text>
        </SectionCard>
      </View>
    );
  }

  const gross = safeNumber(reviewDraft.verifiedGrossCost);
  const existing = safeNumber(reviewDraft.confirmedExistingAssistanceAmount);
  const uncovered = Math.max(0, gross - existing);
  const riskFlags = reviewDraft.riskFlags
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <View style={styles.tabContent}>
      <SectionCard
        title="Private LGU Verification Summary"
        subtitle="This protected record is visible only to authorized LGU/Admin roles. It is the gate behind Verify Need."
        icon="shield-checkmark-outline"
      >
        <InfoGrid>
          <InfoItem label="Review Record" value={reviewRecord ? "Created" : "Not saved yet"} />
          <InfoItem label="Document Consistency" value={reviewDraft.documentConsistencyStatus} />
          <InfoItem label="Duplicate Check" value={reviewDraft.duplicateCheckStatus} />
          <InfoItem label="Beneficiary Check" value={reviewDraft.beneficiaryCheckStatus} />
          <InfoItem label="Residency Verification" value={reviewDraft.residencyVerificationStatus} />
          <InfoItem
            label="Facility Verification"
            value={
              reviewDraft.facilityVerificationRequired
                ? reviewDraft.facilityVerificationStatus
                : "Not required"
            }
          />
          <InfoItem
            label="Cost Verification"
            value={
              reviewDraft.costVerificationRequired
                ? reviewDraft.costVerificationStatus
                : "Not required"
            }
          />
          <InfoItem label="Risk Flags" value={String(riskFlags.length)} attention={riskFlags.length > 0} />
        </InfoGrid>

        {reviewDraft.costVerificationRequired && (
          <>
            <Divider />
            <InfoGrid>
              <InfoItem label="Resident Estimate" value={money(request.estimatedAmount)} />
              <InfoItem label="LGU Verified Gross Cost" value={money(gross)} />
              <InfoItem label="Confirmed Existing Assistance" value={money(existing)} />
              <InfoItem label="Verified Uncovered Amount" value={money(uncovered)} />
            </InfoGrid>
          </>
        )}

        <View
          style={[
            styles.checkSummary,
            ready && styles.checkSummaryComplete,
          ]}
        >
          <Ionicons
            name={ready ? "checkmark-circle" : "alert-circle-outline"}
            size={19}
            color={ready ? "#15803D" : "#9A6700"}
          />
          <Text
            style={[
              styles.checkSummaryText,
              ready && styles.checkSummaryTextComplete,
            ]}
          >
            {ready
              ? "All rule-backed verification conditions are ready for final LGU verification."
              : "Verify Need remains locked until every required private verification condition is satisfied."}
          </Text>
        </View>
      </SectionCard>
    </View>
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
      <View style={{width:54,height:54,borderRadius:10,backgroundColor:"#F1F7F4",alignItems:"center",justifyContent:"center"}}>
        <Ionicons name="business-outline" size={27} color="#076344"/>
      </View>
      <View style={styles.reviewHeaderCopy}>
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
          {request.verificationStatus === "verified" && !!request.supportDecision &&
            request.supportDecision !== "pending" ? "Approved" : meta.label}
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
            ? "#047857"
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

function CaseReviewTab({request,relatedRequestCount,sameBeneficiaryCount,residentIdentityVerified}:{
  request:AssistanceRequest; relatedRequestCount:number; sameBeneficiaryCount:number;
  residentIdentityVerified:boolean;
}){
  return (
    <View style={{padding:14,gap:14}}>
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:14,alignItems:"stretch"}}>
        <View style={{flex:1.2,flexBasis:300,minWidth:0}}>
          <SectionCard title="Request Information" subtitle="Details submitted by the Resident."
            icon="information-circle-outline">
            <View style={{gap:14}}>
              <InfoItem label="Category" value={request.categoryLabel || String(request.category || "Assistance").replaceAll("_"," ")} />
              <InfoItem label="Current Situation" value={request.currentSituation || "Not provided"} />
              <InfoItem label="Requested Amount" value={money(request.estimatedAmount)} />
              <Divider/>
              <LabelText>Description</LabelText>
              <BodyText>{request.description || "No description provided."}</BodyText>
            </View>
          </SectionCard>
        </View>
        <View style={{flex:1,flexBasis:290,minWidth:0}}>
          <SectionCard title="Resident Information" subtitle="Private LGU review details."
            icon="person-outline">
            <View style={{gap:14}}>
              <InfoItem label="Name" value={request.requesterName || "Resident"} />
              <InfoItem label="Contact" value={request.contactNumber || "Not recorded"} />
              <InfoItem label="Barangay" value={request.requesterBarangay || "Not recorded"} />
              <InfoItem label="Address" value={request.requesterAddress || "Not recorded"} />
              <View style={{flexDirection:"row",alignItems:"center",gap:7,
                paddingVertical:10,paddingHorizontal:12,borderRadius:9,
                backgroundColor:"#ECFDF5",alignSelf:"flex-start"}}>
                <Ionicons name="shield-checkmark-outline" color="#047857" size={17}/>
                <Text style={{fontSize:11,color:"#047857",fontWeight:"800"}}>
                  {residentIdentityVerified ? "Verified Resident" : "Verify identity in Resident Info tab"}
                </Text>
              </View>
            </View>
          </SectionCard>
        </View>
      </View>
      {(relatedRequestCount > 0 || sameBeneficiaryCount > 0) && (
        <View style={{padding:14,backgroundColor:"#FFF9EC",borderRadius:11,borderWidth:1,
          borderColor:"#F3E3B0",flexDirection:"row",gap:9,alignItems:"center"}}>
          <Ionicons name="information-circle-outline" color="#B45309" size={18}/>
          <Text style={{flex:1,fontSize:12,color:"#735116"}}>
            Other related requests exist. Check request history in Resident Info before approving.
          </Text>
        </View>
      )}
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

function DecisionTab({
  request, reviewDraft, reviewRecord, reviewLoading, onReviewChange, residentIdentityVerified,
  adminNote, setAdminNote, rejectionReason, setRejectionReason,
  supportDecision, setSupportDecision, remainingAmount, setRemainingAmount,
  locationType, setLocationType, locationName, setLocationName,
  locationAddress, setLocationAddress, locationNotes, setLocationNotes,
  savingAction, onSaveVerificationDraft, onRequestMoreInfo, onVerify, onReject,
  onSaveResourceAssessment, onMarkAssistanceProvided, onSaveLocation,
  onContinueDonation, donationSubmitting,
}: {
  request: AssistanceRequest;
  reviewDraft: PrivateReviewDraft | null;
  reviewRecord: Record<string, any> | null;
  reviewLoading: boolean;
  residentIdentityVerified: boolean;
  onReviewChange: <K extends keyof PrivateReviewDraft>(key: K, value: PrivateReviewDraft[K]) => void;
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
  onContinueDonation: () => void;
  donationSubmitting: boolean;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approve" | "more" | "reject" | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [showDetailedVerification, setShowDetailedVerification] = useState(false);
  useEffect(() => {
    setDecision(null);
    setShowMissing(false);
    setShowDetailedVerification(false);
  }, [request.id]);

  const verified = request.verificationStatus === "verified";
  const rejected = request.verificationStatus === "rejected";
  const busy = !!savingAction;
  const locked = busy || rejected;
  const facilityRequired = needsFacilityVerification(request.category) ||
    !!reviewDraft?.facilityVerificationRequired;
  const costRequired = Number(request.estimatedAmount || 0) > 0 ||
    !!reviewDraft?.costVerificationRequired;
  const monetaryCap = Math.max(0, Number(reviewRecord?.verifiedUncoveredAmount || 0));
  const donationCampaignReady = verified &&
    request.supportDecision === "donation_support" &&
    Number(request.remainingAmount || 0) > 0 &&
    String(request.assignedLocationName || "").trim().length >= 3 &&
    String(request.assignedLocationAddress || "").trim().length >= 5;

  const choice = (
    label: string,
    selected: boolean,
    onPress: () => void,
    danger = false,
  ) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }}
      disabled={locked} onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 7,
        borderWidth: 1, borderColor: selected ? (danger ? "#FCA5A5" : "#86C9AE") : "#CBD5E1",
        backgroundColor: selected ? (danger ? "#FEF2F2" : "#ECFDF5") : "#FFFFFF",
        paddingVertical: 10, paddingHorizontal: 13, borderRadius: 10, minHeight: 42,
      }}>
      <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={16}
        color={selected ? (danger ? "#B91C1C" : "#047857") : "#64748B"} />
      <Text style={{ color: selected ? (danger ? "#991B1B" : "#065F46") : "#334155",
        fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );

  const confirmRow = (
    title: string, hint: string, yes: boolean, no: boolean,
    onYes: () => void, onNo: () => void,
  ) => (
    <View style={{gap: 9, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EEF2F6"}}>
      <Text style={{color:"#0F172A",fontSize:13,fontWeight:"800"}}>{title}</Text>
      <Text style={styles.bodyText}>{hint}</Text>
      <View style={{flexDirection:"row", flexWrap:"wrap",gap:9}}>
        {choice("Confirmed", yes, onYes)}
        {choice("Needs information", no, onNo, true)}
      </View>
    </View>
  );

  if (reviewLoading || !reviewDraft) {
    return <View style={{padding:28, alignItems:"center",gap:12}}>
      <ActivityIndicator color="#047857" />
      <Text style={styles.bodyText}>Loading Assistance Request...</Text>
    </View>;
  }

  const docsMatched = reviewDraft.documentConsistencyStatus === "consistent" &&
    reviewDraft.beneficiaryCheckStatus === "confirmed";
  const docsNotMatched = ["needs_more_information","inconsistent"].includes(
    reviewDraft.documentConsistencyStatus);
  const previousRiskFlags = Array.isArray(reviewRecord?.riskFlags)
    ? reviewRecord.riskFlags.filter((value: unknown) => String(value || "").trim().length > 0)
    : [];
  const riskResolutionNoteMissing = previousRiskFlags.length > 0 &&
    !reviewDraft.riskFlags.trim() && reviewDraft.internalNotes.trim().length < 10;
  const grossCost = Number(reviewDraft.verifiedGrossCost);
  const recordedAid = Number(reviewDraft.confirmedExistingAssistanceAmount);
  const billingValid = !costRequired || (
    Number.isFinite(grossCost) && grossCost > 0 &&
    Number.isFinite(recordedAid) && recordedAid >= 0 && recordedAid <= grossCost
  );
  const verifyReady = reviewReadyForVerification(reviewDraft) &&
    !riskResolutionNoteMissing && billingValid;
  const riskPresent = !!reviewDraft.riskFlags.trim() || previousRiskFlags.length > 0 ||
    !!reviewDraft.videoVerificationRequired || !!reviewDraft.siteVisitRequired;

  if (rejected) return (
    <SectionCard title="Request Rejected" subtitle="This decision was recorded in the case history."
      icon="close-circle-outline">
      <Text style={styles.bodyText}>{request.rejectionReason || "No reason recorded."}</Text>
    </SectionCard>
  );

  if (verified) {
    const completed = ["assistance_provided", "closed"].includes(
      String(request.status || "").toLowerCase(),
    );
    const linkedCampaign = !!request.donationCampaignId;
    const donationChosen = supportDecision === "donation_support";
    const savedPlan = !!supportDecision && supportDecision === request.supportDecision;
    const savedAmount = Number(request.remainingAmount || 0);
    const enteredAmount = Number(remainingAmount);
    const amountValid = !!remainingAmount.trim() &&
      /^\d+(?:\.\d{1,2})?$/.test(remainingAmount.trim()) &&
      Number.isFinite(enteredAmount) && enteredAmount > 0 &&
      enteredAmount <= monetaryCap && monetaryCap > 0;
    const officeValid = locationName.trim().length >= 3 &&
      locationAddress.trim().length >= 5;
    const supportCard = (
      value: "donation_support" | "internal_support" | "not_required",
      title: string, description: string, iconName: "heart-outline" | "business-outline" | "checkmark-done-outline",
    ) => {
      const active = supportDecision === value;
      const disabled = busy || donationSubmitting ||
        (value === "donation_support" && monetaryCap <= 0);
      return (
        <TouchableOpacity
          key={value}
          accessibilityRole="radio"
          accessibilityState={{selected: active, disabled}}
          disabled={disabled}
          onPress={() => {
            setSupportDecision(value);
            if (value === "donation_support" && !remainingAmount.trim() && monetaryCap > 0) {
              setRemainingAmount(String(monetaryCap));
            }
          }}
          style={{
            flexDirection:"row", alignItems:"center", gap:13,
            paddingHorizontal:16, paddingVertical:16,
            borderWidth: active ? 2 : 1,
            borderColor: active ? "#059669" : "#DDE6E3",
            borderRadius:14,
            backgroundColor: active ? "#F0FDF4" : disabled ? "#F8FAFC" : "#FFFFFF",
            opacity: disabled ? 0.65 : 1,
          }}>
          <View style={{
            width:40,height:40,borderRadius:11,alignItems:"center",justifyContent:"center",
            backgroundColor: active ? "#D1FAE5" : "#F1F5F9",
          }}>
            <Ionicons name={iconName} size={21} color={active ? "#047857" : "#475569"} />
          </View>
          <View style={{flex:1,gap:4}}>
            <Text style={{fontSize:14,fontWeight:"800",color:"#102A26"}}>{title}</Text>
            <Text style={{fontSize:11.5,lineHeight:17,color:"#5B706B"}}>{description}</Text>
          </View>
          <Ionicons name={active?"radio-button-on":"radio-button-off"}
            size={21} color={active ? "#047857" : "#94A3B8"}/>
        </TouchableOpacity>
      );
    };
    if (completed) return (
      <View style={{gap:15,paddingBottom:24}}>
        <SectionCard title="Assistance Completed"
          subtitle="This verified assistance case has been marked completed."
          icon="checkmark-done-outline">
          <InfoGrid>
            <InfoItem label="Resident" value={request.requesterName || "Resident"} />
            <InfoItem label="Support Method" value={
              request.supportDecision === "internal_support"
                ? "LGU / Partner Support"
                : "No Further Support Required"
            } />
          </InfoGrid>
          <Text style={styles.bodyText}>
            The completion record has been saved. No donation campaign will be created automatically.
          </Text>
        </SectionCard>
      </View>
    );
    if (linkedCampaign) return (
      <View style={{gap:15,paddingBottom:24}}>
        <SectionCard title="Assistance Approved"
          subtitle="This request is already linked to a Donation Campaign."
          icon="checkmark-circle-outline">
          <InfoGrid>
            <InfoItem label="Resident" value={request.requesterName || "Resident"} />
            <InfoItem label="Verified Uncovered Need" value={money(monetaryCap)} />
          </InfoGrid>
        </SectionCard>
        <SectionCard title="Donation Campaign"
          subtitle="Open the existing campaign to view its status and donation records."
          icon="heart-outline">
          <ActionButton label="Open Linked Donation Campaign"
            variant="success" icon="heart-outline" loading={false}
            onPress={() => router.push({
              pathname: "/donation-list",
              params: {assistanceRequestId: request.id},
            } as any)} />
        </SectionCard>
      </View>
    );
    return (
      <View style={{padding:22,gap:23}}>
        <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",
          flexWrap:"wrap",gap:14,paddingBottom:13,borderBottomWidth:1,borderColor:"#E6EEEA"}}>
          <View style={{gap:5}}>
            <Text style={{fontSize:21,color:"#103528",fontWeight:"800"}}>Choose Assistance</Text>
            <Text style={{fontSize:12,color:"#63796F",lineHeight:19}}>
              This request is approved. Choose how support will be provided.
            </Text>
          </View>
          <View style={{backgroundColor:"#DDF7E6",paddingVertical:9,paddingHorizontal:16,
            borderRadius:99,flexDirection:"row",alignItems:"center",gap:7}}>
            <Ionicons name="checkmark-circle" size={17} color="#087544"/>
            <Text style={{fontSize:12,fontWeight:"800",color:"#087544"}}>Approved</Text>
          </View>
        </View>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:18}}>
          <View style={{flex:1,minWidth:270}}>
            {supportCard("donation_support","Create Donation Campaign",
              "Gather community support for the approved amount.",
              "heart-outline")}
          </View>
          <View style={{flex:1,minWidth:270}}>
            {supportCard("internal_support","Record LGU Assistance",
              "Record assistance given by the LGU or an authorized partner.",
              "business-outline")}
          </View>
        </View>
        {supportDecision==="not_required" && (
          <View style={{padding:13,backgroundColor:"#F1F5F9",borderRadius:10}}>
            <Text style={{fontSize:12,color:"#475569"}}>
              This request is currently marked No Further Support.
              Select LGU Assistance to record direct support, or continue with the saved decision.
            </Text>
          </View>
        )}
        {monetaryCap <= 0 && (
          <Text style={{fontSize:12,color:"#92400E"}}>
            Donation Campaign needs a confirmed amount greater than zero. Review the supported costs first.
          </Text>
        )}
        {donationChosen && (
          <SectionCard title="Publish Donation Campaign"
            subtitle="Prepare a public donation campaign using the approved assistance request."
            icon="megaphone-outline">
            <View style={{gap:22}}>
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:24,alignItems:"flex-start"}}>
                <View style={{flex:1.65,minWidth:270,gap:12}}>
                  <View style={{gap:6}}>
                    <Text style={styles.fieldLabel}>Campaign Title</Text>
                    <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
                      <Text style={{color:"#047857",fontSize:11,fontWeight:"700"}}>From Resident's Request</Text>
                      <Ionicons name="checkmark-circle-outline" size={14} color="#047857"/>
                    </View>
                    <View style={{padding:13,borderWidth:1,borderColor:"#DDE7E1",borderRadius:10,
                      backgroundColor:"#F8FAF9"}}>
                      <Text style={{fontSize:13,fontWeight:"700",color:"#1D332A"}}>
                        {request.title || "Assistance Request"}
                      </Text>
                    </View>
                  </View>
                  <View style={{gap:6}}>
                    <Text style={styles.fieldLabel}>Campaign Story</Text>
                    <Text style={{color:"#047857",fontSize:11,fontWeight:"700"}}>From Resident's Description</Text>
                    <View style={{padding:14,borderWidth:1,borderColor:"#DDE7E1",borderRadius:10,
                      backgroundColor:"#F8FAF9",minHeight:77}}>
                      <Text style={{fontSize:12,color:"#344B42",lineHeight:19}}>
                        {request.description || "No description provided by the Resident."}
                      </Text>
                    </View>
                    <Text style={{fontSize:11,color:"#64748B"}}>
                      The Campaign editor checks and lets the Admin remove private details before publishing.
                    </Text>
                  </View>
                  <View style={{flexDirection:"row",flexWrap:"wrap",gap:16}}>
                    <View style={{flex:1,minWidth:160,gap:6}}>
                      <Text style={styles.fieldLabel}>Donation Target (PHP)</Text>
                      <TextInput value={remainingAmount}
                        editable={!busy && !donationSubmitting}
                        onChangeText={v=>setRemainingAmount(v.replace(/[^0-9.]/g,""))}
                        keyboardType="decimal-pad" placeholder="Enter amount"
                        placeholderTextColor="#94A3B8" style={styles.input}/>
                      {!amountValid && (
                        <Text style={{fontSize:11,color:"#B45309"}}>Enter an amount up to {money(monetaryCap)}.</Text>
                      )}
                    </View>
                    <View style={{flex:1,minWidth:160,gap:6}}>
                      <Text style={styles.fieldLabel}>Campaign Cover</Text>
                      <View style={{padding:13,backgroundColor:"#F8FAF9",borderRadius:10,
                        borderWidth:1,borderColor:"#DDE7E1",flexDirection:"row",gap:8,alignItems:"center"}}>
                        <Ionicons name="image-outline" size={17} color="#047857"/>
                        <Text style={{fontSize:12,color:"#40574D",flex:1}}>
                          {request.publicCampaignPhotoUrl ? "Resident photo provided" : "Upload in Campaign Setup"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.fieldLabel}>Assistance Office (Public Only)</Text>
                  <View style={{flexDirection:"row",flexWrap:"wrap",gap:14}}>
                    <TextInput value={locationName} onChangeText={setLocationName}
                      editable={!busy && !donationSubmitting}
                      placeholder="e.g. City Social Welfare Office"
                      placeholderTextColor="#94A3B8"
                      style={[styles.input,{flex:1,minWidth:180}]}/>
                    <TextInput value={locationAddress} onChangeText={setLocationAddress}
                      editable={!busy && !donationSubmitting}
                      placeholder="Public office address"
                      placeholderTextColor="#94A3B8"
                      style={[styles.input,{flex:1,minWidth:180}]}/>
                  </View>
                  {!officeValid && (
                    <Text style={{fontSize:11,color:"#B45309"}}>
                      Enter a public LGU office name and address. Never use a Resident's private home address.
                    </Text>
                  )}
                </View>
                <View style={{flex:1,minWidth:235,gap:14}}>
                  <View style={{backgroundColor:"#F3F8F5",borderRadius:12,
                    borderWidth:1,borderColor:"#E0ECE5",padding:17,gap:14}}>
                    <Text style={{fontSize:14,fontWeight:"800",color:"#173B2D"}}>Campaign Summary</Text>
                    <InfoItem label="Request ID" value={request.requestId || request.id}/>
                    <InfoItem label="Resident" value={request.requesterName || "Resident"}/>
                    <InfoItem label="Category" value={request.categoryLabel || "Assistance"}/>
                    <InfoItem label="Amount for Donation" value={money(Number(remainingAmount || 0))}/>
                    <Text style={{fontSize:11,color:"#6B7D74",lineHeight:17}}>
                      Resident information is shown privately to the Admin only.
                    </Text>
                  </View>
                  <ActionButton label="Continue to Publish Campaign"
                    icon="megaphone-outline" variant="success"
                    loading={donationSubmitting || busy} disabled={busy || donationSubmitting}
                    onPress={onContinueDonation}/>
                  <Text style={{fontSize:11,color:"#64748B",lineHeight:17,textAlign:"center"}}>
                    Saves the approved amount and public office, then opens the final publishing screen.
                  </Text>
                </View>
              </View>
            </View>
          </SectionCard>
        )}
        {["internal_support","not_required"].includes(supportDecision) && (
          <SectionCard title="Record LGU Assistance"
            subtitle="Save the assistance plan and confirm when support has been provided."
            icon="business-outline">
            <View style={{gap:15}}>
              {!savedPlan ? (
                <ActionButton label="Save Assistance Plan" icon="save-outline" variant="primary"
                  loading={savingAction==="resource_assessment"} disabled={busy}
                  onPress={onSaveResourceAssessment}/>
              ) : (
                <View style={{gap:14}}>
                  <View style={{backgroundColor:"#F0FDF4",padding:14,borderRadius:12,
                    flexDirection:"row",gap:9,alignItems:"center"}}>
                    <Ionicons name="checkmark-circle" color="#047857" size={19}/>
                    <Text style={{fontSize:12,color:"#047857",fontWeight:"800"}}>Assistance plan saved</Text>
                  </View>
                  <ActionButton label={supportDecision==="not_required" ?
                    "Close Assistance Case" : "Mark Assistance Provided"}
                    icon="checkmark-done-outline" variant="success"
                    loading={savingAction==="assistance_provided"} disabled={busy}
                    onPress={onMarkAssistanceProvided}/>
                </View>
              )}
            </View>
          </SectionCard>
        )}
      </View>
    );

  }

  const approvedState = decision === "approve";
  const requestMoreState = decision === "more";
  const rejectionState = decision === "reject";
  const chooseDecision = (value: "approve" | "more" | "reject") => {
    setDecision(value);
    setShowMissing(false);
  };
  const decisionButton = (
    value: "approve" | "more" | "reject", title: string,
    helper: string, icon: "checkmark-circle-outline" | "chatbubble-outline" | "close-circle-outline",
  ) => (
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{selected:decision===value}}
      disabled={busy} onPress={() => chooseDecision(value)}
      style={{
        flexDirection:"row",alignItems:"center",gap:12,
        paddingVertical:12,paddingHorizontal:13,
        borderWidth:1,
        borderColor: decision===value ? "#059669" : "#E1EAE5",
        borderRadius:12,backgroundColor:decision===value ? "#ECFDF5":"#FFFFFF",
      }}>
      <Ionicons name={decision===value?"radio-button-on":"radio-button-off"}
        size={20} color={decision===value?"#047857":"#94A3B8"}/>
      <View style={{flex:1,gap:3}}>
        <Text style={{fontSize:13,fontWeight:"800",color:"#112A21"}}>{title}</Text>
        <Text style={{fontSize:11,color:"#667B71",lineHeight:16}}>{helper}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{padding:16,gap:18}}>
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:15,alignItems:"flex-start"}}>
        <View style={{flex:1.15,flexBasis:280,minWidth:0}}>
          <SectionCard title="Review Summary"
            subtitle="Check and confirm the key items before making a decision."
            icon="clipboard-outline">
            <View style={{gap:5}}>
              {([
                ["Resident identity verified", residentIdentityVerified && reviewDraft.beneficiaryCheckStatus==="confirmed"],
                ["Supporting documents complete", reviewDraft.documentConsistencyStatus==="consistent" && (request.documents?.length||0)>0],
                ["Request details valid", docsMatched && reviewDraft.duplicateCheckStatus==="clear"],
                ["Resident belongs to service area", reviewDraft.residencyVerificationStatus==="verified"],
              ] as Array<[string, boolean]>).map(([label, done]) => (
                <TouchableOpacity accessibilityRole="button" key={label} onPress={()=>setShowDetailedVerification(true)}
                  style={{flexDirection:"row",alignItems:"center",gap:11,paddingVertical:13,
                    borderBottomWidth:1,borderBottomColor:"#EAEFEB"}}>
                  <Ionicons name={done?"checkbox":"square-outline"} size={22} color={done?"#07854A":"#94A3B8"}/>
                  <Text style={{fontSize:12,fontWeight:"700",color:"#182D25",flex:1}}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity accessibilityRole="button" onPress={()=>setShowDetailedVerification(current=>!current)}
                style={{flexDirection:"row",alignItems:"center",gap:7,paddingVertical:10}}>
                <Text style={{fontSize:12,fontWeight:"800",color:"#047857"}}>
                  {showDetailedVerification?"Hide detailed verification":"Complete or edit verification checks"}
                </Text>
                <Ionicons name={showDetailedVerification?"chevron-up":"chevron-down"} size={16} color="#047857"/>
              </TouchableOpacity>
              {showDetailedVerification && <>
              {confirmRow("Documents and beneficiary details match",
                "Check the medical documents and beneficiary information.",
                docsMatched,docsNotMatched,
                ()=>{onReviewChange("documentConsistencyStatus","consistent");
                  onReviewChange("beneficiaryCheckStatus","confirmed");},
                ()=>{onReviewChange("documentConsistencyStatus","needs_more_information");
                  onReviewChange("beneficiaryCheckStatus","needs_more_information");})}
              {confirmRow("No duplicate assistance request",
                "Check the Resident's existing request history.",
                reviewDraft.duplicateCheckStatus==="clear",
                ["potential_duplicate","confirmed_duplicate"].includes(reviewDraft.duplicateCheckStatus),
                ()=>onReviewChange("duplicateCheckStatus","clear"),
                ()=>onReviewChange("duplicateCheckStatus","potential_duplicate"))}
              {confirmRow("Resident belongs to San Jose del Monte",
                "Use verified documents, barangay contact, or in-person confirmation.",
                reviewDraft.residencyVerificationStatus==="verified",
                reviewDraft.residencyVerificationStatus==="unable_to_verify",
                ()=>onReviewChange("residencyVerificationStatus","verified"),
                ()=>onReviewChange("residencyVerificationStatus","unable_to_verify"))}
              <Text style={styles.fieldLabel}>Residency confirmed through</Text>
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:9}}>
                {choice("Document",reviewDraft.residencyVerificationMethod==="profile_address",
                  ()=>onReviewChange("residencyVerificationMethod","profile_address"))}
                {choice("Barangay Contact",reviewDraft.residencyVerificationMethod==="barangay_confirmation",
                  ()=>onReviewChange("residencyVerificationMethod","barangay_confirmation"))}
                {choice("In Person",reviewDraft.residencyVerificationMethod==="site_visit",
                  ()=>onReviewChange("residencyVerificationMethod","site_visit"))}
              </View>
              {!reviewDraft.privateAddressSnapshot.trim() && (
                <TextInput value={reviewDraft.privateAddressSnapshot}
                  onChangeText={v=>onReviewChange("privateAddressSnapshot",v)}
                  placeholder="Barangay / city from supporting proof"
                  placeholderTextColor="#94A3B8" style={styles.input}/>
              )}
              </>}
            </View>
          </SectionCard>
        </View>
        <View style={{flex:1,flexBasis:280,minWidth:0}}>
          <SectionCard title="Decision" subtitle="Choose an action for this assistance request."
            icon="checkmark-circle-outline">
            <View style={{gap:10}}>
              {decisionButton("approve","Approve Request",
                "The verified request may proceed to assistance.","checkmark-circle-outline")}
              {decisionButton("more","Request More Information",
                "Ask the Resident to clarify or submit additional evidence.","chatbubble-outline")}
              {decisionButton("reject","Reject Request",
                "Decline the request and provide a reason.","close-circle-outline")}
              {(requestMoreState || rejectionState) && (
                <View style={{gap:8,marginTop:5}}>
                  <Text style={styles.fieldLabel}>{requestMoreState ?
                    "Information requested from Resident" : "Reason for rejection"}</Text>
                  <TextInput style={styles.textArea} multiline maxLength={1000}
                    value={requestMoreState?adminNote:rejectionReason}
                    onChangeText={requestMoreState?setAdminNote:setRejectionReason}
                    placeholder="Enter a clear reason or instructions"
                    placeholderTextColor="#94A3B8"/>
                </View>
              )}
            </View>
          </SectionCard>
        </View>
      </View>

      {showDetailedVerification && (facilityRequired || costRequired) && (
        <SectionCard title={facilityRequired ? "Medical Bill Check" : "Cost Verification"}
          subtitle={facilityRequired
            ? "Confirm the provider and costs using supporting evidence or direct contact."
            : "Confirm the requested cost using supporting bills or reliable supporting evidence."}
          icon="medical-outline">
          <View style={{gap:13}}>
            {facilityRequired && <>
              <Text style={styles.fieldLabel}>Hospital / provider name</Text>
              <TextInput value={reviewDraft.facilityName}
                onChangeText={v=>onReviewChange("facilityName",v)}
                placeholder="Provider listed on the supporting bill"
                placeholderTextColor="#94A3B8" style={styles.input}/>
              <Text style={styles.fieldLabel}>Provider checked through</Text>
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>
                {choice("Documents",reviewDraft.facilityVerificationStatus==="confirmed" &&
                  reviewDraft.facilityVerificationMethod==="official_record",
                  ()=>{onReviewChange("facilityVerificationMethod","official_record");
                     onReviewChange("facilityVerificationStatus","confirmed");})}
                {choice("Contact",reviewDraft.facilityVerificationStatus==="confirmed" &&
                  reviewDraft.facilityVerificationMethod==="official_phone",
                  ()=>{onReviewChange("facilityVerificationMethod","official_phone");
                     onReviewChange("facilityVerificationStatus","confirmed");})}
                {choice("In Person",reviewDraft.facilityVerificationStatus==="confirmed" &&
                  reviewDraft.facilityVerificationMethod==="in_person",
                  ()=>{onReviewChange("facilityVerificationMethod","in_person");
                     onReviewChange("facilityVerificationStatus","confirmed");})}
              </View>
            </>}
            {costRequired && (
              <View style={{flexDirection:"row",flexWrap:"wrap",gap:18}}>
                <View style={{flex:1,minWidth:220,gap:9}}>
                  <Text style={styles.fieldLabel}>Amount shown in supporting bill (PHP)</Text>
                  <TextInput value={reviewDraft.verifiedGrossCost}
                    onChangeText={v=>onReviewChange("verifiedGrossCost",v.replace(/[^0-9.]/g,""))}
                    keyboardType="decimal-pad" placeholder="e.g. 5000"
                    placeholderTextColor="#94A3B8" style={styles.input}/>
                </View>
                <View style={{flex:1,minWidth:220,gap:9}}>
                  <Text style={styles.fieldLabel}>Assistance already received (PHP)</Text>
                  <TextInput value={reviewDraft.confirmedExistingAssistanceAmount}
                    onChangeText={v=>onReviewChange("confirmedExistingAssistanceAmount",v.replace(/[^0-9.]/g,""))}
                    keyboardType="decimal-pad" placeholder="0 if none"
                    placeholderTextColor="#94A3B8" style={styles.input}/>
                </View>
              </View>
            )}
            {costRequired && !billingValid && (
              <Text style={{fontSize:11,color:"#B45309"}}>
                Enter a confirmed cost greater than zero. Assistance already received cannot exceed the confirmed cost.
              </Text>
            )}
            {costRequired && confirmRow("The amount matches the supporting evidence",
              "Only confirmed costs can be approved for possible donation support.",
              reviewDraft.costVerificationStatus==="confirmed",
              reviewDraft.costVerificationStatus==="inconsistent",
              ()=>onReviewChange("costVerificationStatus","confirmed"),
              ()=>onReviewChange("costVerificationStatus","inconsistent"))}
          </View>
        </SectionCard>
      )}
      {showDetailedVerification && riskPresent && (
        <SectionCard title="Additional Verification"
          subtitle="Only complete checks that the LGU has actually performed. Pending checks block approval."
          icon="shield-checkmark-outline">
          <View style={{gap:18}}>
            {reviewDraft.videoVerificationRequired && (
              <View style={{gap:9}}>
                <Text style={styles.fieldLabel}>Required Video Verification</Text>
                <View style={{flexDirection:"row",gap:10,flexWrap:"wrap"}}>
                  {choice("Completed",reviewDraft.videoVerificationStatus==="completed",
                    ()=>onReviewChange("videoVerificationStatus","completed"))}
                  {choice("Pending",reviewDraft.videoVerificationStatus!=="completed",
                    ()=>onReviewChange("videoVerificationStatus","pending"))}
                </View>
                <TextInput style={styles.input} editable={!busy}
                  value={reviewDraft.videoVerificationNotes}
                  onChangeText={value=>onReviewChange("videoVerificationNotes",value)}
                  placeholder="Record who performed the verification and supporting findings"
                  placeholderTextColor="#94A3B8"/>
              </View>
            )}
            {reviewDraft.siteVisitRequired && (
              <View style={{gap:9}}>
                <Text style={styles.fieldLabel}>Required Site Visit</Text>
                <View style={{flexDirection:"row",gap:10,flexWrap:"wrap"}}>
                  {choice("Completed",reviewDraft.siteVisitStatus==="completed",
                    ()=>onReviewChange("siteVisitStatus","completed"))}
                  {choice("Pending",reviewDraft.siteVisitStatus!=="completed",
                    ()=>onReviewChange("siteVisitStatus","pending"))}
                </View>
                <TextInput style={styles.input} editable={!busy}
                  value={reviewDraft.siteVisitNotes}
                  onChangeText={value=>onReviewChange("siteVisitNotes",value)}
                  placeholder="Record the site visit findings"
                  placeholderTextColor="#94A3B8"/>
              </View>
            )}
            {(!!reviewDraft.riskFlags.trim() || previousRiskFlags.length>0) && (
              <View style={{gap:9}}>
                <Text style={styles.fieldLabel}>Unresolved Risk Flags</Text>
                <Text style={{fontSize:11,color:"#64748B",lineHeight:18}}>
                  Review each flagged issue. Remove it only after it has been resolved and document why.
                  Unresolved flags block approval.
                </Text>
                <TextInput style={[styles.textArea,{minHeight:74}]} multiline editable={!busy}
                  value={reviewDraft.riskFlags}
                  onChangeText={value=>onReviewChange("riskFlags",value)}
                  placeholder="One unresolved issue per line; leave blank only after resolution"
                  placeholderTextColor="#94A3B8"/>
                <Text style={styles.fieldLabel}>Resolution Notes</Text>
                <TextInput style={[styles.textArea,{minHeight:74}]} multiline editable={!busy}
                  value={reviewDraft.internalNotes}
                  onChangeText={value=>onReviewChange("internalNotes",value)}
                  placeholder="Explain verification findings and how each risk was resolved"
                  placeholderTextColor="#94A3B8"/>
                {riskResolutionNoteMissing && (
                  <Text style={{fontSize:11,color:"#B45309"}}>
                    Explain how the flagged concerns were resolved (at least 10 characters) before approval.
                  </Text>
                )}
              </View>
            )}
            <View style={{alignSelf:"flex-start",width:220}}>
              <ActionButton label="Save Review Progress" icon="save-outline" variant="primary"
                loading={busy} disabled={busy} onPress={onSaveVerificationDraft}/>
            </View>
          </View>
        </SectionCard>
      )}
      {showMissing && !verifyReady && approvedState && (
        <View style={{padding:15,backgroundColor:"#FFF7ED",borderRadius:12,gap:7}}>
          <Text style={{color:"#92400E",fontSize:13,fontWeight:"800"}}>Some checks are incomplete</Text>
          <Text style={{color:"#92400E",fontSize:12}}>
            Confirm the required evidence, provider, residency, and billing details before approving.
          </Text>
        </View>
      )}
      <View style={{alignItems:"center",gap:9,paddingVertical:8}}>
        <View style={{width:"100%",maxWidth:385}}>
          <ActionButton label="Confirm Decision" icon="checkmark-outline" variant="success"
            loading={busy} disabled={busy}
            onPress={()=>{
              if (!decision){showAssistanceActionError("Choose a Decision",
                "Select Approve, Request More Information, or Reject.");return;}
              if (approvedState){
                setShowMissing(true);
                if (!verifyReady){showAssistanceActionError("Review Incomplete",
                  "Confirm the required checks and supporting evidence before approving.");return;}
                onVerify();return;
              }
              if (requestMoreState){onRequestMoreInfo();return;}
              onReject();
            }}/>
        </View>
        <Text style={{fontSize:11,color:"#74867D",textAlign:"center"}}>
          Your decision will be saved to the protected LGU review record.
        </Text>
      </View>
    </View>
  );
}


function EmbeddedGoogleMap({
  title,
  query,
  badge,
  emptyText,
  privacyText,
}: {
  title: string;
  query: string;
  badge: string;
  emptyText: string;
  privacyText: string;
}) {
  const cleanQuery = String(query || "").trim();

  const openExternalMap = async () => {
    if (!cleanQuery) return;

    try {
      await Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`,
      );
    } catch {
      Alert.alert(
        "Map Unavailable",
        "Google Maps could not be opened in a new browser tab.",
      );
    }
  };

  return (
    <View style={styles.embeddedMapCard}>
      <View style={styles.embeddedMapHeader}>
        <View style={styles.embeddedMapTitleRow}>
          <View style={styles.embeddedMapIcon}>
            <Ionicons
              name="map-outline"
              size={17}
              color="#2563EB"
            />
          </View>

          <View style={styles.embeddedMapTitleCopy}>
            <Text style={styles.embeddedMapTitle}>
              {title}
            </Text>
            <Text style={styles.embeddedMapQuery} numberOfLines={2}>
              {cleanQuery || "Location preview not available yet"}
            </Text>
          </View>
        </View>

        <View style={styles.embeddedMapBadge}>
          <Text style={styles.embeddedMapBadgeText}>
            {badge}
          </Text>
        </View>
      </View>

      {cleanQuery ? (
        Platform.OS === "web" ? (
          <View style={styles.embeddedMapFrame}>
            {React.createElement(
              "iframe",
              {
                title,
                src: `https://www.google.com/maps?q=${encodeURIComponent(cleanQuery)}&output=embed`,
                loading: "lazy",
                allowFullScreen: true,
                referrerPolicy: "no-referrer-when-downgrade",
                style: {
                  width: "100%",
                  height: "100%",
                  border: 0,
                  display: "block",
                },
              } as any,
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.embeddedMapNativeFallback}
            onPress={() => void openExternalMap()}
            activeOpacity={0.82}
          >
            <Ionicons
              name="map-outline"
              size={24}
              color="#2563EB"
            />
            <Text style={styles.embeddedMapNativeFallbackTitle}>
              Open map preview
            </Text>
            <Text style={styles.embeddedMapNativeFallbackText}>
              Embedded Google Maps is available on the web admin portal. Tap to open this location in Maps.
            </Text>
          </TouchableOpacity>
        )
      ) : (
        <View style={styles.embeddedMapEmpty}>
          <Ionicons
            name="location-outline"
            size={24}
            color="#94A3B8"
          />
          <Text style={styles.embeddedMapEmptyText}>
            {emptyText}
          </Text>
        </View>
      )}

      <View style={styles.embeddedMapFooter}>
        <View style={styles.embeddedMapPrivacy}>
          <Ionicons
            name="shield-checkmark-outline"
            size={15}
            color="#0F766E"
          />
          <Text style={styles.embeddedMapPrivacyText}>
            {privacyText}
          </Text>
        </View>

        {!!cleanQuery && Platform.OS === "web" && (
          <TouchableOpacity
            style={styles.embeddedMapExternalButton}
            onPress={() => void openExternalMap()}
            activeOpacity={0.82}
          >
            <Ionicons
              name="open-outline"
              size={14}
              color="#475569"
            />
            <Text style={styles.embeddedMapExternalButtonText}>
              Open in Google Maps
            </Text>
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
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    options.find(([optionValue]) => optionValue === value)?.[1] || "";

  return (
    <>
      <TouchableOpacity
        style={[
          styles.adminDropdownButton,
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
            color="#047857"
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
}: {
  children: React.ReactNode;
}) {
  return (
    <Text style={styles.fieldLabel}>
      {children}
    </Text>
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
      backgroundColor: "#FFF1F2",
      borderColor: "#FDA4AF",
      textColor: "#B42318",
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
  page: {
    flex: 1,
    backgroundColor: "#F6F8F7",
  },

  pageScroll: {
    flex: 1,
  },

  pageContent: {
    padding: 18,
    paddingBottom: 36,
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
    fontSize: 13,
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
    fontSize: 21,
    fontWeight: "900",
  },

  accessText: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 13,
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
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },

  pageTitle: {
    marginTop: 6,
    color: "#0F172A",
    fontSize: 29,
    fontWeight: "900",
  },

  pageSubtitle: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 13,
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
    fontSize: 12,
    fontWeight: "900",
  },

  noteText: {
    marginTop: 4,
    color: "#4B5563",
    fontSize: 11,
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
    borderRadius: 15,
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
    fontSize: 20,
    fontWeight: "900",
  },

  statLabel: {
    marginTop: 1,
    color: "#64748B",
    fontSize: 11,
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
    fontSize: 12,
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
    fontSize: 13,
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
    fontSize: 11,
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
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },

  panelTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
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
    fontSize: 10,
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
    fontSize: 9.5,
    fontWeight: "900",
  },

  requestTitle: {
    marginTop: 9,
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },

  requestMeta: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 10.5,
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
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },

  reviewHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 13,
    padding: 8,
    borderBottomWidth: 0,
  },

  reviewHeaderCopy: {
    flex: 1,
    minWidth: 250,
  },

  reviewTitle: {
    marginTop: 5,
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
  },

  reviewSubtitle: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 11.5,
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
    fontSize: 10.5,
    fontWeight: "900",
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
    minHeight: 41,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 8,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },

  tabButtonActive: {
    backgroundColor: "#E5F7EC",
    borderBottomColor: "#047857",
  },

  tabButtonText: {
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "800",
  },

  tabButtonTextActive: {
    color: "#047857",
  },

  tabContent: {
    padding: 16,
    gap: 13,
  },

  sectionCard: {
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DFE8E8",
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
    backgroundColor: "#ECF9F1",
  },

  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },

  sectionTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },

  sectionSubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 10.5,
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
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  infoValue: {
    marginTop: 5,
    color: "#0F172A",
    fontSize: 12,
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
    fontSize: 11,
    fontWeight: "900",
  },

  bodyText: {
    color: "#475569",
    fontSize: 12,
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
    fontSize: 9.5,
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
    fontSize: 11,
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
    fontSize: 10,
    fontWeight: "900",
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
    fontSize: 11.5,
    fontWeight: "900",
  },

  documentMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.5,
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
    fontSize: 9.5,
    fontWeight: "900",
  },

  publicCampaignPhotoTitle: {
    marginTop: 10,
    color: "#172033",
    fontSize: 13,
    fontWeight: "900",
  },

  publicCampaignPhotoText: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 11,
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
    fontSize: 10.5,
    fontWeight: "900",
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
    fontSize: 11,
    fontWeight: "900",
  },

  warningText: {
    marginTop: 4,
    color: "#92400E",
    fontSize: 10.5,
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
    fontSize: 10.5,
    lineHeight: 16,
  },

  historyBlock: {
    marginTop: 8,
  },

  historyTitle: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
  },

  historyEmpty: {
    marginTop: 8,
    color: "#64748B",
    fontSize: 10.5,
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
    fontSize: 10.5,
    fontWeight: "800",
  },

  historyMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9,
  },

  historyStatus: {
    fontSize: 9,
    fontWeight: "900",
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
    fontSize: 11.5,
    fontWeight: "900",
  },

  checkText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 10,
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
    fontSize: 10.5,
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
    fontSize: 11.5,
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
    fontSize: 9.5,
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
    fontSize: 10.5,
    fontWeight: "900",
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
    fontSize: 10.5,
    fontWeight: "800",
  },

  optionTextActive: {
    color: "#3730A3",
  },

  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    color: "#0F172A",
    fontSize: 11.5,
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
    fontSize: 10.5,
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
    fontSize: 9.5,
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
    fontSize: 11.5,
    fontWeight: "900",
  },

  rejectedText: {
    marginTop: 4,
    color: "#9F1239",
    fontSize: 10.5,
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
    fontSize: 14,
    fontWeight: "900",
  },

  previewMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 10,
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
    fontSize: 10.5,
    fontWeight: "900",
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
    fontSize: 10.5,
    fontWeight: "900",
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
    minHeight: 35,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#D6DEE8",
    backgroundColor: "#FFFFFF",
  },

  mockStatusTabActive: {
    borderColor: "#006A42",
    backgroundColor: "#006A42",
  },

  mockStatusTabText: {
    color: "#475569",
    fontSize: 10.5,
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
    fontSize: 10.5,
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
    fontSize: 10.5,
    fontWeight: "900",
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
    fontSize: 9.5,
    fontWeight: "800",
  },

  mockQueueTitle: {
    marginTop: 3,
    color: "#111827",
    fontSize: 12.5,
    fontWeight: "900",
  },

  mockQueueMetaLine: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  mockQueueMeta: {
    color: "#64748B",
    fontSize: 10,
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
    fontSize: 9.5,
    fontWeight: "900",
  },

  mockQueueDate: {
    color: "#64748B",
    fontSize: 9.5,
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
    fontSize: 11,
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
    fontSize: 10.5,
    fontWeight: "900",
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
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE8E1",
    borderRadius: 13,
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
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  detailHeaderCard: {
    marginTop: 3,
    borderRadius: 10,
    borderWidth: 0,
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
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1,
  },

  detailPaneTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },

  detailMainScroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F8FAFC",
  },

  detailMainContent: {
    padding: 4,
    paddingBottom: 36,
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
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 1.1,
  },

  evaluationRailTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },

  evaluationRailSubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.5,
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
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  declaredAddressValue: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 10.5,
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
    fontSize: 7.5,
    fontWeight: "900",
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
    fontSize: 9.5,
    fontWeight: "900",
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
    fontSize: 9,
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
    fontSize: 10,
    fontWeight: "900",
  },

  residencyVerifiedText: {
    marginTop: 2,
    color: "#15803D",
    fontSize: 8.8,
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
    fontSize: 9,
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
    fontSize: 11.5,
    fontWeight: "900",
  },

  embeddedMapQuery: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 9.5,
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
    fontSize: 7.5,
    fontWeight: "900",
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
    fontSize: 10,
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
    fontSize: 11,
    fontWeight: "900",
  },

  embeddedMapNativeFallbackText: {
    maxWidth: 320,
    color: "#64748B",
    fontSize: 9.5,
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
    fontSize: 9,
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
    fontSize: 9,
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
    fontSize: 11,
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
    fontSize: 13,
    fontWeight: "900",
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
    fontSize: 11,
    fontWeight: "700",
  },

  adminDropdownOptionTextActive: {
    color: "#4338CA",
    fontWeight: "900",
  },

});