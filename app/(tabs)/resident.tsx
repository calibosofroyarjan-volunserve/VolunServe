import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "../../lib/firebase";
import { getUserProfile } from "../../lib/firebaseAuth";

type AssistanceCategory =
  | "disaster_recovery"
  | "medical_health"
  | "surgery_treatment"
  | "cancer_serious_illness"
  | "animal_pet_welfare"
  | "elderly_assistance"
  | "homeless_basic_needs"
  | "other_community_assistance";

type AssistanceRequestGroup = "disaster_recovery" | "community_need";
type BeneficiaryType = "self" | "someone_else";
type PreferredAssistanceType = "monetary" | "in_kind";
type ScreenMode = "new_request" | "my_requests";

type DocumentRequirement = {
  key: string;
  label: string;
  helper: string;
  required: boolean;
};

type CategoryConfig = {
  value: AssistanceCategory;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  requestGroup: AssistanceRequestGroup;
  accent: string;
  soft: string;
  documents: DocumentRequirement[];
};

type PickedDocument = {
  key: string;
  label: string;
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  file?: any;
};

type StoredDocument = {
  documentType?: string;
  label?: string;
  url?: string;
  fileName?: string;
};

type SecureUploadedDocument = {
  evidenceId: string;
  document: StoredDocument;
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

  beneficiaryType?: BeneficiaryType | string;
  beneficiaryName?: string;
  relationshipToBeneficiary?: string;

  requestGroup?: AssistanceRequestGroup | string;
  category?: AssistanceCategory | string;
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
  assignedLocationSetAt?: any;
  assignedLocationSetBy?: string;

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

const ASSISTANCE_BACKEND_URL = "https://volunserve.onrender.com";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    value: "disaster_recovery",
    label: "Disaster Recovery",
    shortLabel: "Disaster Recovery",
    description: "Post-emergency repair, recovery, shelter, and material needs.",
    icon: "home-outline",
    requestGroup: "disaster_recovery",
    accent: "#C2410C",
    soft: "#FFF1E8",
    documents: [
      {
        key: "damage_evidence",
        label: "Damage / Recovery Evidence",
        helper: "Clear photo showing the current post-emergency recovery need.",
        required: true,
      },
      {
        key: "barangay_incident_reference",
        label: "Barangay / Incident Reference",
        helper: "Optional barangay certification, incident reference, or assessment photo.",
        required: false,
      },
    ],
  },
  {
    value: "medical_health",
    label: "Medical / Health",
    shortLabel: "Medical / Health",
    description: "Hospital bills, medicines, diagnostics, and medical needs.",
    icon: "medkit-outline",
    requestGroup: "community_need",
    accent: "#E11D48",
    soft: "#FFF0F4",
    documents: [
      {
        key: "medical_certificate",
        label: "Medical Certificate / Diagnosis",
        helper: "From a licensed doctor, hospital, or health facility.",
        required: true,
      },
      {
        key: "hospital_estimate",
        label: "Hospital Bill / Estimate",
        helper: "Billing statement, quotation, prescription, or treatment estimate.",
        required: true,
      },
      {
        key: "other_medical_support",
        label: "Other Supporting Document",
        helper: "Optional referral, prescription, laboratory request, or similar support.",
        required: false,
      },
    ],
  },
  {
    value: "surgery_treatment",
    label: "Surgery / Treatment",
    shortLabel: "Surgery / Treatment",
    description: "Operations, procedures, hospitalization, and treatment support.",
    icon: "fitness-outline",
    requestGroup: "community_need",
    accent: "#DC2626",
    soft: "#FFF1F2",
    documents: [
      {
        key: "medical_certificate",
        label: "Medical Certificate / Recommendation",
        helper: "Doctor or hospital recommendation for the procedure or treatment.",
        required: true,
      },
      {
        key: "treatment_estimate",
        label: "Surgery / Treatment Estimate",
        helper: "Hospital quotation, billing statement, or treatment cost estimate.",
        required: true,
      },
      {
        key: "other_treatment_support",
        label: "Other Supporting Document",
        helper: "Optional referral, prescription, schedule, or related document.",
        required: false,
      },
    ],
  },
  {
    value: "cancer_serious_illness",
    label: "Cancer / Serious Illness",
    shortLabel: "Cancer / Serious Illness",
    description: "Cancer care, specialized treatment, and ongoing medical support.",
    icon: "ribbon-outline",
    requestGroup: "community_need",
    accent: "#7C3AED",
    soft: "#F5F0FF",
    documents: [
      {
        key: "diagnosis_document",
        label: "Diagnosis / Medical Certificate",
        helper: "Medical document confirming the serious illness or treatment need.",
        required: true,
      },
      {
        key: "treatment_plan_or_bill",
        label: "Treatment Plan / Hospital Bill",
        helper: "Treatment estimate, bill, quotation, or hospital plan.",
        required: true,
      },
      {
        key: "other_illness_support",
        label: "Other Supporting Document",
        helper: "Optional referral, prescription, laboratory request, or related document.",
        required: false,
      },
    ],
  },
  {
    value: "animal_pet_welfare",
    label: "Animal / Pet Welfare",
    shortLabel: "Animal / Pet Welfare",
    description: "Rescue, veterinary care, medicine, food, and animal supplies.",
    icon: "paw-outline",
    requestGroup: "community_need",
    accent: "#16A34A",
    soft: "#EFFCF3",
    documents: [
      {
        key: "animal_case_photo",
        label: "Animal / Pet Case Photo",
        helper: "Clear photo showing the animal and the current situation.",
        required: true,
      },
      {
        key: "vet_assessment",
        label: "Veterinary Assessment / Quotation",
        helper: "Vet diagnosis, prescription, estimate, or clinic quotation when available.",
        required: true,
      },
      {
        key: "other_animal_support",
        label: "Other Supporting Document",
        helper: "Optional rescue record, referral, or additional evidence.",
        required: false,
      },
    ],
  },
  {
    value: "elderly_assistance",
    label: "Elderly Assistance",
    shortLabel: "Elderly Assistance",
    description: "Basic needs, mobility support, medical care, and daily-living needs.",
    icon: "accessibility-outline",
    requestGroup: "community_need",
    accent: "#D97706",
    soft: "#FFF8E8",
    documents: [
      {
        key: "elderly_need_evidence",
        label: "Supporting Evidence of Need",
        helper: "Clear supporting photo or document showing the requested assistance.",
        required: true,
      },
      {
        key: "elderly_supporting_document",
        label: "Medical / Social Welfare Document",
        helper: "Optional prescription, medical note, barangay endorsement, or referral.",
        required: false,
      },
    ],
  },
  {
    value: "homeless_basic_needs",
    label: "Homeless / Basic Needs",
    shortLabel: "Homeless / Basic Needs",
    description: "Food, hygiene, clothing, temporary shelter, and basic support.",
    icon: "people-circle-outline",
    requestGroup: "community_need",
    accent: "#92400E",
    soft: "#FFF7ED",
    documents: [
      {
        key: "basic_need_evidence",
        label: "Situation / Need Evidence",
        helper: "A privacy-safe supporting photo or document showing the current need.",
        required: true,
      },
      {
        key: "barangay_social_welfare_reference",
        label: "Barangay / Social Welfare Reference",
        helper: "Optional endorsement, referral, or case reference if available.",
        required: false,
      },
    ],
  },
  {
    value: "other_community_assistance",
    label: "Other Community Assistance",
    shortLabel: "Other Assistance",
    description: "Other legitimate, verifiable community support needs.",
    icon: "help-buoy-outline",
    requestGroup: "community_need",
    accent: "#475569",
    soft: "#F1F5F9",
    documents: [
      {
        key: "other_supporting_evidence",
        label: "Supporting Evidence",
        helper: "Upload a clear photo or document that helps the LGU verify the request.",
        required: true,
      },
    ],
  },
];

const CURRENT_SITUATION_OPTIONS = [
  "Currently confined / receiving care",
  "At home / recovering",
  "Awaiting treatment or service",
  "Temporarily displaced",
  "Ongoing community need",
  "Other",
];

const timestampMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
};

const formatDate = (value: any) => {
  const ms = timestampMillis(value);
  if (!ms) return "—";

  return new Date(ms).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatMoney = (value?: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const sanitizeMoneyInput = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  const safeWhole = whole.slice(0, 12);

  return decimalParts.length
    ? `${safeWhole}.${decimal}`
    : safeWhole;
};

const categoryConfig = (value?: string) =>
  CATEGORY_CONFIGS.find((item) => item.value === value);

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
      label: "Verified",
      color: "#15803D",
      soft: "#EAF8EF",
      icon: "shield-checkmark-outline" as const,
    };
  }

  if (status === "campaign_created") {
    return {
      label: "Donation Support Opened",
      color: "#7C3AED",
      soft: "#F3EDFF",
      icon: "heart-outline" as const,
    };
  }

  if (
    status === "assistance_provided" ||
    status === "fulfilled" ||
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
      label: "Not Approved",
      color: "#B42318",
      soft: "#FFF0EE",
      icon: "close-circle-outline" as const,
    };
  }

  return {
    label: "Pending",
    color: "#A16207",
    soft: "#FFF8D8",
    icon: "time-outline" as const,
  };
};

