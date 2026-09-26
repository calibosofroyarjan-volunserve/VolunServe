import { Ionicons } from "@expo/vector-icons";
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    serverTimestamp,
} from "firebase/firestore";
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
    useState<ReviewFilter>("pending");
  const [search, setSearch] = useState("");

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
        (filter === "completed"
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
    setSelected(item);
    setReviewTab("case");
    setScreenMode("detail");
  };

  const backToQueue = () => {
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
  ) => {
    if (
      !selected ||
      !user ||
      !isOperationalAdmin ||
      savingAction
    ) {
      return;
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
          "Official public service / receiving location has been saved.",
        clear_location:
          "Official public service / receiving location has been cleared.",
      };

      const message =
        successMessages[actionKey] ||
        "Assistance Request update has been saved.";

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
    } finally {
      setSavingAction("");
    }
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

    if (note.length < 10) {
      Alert.alert(
        "Verification Note Required",
        "Explain exactly what information or evidence the resident must clarify or provide.",
      );
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
    if (!selected || !reviewDraft) return;

    if (!reviewReadyForVerification(reviewDraft)) {
      Alert.alert(
        "Private Verification Incomplete",
        "Complete document consistency, duplicate, beneficiary, residency, required facility/cost checks, and any required video/site visit. Resolve every risk flag before verifying the need.",
      );
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

    if (reason.length < 3) {
      Alert.alert(
        "Rejection Reason Required",
        "Enter a clear evidence-based reason for rejecting the assistance request.",
      );
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

    if (!["internal_support", "donation_support", "not_required"].includes(supportDecision)) {
      Alert.alert("Support Decision Required", "Select how the verified need will be supported.");
      return;
    }

    const amount = Number(remainingAmount || 0);
    const verifiedCap = Number(verificationReview?.verifiedUncoveredAmount || 0);

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

    if (
      supportDecision === "donation_support" &&
      amount <= 0 &&
      selected.preferredAssistanceTypes?.includes("monetary")
    ) {
      Alert.alert(
        "Remaining Need Required",
        "For a monetary shortage, enter the verified remaining unmet amount before opening Donation Support.",
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
        () =>
          updateRequest(
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
          ),
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
          "Set the official service or receiving location only after the request is verified.",
        );
        return;
      }

      if (
        !locationType ||
        locationName.trim().length < 3 ||
        locationAddress.trim().length < 5
      ) {
        Alert.alert(
          "Official Location Required",
          "Select a location type and enter the official public location name and address.",
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


  const renderReviewMain = () => {
    if (!selected) return null;

    return (
      <>
        {reviewTab === "case" && (
          <CaseReviewTab
            request={selected}
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

        {reviewTab === "decision" && (
          <PrivateVerificationOverview
            request={selected}
            reviewDraft={reviewDraft}
            loading={verificationReviewLoading}
            ready={allChecksComplete}
            reviewRecord={verificationReview}
          />
        )}
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
        </View>

        <View style={styles.detailHeaderCard}>
          <RequestReviewHeader request={selected} />
        </View>

        <View style={styles.mockDetailTabs}>
          <ReviewTabButton
            label="Details"
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
            label="Evaluation"
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
            <View style={styles.mockHeaderRow}>
              <View style={styles.mockHeaderCopy}>
                <Text style={styles.eyebrow}>
                  COMMUNITY ASSISTANCE REVIEW
                </Text>

                <Text style={styles.pageTitle}>
                  Assistance Requests
                </Text>

                <Text style={styles.pageSubtitle}>
                  Review verified Resident requests
                  for non-emergency community
                  assistance. Emergency Cases remain
                  in their separate LGU response
                  workflow.
                </Text>
              </View>
            </View>

            <View style={styles.mockTopTabsRow}>
              <MockStatusTab
                label="Pending"
                count={stats.pending}
                active={filter === "pending"}
                onPress={() => setFilter("pending")}
              />
              <MockStatusTab
                label="Under Review"
                count={stats.underReview}
                active={filter === "under_review"}
                onPress={() =>
                  setFilter("under_review")
                }
              />
              <MockStatusTab
                label="Verified"
                count={stats.verified}
                active={filter === "verified"}
                onPress={() => setFilter("verified")}
              />
              <MockStatusTab
                label="Rejected"
                count={stats.rejected}
                active={filter === "rejected"}
                onPress={() => setFilter("rejected")}
              />

              <View style={styles.mockTopTabsSpacer} />

              <TouchableOpacity
                style={[
                  styles.mockHistoryButton,
                  filter === "completed" &&
                    styles.mockHistoryButtonActive,
                ]}
                onPress={() =>
                  setFilter("completed")
                }
              >
                <Ionicons
                  name="archive-outline"
                  size={15}
                  color={
                    filter === "completed"
                      ? "#2563EB"
                      : "#64748B"
                  }
                />
                <Text
                  style={[
                    styles.mockHistoryButtonText,
                    filter === "completed" &&
                      styles.mockHistoryButtonTextActive,
                  ]}
                >
                  Completed
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.mockSearchRow}>
              <View style={styles.searchBox}>
                <Ionicons
                  name="search-outline"
                  size={18}
                  color="#64748B"
                />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search request ID, Resident, beneficiary, barangay, or title"
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInput}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.mockAllButton,
                  filter === "all" &&
                    styles.mockAllButtonActive,
                ]}
                onPress={() => setFilter("all")}
              >
                <Text
                  style={[
                    styles.mockAllButtonText,
                    filter === "all" &&
                      styles.mockAllButtonTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
            </View>

            {!!listenerError && (
              <View style={styles.errorBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color="#B42318"
                />
                <Text style={styles.errorText}>
                  {listenerError}
                </Text>
              </View>
            )}

            <View style={styles.mockQueuePanel}>
              <View style={styles.mockQueueHeader}>
                <View>
                  <Text style={styles.panelEyebrow}>
                    REVIEW QUEUE
                  </Text>
                  <Text style={styles.panelTitle}>
                    {filteredRequests.length} request
                    {filteredRequests.length === 1
                      ? ""
                      : "s"}
                  </Text>
                </View>

                {loadingRequests && (
                  <ActivityIndicator
                    color="#4F46E5"
                  />
                )}
              </View>

              {!loadingRequests &&
              filteredRequests.length === 0 ? (
                <View style={styles.mockQueueEmpty}>
                  <Ionicons
                    name="file-tray-outline"
                    size={38}
                    color="#94A3B8"
                  />
                  <Text style={styles.emptyTitle}>
                    No requests in this status
                  </Text>
                  <Text style={styles.emptyText}>
                    Valid new Request Assistance
                    submissions will appear here for
                    LGU review.
                  </Text>
                </View>
              ) : (
                filteredRequests.map((item) => (
                  <MockQueueRow
                    key={item.id}
                    request={item}
                    onPress={() =>
                      selectRequest(item)
                    }
                  />
                ))
              )}
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
            <View style={styles.detailMainPane}>
              <View style={styles.detailPaneHeader}>
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
                            : "Verification Summary"
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

            <View style={styles.detailEvaluationPanel}>
              <View style={styles.evaluationRailHeader}>
                <View style={styles.evaluationRailHeaderIcon}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={18}
                    color="#4338CA"
                  />
                </View>
                <View style={styles.evaluationRailHeaderCopy}>
                  <Text style={styles.evaluationRailEyebrow}>
                    LGU EVALUATION
                  </Text>
                  <Text style={styles.evaluationRailTitle}>
                    Verification & Decision
                  </Text>
                  <Text style={styles.evaluationRailSubtitle}>
                    Review, verify, assess resources, and assign only an authorized public service point.
                  </Text>
                </View>
              </View>

              <ScrollView
                style={styles.detailEvaluationScroll}
                contentContainerStyle={styles.detailEvaluationContent}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {renderDecisionRail()}
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

          <View style={styles.mobileEvaluationSection}>
            <View style={styles.evaluationRailHeader}>
              <View style={styles.evaluationRailHeaderIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color="#4338CA"
                />
              </View>
              <View style={styles.evaluationRailHeaderCopy}>
                <Text style={styles.evaluationRailEyebrow}>
                  LGU EVALUATION
                </Text>
                <Text style={styles.evaluationRailTitle}>
                  Verification & Decision
                </Text>
              </View>
            </View>
            {renderDecisionRail()}
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

function MockQueueRow({
  request,
  onPress,
}: {
  request: AssistanceRequest;
  onPress: () => void;
}) {
  const category = assistanceCategoryMeta(
    request.category,
  );
  const status = statusMeta(request.status);

  return (
    <TouchableOpacity
      style={styles.mockQueueRow}
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

function CaseReviewTab({
  request,
  relatedRequestCount,
  sameBeneficiaryCount,
}: {
  request: AssistanceRequest;
  relatedRequestCount: number;
  sameBeneficiaryCount: number;
}) {
  return (
    <View style={styles.tabContent}>
      <SectionCard
        title="Request Information"
        subtitle="Resident-submitted non-emergency assistance details."
        icon="document-text-outline"
      >
        <InfoGrid>
          <InfoItem
            label="Category"
            value={
              request.categoryLabel ||
              request.category ||
              "Not recorded"
            }
          />
          <InfoItem
            label="Current Situation"
            value={
              request.currentSituation ||
              "Not recorded"
            }
          />
          <InfoItem
            label="Estimated Need"
            value={money(
              request.estimatedAmount,
            )}
          />
          <InfoItem
            label="Submitted"
            value={readableDate(
              request.createdAt,
            )}
          />
        </InfoGrid>

        <Divider />

        <LabelText>
          Description
        </LabelText>
        <BodyText>
          {request.description ||
            "No description was recorded."}
        </BodyText>

        <View style={styles.inlineBadges}>
          {(
            request.preferredAssistanceTypes ||
            []
          ).map((item) => (
            <View
              key={item}
              style={styles.softBadge}
            >
              <Text
                style={styles.softBadgeText}
              >
                {item === "monetary"
                  ? "Monetary Support"
                  : item === "in_kind"
                    ? "In-kind Support"
                    : item}
              </Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard
        title="Beneficiary Information"
        subtitle="Confirm who will receive the assistance and the requester's relationship to the beneficiary."
        icon="people-outline"
      >
        <InfoGrid>
          <InfoItem
            label="Beneficiary"
            value={
              request.beneficiaryName ||
              "Not recorded"
            }
          />
          <InfoItem
            label="Beneficiary Type"
            value={
              request.beneficiaryType ===
              "self"
                ? "Requester / Self"
                : "Someone Else"
            }
          />
          <InfoItem
            label="Relationship"
            value={
              request.relationshipToBeneficiary ||
              "Not recorded"
            }
          />
          <InfoItem
            label="Contact"
            value={
              request.contactNumber ||
              "Not recorded"
            }
          />
        </InfoGrid>
      </SectionCard>

      <SectionCard
        title="Initial Risk & Consistency Signals"
        subtitle="These are review prompts only. They do not automatically approve or reject a request."
        icon="alert-circle-outline"
      >
        <SignalRow
          label="Other requests from same Resident"
          value={String(
            relatedRequestCount,
          )}
          attention={
            relatedRequestCount > 0
          }
        />
        <SignalRow
          label="Other requests for same beneficiary name"
          value={String(
            sameBeneficiaryCount,
          )}
          attention={
            sameBeneficiaryCount > 0
          }
        />
        <SignalRow
          label="Supporting files submitted"
          value={String(
            request.documents?.length ||
              0,
          )}
          attention={
            !request.documents?.length
          }
        />
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

  return (
    <View style={styles.tabContent}>
      <SectionCard
        title="Supporting Evidence"
        subtitle="Open every uploaded file and compare names, dates, facility details, estimates, and other information with the request."
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
  request,
  reviewDraft,
  reviewRecord,
  reviewLoading,
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
  const verified = request.verificationStatus === "verified";
  const rejected = request.verificationStatus === "rejected";
  const reviewLocked = ["verified", "rejected"].includes(
    String(reviewRecord?.finalDecision || ""),
  );

  const [privateAddressSearch, setPrivateAddressSearch] = useState("");
  const [privateMapSearchQuery, setPrivateMapSearchQuery] = useState("");
  const [privateMapSearchTouched, setPrivateMapSearchTouched] = useState(false);

  useEffect(() => {
    const savedAddress = String(
      reviewRecord?.privateAddressSnapshot || request.requesterAddress || "",
    ).trim();

    const fallbackAddress = [
      request.requesterBarangay
        ? `Barangay ${String(request.requesterBarangay).trim()}`
        : "",
      "City of San Jose del Monte",
      "Bulacan",
      "Philippines",
    ]
      .filter(Boolean)
      .join(", ");

    const seed = savedAddress || fallbackAddress;

    setPrivateAddressSearch(seed);
    setPrivateMapSearchQuery(reviewLocked ? seed : "");
    setPrivateMapSearchTouched(reviewLocked && seed.length > 0);
  }, [
    request.id,
    request.requesterAddress,
    request.requesterBarangay,
    reviewRecord?.privateAddressSnapshot,
    reviewLocked,
  ]);

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

  const grossCost = safeNumber(reviewDraft.verifiedGrossCost);
  const existingAssistance = safeNumber(reviewDraft.confirmedExistingAssistanceAmount);
  const verifiedUncoveredAmount = Math.max(0, grossCost - existingAssistance);

  const normalizePrivateAddressQuery = (value: string) => {
    const raw = value.trim();
    if (!raw) return "";

    const parts = [raw];

    if (!/san\s+jose\s+del\s+monte/i.test(raw)) {
      parts.push("City of San Jose del Monte");
    }

    if (!/bulacan/i.test(raw)) {
      parts.push("Bulacan");
    }

    if (!/philippines/i.test(raw)) {
      parts.push("Philippines");
    }

    return parts.join(", ");
  };

  const runPrivateAddressSearch = () => {
    if (reviewLocked) return;

    const raw = privateAddressSearch.trim();

    if (raw.length < 3) {
      Alert.alert(
        "Address Required",
        "Enter the Resident's Block/Lot, street, subdivision or purok, barangay, and other available address details before searching.",
      );
      return;
    }

    const query = normalizePrivateAddressQuery(raw);

    setPrivateMapSearchQuery(query);
    setPrivateMapSearchTouched(true);

    onReviewChange("privateAddressSnapshot", raw.slice(0, 300));

    // Address search is only a geographic consistency check.
    // Clear any old experimental exact-pin coordinates so they are not
    // mistaken for proof of the Resident's household location.
    onReviewChange("privateLatitude", "");
    onReviewChange("privateLongitude", "");
  };

  const confirmResidencyAtAddress = () => {
    if (reviewLocked) return;

    if (
      !privateMapSearchTouched ||
      !privateMapSearchQuery.trim() ||
      !reviewDraft.privateAddressSnapshot.trim()
    ) {
      Alert.alert(
        "Search Address First",
        "Search and review the Resident's declared address on the map before marking residency as verified.",
      );
      return;
    }

    if (
      !reviewDraft.residencyVerificationMethod ||
      reviewDraft.residencyVerificationMethod === "not_applicable"
    ) {
      Alert.alert(
        "Verification Method Required",
        "Select how the LGU confirmed that the Resident is associated with this address.",
      );
      return;
    }

    onReviewChange("residencyVerificationStatus", "verified");
  };

  const publicMapQuery = [
    locationName.trim(),
    locationAddress.trim(),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.tabContent}>
      <SectionCard
        title="Private Anti-Scam Verification"
        subtitle="Evidence-based LGU verification only. This is not an automatic fraud score and these private fields are never published to donors."
        icon="shield-checkmark-outline"
      >
        {!reviewRecord && !verified && !rejected && (
          <View style={styles.infoNotice}>
            <Ionicons name="information-circle-outline" size={18} color="#0369A1" />
            <Text style={styles.infoNoticeText}>
              Start Review creates the protected assistanceVerificationReviews record required by Firestore before Verify Need can succeed.
            </Text>
          </View>
        )}

        <LabelText>Document consistency</LabelText>
        <StatusChoiceRow
          value={reviewDraft.documentConsistencyStatus}
          options={[
            ["pending", "Pending"],
            ["consistent", "Consistent"],
            ["inconsistent", "Inconsistent"],
            ["needs_more_information", "Needs More Info"],
          ]}
          disabled={reviewLocked}
          onChange={(value) => onReviewChange("documentConsistencyStatus", value)}
        />
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

        <LabelText>Duplicate / history check</LabelText>
        <StatusChoiceRow
          value={reviewDraft.duplicateCheckStatus}
          options={[
            ["pending", "Pending"],
            ["clear", "Clear"],
            ["potential_duplicate", "Potential Duplicate"],
            ["confirmed_duplicate", "Confirmed Duplicate"],
          ]}
          disabled={reviewLocked}
          onChange={(value) => onReviewChange("duplicateCheckStatus", value)}
        />
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

        <LabelText>Beneficiary verification</LabelText>
        <StatusChoiceRow
          value={reviewDraft.beneficiaryCheckStatus}
          options={[
            ["pending", "Pending"],
            ["confirmed", "Confirmed"],
            ["needs_more_information", "Needs More Info"],
            ["inconsistent", "Inconsistent"],
          ]}
          disabled={reviewLocked}
          onChange={(value) => onReviewChange("beneficiaryCheckStatus", value)}
        />
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
            <StatusChoiceRow
              value={reviewDraft.facilityVerificationStatus}
              options={[
                ["pending", "Pending"],
                ["confirmed", "Confirmed"],
                ["unable_to_confirm", "Unable to Confirm"],
                ["inconsistent", "Inconsistent"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("facilityVerificationStatus", value)}
            />

            <TextInput
              value={reviewDraft.facilityName}
              onChangeText={(value) => onReviewChange("facilityName", value)}
              placeholder="Official hospital / clinic / vet facility name"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />
            <TextInput
              value={reviewDraft.facilityType}
              onChangeText={(value) => onReviewChange("facilityType", value)}
              placeholder="Facility type — hospital, clinic, veterinary clinic..."
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
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
        subtitle="The Resident's entered amount is only a claim. Use an official bill, quotation, facility confirmation, or other verifiable basis before confirming a monetary shortage."
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
            <StatusChoiceRow
              value={reviewDraft.costVerificationStatus}
              options={[
                ["pending", "Pending"],
                ["confirmed", "Confirmed"],
                ["inconsistent", "Inconsistent"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("costVerificationStatus", value)}
            />
            <TextInput
              value={reviewDraft.verifiedGrossCost}
              onChangeText={(value) => onReviewChange("verifiedGrossCost", value.replace(/[^0-9.]/g, ""))}
              placeholder="Verified gross cost (PHP)"
              keyboardType="decimal-pad"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />
            <TextInput
              value={reviewDraft.confirmedExistingAssistanceAmount}
              onChangeText={(value) => onReviewChange("confirmedExistingAssistanceAmount", value.replace(/[^0-9.]/g, ""))}
              placeholder="Confirmed existing LGU / DSWD / NGO / other assistance (PHP)"
              keyboardType="decimal-pad"
              placeholderTextColor="#94A3B8"
              editable={!reviewLocked}
              style={styles.input}
            />
            <TextInput
              value={reviewDraft.costReferenceNumber}
              onChangeText={(value) => onReviewChange("costReferenceNumber", value)}
              placeholder="Official billing / quotation / case reference"
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

      <SectionCard
        title="Residency / Address Verification"
        subtitle="Use Google Maps only to check whether the Resident-declared address is geographically consistent. A map match does not prove residency."
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
            <Text style={styles.addressSearchLabel}>ADDRESS TO CHECK</Text>
            <View style={styles.addressSearchRow}>
              <TextInput
                value={privateAddressSearch}
                onChangeText={(value) => {
                  setPrivateAddressSearch(value);
                  setPrivateMapSearchTouched(false);
                }}
                placeholder="Block/Lot, street, phase, subdivision/purok, barangay"
                placeholderTextColor="#94A3B8"
                editable={!reviewLocked}
                maxLength={300}
                onSubmitEditing={runPrivateAddressSearch}
                style={[styles.input, styles.addressSearchInput]}
              />
              <TouchableOpacity
                style={[
                  styles.addressSearchButton,
                  reviewLocked && styles.addressSearchButtonDisabled,
                ]}
                onPress={runPrivateAddressSearch}
                disabled={reviewLocked}
                activeOpacity={0.82}
              >
                <Ionicons name="search-outline" size={17} color="#FFFFFF" />
                <Text style={styles.addressSearchButtonText}>Search Address</Text>
              </TouchableOpacity>
            </View>

            {privateMapSearchTouched && (
              <View style={styles.mapSearchStatus}>
                <Ionicons name="checkmark-circle-outline" size={17} color="#0369A1" />
                <Text style={styles.mapSearchStatusText}>
                  Address loaded on the private map. Check whether the result is consistent with the declared barangay/city and available evidence.
                </Text>
              </View>
            )}
          </View>

          <EmbeddedGoogleMap
            title="Resident Address Check"
            query={privateMapSearchQuery}
            badge="LGU PRIVATE"
            emptyText="Press Search Address to check the Resident-declared address inside VolunServe."
            privacyText="This map is only an address consistency check. It does not prove that the Resident lives at the mapped point, and it is never shown on the public Donation page."
          />

          <Divider />

          <LabelText>Residency verification method</LabelText>
          <StatusChoiceRow
            value={reviewDraft.residencyVerificationMethod}
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

          <LabelText>Residency status</LabelText>
          <StatusChoiceRow
            value={reviewDraft.residencyVerificationStatus}
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
              The Resident's exact home address stays inside authorized LGU review. Donation campaigns may display only a separate LGU-approved public receiving or service point.
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
            <StatusChoiceRow
              value={reviewDraft.videoVerificationStatus}
              options={[
                ["pending", "Pending"],
                ["requested", "Requested"],
                ["completed", "Completed"],
                ["unable_to_complete", "Unable to Complete"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("videoVerificationStatus", value)}
            />
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
            <StatusChoiceRow
              value={reviewDraft.siteVisitStatus}
              options={[
                ["pending", "Pending"],
                ["scheduled", "Scheduled"],
                ["completed", "Completed"],
                ["unable_to_complete", "Unable to Complete"],
              ]}
              disabled={reviewLocked}
              onChange={(value) => onReviewChange("siteVisitStatus", value)}
            />
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
          style={styles.textArea}
        />
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

        {!reviewLocked && (
          <ActionButton
            label="Save Verification Progress"
            icon="save-outline"
            variant="secondary"
            loading={savingAction === "save_private_review"}
            onPress={onSaveVerificationDraft}
          />
        )}
      </SectionCard>

      <SectionCard
        title="LGU Verification Notes"
        subtitle="This summary may also be stored on the Assistance Request record. Do not put secrets or unnecessary sensitive data here."
        icon="create-outline"
      >
        <TextInput
          value={adminNote}
          onChangeText={setAdminNote}
          placeholder="Short LGU case note / resident-facing clarification summary"
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={1800}
          style={styles.textArea}
        />
        <Text style={styles.counterText}>{adminNote.length}/1800</Text>
      </SectionCard>

      {!verified && !rejected && (
        <SectionCard
          title="Review Decision"
          subtitle="Verify Need is unlocked only by the protected Firestore verification record. Verification still does not create a Donation Campaign automatically."
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
              disabled={!allChecksComplete}
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
                  Complete every required rule-backed verification and clear all unresolved risk flags first.
                </Text>
              </View>
            </View>
          )}

          <LabelText>Rejection reason</LabelText>
          <TextInput
            value={rejectionReason}
            onChangeText={setRejectionReason}
            placeholder="Evidence-based reason for rejection"
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={1000}
            style={[styles.textArea, styles.rejectArea]}
          />
          <ActionButton
            label="Reject Request"
            icon="close-circle-outline"
            variant="danger"
            loading={savingAction === "reject"}
            onPress={onReject}
          />
        </SectionCard>
      )}

      {verified && (
        <>
          <SectionCard
            title="LGU Resource Assessment"
            subtitle={`Public donation support may use at most the verified uncovered amount: ${money(Number(reviewRecord?.verifiedUncoveredAmount || 0))}.`}
            icon="layers-outline"
          >
            <View style={styles.optionGrid}>
              {SUPPORT_OPTIONS.map((option) => {
                const active = supportDecision === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.optionCard, active && styles.optionCardActive]}
                    onPress={() => setSupportDecision(option.value)}
                    activeOpacity={0.82}
                  >
                    <Ionicons name={option.icon} size={20} color={active ? "#4338CA" : "#64748B"} />
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {supportDecision === "donation_support" && (
              <>
                <LabelText>Verified remaining unmet amount</LabelText>
                <TextInput
                  value={remainingAmount}
                  onChangeText={(value) => setRemainingAmount(value.replace(/[^0-9.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder="Cannot exceed private verified uncovered amount"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
              </>
            )}

            <ActionButton
              label="Save Resource Assessment"
              icon="save-outline"
              variant="primary"
              loading={savingAction === "resource_assessment"}
              onPress={onSaveResourceAssessment}
            />

            {supportDecision === "donation_support" && (
              <View style={styles.donationNotice}>
                <Ionicons name="lock-closed-outline" size={18} color="#6D28D9" />
                <Text style={styles.donationNoticeText}>
                  Donation Support records the verified shortage only. Community Need campaign creation remains locked until the separate Admin Panel 11 flow is connected.
                </Text>
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
            title="Official Public Service / Receiving Location"
            subtitle="This is the public coordination point after verification. It is separate from the private Resident address above."
            icon="location-outline"
          >
            <View style={styles.locationOptions}>
              {LOCATION_TYPES.map((option) => {
                const active = locationType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.locationChip, active && styles.locationChipActive]}
                    onPress={() => setLocationType(option.value)}
                  >
                    <Text style={[styles.locationChipText, active && styles.locationChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <LabelText>Official location name</LabelText>
            <TextInput
              value={locationName}
              onChangeText={setLocationName}
              placeholder="e.g. Barangay Hall Assistance Desk"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
            <LabelText>Public address</LabelText>
            <TextInput
              value={locationAddress}
              onChangeText={setLocationAddress}
              placeholder="Public receiving/service point address"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <EmbeddedGoogleMap
              title="LGU-Approved Public Service Point"
              query={publicMapQuery}
              badge="PUBLIC SERVICE LOCATION"
              emptyText="Enter the official location name and public address to preview the map inside VolunServe."
              privacyText="Only this LGU-approved public receiving/service point may be shown to Residents or donors. The beneficiary home address remains private."
            />

            <LabelText>Instructions / schedule</LabelText>
            <TextInput
              value={locationNotes}
              onChangeText={setLocationNotes}
              placeholder="Public handover instructions, office hours, schedule..."
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

      {rejected && (
        <View style={styles.rejectedCard}>
          <Ionicons name="close-circle-outline" size={22} color="#B42318" />
          <View style={styles.noteCopy}>
            <Text style={styles.rejectedTitle}>Request Rejected</Text>
            <Text style={styles.rejectedText}>{request.rejectionReason || "No reason recorded."}</Text>
          </View>
        </View>
      )}
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
  return (
    <View style={styles.locationOptions}>
      {options.map(([optionValue, label]) => {
        const active = value === optionValue;
        return (
          <TouchableOpacity
            key={optionValue}
            style={[styles.locationChip, active && styles.locationChipActive, disabled && { opacity: 0.65 }]}
            onPress={() => !disabled && onChange(optionValue)}
            disabled={disabled}
            activeOpacity={0.8}
          >
            <Text style={[styles.locationChipText, active && styles.locationChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
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
    <TouchableOpacity
      style={[styles.optionCard, value && styles.optionCardActive, disabled && { opacity: 0.65 }]}
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      activeOpacity={0.82}
    >
      <Ionicons
        name={value ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={value ? "#4338CA" : "#64748B"}
      />
      <Text style={[styles.optionText, value && styles.optionTextActive]}>{label}</Text>
    </TouchableOpacity>
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
    backgroundColor: "#F5F7FB",
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
    backgroundColor: "#F5F7FB",
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
    minHeight: 37,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
  },

  tabButtonActive: {
    backgroundColor: "#EEF2FF",
  },

  tabButtonText: {
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "800",
  },

  tabButtonTextActive: {
    color: "#4338CA",
  },

  tabContent: {
    padding: 16,
    gap: 13,
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
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 18,
    backgroundColor: "#F5F7FB",
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

});