export default function AssistanceRequestScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const wide = width >= 1040;
  const user = auth.currentUser;

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  const [screenMode, setScreenMode] =
    useState<ScreenMode>("new_request");

  const [step, setStep] = useState(1);

  const [category, setCategory] =
    useState<AssistanceCategory | "">("");

  const [beneficiaryType, setBeneficiaryType] =
    useState<BeneficiaryType>("self");

  const [beneficiaryName, setBeneficiaryName] =
    useState("");

  const [
    relationshipToBeneficiary,
    setRelationshipToBeneficiary,
  ] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [currentSituation, setCurrentSituation] = useState("");
  const [otherSituation, setOtherSituation] = useState("");

  const [
    preferredAssistanceTypes,
    setPreferredAssistanceTypes,
  ] = useState<PreferredAssistanceType[]>([]);

  const [
    pickedDocuments,
    setPickedDocuments,
  ] = useState<Record<string, PickedDocument>>({});

  const [uploadProgress, setUploadProgress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [
    successRequestId,
    setSuccessRequestId,
  ] = useState("");

  const [
    submissionNeedsAttention,
    setSubmissionNeedsAttention,
  ] = useState(false);

  const [requests, setRequests] =
    useState<AssistanceRequest[]>([]);

  const [requestsReady, setRequestsReady] =
    useState(false);

  const [
    selectedRequest,
    setSelectedRequest,
  ] = useState<AssistanceRequest | null>(null);

  const [pageError, setPageError] = useState("");

  const isVerifiedResident =
    profile?.status === "approved" &&
    profile?.residentAccess === true &&
    (
      profile?.identityVerified === true ||
      profile?.identityStatus === "verified"
    );

  // Development-only web preview so we can review
  // the Request Assistance UI before the custom
  // identity verification flow is finished.
  // This does NOT grant Firestore permission.
  const requestAssistancePreviewBypass =
    __DEV__ &&
    Platform.OS === "web" &&
    profile?.residentAccess === true;

  const canOpenRequestAssistance =
    isVerifiedResident ||
    requestAssistancePreviewBypass;

  const selectedCategory = useMemo(
    () => categoryConfig(category),
    [category],
  );

  const accountContactNumber = String(
    profile?.phoneNumber || "",
  ).trim();

  const accountBarangay = String(
    profile?.barangay ||
      profile?.availability?.barangay ||
      "",
  ).trim();

  const requiresEstimatedAmount = [
    "medical_health",
    "surgery_treatment",
    "cancer_serious_illness",
  ].includes(category);

  const resolvedSituation =
    currentSituation === "Other"
      ? otherSituation.trim()
      : currentSituation.trim();

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        if (!user) return;

        const loadedProfile =
          await getUserProfile(user.uid);

        if (!mounted) return;

        setProfile(loadedProfile);
      } catch (error) {
        console.log(
          "Load assistance profile error:",
          error,
        );
      } finally {
        if (mounted) {
          setLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !isVerifiedResident) {
      setRequestsReady(true);
      return;
    }

    const requestQuery = query(
      collection(db, "assistanceRequests"),
      where("requesterUid", "==", user.uid),
    );

    const unsubscribe = onSnapshot(
      requestQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              AssistanceRequest,
              "id"
            >),
          }))
          .sort(
            (a, b) =>
              timestampMillis(b.createdAt) -
              timestampMillis(a.createdAt),
          );

        setRequests(rows);
        setRequestsReady(true);
        setPageError("");
      },
      (error) => {
        console.log(
          "Assistance requests listener failed:",
          error,
        );

        setRequestsReady(true);

        setPageError(
          "Unable to load your assistance request history. Check Firestore rules and your connection.",
        );
      },
    );

    return unsubscribe;
  }, [user?.uid, isVerifiedResident]);

  const resetForm = () => {
    setStep(1);
    setCategory("");
    setBeneficiaryType("self");
    setBeneficiaryName("");
    setRelationshipToBeneficiary("");
    setTitle("");
    setDescription("");
    setEstimatedAmount("");
    setCurrentSituation("");
    setOtherSituation("");
    setPreferredAssistanceTypes([]);
    setPickedDocuments({});
    setUploadProgress("");
    setSuccessRequestId("");
    setSubmissionNeedsAttention(false);
  };

  const togglePreferredType = (
    value: PreferredAssistanceType,
  ) => {
    setPreferredAssistanceTypes((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const chooseCategory = (
    value: AssistanceCategory,
  ) => {
    setCategory(value);
    setPickedDocuments({});
    setStep(2);
  };

  const pickDocument = async (
    requirement: DocumentRequirement,
  ) => {
    if (submitting) return;

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Gallery Permission",
        "Allow photo library access so you can attach a clear photo or screenshot of the supporting document.",
      );

      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          ImagePicker.MediaTypeOptions.Images,
        quality: 0.86,
      });

    if (result.canceled) return;

    const asset = result.assets[0];

    if (
      typeof asset.fileSize === "number" &&
      asset.fileSize > MAX_DOCUMENT_BYTES
    ) {
      Alert.alert(
        "File Too Large",
        "Use an image smaller than 10 MB.",
      );

      return;
    }

    setPickedDocuments((current) => ({
      ...current,

      [requirement.key]: {
        key: requirement.key,
        label: requirement.label,
        uri: asset.uri,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
        file: (asset as any).file,
      },
    }));
  };

  const removeDocument = (key: string) => {
    setPickedDocuments((current) => {
      const next = {
        ...current,
      };

      delete next[key];

      return next;
    });
  };

  const getDocumentBinary = async (
    asset: PickedDocument,
  ) => {
    if (
      asset.file &&
      typeof asset.file.arrayBuffer === "function"
    ) {
      return await asset.file.arrayBuffer();
    }

    const response =
      await fetch(asset.uri);

    if (!response.ok) {
      throw new Error(
        "The selected supporting document could not be read.",
      );
    }

    return await response.arrayBuffer();
  };

  const uploadDocument = async (
    asset: PickedDocument,
    firebaseToken: string,
  ): Promise<SecureUploadedDocument> => {
    const fileName =
      asset.fileName ||
      asset.uri
        .split("/")
        .pop()
        ?.split("?")[0] ||
      `assistance-${asset.key}-${Date.now()}.jpg`;

    const contentType = String(
      asset.mimeType || "image/jpeg",
    ).toLowerCase();

    const fileBytes =
      await getDocumentBinary(asset);

    if (
      fileBytes.byteLength >
      MAX_DOCUMENT_BYTES
    ) {
      throw new Error(
        "Supporting document must be 10 MB or smaller.",
      );
    }

    const response = await fetch(
      `${ASSISTANCE_BACKEND_URL}/api/assistance/evidence/upload`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${firebaseToken}`,
          "Content-Type": contentType,
          "X-File-Name": fileName.slice(0, 180),
          "X-Document-Type": asset.key,
        },

        body: fileBytes as any,
      },
    );

    const result =
      await response.json().catch(() => null);

    const evidenceId = String(
      result?.evidence?.evidenceId || "",
    ).trim();

    if (!response.ok || !evidenceId) {
      throw new Error(
        result?.message ||
          result?.error ||
          `Secure supporting document upload failed with HTTP ${response.status}.`,
      );
    }

    return {
      evidenceId,

      document: {
        documentType: asset.key,
        label: asset.label,

        url: `${ASSISTANCE_BACKEND_URL}/api/assistance/evidence/${encodeURIComponent(
          evidenceId,
        )}/access`,

        fileName: fileName.slice(0, 180),
      },
    };
  };

  const deleteStagedEvidence = async (
    evidenceId: string,
    firebaseToken: string,
  ) => {
    try {
      const response = await fetch(
        `${ASSISTANCE_BACKEND_URL}/api/assistance/evidence/${encodeURIComponent(
          evidenceId,
        )}`,
        {
          method: "DELETE",

          headers: {
            Authorization: `Bearer ${firebaseToken}`,
          },
        },
      );

      if (
        !response.ok &&
        response.status !== 404
      ) {
        const result =
          await response
            .json()
            .catch(() => null);

        console.log(
          "Unable to clean staged assistance evidence:",
          result?.message ||
            result?.error ||
            response.status,
        );
      }
    } catch (error) {
      console.log(
        "Staged assistance evidence cleanup failed:",
        error,
      );
    }
  };

  const createAssistanceRequest = async (
    requestId: string,
    requestPayload: {
      beneficiaryType: BeneficiaryType;
      beneficiaryName: string;
      relationshipToBeneficiary: string;
      category: AssistanceCategory;
      title: string;
      description: string;
      estimatedAmount: number;
      currentSituation: string;
      preferredAssistanceTypes: PreferredAssistanceType[];
    },
    evidenceIds: string[],
    firebaseToken: string,
  ): Promise<string> => {
    let lastError: Error | null = null;

    for (
      let attempt = 1;
      attempt <= 3;
      attempt += 1
    ) {
      try {
        const response = await fetch(
          `${ASSISTANCE_BACKEND_URL}/api/assistance/requests`,
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${firebaseToken}`,

              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              requestId,

              beneficiaryType:
                requestPayload.beneficiaryType,

              beneficiaryName:
                requestPayload.beneficiaryName,

              relationshipToBeneficiary:
                requestPayload.relationshipToBeneficiary,

              category:
                requestPayload.category,

              title:
                requestPayload.title,

              description:
                requestPayload.description,

              estimatedAmount:
                requestPayload.estimatedAmount,

              currentSituation:
                requestPayload.currentSituation,

              preferredAssistanceTypes:
                requestPayload.preferredAssistanceTypes,

              evidenceIds,
            }),
          },
        );

        const result =
          await response
            .json()
            .catch(() => null);

        if (
          response.ok &&
          result?.requestId
        ) {
          return String(
            result.requestId,
          );
        }

        lastError =
          new Error(
            result?.message ||
              result?.error ||
              `Request Assistance submission failed with HTTP ${response.status}.`,
          );
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error(
                "Unable to reach the secure VolunServe assistance service.",
              );
      }

      if (attempt < 3) {
        setUploadProgress(
          `Secure submission interrupted. Retrying ${attempt + 1} of 3...`,
        );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              700 * attempt,
            ),
        );
      }
    }

    throw (
      lastError ||
      new Error(
        "Unable to save the Request Assistance record.",
      )
    );
  };


  const validateStep = (
    targetStep: number,
  ) => {
    if (targetStep === 1) {
      if (!category) {
        return "Choose the assistance category that best describes the need.";
      }

      return null;
    }

    if (targetStep === 2) {
      if (!category) {
        return "Choose an assistance category first.";
      }

      if (
        beneficiaryType === "someone_else"
      ) {
        if (
          beneficiaryName.trim().length < 2
        ) {
          return "Enter the name of the person who needs assistance.";
        }

        if (
          relationshipToBeneficiary
            .trim()
            .length < 2
        ) {
          return "Enter your relationship to the beneficiary.";
        }
      }

      if (
        title.trim().length < 5
      ) {
        return "Enter a clear request title using at least 5 characters.";
      }

      if (
        description.trim().length < 20
      ) {
        return "Describe the situation using at least 20 characters.";
      }

      if (requiresEstimatedAmount) {
        const numericAmount =
          Number(estimatedAmount);

        if (
          !Number.isFinite(
            numericAmount,
          ) ||
          numericAmount <= 0
        ) {
          return "Enter the estimated amount needed for this medical request.";
        }
      }

      if (
        !resolvedSituation ||
        resolvedSituation.length < 3
      ) {
        return "Select or describe the current situation.";
      }

      if (
        !preferredAssistanceTypes.length
      ) {
        return "Select at least one preferred type of assistance.";
      }

      if (
        accountContactNumber.length < 8
      ) {
        return "Add a valid contact number to your VolunServe account before submitting this request.";
      }

      return null;
    }

    if (targetStep === 3) {
      const missing =
        (
          selectedCategory?.documents ||
          []
        ).find(
          (requirement) =>
            requirement.required &&
            !pickedDocuments[
              requirement.key
            ],
        );

      if (missing) {
        return `Upload the required supporting evidence: ${missing.label}.`;
      }

      return null;
    }

    return null;
  };

  const goNext = () => {
    const problem =
      validateStep(step);

    if (problem) {
      Alert.alert(
        "Complete This Step",
        problem,
      );

      return;
    }

    setStep((current) =>
      Math.min(
        4,
        current + 1,
      ),
    );
  };

  const goBack = () => {
    if (step <= 1) return;

    setStep((current) =>
      Math.max(
        1,
        current - 1,
      ),
    );
  };

  const submitRequest = async () => {
    if (
      !user ||
      !profile ||
      !selectedCategory ||
      submitting
    ) {
      return;
    }

    if (!isVerifiedResident) {
      Alert.alert(
        "Preview Mode Only",
        "You can review the Request Assistance design for now, but submission stays locked until the new VolunServe identity verification flow is completed.",
      );

      return;
    }

    for (
      const targetStep of [1, 2, 3]
    ) {
      const problem =
        validateStep(
          targetStep,
        );

      if (problem) {
        setStep(targetStep);

        Alert.alert(
          "Incomplete Request",
          problem,
        );

        return;
      }
    }

    if (!accountBarangay) {
      const message =
        "Your VolunServe account has no barangay information. Update your account before submitting a Request Assistance.";

      setPageError(message);

      Alert.alert(
        "Barangay Information Required",
        message,
      );

      return;
    }

    const numericAmount =
      Number(
        estimatedAmount || 0,
      );

    console.log(
      "ASSISTANCE RESIDENT PREFLIGHT:",
      {
        authUid: user.uid,
        profileUid:
          String(
            profile?.uid || "",
          ),
        role:
          profile?.role,
        status:
          profile?.status,
        residentAccess:
          profile?.residentAccess,
        activeMode:
          profile?.activeMode,
        identityVerified:
          profile?.identityVerified,
        identityStatus:
          profile?.identityStatus,
        accountBarangay,
        contactNumberLength:
          accountContactNumber.length,
        requestGroup:
          selectedCategory.requestGroup,
        category:
          selectedCategory.value,
        beneficiaryType,
        preferredAssistanceTypes:
          [
            ...preferredAssistanceTypes,
          ],
      },
    );

    const uploadedEvidenceIds:
      string[] = [];

    let firebaseToken = "";
    let requestCreated = false;
    let createdRequestId = "";

    try {
      setSubmitting(true);
      setPageError("");

      setUploadProgress(
        "Securing your session...",
      );

      firebaseToken =
        await user.getIdToken(true);

      if (!firebaseToken) {
        throw new Error(
          "Your secure sign-in session could not be prepared. Please sign in again.",
        );
      }

      const selectedDocs =
        Object.values(
          pickedDocuments,
        );

      const uploadedDocuments:
        StoredDocument[] = [];

      for (
        let index = 0;
        index < selectedDocs.length;
        index += 1
      ) {
        const item =
          selectedDocs[index];

        setUploadProgress(
          `Securely uploading supporting document ${
            index + 1
          } of ${
            selectedDocs.length
          }...`,
        );

        const uploaded =
          await uploadDocument(
            item,
            firebaseToken,
          );

        uploadedEvidenceIds.push(
          uploaded.evidenceId,
        );

        uploadedDocuments.push(
          uploaded.document,
        );
      }

      setUploadProgress(
        "Saving your assistance request...",
      );

      const requestRef = doc(
        collection(
          db,
          "assistanceRequests",
        ),
      );

      const requesterName =
        String(
          profile?.fullName ||
            user.displayName ||
            "Resident",
        ).trim() ||
        "Resident";

      const requestPayload = {
        requestId:
          requestRef.id,

        requesterUid:
          user.uid,

        requesterName:
          requesterName.slice(
            0,
            160,
          ),

        requesterEmail:
          String(
            profile?.email ||
              user.email ||
              "",
          ).slice(
            0,
            160,
          ),

        requesterBarangay:
          accountBarangay.slice(
            0,
            120,
          ),

        requesterAddress:
          String(
            profile?.address ||
              "",
          ).slice(
            0,
            240,
          ),

        contactNumber:
          accountContactNumber.slice(
            0,
            30,
          ),

        beneficiaryType,

        beneficiaryName:
          beneficiaryType ===
          "self"
            ? requesterName.slice(
                0,
                160,
              )
            : beneficiaryName
                .trim()
                .slice(
                  0,
                  160,
                ),

        relationshipToBeneficiary:
          beneficiaryType ===
          "self"
            ? "self"
            : relationshipToBeneficiary
                .trim()
                .slice(
                  0,
                  120,
                ),

        requestGroup:
          selectedCategory
            .requestGroup,

        category:
          selectedCategory.value,

        categoryLabel:
          selectedCategory.label,

        title:
          title
            .trim()
            .slice(
              0,
              160,
            ),

        description:
          description
            .trim()
            .slice(
              0,
              2000,
            ),

        estimatedAmount:
          Number.isFinite(
            numericAmount,
          ) &&
          numericAmount > 0
            ? numericAmount
            : 0,

        currentSituation:
          resolvedSituation.slice(
            0,
            240,
          ),

        preferredAssistanceTypes:
          preferredAssistanceTypes.slice(
            0,
            2,
          ),

        documents:
          uploadedDocuments.slice(
            0,
            8,
          ),

        status:
          "pending",

        verificationStatus:
          "pending_review",

        supportDecision:
          "pending",

        remainingAmount:
          0,

        assignedLocationType:
          "",

        assignedLocationName:
          "",

        assignedLocationAddress:
          "",

        assignedLocationNotes:
          "",

        assignedLocationSetBy:
          "",

        assignedLocationSetAt:
          null,

        donationCampaignId:
          "",

        adminNote:
          "",

        reviewedAt:
          null,

        reviewedBy:
          "",

        verifiedAt:
          null,

        verifiedBy:
          "",

        rejectedAt:
          null,

        rejectionReason:
          "",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      };

      const allowedPayloadKeys = [
        "requestId",
        "requesterUid",
        "requesterName",
        "requesterEmail",
        "requesterBarangay",
        "requesterAddress",
        "contactNumber",
        "beneficiaryType",
        "beneficiaryName",
        "relationshipToBeneficiary",
        "requestGroup",
        "category",
        "categoryLabel",
        "title",
        "description",
        "estimatedAmount",
        "currentSituation",
        "preferredAssistanceTypes",
        "documents",
        "status",
        "verificationStatus",
        "supportDecision",
        "remainingAmount",
        "assignedLocationType",
        "assignedLocationName",
        "assignedLocationAddress",
        "assignedLocationNotes",
        "assignedLocationSetBy",
        "assignedLocationSetAt",
        "donationCampaignId",
        "adminNote",
        "reviewedAt",
        "reviewedBy",
        "verifiedAt",
        "verifiedBy",
        "rejectedAt",
        "rejectionReason",
        "createdAt",
        "updatedAt",
      ].sort();

      const secureEvidenceUrlPattern =
        /^https:\/\/volunserve\.onrender\.com\/api\/assistance\/evidence\/evidence_[A-Za-z0-9]+\/access$/;

      const allowedDocumentTypes =
        new Set([
          "damage_evidence",
          "barangay_incident_reference",
          "medical_certificate",
          "hospital_estimate",
          "other_medical_support",
          "treatment_estimate",
          "other_treatment_support",
          "diagnosis_document",
          "treatment_plan_or_bill",
          "other_illness_support",
          "animal_case_photo",
          "vet_assessment",
          "other_animal_support",
          "elderly_need_evidence",
          "elderly_supporting_document",
          "basic_need_evidence",
          "barangay_social_welfare_reference",
          "other_supporting_evidence",
        ]);

      const localRuleProblems:
        string[] = [];

      const actualPayloadKeys =
        Object.keys(
          requestPayload,
        ).sort();

      if (
        JSON.stringify(
          actualPayloadKeys,
        ) !==
        JSON.stringify(
          allowedPayloadKeys,
        )
      ) {
        localRuleProblems.push(
          `payload keys mismatch: ${actualPayloadKeys.join(", ")}`,
        );
      }

      if (
        requestPayload.requestId !==
        requestRef.id
      ) {
        localRuleProblems.push(
          "requestId does not match the Firestore document ID",
        );
      }

      if (
        requestPayload.requesterUid !==
        user.uid
      ) {
        localRuleProblems.push(
          "requesterUid does not match the authenticated UID",
        );
      }

      if (
        requestPayload.requesterName.length < 1 ||
        requestPayload.requesterName.length > 160
      ) {
        localRuleProblems.push(
          "requesterName length is invalid",
        );
      }

      if (
        requestPayload.requesterEmail.length > 160
      ) {
        localRuleProblems.push(
          "requesterEmail is longer than 160 characters",
        );
      }

      if (
        requestPayload.requesterBarangay.length < 1 ||
        requestPayload.requesterBarangay.length > 120
      ) {
        localRuleProblems.push(
          "requesterBarangay length is invalid",
        );
      }

      if (
        requestPayload.requesterAddress.length > 240
      ) {
        localRuleProblems.push(
          "requesterAddress is longer than 240 characters",
        );
      }

      if (
        requestPayload.contactNumber.length < 8 ||
        requestPayload.contactNumber.length > 30
      ) {
        localRuleProblems.push(
          "contactNumber length is invalid",
        );
      }

      if (
        ![
          "self",
          "someone_else",
        ].includes(
          requestPayload.beneficiaryType,
        )
      ) {
        localRuleProblems.push(
          "beneficiaryType is invalid",
        );
      }

      if (
        requestPayload.beneficiaryName.length < 1 ||
        requestPayload.beneficiaryName.length > 160
      ) {
        localRuleProblems.push(
          "beneficiaryName length is invalid",
        );
      }

      if (
        requestPayload.relationshipToBeneficiary.length < 1 ||
        requestPayload.relationshipToBeneficiary.length > 120
      ) {
        localRuleProblems.push(
          "relationshipToBeneficiary length is invalid",
        );
      }

      if (
        requestPayload.beneficiaryType ===
          "self" &&
        requestPayload.relationshipToBeneficiary !==
          "self"
      ) {
        localRuleProblems.push(
          "self beneficiary must use relationshipToBeneficiary=self",
        );
      }

      const categoryPairValid =
        (
          requestPayload.requestGroup ===
            "disaster_recovery" &&
          requestPayload.category ===
            "disaster_recovery"
        ) ||
        (
          requestPayload.requestGroup ===
            "community_need" &&
          [
            "medical_health",
            "surgery_treatment",
            "cancer_serious_illness",
            "animal_pet_welfare",
            "elderly_assistance",
            "homeless_basic_needs",
            "other_community_assistance",
          ].includes(
            requestPayload.category,
          )
        );

      if (!categoryPairValid) {
        localRuleProblems.push(
          "requestGroup/category pair is invalid",
        );
      }

      if (
        requestPayload.categoryLabel.length < 2 ||
        requestPayload.categoryLabel.length > 120
      ) {
        localRuleProblems.push(
          "categoryLabel length is invalid",
        );
      }

      if (
        requestPayload.title.length < 3 ||
        requestPayload.title.length > 160
      ) {
        localRuleProblems.push(
          "title length is invalid",
        );
      }

      if (
        requestPayload.description.length < 10 ||
        requestPayload.description.length > 2000
      ) {
        localRuleProblems.push(
          "description length is invalid",
        );
      }

      if (
        !Number.isFinite(
          requestPayload.estimatedAmount,
        ) ||
        requestPayload.estimatedAmount < 0 ||
        requestPayload.estimatedAmount >
          100000000
      ) {
        localRuleProblems.push(
          "estimatedAmount is invalid",
        );
      }

      if (
        requestPayload.currentSituation.length < 2 ||
        requestPayload.currentSituation.length > 240
      ) {
        localRuleProblems.push(
          "currentSituation length is invalid",
        );
      }

      if (
        requestPayload.preferredAssistanceTypes.length < 1 ||
        requestPayload.preferredAssistanceTypes.length > 2
      ) {
        localRuleProblems.push(
          "preferredAssistanceTypes size is invalid",
        );
      }

      if (
        requestPayload.documents.length < 1 ||
        requestPayload.documents.length > 8
      ) {
        localRuleProblems.push(
          "documents size is invalid",
        );
      }

      requestPayload.documents.forEach(
        (document, index) => {
          const documentNumber =
            index + 1;

          const documentKeys =
            Object.keys(
              document,
            ).sort();

          if (
            JSON.stringify(
              documentKeys,
            ) !==
            JSON.stringify([
              "documentType",
              "fileName",
              "label",
              "url",
            ])
          ) {
            localRuleProblems.push(
              `document ${documentNumber} has invalid keys: ${documentKeys.join(", ")}`,
            );
          }

          const documentType =
            String(
              document.documentType ||
                "",
            );

          if (
            !allowedDocumentTypes.has(
              documentType,
            )
          ) {
            localRuleProblems.push(
              `document ${documentNumber} has invalid documentType: ${documentType || "(empty)"}`,
            );
          }

          const documentLabel =
            String(
              document.label || "",
            );

          if (
            documentLabel.length < 2 ||
            documentLabel.length > 160
          ) {
            localRuleProblems.push(
              `document ${documentNumber} has invalid label length`,
            );
          }

          const documentUrl =
            String(
              document.url || "",
            );

          if (
            documentUrl.length < 40 ||
            documentUrl.length > 500 ||
            !secureEvidenceUrlPattern.test(
              documentUrl,
            )
          ) {
            localRuleProblems.push(
              `document ${documentNumber} URL does not match the secure Firestore rule`,
            );
          }

          const documentFileName =
            String(
              document.fileName ||
                "",
            );

          if (
            documentFileName.length < 1 ||
            documentFileName.length > 180
          ) {
            localRuleProblems.push(
              `document ${documentNumber} has invalid fileName length`,
            );
          }
        },
      );

      if (
        requestPayload.status !==
          "pending" ||
        requestPayload.verificationStatus !==
          "pending_review" ||
        requestPayload.supportDecision !==
          "pending" ||
        requestPayload.remainingAmount !==
          0
      ) {
        localRuleProblems.push(
          "initial assistance status fields do not match Firestore rules",
        );
      }

      if (
        requestPayload.assignedLocationType !==
          "" ||
        requestPayload.assignedLocationName !==
          "" ||
        requestPayload.assignedLocationAddress !==
          "" ||
        requestPayload.assignedLocationNotes !==
          "" ||
        requestPayload.assignedLocationSetBy !==
          "" ||
        requestPayload.assignedLocationSetAt !==
          null
      ) {
        localRuleProblems.push(
          "Resident request contains an LGU-assigned location",
        );
      }

      if (
        requestPayload.donationCampaignId !==
          "" ||
        requestPayload.adminNote !==
          "" ||
        requestPayload.reviewedAt !==
          null ||
        requestPayload.reviewedBy !==
          "" ||
        requestPayload.verifiedAt !==
          null ||
        requestPayload.verifiedBy !==
          "" ||
        requestPayload.rejectedAt !==
          null ||
        requestPayload.rejectionReason !==
          ""
      ) {
        localRuleProblems.push(
          "Resident request contains Admin/LGU review values",
        );
      }

      console.log(
        "ASSISTANCE PAYLOAD DIAGNOSTIC:",
        {
          requestId:
            requestPayload.requestId,
          requesterUid:
            requestPayload.requesterUid,
          requesterNameLength:
            requestPayload.requesterName.length,
          requesterEmailLength:
            requestPayload.requesterEmail.length,
          requesterBarangay:
            requestPayload.requesterBarangay,
          requesterAddressLength:
            requestPayload.requesterAddress.length,
          contactNumberLength:
            requestPayload.contactNumber.length,
          beneficiaryType:
            requestPayload.beneficiaryType,
          beneficiaryNameLength:
            requestPayload.beneficiaryName.length,
          relationshipToBeneficiary:
            requestPayload.relationshipToBeneficiary,
          requestGroup:
            requestPayload.requestGroup,
          category:
            requestPayload.category,
          categoryLabel:
            requestPayload.categoryLabel,
          titleLength:
            requestPayload.title.length,
          descriptionLength:
            requestPayload.description.length,
          estimatedAmount:
            requestPayload.estimatedAmount,
          currentSituation:
            requestPayload.currentSituation,
          preferredAssistanceTypes:
            requestPayload.preferredAssistanceTypes,
          documents:
            requestPayload.documents.map(
              (document) => ({
                documentType:
                  document.documentType,
                label:
                  document.label,
                url:
                  document.url,
                fileNameLength:
                  String(
                    document.fileName ||
                      "",
                  ).length,
                keys:
                  Object.keys(
                    document,
                  ).sort(),
              }),
            ),
          status:
            requestPayload.status,
          verificationStatus:
            requestPayload.verificationStatus,
          supportDecision:
            requestPayload.supportDecision,
          remainingAmount:
            requestPayload.remainingAmount,
          localRuleProblems,
        },
      );

      if (
        localRuleProblems.length
      ) {
        console.error(
          "ASSISTANCE LOCAL RULE CHECK FAILED:",
          localRuleProblems,
        );

        throw new Error(
          `Assistance payload failed local Firestore rule checks: ${localRuleProblems.join("; ")}`,
        );
      }

      console.log(
        "ASSISTANCE LOCAL RULE CHECK: PASS",
      );

      setUploadProgress(
        "Securely saving your assistance request...",
      );

      const savedRequestId =
        await createAssistanceRequest(
          requestRef.id,
          {
            beneficiaryType:
              requestPayload.beneficiaryType,

            beneficiaryName:
              requestPayload.beneficiaryName,

            relationshipToBeneficiary:
              requestPayload.relationshipToBeneficiary,

            category:
              requestPayload.category,

            title:
              requestPayload.title,

            description:
              requestPayload.description,

            estimatedAmount:
              requestPayload.estimatedAmount,

            currentSituation:
              requestPayload.currentSituation,

            preferredAssistanceTypes:
              requestPayload.preferredAssistanceTypes,
          },
          uploadedEvidenceIds,
          firebaseToken,
        );

      requestCreated = true;

      createdRequestId =
        savedRequestId;

      setSubmissionNeedsAttention(
        false,
      );

      setSuccessRequestId(
        savedRequestId,
      );

      setUploadProgress("");
    } catch (error) {
      console.log(
        "Submit assistance request error:",
        error,
      );

      if (
        !requestCreated &&
        firebaseToken &&
        uploadedEvidenceIds.length
      ) {
        setUploadProgress(
          "Cleaning unfinished secure uploads...",
        );

        await Promise.all(
          uploadedEvidenceIds.map(
            (evidenceId) =>
              deleteStagedEvidence(
                evidenceId,
                firebaseToken,
              ),
          ),
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : "The request could not be saved. Check your connection and try again.";

      if (
        requestCreated &&
        createdRequestId
      ) {
        setSubmissionNeedsAttention(
          true,
        );

        setSuccessRequestId(
          createdRequestId,
        );

        setPageError(
          "Your request was saved, but secure evidence finalization was interrupted. The LGU/Admin can check the existing request. Do not submit a duplicate request.",
        );

        Alert.alert(
          "Request Saved — Evidence Finalization Pending",
          "The Request Assistance record was created, but secure evidence finalization was interrupted after several attempts. Do not submit the same request again. The LGU/Admin can check the existing request.",
        );
      } else {
        setPageError(
          message,
        );

        Alert.alert(
          "Submission Failed",
          message,
        );
      }
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  };

  if (loadingProfile) {
    return (
      <SafeAreaView
        style={
          styles.loadingScreen
        }
      >
        <StatusBar style="dark" />

        <ActivityIndicator
          size="large"
          color="#1769E0"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Preparing Request
          Assistance...
        </Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView
        style={
          styles.loadingScreen
        }
      >
        <StatusBar style="dark" />

        <Ionicons
          name="log-in-outline"
          size={42}
          color="#1769E0"
        />

        <Text
          style={
            styles.gateTitle
          }
        >
          Sign in required
        </Text>

        <Text
          style={
            styles.gateText
          }
        >
          Sign in with your
          VolunServe Resident
          account to continue.
        </Text>

        <TouchableOpacity
          style={
            styles.primaryButton
          }
          onPress={() =>
            router.replace(
              "/login" as any,
            )
          }
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            Go to Login
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!canOpenRequestAssistance) {
    return (
      <SafeAreaView
        style={
          styles.loadingScreen
        }
      >
        <StatusBar style="dark" />

        <View
          style={
            styles.gateIcon
          }
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={36}
            color="#1769E0"
          />
        </View>

        <Text
          style={
            styles.gateTitle
          }
        >
          Verified Resident
          Required
        </Text>

        <Text
          style={
            styles.gateText
          }
        >
          Request Assistance is
          available only to
          Verified Residents.
          Emergency reporting
          remains available even
          if identity verification
          is not yet complete.
        </Text>

        <TouchableOpacity
          style={
            styles.primaryButton
          }
          onPress={() =>
            router.push(
              "/identity-verification" as any,
            )
          }
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            Open Identity
            Verification
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={
            styles.secondaryButton
          }
          onPress={() =>
            router.push(
              "/(tabs)/disaster-response" as any,
            )
          }
        >
          <Text
            style={
              styles.secondaryButtonText
            }
          >
            Report an Emergency
            Instead
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (successRequestId) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <StatusBar style="dark" />

        <View
          style={
            styles.successPage
          }
        >
          <View
            style={
              styles.successIcon
            }
          >
            <Ionicons
              name="checkmark"
              size={46}
              color="#FFFFFF"
            />
          </View>

          <Text
            style={
              styles.successTitle
            }
          >
            {submissionNeedsAttention
              ? "Request Saved — Secure Evidence Check Pending"
              : "Request Submitted Successfully"}
          </Text>

          <Text
            style={
              styles.successText
            }
          >
            {submissionNeedsAttention
              ? "Your Request Assistance record was saved, but the secure evidence attachment needs LGU/Admin checking. Do not submit the same request again."
              : "Your private request has been received and will be reviewed by the LGU. Public donation support is not automatic and will only be opened if the LGU verifies the need and confirms that additional support is required."}
          </Text>

          <View
            style={
              styles.successReferenceCard
            }
          >
            <View>
              <Text
                style={
                  styles.miniLabel
                }
              >
                REQUEST ID
              </Text>

              <Text
                style={
                  styles.successReference
                }
              >
                {
                  successRequestId
                }
              </Text>
            </View>

            <View
              style={
                styles.successDivider
              }
            />

            <View>
              <Text
                style={
                  styles.miniLabel
                }
              >
                STATUS
              </Text>

              <Text
                style={
                  styles.successReference
                }
              >
                {submissionNeedsAttention
                  ? "Evidence Check Pending"
                  : "Pending LGU Review"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              {
                minWidth:
                  280,
              },
            ]}
            onPress={() => {
              setScreenMode(
                "my_requests",
              );

              resetForm();
            }}
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              View My Requests
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              {
                minWidth:
                  280,
              },
            ]}
            onPress={() => {
              resetForm();

              setScreenMode(
                "new_request",
              );
            }}
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Submit Another Request
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top"]}
    >
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={
            styles.pageContainer
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <LinearGradient
            colors={[
              "#0F4E9A",
              "#1769E0",
            ]}
            start={{
              x: 0,
              y: 0,
            }}
            end={{
              x: 1,
              y: 1,
            }}
            style={styles.hero}
          >
            <View
              style={
                styles.heroIcon
              }
            >
              <Ionicons
                name="hand-left-outline"
                size={28}
                color="#FFFFFF"
              />
            </View>

            <View
              style={
                styles.heroCopy
              }
            >
              <Text
                style={
                  styles.heroEyebrow
                }
              >
                VOLUNSERVE · VERIFIED
                RESIDENT SERVICE
              </Text>

              <Text
                style={
                  styles.heroTitle
                }
              >
                Request Assistance
              </Text>

              <Text
                style={
                  styles.heroSubtitle
                }
              >
                Submit a verified
                non-emergency or
                recovery assistance
                request for LGU
                review. Donation
                support may be opened
                later only when a
                verified shortage
                remains.
              </Text>
            </View>

            <View
              style={
                styles.heroVerifiedBadge
              }
            >
              <Ionicons
                name="shield-checkmark"
                size={15}
                color="#0F8A58"
              />

              <Text
                style={
                  styles.heroVerifiedText
                }
              >
                Verified Resident
              </Text>
            </View>
          </LinearGradient>

          <View
            style={
              styles.modeTabs
            }
          >
            <Pressable
              style={[
                styles.modeTab,
                screenMode ===
                  "new_request" &&
                  styles.modeTabActive,
              ]}
              onPress={() =>
                setScreenMode(
                  "new_request",
                )
              }
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color={
                  screenMode ===
                  "new_request"
                    ? "#FFFFFF"
                    : "#475569"
                }
              />

              <Text
                style={[
                  styles.modeTabText,
                  screenMode ===
                    "new_request" &&
                    styles.modeTabTextActive,
                ]}
              >
                New Request
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.modeTab,
                screenMode ===
                  "my_requests" &&
                  styles.modeTabActive,
              ]}
              onPress={() =>
                setScreenMode(
                  "my_requests",
                )
              }
            >
              <Ionicons
                name="documents-outline"
                size={18}
                color={
                  screenMode ===
                  "my_requests"
                    ? "#FFFFFF"
                    : "#475569"
                }
              />

              <Text
                style={[
                  styles.modeTabText,
                  screenMode ===
                    "my_requests" &&
                    styles.modeTabTextActive,
                ]}
              >
                My Requests
              </Text>

              {requests.length > 0
                ? (
                  <View
                    style={[
                      styles.modeCount,

                      screenMode ===
                        "my_requests" &&
                        styles.modeCountActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeCountText,

                        screenMode ===
                          "my_requests" &&
                          styles.modeCountTextActive,
                      ]}
                    >
                      {
                        requests.length
                      }
                    </Text>
                  </View>
                )
                : null}
            </Pressable>
          </View>

          {!!pageError && (
            <View
              style={
                styles.errorCard
              }
            >
              <Ionicons
                name="warning-outline"
                size={18}
                color="#B42318"
              />

              <Text
                style={
                  styles.errorText
                }
              >
                {pageError}
              </Text>
            </View>
          )}

          {screenMode ===
          "new_request" ? (
            <>
              <View
                style={[
                  styles.infoGrid,
                  !wide &&
                    styles.infoGridCompact,
                ]}
              >
                <InfoCard
                  icon="shield-checkmark-outline"
                  title="Verified Residents Only"
                  text="Identity verification is required for non-emergency assistance requests."
                />

                <InfoCard
                  icon="clipboard-outline"
                  title="LGU Review"
                  text="Documents and request details are privately reviewed before any assistance decision."
                />

                <InfoCard
                  icon="location-outline"
                  title="LGU Sets the Location"
                  text="Residents do not choose the public map point. The LGU assigns a safe service or receiving location when needed."
                />

                <InfoCard
                  icon="heart-outline"
                  title="Donation Is Not Automatic"
                  text="A public campaign is opened only after verification and a confirmed remaining shortage."
                />
              </View>

              <View
                style={
                  styles.emergencyNotice
                }
              >
                <View
                  style={
                    styles.emergencyNoticeIcon
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={21}
                    color="#B42318"
                  />
                </View>

                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={
                      styles.emergencyNoticeTitle
                    }
                  >
                    Is there an active
                    emergency or
                    immediate danger?
                  </Text>

                  <Text
                    style={
                      styles.emergencyNoticeText
                    }
                  >
                    Use Emergency
                    Report for fire,
                    rescue, evacuation,
                    serious injury,
                    urgent transport,
                    or other immediate
                    threats. Request
                    Assistance is for
                    non-urgent recovery
                    and community
                    support.
                  </Text>
                </View>

                <TouchableOpacity
                  style={
                    styles.emergencyButton
                  }
                  onPress={() =>
                    router.push(
                      "/(tabs)/disaster-response" as any,
                    )
                  }
                >
                  <Text
                    style={
                      styles.emergencyButtonText
                    }
                  >
                    Emergency Report
                  </Text>
                </TouchableOpacity>
              </View>

              <StepProgress
                step={step}
                wide={wide}
              />

              {step === 1 && (
                <View
                  style={
                    styles.formCard
                  }
                >
                  <FormHeading
                    eyebrow="STEP 1 OF 4"
                    title="Choose an Assistance Category"
                    text="Choose the category that best describes the verified non-emergency need."
                  />

                  <View
                    style={[
                      styles.categoryGrid,
                      !wide &&
                        styles.categoryGridCompact,
                    ]}
                  >
                    {CATEGORY_CONFIGS.map(
                      (item) => (
                        <TouchableOpacity
                          key={
                            item.value
                          }
                          activeOpacity={
                            0.84
                          }
                          style={[
                            styles.categoryCard,

                            category ===
                              item.value && {
                              borderColor:
                                item.accent,

                              backgroundColor:
                                item.soft,
                            },
                          ]}
                          onPress={() =>
                            chooseCategory(
                              item.value,
                            )
                          }
                        >
                          <View
                            style={[
                              styles.categoryIcon,

                              {
                                backgroundColor:
                                  item.soft,
                              },
                            ]}
                          >
                            <Ionicons
                              name={
                                item.icon
                              }
                              size={
                                23
                              }
                              color={
                                item.accent
                              }
                            />
                          </View>

                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={
                                styles.categoryTitle
                              }
                            >
                              {
                                item.label
                              }
                            </Text>

                            <Text
                              style={
                                styles.categoryText
                              }
                            >
                              {
                                item.description
                              }
                            </Text>
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color="#94A3B8"
                          />
                        </TouchableOpacity>
                      ),
                    )}
                  </View>
                </View>
              )}

              {step === 2 &&
                selectedCategory && (
                <View
                  style={
                    styles.formCard
                  }
                >
                  <FormHeading
                    eyebrow="STEP 2 OF 4"
                    title={`${selectedCategory.label} — Request Details`}
                    text="Provide complete, accurate information. Private details are visible only to authorized LGU staff."
                  />

                  <FieldLabel
                    label="Who needs assistance?"
                    required
                  />

                  <View
                    style={
                      styles.choiceRow
                    }
                  >
                    <ChoiceButton
                      selected={
                        beneficiaryType ===
                        "self"
                      }
                      icon="person-outline"
                      label="Myself"
                      onPress={() =>
                        setBeneficiaryType(
                          "self",
                        )
                      }
                    />

                    <ChoiceButton
                      selected={
                        beneficiaryType ===
                        "someone_else"
                      }
                      icon="people-outline"
                      label="Someone else"
                      onPress={() =>
                        setBeneficiaryType(
                          "someone_else",
                        )
                      }
                    />
                  </View>

                  {beneficiaryType ===
                    "someone_else" && (
                    <View
                      style={[
                        styles.twoColumn,

                        !wide &&
                          styles.twoColumnCompact,
                      ]}
                    >
                      <View
                        style={
                          styles.flexField
                        }
                      >
                        <FieldLabel
                          label="Beneficiary name"
                          required
                        />

                        <TextInput
                          style={
                            styles.input
                          }
                          value={
                            beneficiaryName
                          }
                          onChangeText={(
                            value,
                          ) =>
                            setBeneficiaryName(
                              value.slice(
                                0,
                                160,
                              ),
                            )
                          }
                          placeholder="Full name"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>

                      <View
                        style={
                          styles.flexField
                        }
                      >
                        <FieldLabel
                          label="Relationship to beneficiary"
                          required
                        />

                        <TextInput
                          style={
                            styles.input
                          }
                          value={
                            relationshipToBeneficiary
                          }
                          onChangeText={(
                            value,
                          ) =>
                            setRelationshipToBeneficiary(
                              value.slice(
                                0,
                                120,
                              ),
                            )
                          }
                          placeholder="e.g. Parent, sibling, neighbor"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                  )}

                  <FieldLabel
                    label="Title / short description"
                    required
                  />

                  <TextInput
                    style={
                      styles.input
                    }
                    value={title}
                    onChangeText={(
                      value,
                    ) =>
                      setTitle(
                        value.slice(
                          0,
                          160,
                        ),
                      )
                    }
                    placeholder="e.g. Financial assistance for hospital bills"
                    placeholderTextColor="#94A3B8"
                  />

                  <FieldLabel
                    label="Detailed description"
                    required
                  />

                  <TextInput
                    style={[
                      styles.input,
                      styles.textArea,
                    ]}
                    value={
                      description
                    }
                    onChangeText={(
                      value,
                    ) =>
                      setDescription(
                        value.slice(
                          0,
                          2000,
                        ),
                      )
                    }
                    placeholder="Explain the current need, what assistance is required, and relevant background."
                    placeholderTextColor="#94A3B8"
                    multiline
                    textAlignVertical="top"
                  />

                  <Text
                    style={
                      styles.characterCount
                    }
                  >
                    {
                      description.length
                    }
                    /2000
                  </Text>

                  <View
                    style={[
                      styles.twoColumn,
                      !wide &&
                        styles.twoColumnCompact,
                    ]}
                  >
                    <View
                      style={
                        styles.flexField
                      }
                    >
                      <FieldLabel
                        label={`Estimated amount needed (PHP)${
                          requiresEstimatedAmount
                            ? ""
                            : " — optional"
                        }`}
                        required={
                          requiresEstimatedAmount
                        }
                      />

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          estimatedAmount
                        }
                        onChangeText={(
                          value,
                        ) =>
                          setEstimatedAmount(
                            sanitizeMoneyInput(
                              value,
                            ),
                          )
                        }
                        keyboardType="decimal-pad"
                        placeholder="e.g. 50000"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    <View
                      style={
                        styles.flexField
                      }
                    >
                      <FieldLabel
                        label="Account contact number"
                        required
                      />

                      <View
                        style={[
                          styles.accountContactCard,

                          !accountContactNumber &&
                            styles.accountContactCardMissing,
                        ]}
                      >
                        <View
                          style={
                            styles.accountContactIcon
                          }
                        >
                          <Ionicons
                            name={
                              accountContactNumber
                                ? "call-outline"
                                : "alert-circle-outline"
                            }
                            size={18}
                            color={
                              accountContactNumber
                                ? "#1769E0"
                                : "#B42318"
                            }
                          />
                        </View>

                        <View
                          style={
                            styles.accountContactCopy
                          }
                        >
                          <Text
                            style={[
                              styles.accountContactValue,

                              !accountContactNumber &&
                                styles.accountContactValueMissing,
                            ]}
                          >
                            {accountContactNumber ||
                              "No contact number saved"}
                          </Text>

                          <Text
                            style={
                              styles.accountContactHelper
                            }
                          >
                            {accountContactNumber
                              ? "Automatically linked from your VolunServe account. Update it only in Account Settings."
                              : "Add a contact number in Account Settings before submitting this request."}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.readOnlyBadge
                          }
                        >
                          <Ionicons
                            name="lock-closed-outline"
                            size={12}
                            color="#475569"
                          />

                          <Text
                            style={
                              styles.readOnlyBadgeText
                            }
                          >
                            ACCOUNT
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <FieldLabel
                    label="Current situation"
                    required
                  />

                  <View
                    style={
                      styles.chipWrap
                    }
                  >
                    {CURRENT_SITUATION_OPTIONS.map(
                      (item) => {
                        const selected =
                          currentSituation ===
                          item;

                        return (
                          <Pressable
                            key={item}
                            style={[
                              styles.situationChip,

                              selected &&
                                styles.situationChipActive,
                            ]}
                            onPress={() =>
                              setCurrentSituation(
                                item,
                              )
                            }
                          >
                            <Text
                              style={[
                                styles.situationChipText,

                                selected &&
                                  styles.situationChipTextActive,
                              ]}
                            >
                              {item}
                            </Text>
                          </Pressable>
                        );
                      },
                    )}
                  </View>

                  {currentSituation ===
                    "Other" && (
                    <TextInput
                      style={
                        styles.input
                      }
                      value={
                        otherSituation
                      }
                      onChangeText={(
                        value,
                      ) =>
                        setOtherSituation(
                          value.slice(
                            0,
                            240,
                          ),
                        )
                      }
                      placeholder="Describe the current situation"
                      placeholderTextColor="#94A3B8"
                    />
                  )}

                  <FieldLabel
                    label="Preferred type of assistance"
                    required
                  />

                  <View
                    style={
                      styles.choiceRow
                    }
                  >
                    <ChoiceButton
                      selected={
                        preferredAssistanceTypes.includes(
                          "monetary",
                        )
                      }
                      icon="cash-outline"
                      label="Monetary support"
                      onPress={() =>
                        togglePreferredType(
                          "monetary",
                        )
                      }
                    />

                    <ChoiceButton
                      selected={
                        preferredAssistanceTypes.includes(
                          "in_kind",
                        )
                      }
                      icon="cube-outline"
                      label="In-kind support"
                      onPress={() =>
                        togglePreferredType(
                          "in_kind",
                        )
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.privateNotice
                    }
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={17}
                      color="#0F766E"
                    />

                    <Text
                      style={
                        styles.privateNoticeText
                      }
                    >
                      Your profile address
                      and submitted documents
                      are private verification
                      data. You are not asked
                      to choose a public Google
                      Maps location. If a
                      service, receiving, or
                      handover point is needed,
                      the LGU will assign it.
                    </Text>
                  </View>

                  <FormActions
                    onBack={goBack}
                    onNext={goNext}
                  />
                </View>
              )}

              {step === 3 &&
                selectedCategory && (
                <View
                  style={
                    styles.formCard
                  }
                >
                  <FormHeading
                    eyebrow="STEP 3 OF 4"
                    title={`Supporting Documents — ${selectedCategory.label}`}
                    text="Choose clear photos or screenshots. They remain on your device until final submission, then upload through the secured VolunServe backend for private LGU verification."
                  />

                  <View
                    style={
                      styles.documentList
                    }
                  >
                    {selectedCategory.documents.map(
                      (
                        requirement,
                      ) => {
                        const selected =
                          pickedDocuments[
                            requirement
                              .key
                          ];

                        return (
                          <View
                            key={
                              requirement.key
                            }
                            style={
                              styles.documentRow
                            }
                          >
                            <View
                              style={
                                styles.documentIcon
                              }
                            >
                              <Ionicons
                                name={
                                  selected
                                    ? "checkmark-circle-outline"
                                    : "document-attach-outline"
                                }
                                size={
                                  21
                                }
                                color={
                                  selected
                                    ? "#15803D"
                                    : "#1769E0"
                                }
                              />
                            </View>

                            <View
                              style={{
                                flex: 1,
                              }}
                            >
                              <View
                                style={
                                  styles.documentTitleRow
                                }
                              >
                                <Text
                                  style={
                                    styles.documentTitle
                                  }
                                >
                                  {
                                    requirement.label
                                  }
                                </Text>

                                {requirement.required
                                  ? (
                                    <Text
                                      style={
                                        styles.requiredBadge
                                      }
                                    >
                                      REQUIRED
                                    </Text>
                                  )
                                  : (
                                    <Text
                                      style={
                                        styles.optionalBadge
                                      }
                                    >
                                      OPTIONAL
                                    </Text>
                                  )}
                              </View>

                              <Text
                                style={
                                  styles.documentHelper
                                }
                              >
                                {
                                  requirement.helper
                                }
                              </Text>

                              {selected
                                ? (
                                  <View
                                    style={
                                      styles.documentSelected
                                    }
                                  >
                                    <Image
                                      source={{
                                        uri: selected.uri,
                                      }}
                                      style={
                                        styles.documentPreview
                                      }
                                    />

                                    <View
                                      style={{
                                        flex: 1,
                                      }}
                                    >
                                      <Text
                                        style={
                                          styles.documentFileName
                                        }
                                        numberOfLines={
                                          1
                                        }
                                      >
                                        {selected.fileName ||
                                          "Supporting image"}
                                      </Text>

                                      <Text
                                        style={
                                          styles.documentUploadedText
                                        }
                                      >
                                        Ready
                                        for
                                        secure
                                        upload
                                      </Text>
                                    </View>

                                    <Pressable
                                      style={
                                        styles.removeDocumentButton
                                      }
                                      onPress={() =>
                                        removeDocument(
                                          requirement.key,
                                        )
                                      }
                                    >
                                      <Ionicons
                                        name="close"
                                        size={
                                          17
                                        }
                                        color="#B42318"
                                      />
                                    </Pressable>
                                  </View>
                                )
                                : (
                                  <TouchableOpacity
                                    style={
                                      styles.uploadButton
                                    }
                                    onPress={() =>
                                      void pickDocument(
                                        requirement,
                                      )
                                    }
                                  >
                                    <Ionicons
                                      name="cloud-upload-outline"
                                      size={
                                        18
                                      }
                                      color="#1769E0"
                                    />

                                    <Text
                                      style={
                                        styles.uploadButtonText
                                      }
                                    >
                                      Choose
                                      Photo /
                                      Screenshot
                                    </Text>
                                  </TouchableOpacity>
                                )}
                            </View>
                          </View>
                        );
                      },
                    )}
                  </View>

                  <View
                    style={
                      styles.uploadNote
                    }
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={17}
                      color="#1769E0"
                    />

                    <Text
                      style={
                        styles.uploadNoteText
                      }
                    >
                      JPG/PNG/WebP image
                      evidence only, up to
                      10 MB each. Files are
                      uploaded through the
                      secured VolunServe
                      backend only when you
                      submit the request.
                    </Text>
                  </View>

                  <FormActions
                    onBack={goBack}
                    onNext={goNext}
                  />
                </View>
              )}

              {step === 4 &&
                selectedCategory && (
                <View
                  style={
                    styles.formCard
                  }
                >
                  <FormHeading
                    eyebrow="STEP 4 OF 4"
                    title="Review & Submit"
                    text="Check the information before sending it to the LGU for private verification."
                  />

                  <View
                    style={[
                      styles.reviewGrid,

                      !wide &&
                        styles.reviewGridCompact,
                    ]}
                  >
                    <View
                      style={
                        styles.reviewMain
                      }
                    >
                      <ReviewRow
                        label="Category"
                        value={
                          selectedCategory.label
                        }
                      />

                      <ReviewRow
                        label="Request Type"
                        value={
                          selectedCategory.requestGroup ===
                          "disaster_recovery"
                            ? "Disaster Recovery"
                            : "Community Assistance"
                        }
                      />

                      <ReviewRow
                        label="Beneficiary"
                        value={
                          beneficiaryType ===
                          "self"
                            ? String(
                                profile?.fullName ||
                                  "Myself",
                              )
                            : beneficiaryName
                        }
                      />

                      <ReviewRow
                        label="Title"
                        value={title}
                      />

                      <ReviewRow
                        label="Description"
                        value={
                          description
                        }
                        multiline
                      />

                      <ReviewRow
                        label="Estimated Amount"
                        value={
                          Number(
                            estimatedAmount ||
                              0,
                          ) > 0
                            ? formatMoney(
                                Number(
                                  estimatedAmount,
                                ),
                              )
                            : "Not specified"
                        }
                      />

                      <ReviewRow
                        label="Current Situation"
                        value={
                          resolvedSituation
                        }
                      />

                      <ReviewRow
                        label="Preferred Assistance"
                        value={preferredAssistanceTypes
                          .map(
                            (
                              item,
                            ) =>
                              item ===
                              "monetary"
                                ? "Monetary"
                                : "In-kind",
                          )
                          .join(
                            " + ",
                          )}
                      />

                      <ReviewRow
                        label="Account Contact Number"
                        value={
                          accountContactNumber ||
                          "Not available — update Account Settings"
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.reviewSide
                      }
                    >
                      <Text
                        style={
                          styles.reviewSideTitle
                        }
                      >
                        Supporting
                        Documents
                      </Text>

                      <Text
                        style={
                          styles.reviewSideCount
                        }
                      >
                        {
                          Object.keys(
                            pickedDocuments,
                          ).length
                        }{" "}
                        attached
                      </Text>

                      {(
                        selectedCategory.documents ||
                        []
                      ).map(
                        (
                          requirement,
                        ) => (
                          <View
                            key={
                              requirement.key
                            }
                            style={
                              styles.reviewDocumentLine
                            }
                          >
                            <Ionicons
                              name={
                                pickedDocuments[
                                  requirement
                                    .key
                                ]
                                  ? "checkmark-circle"
                                  : "ellipse-outline"
                              }
                              size={
                                16
                              }
                              color={
                                pickedDocuments[
                                  requirement
                                    .key
                                ]
                                  ? "#15803D"
                                  : "#94A3B8"
                              }
                            />

                            <Text
                              style={
                                styles.reviewDocumentText
                              }
                            >
                              {
                                requirement.label
                              }
                            </Text>
                          </View>
                        ),
                      )}

                      <View
                        style={
                          styles.lguLocationReview
                        }
                      >
                        <Ionicons
                          name="map-outline"
                          size={20}
                          color="#1769E0"
                        />

                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={
                              styles.lguLocationReviewTitle
                            }
                          >
                            Public /
                            Service
                            Location
                          </Text>

                          <Text
                            style={
                              styles.lguLocationReviewText
                            }
                          >
                            Not
                            selected by
                            the
                            Resident.
                            The LGU
                            will set
                            an
                            authorized
                            location
                            later if
                            coordination,
                            receiving,
                            or a
                            donation
                            campaign
                            requires
                            one.
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View
                    style={
                      styles.declarationCard
                    }
                  >
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={20}
                      color="#0F766E"
                    />

                    <Text
                      style={
                        styles.declarationText
                      }
                    >
                      By submitting, you
                      confirm that the
                      information is
                      accurate to the
                      best of your
                      knowledge and
                      understand that
                      the LGU may
                      request additional
                      verification before
                      providing
                      assistance or
                      opening public
                      donation support.
                    </Text>
                  </View>

                  <View
                    style={
                      styles.formActionRow
                    }
                  >
                    <TouchableOpacity
                      style={
                        styles.backButton
                      }
                      onPress={
                        goBack
                      }
                    >
                      <Ionicons
                        name="arrow-back"
                        size={17}
                        color="#475569"
                      />

                      <Text
                        style={
                          styles.backButtonText
                        }
                      >
                        Back
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.submitButton,

                        submitting &&
                          styles.disabledButton,
                      ]}
                      disabled={
                        submitting
                      }
                      onPress={() =>
                        void submitRequest()
                      }
                    >
                      {submitting
                        ? (
                          <ActivityIndicator
                            color="#FFFFFF"
                          />
                        )
                        : (
                          <Ionicons
                            name="send-outline"
                            size={
                              18
                            }
                            color="#FFFFFF"
                          />
                        )}

                      <Text
                        style={
                          styles.submitButtonText
                        }
                      >
                        {uploadProgress ||
                          "Submit Request"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          ) : (
            <MyRequestsPanel
              requests={
                requests
              }
              ready={
                requestsReady
              }
              onOpen={
                setSelectedRequest
              }
              onNewRequest={() => {
                resetForm();

                setScreenMode(
                  "new_request",
                );
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <RequestDetailsModal
        request={
          selectedRequest
        }
        onClose={() =>
          setSelectedRequest(
            null,
          )
        }
      />
    </SafeAreaView>
  );
}

function StepProgress({
  step,
  wide,
}: {
  step: number;
  wide: boolean;
}) {
  const rows = [
    {
      number: 1,
      label: "Category",
      icon:
        "grid-outline" as const,
    },
    {
      number: 2,
      label: "Details",
      icon:
        "create-outline" as const,
    },
    {
      number: 3,
      label: "Documents",
      icon:
        "document-attach-outline" as const,
    },
    {
      number: 4,
      label: "Review",
      icon:
        "checkmark-circle-outline" as const,
    },
  ];

  return (
    <View
      style={[
        styles.progressCard,

        !wide &&
          styles.progressCardCompact,
      ]}
    >
      {rows.map(
        (
          item,
          index,
        ) => {
          const active =
            item.number ===
            step;

          const done =
            item.number <
            step;

          return (
            <React.Fragment
              key={
                item.number
              }
            >
              {index >
                0 && (
                <View
                  style={[
                    styles.progressLine,

                    done &&
                      styles.progressLineDone,
                  ]}
                />
              )}

              <View
                style={
                  styles.progressItem
                }
              >
                <View
                  style={[
                    styles.progressCircle,

                    (
                      active ||
                      done
                    ) &&
                      styles.progressCircleActive,
                  ]}
                >
                  <Ionicons
                    name={
                      done
                        ? "checkmark"
                        : item.icon
                    }
                    size={
                      15
                    }
                    color={
                      active ||
                      done
                        ? "#FFFFFF"
                        : "#64748B"
                    }
                  />
                </View>

                <Text
                  style={[
                    styles.progressLabel,

                    active &&
                      styles.progressLabelActive,
                  ]}
                >
                  {
                    item.label
                  }
                </Text>
              </View>
            </React.Fragment>
          );
        },
      )}
    </View>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  title: string;
  text: string;
}) {
  return (
    <View
      style={
        styles.infoCard
      }
    >
      <View
        style={
          styles.infoCardIcon
        }
      >
        <Ionicons
          name={icon}
          size={20}
          color="#1769E0"
        />
      </View>

      <View
        style={{
          flex: 1,
        }}
      >
        <Text
          style={
            styles.infoCardTitle
          }
        >
          {title}
        </Text>

        <Text
          style={
            styles.infoCardText
          }
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

function FormHeading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <View
      style={
        styles.formHeading
      }
    >
      <Text
        style={
          styles.formEyebrow
        }
      >
        {eyebrow}
      </Text>

      <Text
        style={
          styles.formTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.formText
        }
      >
        {text}
      </Text>
    </View>
  );
}

function FieldLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  return (
    <Text
      style={
        styles.fieldLabel
      }
    >
      {label}

      {required
        ? (
          <Text
            style={
              styles.requiredStar
            }
          >
            {" "}
            *
          </Text>
        )
        : null}
    </Text>
  );
}

function ChoiceButton({
  selected,
  icon,
  label,
  onPress,
}: {
  selected: boolean;

  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];

  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.choiceButton,

        selected &&
          styles.choiceButtonSelected,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={
          selected
            ? "checkmark-circle"
            : icon
        }
        size={18}
        color={
          selected
            ? "#1769E0"
            : "#64748B"
        }
      />

      <Text
        style={[
          styles.choiceButtonText,

          selected &&
            styles.choiceButtonTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FormActions({
  onBack,
  onNext,
}: {
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <View
      style={
        styles.formActionRow
      }
    >
      <TouchableOpacity
        style={
          styles.backButton
        }
        onPress={
          onBack
        }
      >
        <Ionicons
          name="arrow-back"
          size={17}
          color="#475569"
        />

        <Text
          style={
            styles.backButtonText
          }
        >
          Back
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={
          styles.nextButton
        }
        onPress={
          onNext
        }
      >
        <Text
          style={
            styles.nextButtonText
          }
        >
          Next
        </Text>

        <Ionicons
          name="arrow-forward"
          size={17}
          color="#FFFFFF"
        />
      </TouchableOpacity>
    </View>
  );
}

function ReviewRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View
      style={[
        styles.reviewRow,

        multiline &&
          styles.reviewRowMultiline,
      ]}
    >
      <Text
        style={
          styles.reviewLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.reviewValue
        }
      >
        {value || "—"}
      </Text>
    </View>
  );
}

function MyRequestsPanel({
  requests,
  ready,
  onOpen,
  onNewRequest,
}: {
  requests:
    AssistanceRequest[];

  ready: boolean;

  onOpen: (
    request: AssistanceRequest,
  ) => void;

  onNewRequest:
    () => void;
}) {
  const counts = {
    all:
      requests.length,

    pending:
      requests.filter(
        (item) =>
          item.status ===
          "pending",
      ).length,

    underReview:
      requests.filter(
        (item) =>
          item.status ===
          "under_review",
      ).length,

    verified:
      requests.filter(
        (item) =>
          [
            "verified",
            "campaign_created",
            "assistance_provided",
            "fulfilled",
            "closed",
          ].includes(
            String(
              item.status ||
                "",
            ),
          ),
      ).length,
  };

  return (
    <View
      style={
        styles.historyCard
      }
    >
      <View
        style={
          styles.historyHeader
        }
      >
        <View
          style={{
            flex: 1,
          }}
        >
          <Text
            style={
              styles.formEyebrow
            }
          >
            RESIDENT TRACKING
          </Text>

          <Text
            style={
              styles.historyTitle
            }
          >
            My Assistance
            Requests
          </Text>

          <Text
            style={
              styles.historySubtitle
            }
          >
            Track LGU review,
            verification, assigned
            service locations, and
            whether additional
            donation support was
            opened.
          </Text>
        </View>

        <TouchableOpacity
          style={
            styles.newRequestButton
          }
          onPress={
            onNewRequest
          }
        >
          <Ionicons
            name="add"
            size={17}
            color="#FFFFFF"
          />

          <Text
            style={
              styles.newRequestButtonText
            }
          >
            New Request
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={
          styles.historySummaryRow
        }
      >
        <SummaryPill
          label="All"
          value={
            counts.all
          }
        />

        <SummaryPill
          label="Pending"
          value={
            counts.pending
          }
        />

        <SummaryPill
          label="Under Review"
          value={
            counts.underReview
          }
        />

        <SummaryPill
          label="Verified / Completed"
          value={
            counts.verified
          }
        />
      </View>

      {!ready ? (
        <View
          style={
            styles.emptyState
          }
        >
          <ActivityIndicator
            color="#1769E0"
          />

          <Text
            style={
              styles.emptyText
            }
          >
            Loading your
            requests...
          </Text>
        </View>
      ) : requests.length ===
        0 ? (
        <View
          style={
            styles.emptyState
          }
        >
          <Ionicons
            name="documents-outline"
            size={38}
            color="#94A3B8"
          />

          <Text
            style={
              styles.emptyTitle
            }
          >
            No assistance
            requests yet
          </Text>

          <Text
            style={
              styles.emptyText
            }
          >
            Submit a verified
            non-emergency request
            when legitimate
            community or recovery
            support is needed.
          </Text>
        </View>
      ) : (
        <View
          style={
            styles.requestList
          }
        >
          {requests.map(
            (request) => {
              const meta =
                statusMeta(
                  request.status,
                );

              const config =
                categoryConfig(
                  request.category,
                );

              return (
                <Pressable
                  key={
                    request.id
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.requestCard,

                    pressed && {
                      opacity:
                        0.86,
                    },
                  ]}
                  onPress={() =>
                    onOpen(
                      request,
                    )
                  }
                >
                  <View
                    style={[
                      styles.requestCardIcon,

                      {
                        backgroundColor:
                          config?.soft ||
                          "#EFF6FF",
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        config?.icon ||
                        "help-buoy-outline"
                      }
                      size={22}
                      color={
                        config?.accent ||
                        "#1769E0"
                      }
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={
                        styles.requestCardId
                      }
                    >
                      {request.requestId ||
                        request.id}
                    </Text>

                    <Text
                      style={
                        styles.requestCardTitle
                      }
                    >
                      {request.title ||
                        request.categoryLabel ||
                        "Assistance Request"}
                    </Text>

                    <Text
                      style={
                        styles.requestCardMeta
                      }
                    >
                      {request.categoryLabel ||
                        config?.label ||
                        "Community Assistance"}
                      {" · "}
                      {formatDate(
                        request.createdAt,
                      )}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,

                      {
                        backgroundColor:
                          meta.soft,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        meta.icon
                      }
                      size={13}
                      color={
                        meta.color
                      }
                    />

                    <Text
                      style={[
                        styles.statusBadgeText,

                        {
                          color:
                            meta.color,
                        },
                      ]}
                    >
                      {
                        meta.label
                      }
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color="#94A3B8"
                  />
                </Pressable>
              );
            },
          )}
        </View>
      )}
    </View>
  );
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View
      style={
        styles.summaryPill
      }
    >
      <Text
        style={
          styles.summaryPillValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.summaryPillLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function RequestDetailsModal({
  request,
  onClose,
}: {
  request:
    AssistanceRequest | null;

  onClose:
    () => void;
}) {
  if (!request) {
    return null;
  }

  const meta =
    statusMeta(
      request.status,
    );

  const config =
    categoryConfig(
      request.category,
    );

  const hasAssignedLocation =
    String(
      request.assignedLocationName ||
        "",
    ).trim().length > 0 ||
    String(
      request.assignedLocationAddress ||
        "",
    ).trim().length > 0;

  const mapQuery = [
    String(
      request.assignedLocationName ||
        "",
    ).trim(),

    String(
      request.assignedLocationAddress ||
        "",
    ).trim(),
  ]
    .filter(Boolean)
    .join(", ");

  const mapUrl =
    mapQuery
      ? `https://www.google.com/maps?q=${encodeURIComponent(
          mapQuery,
        )}&output=embed`
      : "";

  const timeline = [
    {
      label:
        "Submitted",

      active:
        true,

      done:
        true,
    },
    {
      label:
        "Under Review",

      active:
        request.status ===
        "under_review",

      done:
        [
          "under_review",
          "verified",
          "campaign_created",
          "assistance_provided",
          "fulfilled",
          "closed",
          "rejected",
        ].includes(
          String(
            request.status ||
              "",
          ),
        ),
    },
    {
      label:
        "Verified",

      active:
        request.status ===
        "verified",

      done:
        [
          "verified",
          "campaign_created",
          "assistance_provided",
          "fulfilled",
          "closed",
        ].includes(
          String(
            request.status ||
              "",
          ),
        ),
    },
    {
      label:
        request.status ===
        "campaign_created"
          ? "Donation Support Opened"
          : "Assistance / Resolution",

      active:
        [
          "campaign_created",
          "assistance_provided",
          "fulfilled",
          "closed",
        ].includes(
          String(
            request.status ||
              "",
          ),
        ),

      done:
        [
          "campaign_created",
          "assistance_provided",
          "fulfilled",
          "closed",
        ].includes(
          String(
            request.status ||
              "",
          ),
        ),
    },
  ];

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={
        onClose
      }
    >
      <View
        style={
          styles.modalOverlay
        }
      >
        <View
          style={
            styles.modalCard
          }
        >
          <View
            style={
              styles.modalHeader
            }
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={
                  styles.formEyebrow
                }
              >
                REQUEST DETAILS
              </Text>

              <Text
                style={
                  styles.modalTitle
                }
              >
                {request.title ||
                  "Assistance Request"}
              </Text>

              <Text
                style={
                  styles.modalReference
                }
              >
                {request.requestId ||
                  request.id}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,

                {
                  backgroundColor:
                    meta.soft,
                },
              ]}
            >
              <Ionicons
                name={
                  meta.icon
                }
                size={13}
                color={
                  meta.color
                }
              />

              <Text
                style={[
                  styles.statusBadgeText,

                  {
                    color:
                      meta.color,
                  },
                ]}
              >
                {
                  meta.label
                }
              </Text>
            </View>

            <Pressable
              style={
                styles.modalClose
              }
              onPress={
                onClose
              }
            >
              <Ionicons
                name="close"
                size={21}
                color="#475569"
              />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator
            contentContainerStyle={
              styles.modalContent
            }
          >
            <View
              style={
                styles.modalSection
              }
            >
              <Text
                style={
                  styles.modalSectionTitle
                }
              >
                Status Timeline
              </Text>

              <View
                style={
                  styles.timeline
                }
              >
                {timeline.map(
                  (
                    item,
                    index,
                  ) => (
                    <View
                      key={
                        item.label
                      }
                      style={
                        styles.timelineRow
                      }
                    >
                      <View
                        style={
                          styles.timelineRail
                        }
                      >
                        <View
                          style={[
                            styles.timelineDot,

                            item.done &&
                              styles.timelineDotDone,
                          ]}
                        >
                          {item.done
                            ? (
                              <Ionicons
                                name="checkmark"
                                size={
                                  11
                                }
                                color="#FFFFFF"
                              />
                            )
                            : null}
                        </View>

                        {index <
                          timeline.length -
                            1 && (
                          <View
                            style={[
                              styles.timelineLine,

                              item.done &&
                                styles.timelineLineDone,
                            ]}
                          />
                        )}
                      </View>

                      <View
                        style={
                          styles.timelineCopy
                        }
                      >
                        <Text
                          style={[
                            styles.timelineTitle,

                            item.active &&
                              styles.timelineTitleActive,
                          ]}
                        >
                          {
                            item.label
                          }
                        </Text>

                        {index ===
                        0 ? (
                          <Text
                            style={
                              styles.timelineMeta
                            }
                          >
                            {formatDate(
                              request.createdAt,
                            )}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ),
                )}
              </View>
            </View>

            <View
              style={
                styles.modalSection
              }
            >
              <Text
                style={
                  styles.modalSectionTitle
                }
              >
                Request Information
              </Text>

              <ReviewRow
                label="Category"
                value={
                  request.categoryLabel ||
                  config?.label ||
                  "—"
                }
              />

              <ReviewRow
                label="Title"
                value={
                  request.title ||
                  "—"
                }
              />

              <ReviewRow
                label="Estimated Amount"
                value={
                  Number(
                    request.estimatedAmount ||
                      0,
                  ) > 0
                    ? formatMoney(
                        request.estimatedAmount,
                      )
                    : "Not specified"
                }
              />

              <ReviewRow
                label="Current Situation"
                value={
                  request.currentSituation ||
                  "—"
                }
              />

              <ReviewRow
                label="Description"
                value={
                  request.description ||
                  "—"
                }
                multiline
              />
            </View>

            <View
              style={
                styles.modalSection
              }
            >
              <Text
                style={
                  styles.modalSectionTitle
                }
              >
                Supporting Documents
              </Text>

              {(request.documents ||
                []).length
                ? (
                  <View
                    style={
                      styles.modalDocumentGrid
                    }
                  >
                    {(request.documents ||
                      []).map(
                      (
                        item,
                        index,
                      ) => (
                        <View
                          key={`${item.documentType || "document"}-${index}`}
                          style={
                            styles.modalDocumentCard
                          }
                        >
                          <Ionicons
                            name="document-attach-outline"
                            size={
                              18
                            }
                            color="#1769E0"
                          />

                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={
                                styles.modalDocumentTitle
                              }
                            >
                              {item.label ||
                                "Supporting Document"}
                            </Text>

                            <Text
                              style={
                                styles.modalDocumentMeta
                              }
                              numberOfLines={
                                1
                              }
                            >
                              {item.fileName ||
                                "Uploaded evidence"}
                            </Text>
                          </View>
                        </View>
                      ),
                    )}
                  </View>
                )
                : (
                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    No documents
                    listed.
                  </Text>
                )}
            </View>

            <View
              style={
                styles.modalSection
              }
            >
              <View
                style={
                  styles.assignedLocationHeader
                }
              >
                <View
                  style={
                    styles.assignedLocationIcon
                  }
                >
                  <Ionicons
                    name="location-outline"
                    size={20}
                    color="#1769E0"
                  />
                </View>

                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={
                      styles.modalSectionTitle
                    }
                  >
                    LGU-Assigned
                    Service / Receiving
                    Location
                  </Text>

                  <Text
                    style={
                      styles.assignedLocationHelper
                    }
                  >
                    Only an Admin/LGU-selected
                    location appears here. Your
                    home or live GPS is not
                    published to donors.
                  </Text>
                </View>
              </View>

              {hasAssignedLocation
                ? (
                  <>
                    <Text
                      style={
                        styles.assignedLocationName
                      }
                    >
                      {request.assignedLocationName ||
                        "LGU-Assigned Location"}
                    </Text>

                    <Text
                      style={
                        styles.assignedLocationAddress
                      }
                    >
                      {
                        request.assignedLocationAddress
                      }
                    </Text>

                    {Platform.OS ===
                      "web" &&
                    mapUrl ? (
                      <View
                        style={
                          styles.mapFrame
                        }
                      >
                        {React.createElement(
                          "iframe" as any,
                          {
                            src:
                              mapUrl,

                            title:
                              "LGU assigned assistance location",

                            loading:
                              "lazy",

                            referrerPolicy:
                              "no-referrer-when-downgrade",

                            allowFullScreen:
                              true,

                            style: {
                              width:
                                "100%",

                              height:
                                260,

                              border:
                                0,

                              display:
                                "block",
                            },
                          } as any,
                        )}
                      </View>
                    ) : (
                      <View
                        style={
                          styles.mapFallback
                        }
                      >
                        <Ionicons
                          name="map-outline"
                          size={
                            32
                          }
                          color="#1769E0"
                        />

                        <Text
                          style={
                            styles.mapFallbackText
                          }
                        >
                          {request.assignedLocationAddress ||
                            "LGU-assigned location available."}
                        </Text>
                      </View>
                    )}

                    {!!request.assignedLocationNotes && (
                      <View
                        style={
                          styles.locationNotes
                        }
                      >
                        <Ionicons
                          name="information-circle-outline"
                          size={
                            17
                          }
                          color="#0F766E"
                        />

                        <Text
                          style={
                            styles.locationNotesText
                          }
                        >
                          {
                            request.assignedLocationNotes
                          }
                        </Text>
                      </View>
                    )}
                  </>
                )
                : (
                  <View
                    style={
                      styles.locationPendingCard
                    }
                  >
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color="#64748B"
                    />

                    <Text
                      style={
                        styles.locationPendingText
                      }
                    >
                      No location has
                      been assigned. If
                      the LGU later
                      needs a service,
                      receiving, or
                      coordinated
                      handover point, it
                      will appear here
                      automatically.
                    </Text>
                  </View>
                )}
            </View>

            {!!request.donationCampaignId && (
              <View
                style={
                  styles.campaignLinkCard
                }
              >
                <Ionicons
                  name="heart-outline"
                  size={20}
                  color="#7C3AED"
                />

                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={
                      styles.campaignLinkTitle
                    }
                  >
                    Public Donation
                    Support Opened
                  </Text>

                  <Text
                    style={
                      styles.campaignLinkText
                    }
                  >
                    The LGU verified a
                    remaining shortage
                    and created a public
                    donation campaign
                    linked to this
                    request.
                  </Text>
                </View>
              </View>
            )}

            {request.status ===
              "rejected" &&
              !!request.rejectionReason && (
              <View
                style={
                  styles.rejectionCard
                }
              >
                <Ionicons
                  name="close-circle-outline"
                  size={20}
                  color="#B42318"
                />

                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={
                      styles.rejectionTitle
                    }
                  >
                    LGU Review Result
                  </Text>

                  <Text
                    style={
                      styles.rejectionText
                    }
                  >
                    {
                      request.rejectionReason
                    }
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles =
  StyleSheet.create({
    flex: {
      flex: 1,
    },

    safeArea: {
      flex: 1,
      backgroundColor:
        "#F4F7FB",
    },

    loadingScreen: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        28,
      backgroundColor:
        "#F7F9FC",
    },

    loadingText: {
      marginTop:
        12,
      color:
        "#64748B",
      fontWeight:
        "600",
    },

    gateIcon: {
      width:
        70,
      height:
        70,
      borderRadius:
        22,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EAF2FF",
      marginBottom:
        18,
    },

    gateTitle: {
      fontSize:
        25,
      fontWeight:
        "800",
      color:
        "#172033",
      textAlign:
        "center",
    },

    gateText: {
      maxWidth:
        620,
      marginTop:
        10,
      marginBottom:
        22,
      color:
        "#64748B",
      lineHeight:
        22,
      textAlign:
        "center",
    },

    pageContainer: {
      width:
        "100%",
      maxWidth:
        1480,
      alignSelf:
        "center",
      paddingHorizontal:
        24,
      paddingTop:
        22,
      paddingBottom:
        60,
    },

    hero: {
      minHeight:
        178,
      borderRadius:
        22,
      padding:
        26,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        18,
      overflow:
        "hidden",
    },

    heroIcon: {
      width:
        58,
      height:
        58,
      borderRadius:
        18,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(255,255,255,0.15)",
    },

    heroCopy: {
      flex:
        1,
      maxWidth:
        900,
    },

    heroEyebrow: {
      color:
        "#CFE2FF",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        1.1,
    },

    heroTitle: {
      marginTop:
        6,
      color:
        "#FFFFFF",
      fontSize:
        32,
      fontWeight:
        "900",
    },

    heroSubtitle: {
      marginTop:
        8,
      color:
        "#E6F0FF",
      lineHeight:
        21,
      fontSize:
        14,
      maxWidth:
        820,
    },

    heroVerifiedBadge: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        7,
      backgroundColor:
        "#FFFFFF",
      borderRadius:
        999,
      paddingHorizontal:
        13,
      paddingVertical:
        9,
    },

    heroVerifiedText: {
      color:
        "#0F8A58",
      fontWeight:
        "800",
      fontSize:
        12,
    },

    modeTabs: {
      marginTop:
        16,
      flexDirection:
        "row",
      alignSelf:
        "flex-start",
      padding:
        4,
      gap:
        4,
      borderRadius:
        12,
      backgroundColor:
        "#E8EEF7",
    },

    modeTab: {
      minHeight:
        40,
      paddingHorizontal:
        14,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        7,
      borderRadius:
        9,
    },

    modeTabActive: {
      backgroundColor:
        "#1769E0",
    },

    modeTabText: {
      color:
        "#475569",
      fontWeight:
        "800",
      fontSize:
        13,
    },

    modeTabTextActive: {
      color:
        "#FFFFFF",
    },

    modeCount: {
      minWidth:
        22,
      height:
        22,
      borderRadius:
        11,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#D8E0EC",
    },

    modeCountActive: {
      backgroundColor:
        "rgba(255,255,255,0.2)",
    },

    modeCountText: {
      fontSize:
        11,
      fontWeight:
        "900",
      color:
        "#475569",
    },

    modeCountTextActive: {
      color:
        "#FFFFFF",
    },

    errorCard: {
      marginTop:
        14,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        9,
      padding:
        13,
      borderRadius:
        12,
      borderWidth:
        1,
      borderColor:
        "#F5C2BC",
      backgroundColor:
        "#FFF5F3",
    },

    errorText: {
      flex:
        1,
      color:
        "#B42318",
      lineHeight:
        19,
      fontSize:
        13,
      fontWeight:
        "600",
    },

    infoGrid: {
      marginTop:
        16,
      flexDirection:
        "row",
      gap:
        12,
    },

    infoGridCompact: {
      flexDirection:
        "column",
    },

    infoCard: {
      flex:
        1,
      minHeight:
        116,
      flexDirection:
        "row",
      gap:
        11,
      padding:
        16,
      borderRadius:
        15,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    infoCardIcon: {
      width:
        38,
      height:
        38,
      borderRadius:
        11,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EDF4FF",
    },

    infoCardTitle: {
      color:
        "#172033",
      fontSize:
        13,
      fontWeight:
        "900",
    },

    infoCardText: {
      marginTop:
        5,
      color:
        "#64748B",
      fontSize:
        12,
      lineHeight:
        18,
    },

    emergencyNotice: {
      marginTop:
        16,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        12,
      padding:
        15,
      borderRadius:
        15,
      borderWidth:
        1,
      borderColor:
        "#F2C7C2",
      backgroundColor:
        "#FFF7F6",
    },

    emergencyNoticeIcon: {
      width:
        40,
      height:
        40,
      borderRadius:
        12,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FDECEA",
    },

    emergencyNoticeTitle: {
      color:
        "#7A271A",
      fontWeight:
        "900",
      fontSize:
        13,
    },

    emergencyNoticeText: {
      marginTop:
        3,
      color:
        "#8A463E",
      fontSize:
        12,
      lineHeight:
        18,
    },

    emergencyButton: {
      minHeight:
        38,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        14,
      borderRadius:
        9,
      backgroundColor:
        "#B42318",
    },

    emergencyButtonText: {
      color:
        "#FFFFFF",
      fontWeight:
        "800",
      fontSize:
        12,
    },

    progressCard: {
      marginTop:
        16,
      paddingHorizontal:
        18,
      paddingVertical:
        14,
      borderRadius:
        15,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
      flexDirection:
        "row",
      alignItems:
        "center",
    },

    progressCardCompact: {
      paddingHorizontal:
        10,
    },

    progressItem: {
      alignItems:
        "center",
      minWidth:
        82,
    },

    progressCircle: {
      width:
        30,
      height:
        30,
      borderRadius:
        15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E2E8F0",
    },

    progressCircleActive: {
      backgroundColor:
        "#1769E0",
    },

    progressLabel: {
      marginTop:
        5,
      fontSize:
        11,
      color:
        "#64748B",
      fontWeight:
        "700",
    },

    progressLabelActive: {
      color:
        "#1769E0",
      fontWeight:
        "900",
    },

    progressLine: {
      height:
        2,
      flex:
        1,
      backgroundColor:
        "#E2E8F0",
      marginHorizontal:
        4,
      marginBottom:
        20,
    },

    progressLineDone: {
      backgroundColor:
        "#1769E0",
    },

    formCard: {
      marginTop:
        16,
      padding:
        22,
      borderRadius:
        18,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    formHeading: {
      marginBottom:
        20,
    },

    formEyebrow: {
      color:
        "#1769E0",
      fontSize:
        11,
      fontWeight:
        "900",
      letterSpacing:
        1,
    },

    formTitle: {
      marginTop:
        5,
      color:
        "#172033",
      fontSize:
        23,
      fontWeight:
        "900",
    },

    formText: {
      marginTop:
        6,
      color:
        "#64748B",
      fontSize:
        13,
      lineHeight:
        20,
    },

    categoryGrid: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        12,
    },

    categoryGridCompact: {
      flexDirection:
        "column",
    },

    categoryCard: {
      width:
        "48.8%",
      minHeight:
        110,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        12,
      padding:
        15,
      borderRadius:
        14,
      borderWidth:
        1,
      borderColor:
        "#DFE6EF",
      backgroundColor:
        "#FFFFFF",
    },

    categoryIcon: {
      width:
        46,
      height:
        46,
      borderRadius:
        13,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    categoryTitle: {
      color:
        "#172033",
      fontSize:
        14,
      fontWeight:
        "900",
    },

    categoryText: {
      marginTop:
        4,
      color:
        "#64748B",
      fontSize:
        12,
      lineHeight:
        17,
    },

    fieldLabel: {
      marginTop:
        15,
      marginBottom:
        7,
      color:
        "#334155",
      fontSize:
        12,
      fontWeight:
        "800",
    },

    requiredStar: {
      color:
        "#DC2626",
    },

    input: {
      minHeight:
        46,
      borderRadius:
        10,
      borderWidth:
        1,
      borderColor:
        "#CBD5E1",
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal:
        13,
      color:
        "#172033",
      fontSize:
        13,
    },

    accountContactCard: {
      minHeight:
        58,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        10,
      paddingHorizontal:
        12,
      paddingVertical:
        9,
      borderRadius:
        10,
      borderWidth:
        1,
      borderColor:
        "#BFDBFE",
      backgroundColor:
        "#F8FBFF",
    },

    accountContactCardMissing: {
      borderColor:
        "#FECACA",
      backgroundColor:
        "#FFF7F7",
    },

    accountContactIcon: {
      width:
        34,
      height:
        34,
      borderRadius:
        9,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EEF4FF",
    },

    accountContactCopy: {
      flex:
        1,
      minWidth:
        0,
    },

    accountContactValue: {
      color:
        "#172033",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    accountContactValueMissing: {
      color:
        "#B42318",
    },

    accountContactHelper: {
      marginTop:
        3,
      color:
        "#64748B",
      fontSize:
        10.5,
      lineHeight:
        15,
    },

    readOnlyBadge: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        4,
      paddingHorizontal:
        7,
      paddingVertical:
        5,
      borderRadius:
        999,
      backgroundColor:
        "#EEF2F7",
    },

    readOnlyBadgeText: {
      color:
        "#475569",
      fontSize:
        8.5,
      fontWeight:
        "900",
      letterSpacing:
        0.4,
    },

    textArea: {
      minHeight:
        116,
      paddingTop:
        12,
      paddingBottom:
        12,
    },

    characterCount: {
      marginTop:
        5,
      alignSelf:
        "flex-end",
      color:
        "#94A3B8",
      fontSize:
        11,
    },

    twoColumn: {
      flexDirection:
        "row",
      gap:
        14,
    },

    twoColumnCompact: {
      flexDirection:
        "column",
      gap:
        0,
    },

    flexField: {
      flex:
        1,
    },

    choiceRow: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        10,
    },

    choiceButton: {
      minHeight:
        42,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        7,
      paddingHorizontal:
        13,
      borderRadius:
        10,
      borderWidth:
        1,
      borderColor:
        "#D5DEE9",
      backgroundColor:
        "#FFFFFF",
    },

    choiceButtonSelected: {
      borderColor:
        "#1769E0",
      backgroundColor:
        "#EDF4FF",
    },

    choiceButtonText: {
      color:
        "#475569",
      fontWeight:
        "700",
      fontSize:
        12,
    },

    choiceButtonTextSelected: {
      color:
        "#1458B7",
      fontWeight:
        "900",
    },

    chipWrap: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        8,
    },

    situationChip: {
      minHeight:
        38,
      justifyContent:
        "center",
      paddingHorizontal:
        12,
      borderRadius:
        999,
      borderWidth:
        1,
      borderColor:
        "#D8E0EA",
      backgroundColor:
        "#FFFFFF",
    },

    situationChipActive: {
      borderColor:
        "#1769E0",
      backgroundColor:
        "#EDF4FF",
    },

    situationChipText: {
      color:
        "#64748B",
      fontSize:
        12,
      fontWeight:
        "700",
    },

    situationChipTextActive: {
      color:
        "#1769E0",
      fontWeight:
        "900",
    },

    privateNotice: {
      marginTop:
        18,
      flexDirection:
        "row",
      gap:
        9,
      padding:
        13,
      borderRadius:
        11,
      backgroundColor:
        "#ECF8F5",
    },

    privateNoticeText: {
      flex:
        1,
      color:
        "#356B64",
      fontSize:
        12,
      lineHeight:
        18,
    },

    formActionRow: {
      marginTop:
        24,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap:
        12,
    },

    backButton: {
      minWidth:
        110,
      minHeight:
        44,
      borderRadius:
        10,
      borderWidth:
        1,
      borderColor:
        "#D5DEE9",
      backgroundColor:
        "#F8FAFC",
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        7,
      paddingHorizontal:
        16,
    },

    backButtonText: {
      color:
        "#475569",
      fontWeight:
        "800",
    },

    nextButton: {
      minWidth:
        130,
      minHeight:
        44,
      borderRadius:
        10,
      backgroundColor:
        "#1769E0",
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        7,
      paddingHorizontal:
        18,
    },

    nextButtonText: {
      color:
        "#FFFFFF",
      fontWeight:
        "900",
    },

    documentList: {
      gap:
        11,
    },

    documentRow: {
      flexDirection:
        "row",
      gap:
        12,
      padding:
        15,
      borderRadius:
        13,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FAFCFF",
    },

    documentIcon: {
      width:
        36,
      height:
        36,
      borderRadius:
        10,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EEF4FF",
    },

    documentTitleRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      flexWrap:
        "wrap",
      gap:
        8,
    },

    documentTitle: {
      color:
        "#172033",
      fontWeight:
        "900",
      fontSize:
        13,
    },

    requiredBadge: {
      paddingHorizontal:
        7,
      paddingVertical:
        3,
      borderRadius:
        999,
      backgroundColor:
        "#FDECEC",
      color:
        "#B42318",
      fontSize:
        9,
      fontWeight:
        "900",
    },

    optionalBadge: {
      paddingHorizontal:
        7,
      paddingVertical:
        3,
      borderRadius:
        999,
      backgroundColor:
        "#EEF2F7",
      color:
        "#64748B",
      fontSize:
        9,
      fontWeight:
        "900",
    },

    documentHelper: {
      marginTop:
        4,
      color:
        "#64748B",
      fontSize:
        11,
      lineHeight:
        17,
    },

    uploadButton: {
      marginTop:
        10,
      alignSelf:
        "flex-start",
      minHeight:
        38,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        7,
      paddingHorizontal:
        12,
      borderRadius:
        9,
      borderWidth:
        1,
      borderColor:
        "#BFD3F2",
      backgroundColor:
        "#F4F8FF",
    },

    uploadButtonText: {
      color:
        "#1769E0",
      fontSize:
        11,
      fontWeight:
        "900",
    },

    documentSelected: {
      marginTop:
        10,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        10,
      padding:
        9,
      borderRadius:
        10,
      backgroundColor:
        "#EEF9F2",
    },

    documentPreview: {
      width:
        42,
      height:
        42,
      borderRadius:
        7,
      backgroundColor:
        "#E2E8F0",
    },

    documentFileName: {
      color:
        "#334155",
      fontSize:
        11,
      fontWeight:
        "800",
    },

    documentUploadedText: {
      marginTop:
        2,
      color:
        "#15803D",
      fontSize:
        10,
      fontWeight:
        "700",
    },

    removeDocumentButton: {
      width:
        30,
      height:
        30,
      borderRadius:
        8,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF2F0",
    },

    uploadNote: {
      marginTop:
        14,
      flexDirection:
        "row",
      gap:
        8,
      padding:
        12,
      borderRadius:
        10,
      backgroundColor:
        "#EEF5FF",
    },

    uploadNoteText: {
      flex:
        1,
      color:
        "#506A8B",
      fontSize:
        11,
      lineHeight:
        17,
    },

    reviewGrid: {
      flexDirection:
        "row",
      gap:
        16,
    },

    reviewGridCompact: {
      flexDirection:
        "column",
    },

    reviewMain: {
      flex:
        1.45,
      borderRadius:
        13,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      overflow:
        "hidden",
    },

    reviewSide: {
      flex:
        0.75,
      borderRadius:
        13,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      padding:
        16,
      backgroundColor:
        "#FAFCFF",
    },

    reviewRow: {
      minHeight:
        48,
      flexDirection:
        "row",
      borderBottomWidth:
        1,
      borderBottomColor:
        "#EDF1F5",
    },

    reviewRowMultiline: {
      minHeight:
        90,
    },

    reviewLabel: {
      width:
        160,
      padding:
        13,
      color:
        "#64748B",
      fontSize:
        11,
      fontWeight:
        "800",
      backgroundColor:
        "#F8FAFC",
    },

    reviewValue: {
      flex:
        1,
      padding:
        13,
      color:
        "#27364B",
      fontSize:
        12,
      lineHeight:
        18,
      fontWeight:
        "600",
    },

    reviewSideTitle: {
      color:
        "#172033",
      fontSize:
        13,
      fontWeight:
        "900",
    },

    reviewSideCount: {
      marginTop:
        3,
      marginBottom:
        11,
      color:
        "#64748B",
      fontSize:
        11,
    },

    reviewDocumentLine: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        7,
      marginTop:
        8,
    },

    reviewDocumentText: {
      flex:
        1,
      color:
        "#475569",
      fontSize:
        11,
      lineHeight:
        16,
    },

    lguLocationReview: {
      marginTop:
        16,
      paddingTop:
        14,
      borderTopWidth:
        1,
      borderTopColor:
        "#E2E8F0",
      flexDirection:
        "row",
      gap:
        9,
    },

    lguLocationReviewTitle: {
      color:
        "#1769E0",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    lguLocationReviewText: {
      marginTop:
        3,
      color:
        "#64748B",
      fontSize:
        11,
      lineHeight:
        17,
    },

    declarationCard: {
      marginTop:
        16,
      padding:
        13,
      borderRadius:
        11,
      flexDirection:
        "row",
      gap:
        9,
      backgroundColor:
        "#ECF8F5",
    },

    declarationText: {
      flex:
        1,
      color:
        "#356B64",
      fontSize:
        11,
      lineHeight:
        18,
    },

    submitButton: {
      minWidth:
        200,
      minHeight:
        46,
      borderRadius:
        10,
      backgroundColor:
        "#1769E0",
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap:
        8,
      paddingHorizontal:
        18,
    },

    submitButtonText: {
      color:
        "#FFFFFF",
      fontWeight:
        "900",
      fontSize:
        13,
    },

    disabledButton: {
      opacity:
        0.65,
    },

    primaryButton: {
      minHeight:
        46,
      borderRadius:
        10,
      backgroundColor:
        "#1769E0",
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        20,
    },

    primaryButtonText: {
      color:
        "#FFFFFF",
      fontWeight:
        "900",
    },

    secondaryButton: {
      marginTop:
        10,
      minHeight:
        46,
      borderRadius:
        10,
      borderWidth:
        1,
      borderColor:
        "#CBD5E1",
      backgroundColor:
        "#FFFFFF",
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal:
        20,
    },

    secondaryButtonText: {
      color:
        "#475569",
      fontWeight:
        "800",
    },

    successPage: {
      flex:
        1,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        30,
      backgroundColor:
        "#F7F9FC",
    },

    successIcon: {
      width:
        82,
      height:
        82,
      borderRadius:
        41,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#18A66A",
      marginBottom:
        18,
    },

    successTitle: {
      color:
        "#172033",
      fontSize:
        27,
      fontWeight:
        "900",
      textAlign:
        "center",
    },

    successText: {
      marginTop:
        9,
      maxWidth:
        700,
      color:
        "#64748B",
      lineHeight:
        21,
      textAlign:
        "center",
    },

    successReferenceCard: {
      marginVertical:
        20,
      minWidth:
        460,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-around",
      gap:
        20,
      padding:
        18,
      borderRadius:
        14,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    successDivider: {
      width:
        1,
      height:
        42,
      backgroundColor:
        "#E2E8F0",
    },

    miniLabel: {
      color:
        "#94A3B8",
      fontSize:
        9,
      fontWeight:
        "900",
      letterSpacing:
        0.8,
    },

    successReference: {
      marginTop:
        4,
      color:
        "#27364B",
      fontSize:
        13,
      fontWeight:
        "900",
    },

    historyCard: {
      marginTop:
        16,
      padding:
        22,
      borderRadius:
        18,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    historyHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        14,
    },

    historyTitle: {
      marginTop:
        5,
      color:
        "#172033",
      fontSize:
        23,
      fontWeight:
        "900",
    },

    historySubtitle: {
      marginTop:
        5,
      color:
        "#64748B",
      fontSize:
        12,
      lineHeight:
        18,
      maxWidth:
        760,
    },

    newRequestButton: {
      minHeight:
        40,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        6,
      paddingHorizontal:
        13,
      borderRadius:
        9,
      backgroundColor:
        "#1769E0",
    },

    newRequestButtonText: {
      color:
        "#FFFFFF",
      fontWeight:
        "900",
      fontSize:
        12,
    },

    historySummaryRow: {
      marginTop:
        16,
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap:
        8,
    },

    summaryPill: {
      minWidth:
        118,
      paddingHorizontal:
        12,
      paddingVertical:
        10,
      borderRadius:
        10,
      backgroundColor:
        "#F3F6FA",
    },

    summaryPillValue: {
      color:
        "#1769E0",
      fontSize:
        17,
      fontWeight:
        "900",
    },

    summaryPillLabel: {
      marginTop:
        2,
      color:
        "#64748B",
      fontSize:
        10,
      fontWeight:
        "700",
    },

    requestList: {
      marginTop:
        16,
      gap:
        9,
    },

    requestCard: {
      minHeight:
        84,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        12,
      padding:
        13,
      borderRadius:
        13,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    requestCardIcon: {
      width:
        46,
      height:
        46,
      borderRadius:
        13,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    requestCardId: {
      color:
        "#94A3B8",
      fontSize:
        9,
      fontWeight:
        "900",
    },

    requestCardTitle: {
      marginTop:
        2,
      color:
        "#27364B",
      fontSize:
        13,
      fontWeight:
        "900",
    },

    requestCardMeta: {
      marginTop:
        3,
      color:
        "#64748B",
      fontSize:
        10,
    },

    statusBadge: {
      minHeight:
        29,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        5,
      paddingHorizontal:
        9,
      borderRadius:
        999,
    },

    statusBadgeText: {
      fontSize:
        10,
      fontWeight:
        "900",
    },

    emptyState: {
      minHeight:
        220,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        30,
    },

    emptyTitle: {
      marginTop:
        10,
      color:
        "#334155",
      fontSize:
        15,
      fontWeight:
        "900",
    },

    emptyText: {
      marginTop:
        5,
      color:
        "#64748B",
      textAlign:
        "center",
      fontSize:
        12,
      lineHeight:
        18,
    },

    modalOverlay: {
      flex:
        1,
      padding:
        24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(15, 23, 42, 0.48)",
    },

    modalCard: {
      width:
        "100%",
      maxWidth:
        940,
      maxHeight:
        "92%",
      borderRadius:
        20,
      overflow:
        "hidden",
      backgroundColor:
        "#FFFFFF",
    },

    modalHeader: {
      minHeight:
        92,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        12,
      paddingHorizontal:
        20,
      paddingVertical:
        16,
      borderBottomWidth:
        1,
      borderBottomColor:
        "#E2E8F0",
    },

    modalTitle: {
      marginTop:
        4,
      color:
        "#172033",
      fontSize:
        19,
      fontWeight:
        "900",
    },

    modalReference: {
      marginTop:
        3,
      color:
        "#64748B",
      fontSize:
        10,
      fontWeight:
        "700",
    },

    modalClose: {
      width:
        36,
      height:
        36,
      borderRadius:
        10,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
    },

    modalContent: {
      padding:
        20,
      gap:
        14,
    },

    modalSection: {
      borderRadius:
        14,
      borderWidth:
        1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
      padding:
        16,
    },

    modalSectionTitle: {
      color:
        "#172033",
      fontSize:
        13,
      fontWeight:
        "900",
    },

    timeline: {
      marginTop:
        14,
    },

    timelineRow: {
      flexDirection:
        "row",
      minHeight:
        58,
    },

    timelineRail: {
      width:
        30,
      alignItems:
        "center",
    },

    timelineDot: {
      width:
        20,
      height:
        20,
      borderRadius:
        10,
      borderWidth:
        2,
      borderColor:
        "#CBD5E1",
      backgroundColor:
        "#FFFFFF",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    timelineDotDone: {
      borderColor:
        "#1769E0",
      backgroundColor:
        "#1769E0",
    },

    timelineLine: {
      width:
        2,
      flex:
        1,
      backgroundColor:
        "#E2E8F0",
    },

    timelineLineDone: {
      backgroundColor:
        "#9BC0F4",
    },

    timelineCopy: {
      flex:
        1,
      paddingLeft:
        6,
    },

    timelineTitle: {
      color:
        "#64748B",
      fontSize:
        12,
      fontWeight:
        "800",
    },

    timelineTitleActive: {
      color:
        "#1769E0",
    },

    timelineMeta: {
      marginTop:
        3,
      color:
        "#94A3B8",
      fontSize:
        10,
    },

    modalDocumentGrid: {
      marginTop:
        10,
      gap:
        8,
    },

    modalDocumentCard: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap:
        9,
      padding:
        10,
      borderRadius:
        10,
      backgroundColor:
        "#F7F9FC",
    },

    modalDocumentTitle: {
      color:
        "#334155",
      fontSize:
        11,
      fontWeight:
        "800",
    },

    modalDocumentMeta: {
      marginTop:
        2,
      color:
        "#94A3B8",
      fontSize:
        9,
    },

    assignedLocationHeader: {
      flexDirection:
        "row",
      gap:
        10,
    },

    assignedLocationIcon: {
      width:
        38,
      height:
        38,
      borderRadius:
        11,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EDF4FF",
    },

    assignedLocationHelper: {
      marginTop:
        3,
      color:
        "#64748B",
      fontSize:
        10,
      lineHeight:
        16,
    },

    assignedLocationName: {
      marginTop:
        14,
      color:
        "#172033",
      fontSize:
        15,
      fontWeight:
        "900",
    },

    assignedLocationAddress: {
      marginTop:
        4,
      color:
        "#64748B",
      fontSize:
        11,
    },

    mapFrame: {
      marginTop:
        12,
      borderRadius:
        12,
      overflow:
        "hidden",
      borderWidth:
        1,
      borderColor:
        "#DCE4EE",
      backgroundColor:
        "#E2E8F0",
    },

    mapFallback: {
      marginTop:
        12,
      minHeight:
        130,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding:
        20,
      borderRadius:
        12,
      backgroundColor:
        "#F1F5F9",
    },

    mapFallbackText: {
      marginTop:
        8,
      color:
        "#64748B",
      textAlign:
        "center",
      fontSize:
        11,
    },

    locationNotes: {
      marginTop:
        10,
      flexDirection:
        "row",
      gap:
        8,
      padding:
        10,
      borderRadius:
        9,
      backgroundColor:
        "#ECF8F5",
    },

    locationNotesText: {
      flex:
        1,
      color:
        "#356B64",
      fontSize:
        11,
      lineHeight:
        16,
    },

    locationPendingCard: {
      marginTop:
        12,
      flexDirection:
        "row",
      gap:
        9,
      padding:
        12,
      borderRadius:
        10,
      backgroundColor:
        "#F1F5F9",
    },

    locationPendingText: {
      flex:
        1,
      color:
        "#64748B",
      fontSize:
        11,
      lineHeight:
        17,
    },

    campaignLinkCard: {
      flexDirection:
        "row",
      gap:
        10,
      padding:
        14,
      borderRadius:
        12,
      borderWidth:
        1,
      borderColor:
        "#DDD0FF",
      backgroundColor:
        "#F7F3FF",
    },

    campaignLinkTitle: {
      color:
        "#6D28D9",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    campaignLinkText: {
      marginTop:
        3,
      color:
        "#6B5B82",
      fontSize:
        11,
      lineHeight:
        17,
    },

    rejectionCard: {
      flexDirection:
        "row",
      gap:
        10,
      padding:
        14,
      borderRadius:
        12,
      borderWidth:
        1,
      borderColor:
        "#F3C1BB",
      backgroundColor:
        "#FFF5F3",
    },

    rejectionTitle: {
      color:
        "#B42318",
      fontSize:
        12,
      fontWeight:
        "900",
    },

    rejectionText: {
      marginTop:
        3,
      color:
        "#8A463E",
      fontSize:
        11,
      lineHeight:
        17,
    },
  });