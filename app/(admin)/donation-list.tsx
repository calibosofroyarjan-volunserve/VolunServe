import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type NeedAssessmentStatus =
  | "verified"
  | "partially_allocated"
  | "fulfilled"
  | "closed"
  | string;

type NeedAssessment = {
  id: string;
  assessmentId?: string;
  barangay?: string;
  sourceCaseId?: string;
  affectedHouseholds?: number;
  affectedPeople?: number;
  peopleNeedingFood?: number;
  peopleNeedingWater?: number;
  peopleNeedingClothing?: number;
  peopleNeedingMedical?: number;
  householdsNeedingShelter?: number;
  householdsNeedingHygiene?: number;
  otherNeedDescription?: string;
  status?: NeedAssessmentStatus;
  createdAt?: any;
  updatedAt?: any;
};

type CampaignStatus = "published" | "closed" | string;
type DonationType = "monetary" | "in_kind";
type CampaignGroup = "disaster_affected" | "community_needs_help";
type CampaignSourceType = "disaster_relief_need" | "community_assistance_request";

type PublicNeed = {
  category: string;
  label: string;
  needed?: number;
  unit?: string;
};

type SourceCaseAttachment = {
  url?: string;
  type?: string;
  contentType?: string;
  name?: string;
};

type SourceCase = {
  id: string;
  category?: string;
  severity?: string;
  details?: string;
  attachments?: SourceCaseAttachment[];
};

type AssistanceCampaignSource = {
  id: string;
  requestId?: string;
  requesterBarangay?: string;
  category?: string;
  categoryLabel?: string;
  title?: string;
  description?: string;
  preferredAssistanceTypes?: string[];
  verificationStatus?: string;
  supportDecision?: string;
  remainingAmount?: number;
  donationCampaignId?: string;
  assignedLocationType?: string;
  assignedLocationName?: string;
  assignedLocationAddress?: string;
  assignedLocationNotes?: string;
  status?: string;
};

type DonationCampaign = {
  id: string;
  campaignId?: string;
  title?: string;
  description?: string;
  status?: CampaignStatus;
  sourceNeedAssessmentIds?: string[];
  sourceAssistanceRequestId?: string;
  barangays?: string[];
  acceptedDonationTypes?: DonationType[];
  acceptedCategories?: string[];
  officialChannelLabel?: string;
  officialChannelInstructions?: string;
  inKindInstructions?: string;
  publicStory?: string;
  publicLocationLabel?: string;
  publicIncidentType?: string;
  publicSeverity?: string;
  publicPhotoUrls?: string[];
  affectedHouseholds?: number;
  affectedPeople?: number;
  publicNeeds?: PublicNeed[];

  // Public campaign classification. Disaster campaigns come from Relief
  // Operations; Community campaigns come from a final LGU-verified Request
  // Assistance source with Donation Support Needed.
  campaignGroup?: CampaignGroup | string;
  campaignCategory?: string;
  beneficiaryType?: string;
  generalArea?: string;
  sourceType?: CampaignSourceType | string;

  // Public monetary progress. verifiedAmountReceived must only increase after
  // the LGU/backend confirms an actual successful monetary receipt.
  monetaryGoal?: number;
  verifiedAmountReceived?: number;

  // Controlled donation handoff / receiving fields.
  handoffMode?: HandoffMode;
  handoffLocationType?: HandoffLocationType;
  handoffLocationName?: string;
  handoffAddress?: string;
  handoffNotes?: string;
  createdAt?: any;
  updatedAt?: any;
};

type DonationSubmission = {
  id: string;
  campaignId?: string;
  campaignTitle?: string;
  campaignBarangays?: string[];
  donorUid?: string;
  donorName?: string;
  donorDisplayName?: string;
  donationType?: DonationType | string;
  category?: string;
  itemName?: string;
  unit?: string;
  quantityPledged?: number;
  amount?: number;
  transactionReference?: string;
  donorNote?: string;
  proofUrls?: string[];
  status?: "submitted" | "received" | "rejected" | string;
  actualQuantityReceived?: number;
  actualAmountReceived?: number;
  officialReceiptReference?: string;
  rejectionReason?: string;
  createdAt?: any;
  receivedAt?: any;
  rejectedAt?: any;
};

type VerificationForm = {
  actualValue: string;
  officialReceiptReference: string;
  rejectionReason: string;
};

type AdminDonationView = "campaigns" | "verification";

type SelectOption = {
  value: string;
  label: string;
  helper?: string;
};

type HandoffMode = "receiving_point" | "coordinated_handover" | "both";
type HandoffLocationType =
  | "barangay_relief_desk"
  | "evacuation_center"
  | "lgu_relief_center"
  | "city_hall"
  | "hospital_social_service"
  | "veterinary_clinic"
  | "social_welfare_office"
  | "animal_shelter"
  | "approved_public_meeting"
  | "other";

const HANDOFF_MODE_OPTIONS: SelectOption[] = [
  {
    value: "receiving_point",
    label: "Barangay / LGU Receiving Point",
    helper: "Donor sends or drops off goods at an authorized receiving point.",
  },
  {
    value: "coordinated_handover",
    label: "Coordinated Beneficiary Handover",
    helper: "LGU may arrange a meeting at an authorized public location when the beneficiary agrees.",
  },
  {
    value: "both",
    label: "Both",
    helper: "Allow LGU receiving and, when approved, a coordinated public handover.",
  },
];

const HANDOFF_LOCATION_TYPE_OPTIONS: SelectOption[] = [
  { value: "barangay_relief_desk", label: "Barangay Hall / Relief Desk" },
  { value: "evacuation_center", label: "Authorized Evacuation Center" },
  { value: "lgu_relief_center", label: "LGU Relief Operations Center" },
  { value: "city_hall", label: "City Hall Receiving Area" },
  { value: "hospital_social_service", label: "Hospital / Medical Social Service Office" },
  { value: "veterinary_clinic", label: "Veterinary Clinic / Animal Care Partner" },
  { value: "social_welfare_office", label: "Social Welfare / Assistance Office" },
  { value: "animal_shelter", label: "Animal Shelter / Rescue Receiving Point" },
  { value: "approved_public_meeting", label: "LGU-Approved Public Meeting Point" },
  { value: "other", label: "Other Authorized Public Location" },
];

const NEED_CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  water: "Water",
  hygiene: "Hygiene",
  clothing: "Clothing",
  shelter: "Shelter",
  medical: "Medical",
  other: "Other",
};

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

const money = (value: number) =>
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

  if (!decimalParts.length) return safeWhole;
  return `${safeWhole}.${decimal}`;
};

const SECURE_DONATION_BACKEND = "https://volunserve.onrender.com";
const CLOUDINARY_CLOUD_NAME = "netjawtz";
const CLOUDINARY_UPLOAD_PRESET = "volunserve_evidence";
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const MAX_PUBLIC_CAMPAIGN_PHOTO_BYTES = 10 * 1024 * 1024;

const normalizeCategoryLabel = (value?: string) =>
  String(value || "Community Assistance")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const assistanceSourceIsEligible = (source?: AssistanceCampaignSource | null) =>
  !!source &&
  String(source.verificationStatus || "") === "verified" &&
  String(source.supportDecision || "") === "donation_support" &&
  Number(source.remainingAmount || 0) > 0;

const communityGeneralArea = (source?: AssistanceCampaignSource | null) => {
  const barangay = String(source?.requesterBarangay || "").trim();
  if (!barangay) return "City of San Jose del Monte, Bulacan";
  if (barangay.toLowerCase().includes("san jose del monte")) return barangay;
  return `${barangay}, City of San Jose del Monte, Bulacan`;
};

const defaultCommunityCampaignTitle = (source?: AssistanceCampaignSource | null) => {
  const label = String(source?.categoryLabel || source?.category || "Community Assistance").trim();
  return `${normalizeCategoryLabel(label)} Support`;
};

const defaultCommunityCampaignDescription = (source?: AssistanceCampaignSource | null) => {
  const label = normalizeCategoryLabel(source?.categoryLabel || source?.category);
  const area = communityGeneralArea(source);
  return `Support an LGU-verified ${label.toLowerCase()} need in ${area}. The beneficiary's identity, exact home address, contact details, and private supporting records are not published.`;
};

const defaultCommunityPublicStory = (source?: AssistanceCampaignSource | null) => {
  const label = normalizeCategoryLabel(source?.categoryLabel || source?.category);
  const area = communityGeneralArea(source);
  return `The LGU verified a legitimate ${label.toLowerCase()} need in ${area} and confirmed that available LGU or partner resources cannot fully cover the remaining requirement. Public support is limited to the verified shortage, while beneficiary identity and private case information remain protected.`;
};

const mapAssistanceLocationType = (value?: string): HandoffLocationType => {
  const normalized = String(value || "").trim().toLowerCase();
  const mapping: Record<string, HandoffLocationType> = {
    barangay_hall: "barangay_relief_desk",
    lgu_office: "city_hall",
    hospital_social_service: "hospital_social_service",
    social_welfare_office: "social_welfare_office",
    vet_clinic: "veterinary_clinic",
    authorized_public_point: "other",
  };
  return mapping[normalized] || "other";
};

const campaignGroupLabel = (campaign?: DonationCampaign) =>
  String(campaign?.campaignGroup || "") === "community_needs_help"
    ? "Community Need Donation Support"
    : "Disaster Need Donation Support";

const campaignCategoryLabel = (campaign?: DonationCampaign) => {
  const raw = String(campaign?.campaignCategory || "").trim();
  if (!raw) return "Verified Support";
  return raw
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const categoriesFromAssessment = (assessment?: NeedAssessment) => {
  if (!assessment) return [] as string[];

  const categories: string[] = [];
  if (Number(assessment.peopleNeedingFood || 0) > 0) categories.push("food");
  if (Number(assessment.peopleNeedingWater || 0) > 0) categories.push("water");
  if (Number(assessment.householdsNeedingHygiene || 0) > 0) {
    categories.push("hygiene");
  }
  if (Number(assessment.peopleNeedingClothing || 0) > 0) {
    categories.push("clothing");
  }
  if (Number(assessment.householdsNeedingShelter || 0) > 0) {
    categories.push("shelter");
  }
  if (Number(assessment.peopleNeedingMedical || 0) > 0) {
    categories.push("medical");
  }
  if (String(assessment.otherNeedDescription || "").trim()) categories.push("other");

  return Array.from(new Set(categories));
};

const statusLabel = (value?: string) =>
  String(value || "unknown").replaceAll("_", " ").toUpperCase();

const assessmentIsActive = (assessment?: NeedAssessment) =>
  !!assessment &&
  ["verified", "partially_allocated"].includes(String(assessment.status || ""));

const reliefScopeLabel = (assessment?: NeedAssessment) => {
  const households = Number(assessment?.affectedHouseholds || 0);
  if (households === 1) return "Household Relief";
  if (households > 1) return "Community Relief";
  return "Relief Need";
};

const defaultCampaignTitle = (assessment?: NeedAssessment) => {
  const barangay = String(assessment?.barangay || "Affected Area").trim() || "Affected Area";
  return `${reliefScopeLabel(assessment)} Support — ${barangay}`;
};

const defaultCampaignDescription = (assessment?: NeedAssessment) => {
  const barangay = String(assessment?.barangay || "the affected area").trim() || "the affected area";
  const households = Number(assessment?.affectedHouseholds || 0);

  if (households === 1) {
    return `Support a verified household relief need in ${barangay} where LGU resources are currently insufficient. Beneficiary identity and private case details are not shown publicly.`;
  }

  return `Support LGU-verified relief needs affecting multiple households in ${barangay} where available LGU resources are currently insufficient.`;
};

const severityPublicLabel = (value?: string) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "low") return "Standard";
  if (normalized === "medium") return "Urgent";
  if (normalized === "high") return "High";
  if (normalized === "critical") return "Critical";
  return normalized ? normalized.replaceAll("_", " ") : "LGU assessed";
};

const defaultPublicLocation = (assessment?: NeedAssessment) => {
  const barangay = String(assessment?.barangay || "").trim();
  return barangay
    ? `${barangay}, San Jose del Monte, Bulacan`
    : "San Jose del Monte, Bulacan";
};

const handoffModeLabel = (value?: string) =>
  HANDOFF_MODE_OPTIONS.find((item) => item.value === value)?.label || "Barangay / LGU Receiving Point";

const handoffLocationTypeLabel = (value?: string) =>
  HANDOFF_LOCATION_TYPE_OPTIONS.find((item) => item.value === value)?.label || "Authorized Public Location";

const authorizedLocationOptions = (
  assessment?: NeedAssessment,
  locationType?: HandoffLocationType | "",
): SelectOption[] => {
  const barangay = String(assessment?.barangay || "Selected Barangay").trim() || "Selected Barangay";

  if (locationType === "barangay_relief_desk") {
    return [
      {
        value: `${barangay} Barangay Hall - Relief Receiving Desk`,
        label: `${barangay} Barangay Hall - Relief Receiving Desk`,
        helper: "Barangay-level receiving point. Confirm the exact public address before publishing.",
      },
      {
        value: `${barangay} Barangay Relief Desk`,
        label: `${barangay} Barangay Relief Desk`,
        helper: "Use only when this is an authorized public receiving point.",
      },
    ];
  }

  if (locationType === "evacuation_center") {
    return [
      {
        value: "Authorized Evacuation Center Receiving Desk",
        label: "Authorized Evacuation Center Receiving Desk",
        helper: "Select this only when the LGU has designated an evacuation center to receive goods.",
      },
    ];
  }

  if (locationType === "lgu_relief_center") {
    return [
      {
        value: "LGU Relief Operations Center",
        label: "LGU Relief Operations Center",
        helper: "Central LGU relief receiving and verification point.",
      },
    ];
  }

  if (locationType === "city_hall") {
    return [
      {
        value: "City Hall Relief Receiving Area",
        label: "City Hall Relief Receiving Area",
        helper: "Use the authorized City Hall receiving desk or relief area.",
      },
    ];
  }

  if (locationType === "hospital_social_service") {
    return [
      {
        value: "__custom__",
        label: "Hospital / Medical Social Service Office",
        helper: "Enter the exact LGU-approved hospital or medical assistance office and its public address.",
      },
    ];
  }

  if (locationType === "veterinary_clinic") {
    return [
      {
        value: "__custom__",
        label: "Veterinary Clinic / Animal Care Partner",
        helper: "Enter the exact verified veterinary clinic or animal-care partner selected by the LGU.",
      },
    ];
  }

  if (locationType === "social_welfare_office") {
    return [
      {
        value: "__custom__",
        label: "Social Welfare / Assistance Office",
        helper: "Enter the authorized public social-welfare or assistance receiving point.",
      },
    ];
  }

  if (locationType === "animal_shelter") {
    return [
      {
        value: "__custom__",
        label: "Animal Shelter / Rescue Receiving Point",
        helper: "Enter the approved shelter, rescue center, or animal-welfare receiving location.",
      },
    ];
  }

  if (locationType === "approved_public_meeting") {
    return [
      {
        value: "__custom__",
        label: "LGU-Approved Public Meeting Point",
        helper: "Use only a safe public meeting point approved by the LGU. Never use a beneficiary home address.",
      },
    ];
  }

  if (locationType === "other") {
    return [
      {
        value: "__custom__",
        label: "Other Authorized Public Location",
        helper: "Enter the approved location name and public delivery address below.",
      },
    ];
  }

  return [];
};

const handoffMapUrl = (name: string, address: string) => {
  const query = [name.trim(), address.trim()].filter(Boolean).join(", ");
  return query
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
    : "";
};

const defaultPublicStory = (assessment?: NeedAssessment, sourceCase?: SourceCase | null) => {
  const barangay = String(assessment?.barangay || "the affected area").trim() || "the affected area";
  const households = Math.max(0, Number(assessment?.affectedHouseholds || 0));
  const incident = String(sourceCase?.category || "").trim();

  const subject =
    households === 1
      ? `A verified household in ${barangay}`
      : `${households || "Multiple"} verified households in ${barangay}`;

  const incidentText = incident ? ` were affected by ${incident.toLowerCase()}` : " have a verified relief need";

  return `${subject}${incidentText}. The LGU confirmed the remaining material needs and found that available resources cannot fully cover the shortage. Public support is being requested only for the verified remaining needs, while beneficiary identity and exact private location remain protected.`;
};

const publicNeedsFromAssessment = (assessment?: NeedAssessment): PublicNeed[] => {
  if (!assessment) return [];

  const rows: PublicNeed[] = [];
  const push = (category: string, label: string, needed: number, unit: string) => {
    if (needed > 0) rows.push({ category, label, needed, unit });
  };

  push("food", "Food support", Number(assessment.peopleNeedingFood || 0), "people");
  push("water", "Drinking water", Number(assessment.peopleNeedingWater || 0), "people");
  push("clothing", "Clothing", Number(assessment.peopleNeedingClothing || 0), "people");
  push("medical", "Medical support", Number(assessment.peopleNeedingMedical || 0), "people");
  push("shelter", "Temporary shelter", Number(assessment.householdsNeedingShelter || 0), "households");
  push("hygiene", "Hygiene kits", Number(assessment.householdsNeedingHygiene || 0), "households");

  const other = String(assessment.otherNeedDescription || "").trim();
  if (other) rows.push({ category: "other", label: other.slice(0, 160) });

  return rows.slice(0, 7);
};

const publicPhotoCandidates = (sourceCase?: SourceCase | null) => {
  if (!sourceCase || !Array.isArray(sourceCase.attachments)) return [] as string[];

  return Array.from(
    new Set(
      sourceCase.attachments
        .filter((item) => {
          const type = String(item?.type || "").toLowerCase();
          const contentType = String(item?.contentType || "").toLowerCase();
          return type === "image" || contentType.startsWith("image/");
        })
        .map((item) => String(item?.url || "").trim())
        .filter((url) => url.startsWith("https://")),
    ),
  ).slice(0, 8);
};

const validProofUrls = (value?: string[]) =>
  Array.isArray(value)
    ? value.filter(
        (item) =>
          typeof item === "string" &&
          item.trim().startsWith("https://"),
      )
    : [];

const normalizeReference = (value?: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const summarizeVerifiedGoods = (items: DonationSubmission[]) => {
  const groups = new Map<
    string,
    {
      label: string;
      unit: string;
      quantity: number;
    }
  >();

  items
    .filter(
      (item) =>
        item.status === "received" &&
        item.donationType === "in_kind" &&
        Number(item.actualQuantityReceived || 0) > 0,
    )
    .forEach((item) => {
      const label =
        String(item.itemName || "").trim() ||
        NEED_CATEGORY_LABELS[String(item.category || "other")] ||
        "Relief item";
      const unit = String(item.unit || "unit").trim() || "unit";
      const key = `${label.toLowerCase()}|${unit.toLowerCase()}`;
      const current = groups.get(key);

      groups.set(key, {
        label,
        unit,
        quantity:
          Number(current?.quantity || 0) +
          Number(item.actualQuantityReceived || 0),
      });
    });

  const rows = Array.from(groups.values());

  if (!rows.length) return "None verified yet";

  const visible = rows
    .slice(0, 4)
    .map(
      (item) =>
        `${item.quantity} ${item.unit} ${item.label}`,
    )
    .join(" · ");

  return rows.length > 4
    ? `${visible} · +${rows.length - 4} more`
    : visible;
};

export default function DonationAdministration() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    assessmentId?: string | string[];
    assistanceRequestId?: string | string[];
  }>();
  const requestedAssessmentId = Array.isArray(params.assessmentId)
    ? params.assessmentId[0]
    : params.assessmentId || "";
  const requestedAssistanceRequestId = Array.isArray(params.assistanceRequestId)
    ? params.assistanceRequestId[0]
    : params.assistanceRequestId || "";
  const openedFromRelief = Boolean(String(requestedAssessmentId || "").trim());
  const openedFromAssistance = Boolean(
    String(requestedAssistanceRequestId || "").trim(),
  );
  const openedFromVerifiedSource = openedFromRelief || openedFromAssistance;

  const { loading, user, profile } = useUserSession();

  const [activeView, setActiveView] = useState<AdminDonationView>("campaigns");
  const [showReviewedHistory, setShowReviewedHistory] = useState(false);

  const [assessments, setAssessments] = useState<NeedAssessment[]>([]);
  const [campaigns, setCampaigns] = useState<DonationCampaign[]>([]);
  const [donations, setDonations] = useState<DonationSubmission[]>([]);
  const [assistanceSource, setAssistanceSource] =
    useState<AssistanceCampaignSource | null>(null);
  const [assistanceSourceReady, setAssistanceSourceReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const scrollRef = useRef<ScrollView | null>(null);
  const [campaignFormY, setCampaignFormY] = useState(0);
  const [focusCampaignSetup, setFocusCampaignSetup] = useState(false);

  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [assessmentId, setAssessmentId] = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [allowMonetary, setAllowMonetary] = useState(true);
  const [allowInKind, setAllowInKind] = useState(true);
  const [officialChannelLabel, setOfficialChannelLabel] = useState("");
  const [officialChannelInstructions, setOfficialChannelInstructions] = useState("");
  const [monetaryGoal, setMonetaryGoal] = useState("");
  const [inKindInstructions, setInKindInstructions] = useState("");

  const [handoffMode, setHandoffMode] = useState<HandoffMode>("receiving_point");
  const [handoffLocationType, setHandoffLocationType] = useState<HandoffLocationType | "">("");
  const [handoffLocationPreset, setHandoffLocationPreset] = useState("");
  const [handoffLocationName, setHandoffLocationName] = useState("");
  const [handoffAddress, setHandoffAddress] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");

  const [sourceCase, setSourceCase] = useState<SourceCase | null>(null);
  const [sourceCaseLoading, setSourceCaseLoading] = useState(false);
  const [publicStory, setPublicStory] = useState("");
  const [publicLocationLabel, setPublicLocationLabel] = useState("");
  const [publicIncidentType, setPublicIncidentType] = useState("");
  const [publicSeverity, setPublicSeverity] = useState("");
  const [selectedPublicPhotoUrls, setSelectedPublicPhotoUrls] = useState<string[]>([]);
  const [publicPhotoUploading, setPublicPhotoUploading] = useState(false);
  const [publicPhotoUploadStatus, setPublicPhotoUploadStatus] = useState("");

  const [verificationForms, setVerificationForms] = useState<
    Record<string, VerificationForm>
  >({});

  const isAdmin =
    !!profile && profile.role === "admin" && isApprovedProfile(profile);

  useEffect(() => {
    if (!isAdmin) return;

    let readyCount = 0;
    const markReady = () => {
      readyCount += 1;
      if (readyCount >= 3) setDataReady(true);
    };

    const unsubAssessments = onSnapshot(
      collection(db, "barangayNeedAssessments"),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<NeedAssessment, "id">),
          }))
          .sort(
            (a, b) =>
              (timestampMillis(b.updatedAt) || timestampMillis(b.createdAt)) -
              (timestampMillis(a.updatedAt) || timestampMillis(a.createdAt)),
          );
        setAssessments(rows);
        setError("");
        markReady();
      },
      (problem) => {
        console.log("Donation admin assessments listener failed", problem);
        setError("Unable to load verified relief needs.");
        markReady();
      },
    );

    const unsubCampaigns = onSnapshot(
      collection(db, "donationCampaigns"),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<DonationCampaign, "id">),
          }))
          .sort(
            (a, b) =>
              (timestampMillis(b.updatedAt) || timestampMillis(b.createdAt)) -
              (timestampMillis(a.updatedAt) || timestampMillis(a.createdAt)),
          );
        setCampaigns(rows);
        setError("");
        markReady();
      },
      (problem) => {
        console.log("Donation campaigns listener failed", problem);
        setError("Unable to load donation campaigns.");
        markReady();
      },
    );

    const unsubDonations = onSnapshot(
      collection(db, "donations"),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<DonationSubmission, "id">),
          }))
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
        setDonations(rows);
        setError("");
        markReady();
      },
      (problem) => {
        console.log("Donations listener failed", problem);
        setError("Unable to load donation submissions.");
        markReady();
      },
    );

    return () => {
      unsubAssessments();
      unsubCampaigns();
      unsubDonations();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !openedFromAssistance || !requestedAssistanceRequestId) {
      setAssistanceSource(null);
      setAssistanceSourceReady(!openedFromAssistance);
      return;
    }

    setAssistanceSourceReady(false);

    const unsubscribe = onSnapshot(
      doc(db, "assistanceRequests", requestedAssistanceRequestId),
      (snapshot) => {
        setAssistanceSource(
          snapshot.exists()
            ? ({
                id: snapshot.id,
                ...(snapshot.data() as Omit<AssistanceCampaignSource, "id">),
              } as AssistanceCampaignSource)
            : null,
        );
        setAssistanceSourceReady(true);
      },
      (problem) => {
        console.log("Donation assistance source listener failed", problem);
        setAssistanceSource(null);
        setAssistanceSourceReady(true);
        setError("Unable to load the verified Assistance Request source.");
      },
    );

    return unsubscribe;
  }, [isAdmin, openedFromAssistance, requestedAssistanceRequestId]);

  const requestedAssessment = useMemo(
    () => assessments.find((item) => item.id === requestedAssessmentId),
    [assessments, requestedAssessmentId],
  );

  const communityAssessmentAdapter = useMemo<NeedAssessment | undefined>(() => {
    if (!openedFromAssistance || !assistanceSource) return undefined;

    const category = String(assistanceSource.category || "").toLowerCase();
    const medical = [
      "medical_health",
      "surgery_treatment",
      "cancer_serious_illness",
    ].includes(category);

    return {
      id: assistanceSource.id,
      assessmentId: assistanceSource.id,
      barangay: assistanceSource.requesterBarangay || "San Jose del Monte",
      affectedHouseholds: 1,
      affectedPeople: 1,
      peopleNeedingMedical: medical ? 1 : 0,
      otherNeedDescription: medical
        ? ""
        : normalizeCategoryLabel(
            assistanceSource.categoryLabel || assistanceSource.category,
          ),
      status: assistanceSourceIsEligible(assistanceSource) ? "verified" : "closed",
    };
  }, [openedFromAssistance, assistanceSource]);

  const selectedAssessment = useMemo(
    () =>
      openedFromAssistance
        ? communityAssessmentAdapter
        : assessments.find((item) => item.id === assessmentId),
    [openedFromAssistance, communityAssessmentAdapter, assessments, assessmentId],
  );

  const selectedAssessmentActive = openedFromAssistance
    ? assistanceSourceIsEligible(assistanceSource)
    : assessmentIsActive(selectedAssessment);
  const selectedReliefScope = openedFromAssistance
    ? "Verified Community Assistance"
    : reliefScopeLabel(selectedAssessment);

  const selectedPublishedCampaign = useMemo(
    () =>
      campaigns.find((campaign) => {
        if (campaign.status !== "published") return false;

        if (openedFromAssistance) {
          return (
            String(campaign.sourceAssistanceRequestId || "") ===
            String(requestedAssistanceRequestId || "")
          );
        }

        return (
          Array.isArray(campaign.sourceNeedAssessmentIds) &&
          campaign.sourceNeedAssessmentIds.includes(assessmentId)
        );
      }),
    [
      campaigns,
      openedFromAssistance,
      requestedAssistanceRequestId,
      assessmentId,
    ],
  );

  const selectedNeedBreakdown = useMemo(() => {
    if (openedFromAssistance && assistanceSource) {
      return [
        {
          label: "Verified unmet amount",
          value: Number(assistanceSource.remainingAmount || 0),
          unit: "PHP",
        },
      ].filter((item) => item.value > 0);
    }

    if (!selectedAssessment) return [] as { label: string; value: number; unit: string }[];

    return [
      { label: "Food", value: Number(selectedAssessment.peopleNeedingFood || 0), unit: "people" },
      { label: "Water", value: Number(selectedAssessment.peopleNeedingWater || 0), unit: "people" },
      { label: "Clothing", value: Number(selectedAssessment.peopleNeedingClothing || 0), unit: "people" },
      { label: "Medical", value: Number(selectedAssessment.peopleNeedingMedical || 0), unit: "people" },
      { label: "Shelter", value: Number(selectedAssessment.householdsNeedingShelter || 0), unit: "households" },
      { label: "Hygiene", value: Number(selectedAssessment.householdsNeedingHygiene || 0), unit: "households" },
    ].filter((item) => item.value > 0);
  }, [openedFromAssistance, assistanceSource, selectedAssessment]);

  const selectedPublicNeeds = useMemo(
    () =>
      openedFromAssistance && assistanceSource
        ? [
            {
              category: "other",
              label: `${normalizeCategoryLabel(
                assistanceSource.categoryLabel || assistanceSource.category,
              )} support`,
              needed: Number(assistanceSource.remainingAmount || 0),
              unit: "PHP",
            },
          ]
        : publicNeedsFromAssessment(selectedAssessment),
    [openedFromAssistance, assistanceSource, selectedAssessment],
  );

  const handoffLocationOptions = useMemo(
    () => authorizedLocationOptions(selectedAssessment, handoffLocationType),
    [selectedAssessment, handoffLocationType],
  );

  const handoffMapPreviewUrl = useMemo(
    () => handoffMapUrl(handoffLocationName, handoffAddress),
    [handoffLocationName, handoffAddress],
  );

  const availablePublicPhotos = useMemo(
    () => publicPhotoCandidates(sourceCase),
    [sourceCase],
  );

  const publishedCampaigns = campaigns.filter((item) => item.status === "published");
  const pendingDonations = donations.filter((item) => item.status === "submitted");
  const receivedDonations = donations.filter((item) => item.status === "received");

  const selectedCampaignDonations = selectedPublishedCampaign
    ? donations.filter((item) => item.campaignId === selectedPublishedCampaign.id)
    : [];
  const selectedPendingDonations = selectedCampaignDonations.filter(
    (item) => item.status === "submitted",
  );
  const selectedReceivedDonations = selectedCampaignDonations.filter(
    (item) => item.status === "received",
  );

  const verifiedMonetaryTotal = receivedDonations
    .filter((item) => item.donationType === "monetary")
    .reduce(
      (sum, item) =>
        sum + Number(item.actualAmountReceived || 0),
      0,
    );

  const reviewDonations = useMemo(
    () =>
      [...donations].sort((a, b) => {
        const rank = (status?: string) => {
          if (status === "submitted") return 0;
          if (status === "received") return 1;
          if (status === "rejected") return 2;
          return 3;
        };

        const statusDiff = rank(a.status) - rank(b.status);
        if (statusDiff !== 0) return statusDiff;

        return timestampMillis(b.createdAt) - timestampMillis(a.createdAt);
      }),
    [donations],
  );

  const reviewedDonations = useMemo(
    () => reviewDonations.filter((item) => item.status !== "submitted"),
    [reviewDonations],
  );

  useEffect(() => {
    let cancelled = false;

    const loadSourceCase = async () => {
      const sourceCaseId = String(selectedAssessment?.sourceCaseId || "").trim();

      if (!isAdmin || !sourceCaseId) {
        setSourceCase(null);
        setSourceCaseLoading(false);
        return;
      }

      try {
        setSourceCaseLoading(true);
        const snapshot = await getDoc(doc(db, "disasterCases", sourceCaseId));

        if (cancelled) return;

        if (!snapshot.exists()) {
          setSourceCase(null);
          return;
        }

        setSourceCase({
          id: snapshot.id,
          ...(snapshot.data() as Omit<SourceCase, "id">),
        });
      } catch (problem) {
        console.log("Donation public case preview load failed", problem);
        if (!cancelled) setSourceCase(null);
      } finally {
        if (!cancelled) setSourceCaseLoading(false);
      }
    };

    void loadSourceCase();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedAssessment?.id, selectedAssessment?.sourceCaseId]);

  useEffect(() => {
    if (!selectedAssessment || selectedPublishedCampaign) return;

    if (openedFromAssistance && assistanceSource) {
      setPublicLocationLabel(communityGeneralArea(assistanceSource));
      setPublicIncidentType(
        normalizeCategoryLabel(
          assistanceSource.categoryLabel || assistanceSource.category,
        ).slice(0, 120),
      );
      setPublicSeverity("LGU verified need");
      setPublicStory((current) =>
        current.trim() ? current : defaultCommunityPublicStory(assistanceSource),
      );
      return;
    }

    setPublicLocationLabel((current) =>
      current.trim() ? current : defaultPublicLocation(selectedAssessment),
    );
    setPublicIncidentType((current) => {
      const clean = current.trim();
      if (clean && clean !== "Verified relief need") return current;
      return String(sourceCase?.category || "Verified relief need").slice(0, 120);
    });
    setPublicSeverity((current) => {
      const clean = current.trim();
      if (clean && clean !== "LGU assessed") return current;
      return severityPublicLabel(sourceCase?.severity);
    });
    setPublicStory((current) => {
      const generic = defaultPublicStory(selectedAssessment, null);
      if (current.trim() && current.trim() !== generic.trim()) return current;
      return defaultPublicStory(selectedAssessment, sourceCase);
    });
  }, [
    openedFromAssistance,
    assistanceSource,
    selectedAssessment?.id,
    selectedPublishedCampaign?.id,
    sourceCase?.id,
  ]);

  useEffect(() => {
    // Community Assistance public photos are separate Admin-selected publication
    // assets. Never clear them just because there is no linked disaster case.
    if (openedFromAssistance || selectedPublishedCampaign) return;

    if (!availablePublicPhotos.length) {
      setSelectedPublicPhotoUrls([]);
      return;
    }

    setSelectedPublicPhotoUrls((current) =>
      current.filter((url) => availablePublicPhotos.includes(url)).slice(0, 5),
    );
  }, [
    openedFromAssistance,
    selectedPublishedCampaign?.id,
    availablePublicPhotos,
  ]);

  useEffect(() => {
    if (!selectedPublishedCampaign) return;

    setSelectedPublicPhotoUrls(
      (Array.isArray(selectedPublishedCampaign.publicPhotoUrls)
        ? selectedPublishedCampaign.publicPhotoUrls
        : []
      )
        .map((url) => String(url || "").trim())
        .filter((url) => url.startsWith("https://"))
        .slice(0, 5),
    );
  }, [selectedPublishedCampaign?.id, selectedPublishedCampaign?.updatedAt]);

  useEffect(() => {
    if (!isAdmin || !requestedAssessmentId || !assessments.length) return;

    const target = assessments.find((item) => item.id === requestedAssessmentId);
    if (!target) return;

    const existing = campaigns.find(
      (campaign) =>
        campaign.status === "published" &&
        Array.isArray(campaign.sourceNeedAssessmentIds) &&
        campaign.sourceNeedAssessmentIds.includes(target.id),
    );

    setActiveView("campaigns");
    setAssessmentId(target.id);
    // Keep the setup collapsed until the Admin explicitly continues.
    // This makes the top “Continue Setup” action meaningful instead of
    // setting a state that is already active.
    setShowCampaignForm(false);

    if (!existing && assessmentIsActive(target)) {
      setCampaignTitle(defaultCampaignTitle(target));
      setCampaignDescription(defaultCampaignDescription(target));
      setPublicStory(defaultPublicStory(target, null));
      setPublicLocationLabel(defaultPublicLocation(target));
      setPublicIncidentType("Verified relief need");
      setPublicSeverity("LGU assessed");
      setSelectedPublicPhotoUrls([]);
    }
  }, [isAdmin, requestedAssessmentId, assessments, campaigns]);

  useEffect(() => {
    if (
      !isAdmin ||
      !openedFromAssistance ||
      !requestedAssistanceRequestId ||
      !assistanceSourceReady ||
      !assistanceSource
    ) {
      return;
    }

    const existing = campaigns.find(
      (campaign) =>
        campaign.status === "published" &&
        String(campaign.sourceAssistanceRequestId || "") ===
          requestedAssistanceRequestId,
    );

    setActiveView("campaigns");
    setAssessmentId(assistanceSource.id);
    setShowCampaignForm(false);

    if (!existing && assistanceSourceIsEligible(assistanceSource)) {
      const preferred = Array.isArray(assistanceSource.preferredAssistanceTypes)
        ? assistanceSource.preferredAssistanceTypes.map((item) => String(item))
        : [];
      const monetary = preferred.includes("monetary") || !preferred.length;
      const inKind = preferred.includes("in_kind");

      setCampaignTitle(defaultCommunityCampaignTitle(assistanceSource));
      setCampaignDescription(defaultCommunityCampaignDescription(assistanceSource));
      setPublicStory(defaultCommunityPublicStory(assistanceSource));
      setPublicLocationLabel(communityGeneralArea(assistanceSource));
      setPublicIncidentType(
        normalizeCategoryLabel(
          assistanceSource.categoryLabel || assistanceSource.category,
        ).slice(0, 120),
      );
      setPublicSeverity("LGU verified need");
      setSelectedPublicPhotoUrls([]);
      setAllowMonetary(monetary);
      setAllowInKind(inKind);
      setMonetaryGoal(
        monetary ? String(Number(assistanceSource.remainingAmount || 0)) : "",
      );
      setHandoffMode("receiving_point");
      setHandoffLocationType(
        mapAssistanceLocationType(assistanceSource.assignedLocationType),
      );
      setHandoffLocationPreset("__assistance_source__");
      setHandoffLocationName(assistanceSource.assignedLocationName || "");
      setHandoffAddress(assistanceSource.assignedLocationAddress || "");
      setHandoffNotes(assistanceSource.assignedLocationNotes || "");
      setInKindInstructions(
        inKind
          ? assistanceSource.assignedLocationNotes ||
              "Coordinate in-kind support through the LGU-approved public receiving point."
          : "",
      );
    }
  }, [
    isAdmin,
    openedFromAssistance,
    requestedAssistanceRequestId,
    assistanceSourceReady,
    assistanceSource,
    campaigns,
  ]);

  useEffect(() => {
    if (
      !focusCampaignSetup ||
      activeView !== "campaigns" ||
      !showCampaignForm ||
      campaignFormY <= 0
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, campaignFormY - 20),
        animated: true,
      });
      setFocusCampaignSetup(false);
    });

    return () => cancelAnimationFrame(frame);
  }, [activeView, campaignFormY, focusCampaignSetup, showCampaignForm]);

  const openCampaignSetup = () => {
    setActiveView("campaigns");
    setShowCampaignForm(true);
    setFocusCampaignSetup(true);
  };

  const openProof = async (url: string) => {
    const cleanUrl = String(url || "").trim();

    if (!cleanUrl.startsWith("https://")) {
      Alert.alert("Invalid Proof Link", "This proof link is not valid.");
      return;
    }

    try {
      const supported = await Linking.canOpenURL(cleanUrl);
      if (!supported) {
        throw new Error("This link cannot be opened on this device.");
      }

      await Linking.openURL(cleanUrl);
    } catch (problem) {
      Alert.alert(
        "Unable to Open Proof",
        problem instanceof Error
          ? problem.message
          : "The receipt image could not be opened.",
      );
    }
  };

  const resetCampaignForm = () => {
    if (!openedFromVerifiedSource) {
      setAssessmentId("");
    }
    setCampaignTitle("");
    setCampaignDescription("");
    setAllowMonetary(true);
    setAllowInKind(true);
    setOfficialChannelLabel("");
    setOfficialChannelInstructions("");
    setMonetaryGoal("");
    setInKindInstructions("");
    setHandoffMode("receiving_point");
    setHandoffLocationType("");
    setHandoffLocationPreset("");
    setHandoffLocationName("");
    setHandoffAddress("");
    setHandoffNotes("");
    setPublicStory("");
    setPublicLocationLabel("");
    setPublicIncidentType("");
    setPublicSeverity("");
    setSelectedPublicPhotoUrls([]);
    setPublicPhotoUploadStatus("");
    setShowCampaignForm(false);
  };

  const updateVerificationForm = (
    donationId: string,
    field: keyof VerificationForm,
    value: string,
  ) => {
    setVerificationForms((current) => ({
      ...current,
      [donationId]: {
        actualValue: current[donationId]?.actualValue || "",
        officialReceiptReference:
          current[donationId]?.officialReceiptReference || "",
        rejectionReason: current[donationId]?.rejectionReason || "",
        [field]: value,
      },
    }));
  };

  const togglePublicPhoto = (url: string) => {
    setSelectedPublicPhotoUrls((current) => {
      if (current.includes(url)) {
        return current.filter((item) => item !== url);
      }

      if (current.length >= 5) {
        Alert.alert(
          "Public Photo Limit",
          "Select up to 5 privacy-safe photos for the public campaign.",
        );
        return current;
      }

      return [...current, url];
    });
  };

  const uploadPublicCampaignPhoto = async (
    asset: ImagePicker.ImagePickerAsset,
  ) => {
    const fileName =
      asset.fileName ||
      asset.uri.split("/").pop()?.split("?")[0] ||
      `public-campaign-photo-${Date.now()}.jpg`;

    const contentType = asset.mimeType || "image/jpeg";
    const body = new FormData();
    const webFile = (asset as any).file;

    if (webFile) {
      body.append("file", webFile);
    } else {
      body.append(
        "file",
        {
          uri: asset.uri,
          name: fileName,
          type: contentType,
        } as any,
      );
    }

    body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: "POST",
      body,
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result || typeof result.secure_url !== "string") {
      throw new Error(
        result?.error?.message ||
          `Public campaign photo upload failed with HTTP ${response.status}.`,
      );
    }

    return String(result.secure_url);
  };

  const chooseAndUploadPublicCampaignPhoto = async () => {
    if (publicPhotoUploading || selectedPublicPhotoUrls.length >= 5) {
      if (selectedPublicPhotoUrls.length >= 5) {
        Alert.alert(
          "Public Photo Limit",
          "A campaign may publish up to 5 LGU-approved public photos.",
        );
      }
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Gallery Permission",
        "Allow photo library access so the Admin can add a separate privacy-safe public campaign photo.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];

    if (
      typeof asset.fileSize === "number" &&
      asset.fileSize > MAX_PUBLIC_CAMPAIGN_PHOTO_BYTES
    ) {
      Alert.alert("Photo Too Large", "Use a public campaign photo smaller than 10 MB.");
      return;
    }

    try {
      setPublicPhotoUploading(true);
      setPublicPhotoUploadStatus("Uploading public campaign photo...");

      const publicUrl = await uploadPublicCampaignPhoto(asset);

      setSelectedPublicPhotoUrls((current) =>
        Array.from(new Set([...current, publicUrl])).slice(0, 5),
      );
      setPublicPhotoUploadStatus("Public campaign photo uploaded.");
    } catch (problem) {
      const message =
        problem instanceof Error
          ? problem.message
          : "Unable to upload the public campaign photo.";
      setPublicPhotoUploadStatus("");
      Alert.alert("Photo Upload Failed", message);
    } finally {
      setPublicPhotoUploading(false);
    }
  };

  const removePublicCampaignPhoto = (url: string) => {
    if (publicPhotoUploading) return;
    setSelectedPublicPhotoUrls((current) =>
      current.filter((item) => item !== url),
    );
    setPublicPhotoUploadStatus("");
  };

  const savePublishedCampaignPhotos = async () => {
    if (!selectedPublishedCampaign || !user || !isAdmin || busyKey) return;

    try {
      setBusyKey(`photos_${selectedPublishedCampaign.id}`);
      setError("");

      await secureAdminPost(
        `/api/admin/donations/campaigns/${encodeURIComponent(
          selectedPublishedCampaign.id,
        )}/public-photos`,
        {
          publicPhotoUrls: selectedPublicPhotoUrls,
        },
      );

      setPublicPhotoUploadStatus("Public campaign photos saved.");
      Alert.alert(
        "Public Photos Saved",
        "The Resident Donation page will now use these LGU-approved campaign photos.",
      );
    } catch (problem) {
      const message =
        problem instanceof Error
          ? problem.message
          : "Unable to save the public campaign photos.";
      setError(message);
      Alert.alert("Photo Save Failed", message);
    } finally {
      setBusyKey("");
    }
  };

  const chooseHandoffLocationType = (value: string) => {
    const next = value as HandoffLocationType;
    setHandoffLocationType(next);
    setHandoffLocationPreset("");
    setHandoffLocationName("");
    setHandoffAddress("");
    setHandoffNotes("");
  };

  const chooseAuthorizedLocation = (value: string) => {
    setHandoffLocationPreset(value);

    if (value === "__custom__") {
      setHandoffLocationName("");
      setHandoffAddress("");
      return;
    }

    setHandoffLocationName(value);
    setHandoffAddress("");
  };

  const secureAdminPost = async (
    path: string,
    payload: Record<string, any> = {},
  ) => {
    if (!user) throw new Error("Admin session is not available.");

    const token = await user.getIdToken(true);
    const response = await fetch(`${SECURE_DONATION_BACKEND}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      const backendError: any = new Error(
        result?.message ||
          result?.error ||
          `Donation Admin operation failed with HTTP ${response.status}.`,
      );
      backendError.code = result?.error || `http_${response.status}`;
      throw backendError;
    }

    return result;
  };

  const createCampaign = async () => {
    if (!user || !isAdmin || busyKey) return;

    if (!openedFromVerifiedSource) {
      Alert.alert(
        "Verified Source Required",
        "Open Donation Support from either Relief Operations or a verified Assistance Request with a confirmed shortage.",
      );
      return;
    }

    if (openedFromAssistance) {
      if (!assistanceSourceReady || !assistanceSource) {
        Alert.alert(
          "Verified Assistance Request Required",
          "The selected Assistance Request could not be loaded.",
        );
        return;
      }

      if (!assistanceSourceIsEligible(assistanceSource)) {
        Alert.alert(
          "Donation Support Not Available",
          "This Assistance Request must be finally verified and have Donation Support Needed with a verified remaining shortage.",
        );
        return;
      }

      if (
        !String(assistanceSource.assignedLocationName || "").trim() ||
        !String(assistanceSource.assignedLocationAddress || "").trim()
      ) {
        Alert.alert(
          "Official Location Required",
          "Return to Assistance Requests and save the LGU-approved public service or receiving location first.",
        );
        return;
      }
    } else {
      if (!selectedAssessment || selectedAssessment.id !== requestedAssessmentId) {
        Alert.alert(
          "Verified Relief Need Required",
          "Return to Relief Operations and open Donation Support from the exact relief need that has a confirmed shortage.",
        );
        return;
      }

      if (!selectedAssessmentActive) {
        Alert.alert(
          "Relief Need No Longer Active",
          "This relief need is already fulfilled or closed, so a new donation campaign cannot be published.",
        );
        return;
      }
    }

    if (selectedPublishedCampaign) {
      Alert.alert(
        "Campaign Already Active",
        "Close the existing campaign for this verified source before publishing another one.",
      );
      return;
    }

    const title = campaignTitle.trim();
    const description = campaignDescription.trim();
    const moneyLabel = officialChannelLabel.trim();
    const moneyInstructions = officialChannelInstructions.trim();
    const numericMonetaryGoal = Number(monetaryGoal);
    const goodsInstructions = inKindInstructions.trim();
    const handoffName = handoffLocationName.trim();
    const handoffPublicAddress = handoffAddress.trim();
    const handoffPublicNotes = handoffNotes.trim();
    const story = publicStory.trim();
    const publicLocation = publicLocationLabel.trim();
    const incidentType = publicIncidentType.trim();
    const severityLabel = publicSeverity.trim();

    if (title.length < 5) {
      Alert.alert("Campaign Title", "Enter a clear campaign title.");
      return;
    }

    if (description.length < 15) {
      Alert.alert(
        "Campaign Description",
        "Describe the verified need clearly without exposing private beneficiary details.",
      );
      return;
    }

    if (story.length < 30) {
      Alert.alert(
        "Verified Situation Required",
        "Write a short privacy-safe public story explaining the verified situation and why support is needed.",
      );
      return;
    }

    if (publicLocation.length < 3) {
      Alert.alert(
        "Public Location Required",
        "Use only an approximate public area. Never publish the beneficiary's exact home address.",
      );
      return;
    }

    if (incidentType.length < 2 || severityLabel.length < 2) {
      Alert.alert(
        "Public Case Details",
        "Confirm the public category and LGU-assessed priority before publishing.",
      );
      return;
    }

    if (!allowMonetary && !allowInKind) {
      Alert.alert("Donation Type", "Enable at least one donation type.");
      return;
    }

    if (allowMonetary && (!Number.isFinite(numericMonetaryGoal) || numericMonetaryGoal <= 0)) {
      Alert.alert(
        "Funding Goal Required",
        "Enter the verified monetary amount still needed for this campaign.",
      );
      return;
    }

    if (
      openedFromAssistance &&
      allowMonetary &&
      Math.abs(
        numericMonetaryGoal - Number(assistanceSource?.remainingAmount || 0),
      ) > 0.009
    ) {
      Alert.alert(
        "Verified Funding Goal",
        `For a Community Assistance campaign, the funding goal must match the verified remaining unmet amount: ${money(
          Number(assistanceSource?.remainingAmount || 0),
        )}.`,
      );
      return;
    }

    if (allowMonetary && (moneyLabel.length < 3 || moneyInstructions.length < 10)) {
      Alert.alert(
        "Official LGU Channel Required",
        "Enter the official LGU monetary channel and clear payment or receipt instructions.",
      );
      return;
    }

    if (allowInKind && goodsInstructions.length < 10) {
      Alert.alert(
        "Receiving Instructions Required",
        "Enter clear instructions for how the goods will be received or handed over.",
      );
      return;
    }

    if (allowInKind && !handoffLocationType) {
      Alert.alert(
        "Location Type Required",
        "Select the authorized type of receiving or handover location.",
      );
      return;
    }

    if (allowInKind && !openedFromAssistance && !handoffLocationPreset) {
      Alert.alert(
        "Authorized Location Required",
        "Select the authorized receiving or handover location before publishing.",
      );
      return;
    }

    if (allowInKind && handoffName.length < 3) {
      Alert.alert(
        "Location Name Required",
        "An LGU-approved public receiving or handover location is required for in-kind support.",
      );
      return;
    }

    if (allowInKind && handoffPublicAddress.length < 8) {
      Alert.alert(
        "Public Delivery Address Required",
        "Enter the approved public receiving address. Never use the beneficiary's home address.",
      );
      return;
    }

    const acceptedDonationTypes: DonationType[] = [];
    if (allowMonetary) acceptedDonationTypes.push("monetary");
    if (allowInKind) acceptedDonationTypes.push("in_kind");

    try {
      setBusyKey("create_campaign");
      setError("");

      await secureAdminPost("/api/admin/donations/campaigns", {
        sourceType: openedFromAssistance
          ? "community_assistance_request"
          : "disaster_relief_need",
        sourceId: openedFromAssistance
          ? requestedAssistanceRequestId
          : requestedAssessmentId,
        title,
        description,
        publicStory: story,
        publicLocationLabel: publicLocation,
        publicIncidentType: incidentType,
        publicSeverity: severityLabel,
        publicPhotoUrls: selectedPublicPhotoUrls,
        campaignCategory: String(sourceCase?.category || incidentType || "disaster_relief"),
        acceptedDonationTypes,
        officialChannelLabel: moneyLabel,
        officialChannelInstructions: moneyInstructions,
        monetaryGoal: allowMonetary ? numericMonetaryGoal : 0,
        inKindInstructions: goodsInstructions,
        handoffMode,
        handoffLocationType,
        handoffLocationName: handoffName,
        handoffAddress: handoffPublicAddress,
        handoffNotes: handoffPublicNotes,
      });

      setShowCampaignForm(false);
      Alert.alert(
        "Campaign Published",
        openedFromAssistance
          ? "The verified Community Assistance campaign is now active. Only privacy-safe campaign information and the LGU-approved public location are exposed to donors."
          : "The disaster relief campaign is now active. Residents can submit support through the official LGU receiving instructions.",
      );
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : "Unable to create the campaign.";
      setError(message);
      Alert.alert("Campaign Failed", message);
    } finally {
      setBusyKey("");
    }
  };

  const closeCampaign = async (campaign: DonationCampaign) => {
    if (!user || !isAdmin || busyKey) return;

    try {
      setBusyKey(`close_${campaign.id}`);
      setError("");

      await secureAdminPost(
        `/api/admin/donations/campaigns/${encodeURIComponent(campaign.id)}/close`,
      );

      Alert.alert("Campaign Closed", "New donor submissions are now disabled.");
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : "Unable to close the campaign.";
      setError(message);
      Alert.alert("Close Failed", message);
    } finally {
      setBusyKey("");
    }
  };

  const verifyDonation = async (donation: DonationSubmission) => {
    if (!user || !isAdmin || busyKey) return;

    const form = verificationForms[donation.id] || {
      actualValue: "",
      officialReceiptReference: "",
      rejectionReason: "",
    };

    const type = String(donation.donationType || "");
    const actual = Number(form.actualValue);
    const receiptReference = form.officialReceiptReference.trim();

    if (!Number.isFinite(actual) || actual <= 0) {
      Alert.alert(
        "Actual Receipt Required",
        type === "in_kind"
          ? "Enter the actual quantity physically received by the LGU."
          : "Enter the actual monetary amount confirmed by the LGU.",
      );
      return;
    }

    if (type === "in_kind" && !Number.isInteger(actual)) {
      Alert.alert("Whole Quantity Required", "In-kind quantity must be a whole number.");
      return;
    }

    if (receiptReference.length < 3) {
      Alert.alert(
        "Official Receipt / Record Required",
        "Enter the LGU receipt, receiving-log, or official verification reference.",
      );
      return;
    }

    try {
      setBusyKey(`verify_${donation.id}`);
      setError("");

      await secureAdminPost(
        `/api/admin/donations/${encodeURIComponent(donation.id)}/verify`,
        {
          actualValue: actual,
          officialReceiptReference: receiptReference,
        },
      );

      setVerificationForms((current) => {
        const next = { ...current };
        delete next[donation.id];
        return next;
      });

      Alert.alert(
        "Donation Verified",
        type === "in_kind"
          ? "The actually received goods were added to LGU Relief Inventory."
          : "The monetary receipt was documented and added to the campaign's verified funding progress. It was not converted into goods inventory.",
      );
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : "Unable to verify the donation.";
      setError(message);
      Alert.alert("Verification Failed", message);
    } finally {
      setBusyKey("");
    }
  };

  const rejectDonation = async (donation: DonationSubmission) => {
    if (!user || !isAdmin || busyKey) return;

    const reason = (verificationForms[donation.id]?.rejectionReason || "").trim();
    if (reason.length < 5) {
      Alert.alert("Reason Required", "Enter a clear rejection reason.");
      return;
    }

    try {
      setBusyKey(`reject_${donation.id}`);
      setError("");

      await secureAdminPost(
        `/api/admin/donations/${encodeURIComponent(donation.id)}/reject`,
        { rejectionReason: reason },
      );

      setVerificationForms((current) => {
        const next = { ...current };
        delete next[donation.id];
        return next;
      });

      Alert.alert("Donation Rejected", "The submission was not counted as LGU resources.");
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : "Unable to reject this donation.";
      setError(message);
      Alert.alert("Rejection Failed", message);
    } finally {
      setBusyKey("");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Loading donation operations...</Text>
      </View>
    );
  }

  if (!user || !profile || !isApprovedProfile(profile)) {
    return <Redirect href="/login" />;
  }

  if (profile.role === "superadmin") {
    return <Redirect href="/(superadmin)" />;
  }

  if (!isAdmin) {
    return <Redirect href="/(tabs)" />;
  }

  const sourceLoading =
    !dataReady || (openedFromAssistance && !assistanceSourceReady);
  const sourceUnavailable =
    openedFromAssistance
      ? assistanceSourceReady && !assistanceSource
      : openedFromRelief
        ? dataReady && !requestedAssessment
        : false;
  const sourceFinalized =
    openedFromAssistance
      ? !!assistanceSource && !assistanceSourceIsEligible(assistanceSource)
      : !!requestedAssessment && !assessmentIsActive(requestedAssessment);
  const sourceReadyForCampaign =
    openedFromVerifiedSource &&
    !sourceUnavailable &&
    !sourceFinalized &&
    selectedAssessmentActive &&
    !selectedPublishedCampaign;
  const sourceBackPath = openedFromAssistance
    ? "/assistance-requests"
    : "/relief-operations";
  const sourceBackLabel = openedFromAssistance
    ? "Back to Assistance"
    : "Back to Relief";

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push(sourceBackPath as any)}
        >
          <Ionicons name="arrow-back" size={18} color="#334155" />
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>ADMIN · DONATION OPERATIONS</Text>
          <Text style={styles.title}>Donation Support</Text>
          <Text style={styles.subtitle}>
            Publish and monitor LGU-verified donation campaigns only after a legitimate need is verified and an actual support shortage remains.
          </Text>
        </View>
      </View>

      <View style={styles.flowCard}>
        <FlowStep
          number="1"
          title="Verified Need"
          text="LGU confirms the beneficiary, documents, and legitimate remaining need."
        />
        <FlowConnector />
        <FlowStep
          number="2"
          title="Confirmed Shortage"
          text="LGU or partner resources are not enough, so controlled public support is opened."
        />
        <FlowConnector />
        <FlowStep
          number="3"
          title="Verify Actual Receipt"
          text="Only money or goods actually confirmed by the LGU are counted."
        />
      </View>

      <View style={styles.nextActionCard}>
        <View style={styles.nextActionIcon}>
          <Ionicons
            name={
              sourceFinalized || sourceUnavailable
                ? "checkmark-circle-outline"
                : sourceReadyForCampaign
                  ? openedFromAssistance
                    ? "heart-outline"
                    : "megaphone-outline"
                  : selectedPublishedCampaign && selectedPendingDonations.length > 0
                    ? "receipt-outline"
                    : selectedPublishedCampaign
                      ? "pulse-outline"
                      : pendingDonations.length > 0
                        ? "receipt-outline"
                        : publishedCampaigns.length > 0
                          ? "pulse-outline"
                          : "checkmark-circle-outline"
            }
            size={21}
            color="#0F766E"
          />
        </View>

        <View style={styles.nextActionBody}>
          <Text style={styles.nextActionEyebrow}>NEXT LGU ACTION</Text>

          {sourceUnavailable ? (
            <>
              <Text style={styles.nextActionTitle}>Verified source is unavailable</Text>
              <Text style={styles.nextActionText}>
                Return to the source module and open Donation Support again from the verified case.
              </Text>
            </>
          ) : sourceFinalized && !selectedPublishedCampaign ? (
            <>
              <Text style={styles.nextActionTitle}>This verified source is no longer eligible</Text>
              <Text style={styles.nextActionText}>
                No new campaign should be created because the source no longer has an active confirmed shortage.
              </Text>
            </>
          ) : sourceReadyForCampaign ? (
            <>
              <Text style={styles.nextActionTitle}>
                {openedFromAssistance
                  ? "Publish Community Need Donation Support"
                  : `Publish donation support for ${selectedReliefScope.toLowerCase()}`}
              </Text>
              <Text style={styles.nextActionText}>
                {openedFromAssistance
                  ? "The Assistance Request is LGU-verified, Donation Support Needed is confirmed, and the public service location is controlled by the LGU. Complete the privacy-safe campaign details below."
                  : "Relief Operations already selected this exact verified need after the LGU confirmed a resource shortage. Complete the official receiving details below."}
              </Text>
            </>
          ) : selectedPublishedCampaign && selectedPendingDonations.length > 0 ? (
            <>
              <Text style={styles.nextActionTitle}>
                Verify {selectedPendingDonations.length} pending donation
                {selectedPendingDonations.length === 1 ? "" : "s"}
              </Text>
              <Text style={styles.nextActionText}>
                Check each submission against the official LGU transaction record or physical receiving log before counting it as received.
              </Text>
            </>
          ) : selectedPublishedCampaign ? (
            <>
              <Text style={styles.nextActionTitle}>Campaign is active</Text>
              <Text style={styles.nextActionText}>
                Keep it open only while the verified shortage still needs public support. Close it once the LGU no longer needs additional donations.
              </Text>
            </>
          ) : pendingDonations.length > 0 ? (
            <>
              <Text style={styles.nextActionTitle}>
                Verify {pendingDonations.length} pending donation
                {pendingDonations.length === 1 ? "" : "s"}
              </Text>
              <Text style={styles.nextActionText}>
                These submissions are not yet counted as LGU resources.
              </Text>
            </>
          ) : publishedCampaigns.length > 0 ? (
            <>
              <Text style={styles.nextActionTitle}>Monitor active donation support</Text>
              <Text style={styles.nextActionText}>
                There is no receipt waiting for review. Keep campaigns open only while their verified shortages remain active.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.nextActionTitle}>No donation action required right now</Text>
              <Text style={styles.nextActionText}>
                Campaign creation starts only from a verified LGU source with a confirmed remaining shortage.
              </Text>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.nextActionButton}
          onPress={() => {
            if (sourceUnavailable || (sourceFinalized && !selectedPublishedCampaign)) {
              router.push(sourceBackPath as any);
              return;
            }

            if (sourceReadyForCampaign) {
              openCampaignSetup();
              return;
            }

            if (
              (selectedPublishedCampaign && selectedPendingDonations.length > 0) ||
              pendingDonations.length > 0
            ) {
              setActiveView("verification");
              return;
            }

            if (selectedPublishedCampaign || publishedCampaigns.length > 0) {
              setActiveView("campaigns");
              return;
            }

            router.push(sourceBackPath as any);
          }}
        >
          <Text style={styles.nextActionButtonText}>
            {sourceUnavailable || (sourceFinalized && !selectedPublishedCampaign)
              ? sourceBackLabel
              : sourceReadyForCampaign
                ? "Continue Setup"
                : (selectedPublishedCampaign && selectedPendingDonations.length > 0) ||
                    pendingDonations.length > 0
                  ? "Review Pending"
                  : selectedPublishedCampaign || publishedCampaigns.length > 0
                    ? "View Campaigns"
                    : sourceBackLabel}
          </Text>
          <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color="#B42318" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.viewTabs}>
        <TouchableOpacity
          style={[styles.viewTab, activeView === "campaigns" && styles.viewTabActive]}
          onPress={() => setActiveView("campaigns")}
        >
          <Ionicons
            name="megaphone-outline"
            size={17}
            color={activeView === "campaigns" ? "#0F766E" : "#64748B"}
          />
          <Text style={[styles.viewTabText, activeView === "campaigns" && styles.viewTabTextActive]}>
            Campaigns
          </Text>
          <View style={styles.tabCountBadge}>
            <Text style={styles.tabCountText}>{publishedCampaigns.length}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewTab, activeView === "verification" && styles.viewTabActive]}
          onPress={() => setActiveView("verification")}
        >
          <Ionicons
            name="receipt-outline"
            size={17}
            color={activeView === "verification" ? "#0F766E" : "#64748B"}
          />
          <Text style={[styles.viewTabText, activeView === "verification" && styles.viewTabTextActive]}>
            Verify Receipts
          </Text>
          <View style={[styles.tabCountBadge, pendingDonations.length > 0 && styles.pendingCountBadge]}>
            <Text style={styles.tabCountText}>{pendingDonations.length}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {activeView === "campaigns" ? (
        <>
          <View style={styles.sectionTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionEyebrow}>DONATION SUPPORT</Text>
              <Text style={styles.sectionTitle}>Campaign Operations</Text>
              <Text style={styles.helperText}>
                Every campaign must be tied to one verified LGU source and a confirmed unmet need. Both Disaster / Relief and Verified Community Assistance sources use this controlled flow.
              </Text>
            </View>
          </View>

          {sourceLoading ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color="#0F766E" />
              <Text style={styles.emptyText}>Loading donation campaign records...</Text>
            </View>
          ) : !openedFromVerifiedSource ? (
            <View style={styles.gateCard}>
              <View style={styles.gateIcon}>
                <Ionicons name="shield-checkmark-outline" size={24} color="#0F766E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateTitle}>Campaign creation starts from a verified LGU source</Text>
                <Text style={styles.gateText}>
                  Do not create a public campaign from an unverified request. Open Donation Support only from Relief Operations after a confirmed disaster shortage or from an LGU-verified Assistance Request after Donation Support Needed is recorded.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.gateButton}
                onPress={() => router.push(sourceBackPath as any)}
              >
                <Text style={styles.gateButtonText}>Open Relief Action Center</Text>
                <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : !selectedAssessment ? (
            <View style={styles.emptyCard}>
              <Ionicons name="alert-circle-outline" size={30} color="#B7791F" />
              <Text style={styles.emptyTitle}>Verified source is unavailable</Text>
              <Text style={styles.emptyText}>
                The selected verified source could not be found. Return to the source module and open Donation Support again from an eligible case.
              </Text>
              <TouchableOpacity
                style={styles.gateButton}
                onPress={() => router.push(sourceBackPath as any)}
              >
                <Text style={styles.gateButtonText}>{sourceBackLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : selectedPublishedCampaign ? (
            <View style={styles.activeCampaignFocus}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionEyebrow}>ACTIVE CAMPAIGN</Text>
                  <Text style={styles.sectionTitle}>
                    {selectedPublishedCampaign.title || "Donation Campaign"}
                  </Text>
                  <Text style={styles.helperText}>
                    {campaignGroupLabel(selectedPublishedCampaign)} · {campaignCategoryLabel(selectedPublishedCampaign)} · {selectedAssessment.barangay || "Affected area"}
                  </Text>
                </View>
                <View style={[styles.statusBadge, styles.statusPublished]}>
                  <Text style={styles.statusText}>PUBLISHED</Text>
                </View>
              </View>

              <Text style={styles.cardDescription}>
                {selectedPublishedCampaign.description || "—"}
              </Text>

              <View style={styles.activePublicPhotosCard}>
                <View style={styles.activePublicPhotosHeader}>
                  <View style={styles.activePublicPhotosIcon}>
                    <Ionicons name="images-outline" size={18} color="#4F46E5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activePublicPhotosTitle}>Public Campaign Photos</Text>
                    <Text style={styles.activePublicPhotosText}>
                      These are the only campaign images shown to Residents. Keep private beneficiary evidence, IDs, medical records, and exact home details out of this section.
                    </Text>
                  </View>
                  <View style={styles.photoCountBadge}>
                    <Text style={styles.photoCountText}>{selectedPublicPhotoUrls.length}/5</Text>
                  </View>
                </View>

                {selectedPublicPhotoUrls.length > 0 ? (
                  <View style={styles.uploadedPublicPhotoGrid}>
                    {selectedPublicPhotoUrls.map((url, index) => (
                      <View key={`${url}-${index}`} style={styles.uploadedPublicPhotoCard}>
                        <Image
                          source={{ uri: url }}
                          style={styles.uploadedPublicPhotoImage}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          style={styles.removePublicPhotoButton}
                          disabled={publicPhotoUploading}
                          onPress={() => removePublicCampaignPhoto(url)}
                        >
                          <Ionicons name="close" size={15} color="#FFFFFF" />
                        </TouchableOpacity>
                        <View style={styles.uploadedPublicPhotoLabel}>
                          <Ionicons name="shield-checkmark" size={12} color="#15803D" />
                          <Text style={styles.uploadedPublicPhotoLabelText}>
                            Public photo {index + 1}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.noPublicPhotoBox}>
                    <Ionicons name="image-outline" size={20} color="#64748B" />
                    <Text style={styles.noPublicPhotoText}>
                      No public campaign photo is published yet. Residents currently see the category placeholder.
                    </Text>
                  </View>
                )}

                <View style={styles.activePublicPhotoActions}>
                  <TouchableOpacity
                    style={[
                      styles.publicPhotoUploadButton,
                      (publicPhotoUploading || selectedPublicPhotoUrls.length >= 5) &&
                        styles.disabledButton,
                    ]}
                    disabled={
                      publicPhotoUploading || selectedPublicPhotoUrls.length >= 5
                    }
                    onPress={() => void chooseAndUploadPublicCampaignPhoto()}
                  >
                    {publicPhotoUploading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="add-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.publicPhotoUploadButtonText}>
                      {publicPhotoUploading ? "Uploading..." : "Add Public Photo"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.savePublicPhotosButton,
                      busyKey === `photos_${selectedPublishedCampaign.id}` &&
                        styles.disabledButton,
                    ]}
                    disabled={busyKey === `photos_${selectedPublishedCampaign.id}`}
                    onPress={() => void savePublishedCampaignPhotos()}
                  >
                    {busyKey === `photos_${selectedPublishedCampaign.id}` ? (
                      <ActivityIndicator size="small" color="#4F46E5" />
                    ) : (
                      <Ionicons name="save-outline" size={16} color="#4F46E5" />
                    )}
                    <Text style={styles.savePublicPhotosButtonText}>Save Public Photos</Text>
                  </TouchableOpacity>
                </View>

                {!!publicPhotoUploadStatus && (
                  <Text style={styles.publicPhotoUploadStatus}>
                    {publicPhotoUploadStatus}
                  </Text>
                )}
              </View>

              {!!selectedPublishedCampaign.handoffLocationName && (
                <View style={styles.activeHandoffStrip}>
                  <Ionicons name="location-outline" size={17} color="#0F766E" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeHandoffLabel}>AUTHORIZED HANDOVER / RECEIVING POINT</Text>
                    <Text style={styles.activeHandoffTitle}>
                      {selectedPublishedCampaign.handoffLocationName}
                    </Text>
                    {!!selectedPublishedCampaign.handoffAddress && (
                      <Text style={styles.activeHandoffAddress}>
                        {selectedPublishedCampaign.handoffAddress}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.campaignMetrics}>
                <CompactMetric label="Pending" value={String(selectedPendingDonations.length)} />
                <CompactMetric label="Verified" value={String(selectedReceivedDonations.length)} />
                <CompactMetric
                  label="Verified Monetary"
                  value={money(
                    selectedReceivedDonations
                      .filter((item) => item.donationType === "monetary")
                      .reduce((sum, item) => sum + Number(item.actualAmountReceived || 0), 0),
                  )}
                />
                {Number(selectedPublishedCampaign.monetaryGoal || 0) > 0 && (
                  <CompactMetric
                    label="Funding Goal"
                    value={money(Number(selectedPublishedCampaign.monetaryGoal || 0))}
                  />
                )}
              </View>

              <View style={styles.shortageCard}>
                <Ionicons name="alert-circle-outline" size={18} color="#9A6700" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.shortageTitle}>Donation support remains tied to this shortage</Text>
                  <Text style={styles.shortageText}>
                    Close the campaign when the verified shortage is already covered or when the verified source no longer requires public support.
                  </Text>
                </View>
              </View>

              <View style={styles.activeCampaignActions}>
                {selectedPendingDonations.length > 0 && (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => setActiveView("verification")}
                  >
                    <Ionicons name="receipt-outline" size={17} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Review Pending Donations</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push(sourceBackPath as any)}
                >
                  <Ionicons name="arrow-back-outline" size={16} color="#475569" />
                  <Text style={styles.secondaryButtonText}>{sourceBackLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeCampaignButton}
                  disabled={busyKey === `close_${selectedPublishedCampaign.id}`}
                  onPress={() => void closeCampaign(selectedPublishedCampaign)}
                >
                  <Text style={styles.closeCampaignText}>Close Campaign</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : !selectedAssessmentActive ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={30} color="#15803D" />
              <Text style={styles.emptyTitle}>Verified source is no longer eligible</Text>
              <Text style={styles.emptyText}>
                {openedFromAssistance
                  ? "This Assistance Request no longer has an active verified Donation Support shortage."
                  : `This assessment is ${statusLabel(selectedAssessment.status)}. A new donation campaign is no longer appropriate for it.`}
              </Text>
              <TouchableOpacity
                style={styles.gateButton}
                onPress={() => router.push(sourceBackPath as any)}
              >
                <Text style={styles.gateButtonText}>{sourceBackLabel}</Text>
              </TouchableOpacity>
            </View>
          ) : showCampaignForm ? (
            <View
              style={styles.formCard}
              onLayout={(event) => setCampaignFormY(event.nativeEvent.layout.y)}
            >
              <View style={styles.formHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>
                    {openedFromAssistance ? "Verified Community Assistance Need" : "Verified Relief Need"}
                  </Text>
                  <Text style={styles.formSubtitle}>
                    {openedFromAssistance
                      ? "This source is locked to the exact Assistance Request already verified by the LGU. Private resident identity, contact, home address, and supporting evidence stay outside the public campaign."
                      : "This source is locked to the exact relief need selected in Relief Operations. The Admin does not choose another request here."}
                  </Text>
                </View>
              </View>

              <View style={styles.selectedSourceCard}>
                <View style={styles.selectedSourceIcon}>
                  <Ionicons
                    name={Number(selectedAssessment.affectedHouseholds || 0) === 1 ? "home-outline" : "people-outline"}
                    size={19}
                    color="#0F766E"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedSourceLabel}>
                    {openedFromAssistance
                      ? "SELECTED FROM VERIFIED ASSISTANCE REQUEST"
                      : "SELECTED FROM RELIEF OPERATIONS"}
                  </Text>
                  <Text style={styles.selectedSourceTitle}>
                    {selectedReliefScope} · {selectedAssessment.barangay || "Affected area"}
                  </Text>
                  <Text style={styles.selectedSourceMeta}>
                    {openedFromAssistance
                      ? `Verified remaining unmet amount: ${money(Number(assistanceSource?.remainingAmount || 0))}`
                      : `${Number(selectedAssessment.affectedHouseholds || 0)} affected household${Number(selectedAssessment.affectedHouseholds || 0) === 1 ? "" : "s"} · ${Number(selectedAssessment.affectedPeople || 0)} affected people`}
                  </Text>
                </View>
                <View style={styles.sourceBadgeStack}>
                  <View style={styles.disasterGroupBadge}>
                    <Ionicons
                      name={openedFromAssistance ? "heart-outline" : "warning-outline"}
                      size={12}
                      color="#B45309"
                    />
                    <Text style={styles.disasterGroupBadgeText}>
                      {openedFromAssistance
                        ? "COMMUNITY NEED DONATION SUPPORT"
                        : "DISASTER DONATION SUPPORT"}
                    </Text>
                  </View>
                  <View style={styles.scopeBadge}>
                    <Text style={styles.scopeBadgeText}>
                      {openedFromAssistance
                        ? "VERIFIED ASSISTANCE"
                        : Number(selectedAssessment.affectedHouseholds || 0) === 1
                          ? "HOUSEHOLD"
                          : "COMMUNITY"}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.shortageCard}>
                <Ionicons name="alert-circle-outline" size={18} color="#9A6700" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.shortageTitle}>RESOURCE SHORTAGE CONFIRMED</Text>
                  <Text style={styles.shortageText}>
                    {openedFromAssistance
                      ? "Donation Support was opened only after final LGU verification and Resource Assessment confirmed that the verified need still has an uncovered shortage. The public campaign is not created automatically."
                      : "Donation Support was opened from the Relief Action Center after the LGU confirmed that available resources cannot fully cover this verified need. Donation is not automatic for every request."}
                  </Text>
                </View>
              </View>

              <View style={styles.needSummaryCard}>
                <View style={styles.needSummaryHeader}>
                  <View>
                    <Text style={styles.needSummaryEyebrow}>VERIFIED NEED SUMMARY</Text>
                    <Text style={styles.needSummaryTitle}>
                      {selectedAssessment.barangay || "Affected area"}
                    </Text>
                  </View>
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={14} color="#15803D" />
                    <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                  </View>
                </View>

                <View style={styles.needStatsRow}>
                  {openedFromAssistance ? (
                    <>
                      <MiniStat label="Verified shortage (PHP)" value={Number(assistanceSource?.remainingAmount || 0)} />
                      <MiniStat label="Verified case" value={1} />
                    </>
                  ) : (
                    <>
                      <MiniStat label="Affected households" value={Number(selectedAssessment.affectedHouseholds || 0)} />
                      <MiniStat label="Affected people" value={Number(selectedAssessment.affectedPeople || 0)} />
                    </>
                  )}
                </View>

                {selectedNeedBreakdown.length > 0 && (
                  <View style={styles.needTagsWrap}>
                    {selectedNeedBreakdown.map((item) => (
                      <View key={item.label} style={styles.needTag}>
                        <Text style={styles.needTagText}>
                          {item.label}: {item.value} {item.unit}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {!!selectedAssessment.otherNeedDescription && (
                  <Text style={styles.otherNeedText}>
                    Other verified need: {selectedAssessment.otherNeedDescription}
                  </Text>
                )}
              </View>

              <View style={styles.formDivider} />

              <View style={styles.formHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>Public Case Presentation</Text>
                  <Text style={styles.formSubtitle}>
                    Prepare the privacy-safe story and general public area donors will see. Exact home addresses, IDs, contacts, medical records, and private evidence must stay hidden.
                  </Text>
                </View>
              </View>

              <View style={styles.publicPresentationCard}>
                <View style={styles.publicFactRow}>
                  <View style={styles.publicFactCell}>
                    <Text style={styles.publicFactLabel}>
                      {openedFromAssistance ? "CATEGORY" : "INCIDENT"}
                    </Text>
                    <Text style={styles.publicFactValue}>
                      {publicIncidentType || "Verified relief need"}
                    </Text>
                  </View>
                  <View style={styles.publicFactCell}>
                    <Text style={styles.publicFactLabel}>LGU PRIORITY</Text>
                    <Text style={styles.publicFactValue}>
                      {publicSeverity || "LGU assessed"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.label}>Verified situation shown to donors</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={publicStory}
                  onChangeText={setPublicStory}
                  maxLength={1200}
                  multiline
                  placeholder="Write a short professional story about the verified situation. Do not include the beneficiary's full name, exact home address, phone number, or private evidence details."
                  placeholderTextColor="#94A3B8"
                />

                <Text style={styles.label}>Approximate public location</Text>
                <TextInput
                  style={styles.input}
                  value={publicLocationLabel}
                  onChangeText={setPublicLocationLabel}
                  editable={!openedFromAssistance}
                  maxLength={240}
                  placeholder="e.g. Narra, San Jose del Monte, Bulacan"
                  placeholderTextColor="#94A3B8"
                />
                <Text style={styles.privacyHelper}>
                  Show only the barangay or general affected area. Never publish the exact household address or private GPS coordinates.
                </Text>

                <View style={styles.publicNeedsBox}>
                  <Text style={styles.publicNeedsTitle}>Verified remaining needs shown publicly</Text>
                  <Text style={styles.publicNeedsText}>
                    {openedFromAssistance
                      ? "This public need summary comes from the verified Assistance Request shortage. Private supporting records are never copied into the campaign."
                      : "These values come from the verified Relief Assessment and are not manually re-entered here."}
                  </Text>
                  <View style={styles.needTagsWrap}>
                    {selectedPublicNeeds.length > 0 ? (
                      selectedPublicNeeds.map((item, index) => (
                        <View key={`${item.category}-${index}`} style={styles.needTag}>
                          <Text style={styles.needTagText}>
                            {item.label}
                            {typeof item.needed === "number"
                              ? `: ${item.needed} ${item.unit || ""}`
                              : ""}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.publicNeedsEmpty}>No public material need category recorded.</Text>
                    )}
                  </View>
                </View>

                <View style={styles.photoSectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Public campaign photos</Text>
                    <Text style={styles.privacyHelper}>
                      {openedFromAssistance
                        ? "Upload only a separate privacy-safe publication photo approved by the LGU. Private Assistance Request documents, medical records, IDs, and evidence are never copied into the public campaign."
                        : "Select only privacy-safe incident photos. The Resident Donation page will show up to 5 approved images."}
                    </Text>
                  </View>
                  <View style={styles.photoCountBadge}>
                    <Text style={styles.photoCountText}>{selectedPublicPhotoUrls.length}/5</Text>
                  </View>
                </View>

                {openedFromAssistance && (
                  <View style={styles.publicPhotoUploadPanel}>
                    <View style={styles.publicPhotoUploadTop}>
                      <View style={styles.publicPhotoUploadIcon}>
                        <Ionicons name="images-outline" size={20} color="#4F46E5" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.publicPhotoUploadTitle}>LGU Public Campaign Photo</Text>
                        <Text style={styles.publicPhotoUploadText}>
                          Choose a safe public-facing image for the donor campaign. This is a separate publication asset, not private case evidence.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.publicPhotoUploadButton,
                          (publicPhotoUploading || selectedPublicPhotoUrls.length >= 5) &&
                            styles.disabledButton,
                        ]}
                        disabled={
                          publicPhotoUploading || selectedPublicPhotoUrls.length >= 5
                        }
                        onPress={() => void chooseAndUploadPublicCampaignPhoto()}
                      >
                        {publicPhotoUploading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" />
                        )}
                        <Text style={styles.publicPhotoUploadButtonText}>
                          {publicPhotoUploading ? "Uploading..." : "Add Public Photo"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {!!publicPhotoUploadStatus && (
                      <Text style={styles.publicPhotoUploadStatus}>
                        {publicPhotoUploadStatus}
                      </Text>
                    )}

                    {selectedPublicPhotoUrls.length > 0 ? (
                      <View style={styles.uploadedPublicPhotoGrid}>
                        {selectedPublicPhotoUrls.map((url, index) => (
                          <View key={`${url}-${index}`} style={styles.uploadedPublicPhotoCard}>
                            <Image
                              source={{ uri: url }}
                              style={styles.uploadedPublicPhotoImage}
                              resizeMode="cover"
                            />
                            <TouchableOpacity
                              style={styles.removePublicPhotoButton}
                              onPress={() => removePublicCampaignPhoto(url)}
                            >
                              <Ionicons name="close" size={15} color="#FFFFFF" />
                            </TouchableOpacity>
                            <View style={styles.uploadedPublicPhotoLabel}>
                              <Ionicons name="shield-checkmark" size={12} color="#15803D" />
                              <Text style={styles.uploadedPublicPhotoLabelText}>
                                Public photo {index + 1}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.noPublicPhotoBox}>
                        <Ionicons name="image-outline" size={20} color="#64748B" />
                        <Text style={styles.noPublicPhotoText}>
                          No public campaign photo selected yet. The campaign can still publish, but the Resident page will use a clean category placeholder until an LGU-approved photo is added.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {!openedFromAssistance &&
                  (sourceCaseLoading ? (
                    <View style={styles.photoLoadingBox}>
                      <ActivityIndicator color="#0F766E" />
                      <Text style={styles.photoLoadingText}>Loading linked case photos...</Text>
                    </View>
                  ) : availablePublicPhotos.length > 0 ? (
                    <View style={styles.publicPhotoGrid}>
                      {availablePublicPhotos.map((url, index) => {
                        const selected = selectedPublicPhotoUrls.includes(url);
                        return (
                          <TouchableOpacity
                            key={`${url}-${index}`}
                            style={[
                              styles.publicPhotoCard,
                              selected && styles.publicPhotoCardSelected,
                            ]}
                            activeOpacity={0.86}
                            onPress={() => togglePublicPhoto(url)}
                          >
                            <Image source={{ uri: url }} style={styles.publicPhotoImage} />
                            <View style={styles.publicPhotoFooter}>
                              <Ionicons
                                name={selected ? "checkmark-circle" : "ellipse-outline"}
                                size={16}
                                color={selected ? "#0F766E" : "#64748B"}
                              />
                              <Text
                                style={[
                                  styles.publicPhotoText,
                                  selected && styles.publicPhotoTextSelected,
                                ]}
                              >
                                {selected ? "Included publicly" : `Photo ${index + 1}`}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.noPublicPhotoBox}>
                      <Ionicons name="images-outline" size={20} color="#64748B" />
                      <Text style={styles.noPublicPhotoText}>
                        {selectedAssessment.sourceCaseId
                          ? "No image evidence is available from the linked case. Photos are optional."
                          : "This relief assessment is not linked to a single resident emergency case. Public photos are optional."}
                      </Text>
                    </View>
                  ))}
              </View>

              <View style={styles.formDivider} />

              <View style={styles.formHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>Donation Support Details</Text>
                  <Text style={styles.formSubtitle}>
                    Request only the support needed to cover the confirmed shortage. Keep public text privacy-safe.
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Campaign title</Text>
              <TextInput
                style={styles.input}
                value={campaignTitle}
                onChangeText={setCampaignTitle}
                maxLength={160}
                placeholder="Relief Support for ..."
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>Public description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={campaignDescription}
                onChangeText={setCampaignDescription}
                maxLength={1200}
                multiline
                placeholder="Explain the verified shortage without exposing beneficiary identity, exact address, or private case evidence."
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>Accepted donation support</Text>
              <View style={styles.toggleRow}>
                <ToggleChoice
                  label="Monetary"
                  selected={allowMonetary}
                  onPress={() => {
                    if (!openedFromAssistance) setAllowMonetary((current) => !current);
                  }}
                />
                <ToggleChoice
                  label="In-kind Goods"
                  selected={allowInKind}
                  onPress={() => {
                    if (!openedFromAssistance) setAllowInKind((current) => !current);
                  }}
                />
              </View>

              {allowMonetary && (
                <View style={styles.fundingGoalCard}>
                  <View style={styles.fundingGoalHeader}>
                    <View style={styles.fundingGoalIcon}>
                      <Ionicons name="trending-up-outline" size={18} color="#0F766E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fundingGoalTitle}>Verified Monetary Goal</Text>
                      <Text style={styles.fundingGoalText}>
                        {openedFromAssistance
                        ? "This goal is locked to the LGU-verified remaining unmet amount from the Assistance Request. Only verified received payments increase the public progress bar."
                        : "Enter the remaining financial support confirmed by the LGU. Only verified received payments will increase the public progress bar."}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.label}>Funding goal (PHP)</Text>
                  <TextInput
                    style={styles.input}
                    value={monetaryGoal}
                    onChangeText={(value) => setMonetaryGoal(sanitizeMoneyInput(value))}
                    editable={!openedFromAssistance}
                    keyboardType="decimal-pad"
                    maxLength={15}
                    placeholder="e.g. 50000"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              )}

              <View style={styles.formDivider} />

              <View style={styles.formHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>4</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>Official LGU Receiving & Handover Details</Text>
                  <Text style={styles.formSubtitle}>
                    The LGU controls the public receiving, service, or handover location. It may be a relief desk, hospital office, veterinary clinic, social-welfare office, shelter, or another approved public point. A beneficiary's home or live GPS is never shown.
                  </Text>
                </View>
              </View>

              {allowMonetary && (
                <View style={styles.subFormCard}>
                  <View style={styles.subFormHeader}>
                    <Ionicons name="cash-outline" size={18} color="#0F766E" />
                    <Text style={styles.subFormTitle}>Monetary Donation</Text>
                  </View>

                  <Text style={styles.label}>Official LGU monetary channel</Text>
                  <TextInput
                    style={styles.input}
                    value={officialChannelLabel}
                    onChangeText={setOfficialChannelLabel}
                    maxLength={160}
                    placeholder="Official City/LGU receiving channel"
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={styles.label}>Payment and receipt instructions</Text>
                  <TextInput
                    style={[styles.input, styles.multilineSmall]}
                    value={officialChannelInstructions}
                    onChangeText={setOfficialChannelInstructions}
                    maxLength={1000}
                    multiline
                    placeholder="Explain how donors use the official channel and keep their transaction reference or official receipt."
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              )}

              {openedFromAssistance && !!handoffLocationName.trim() && (
                <View style={[styles.subFormCard, styles.handoffSetupCard]}>
                  <View style={styles.subFormHeader}>
                    <Ionicons name="location-outline" size={18} color="#0F766E" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFormTitle}>LGU-Approved Public Service / Receiving Point</Text>
                      <Text style={styles.handoffHelper}>
                        This location was already assigned in Assistance Review and is locked here. It is the only location donors may see; the Resident's home remains private.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.handoffGrid}>
                    <View style={styles.handoffDetailsCard}>
                      <View style={styles.handoffMiniHeader}>
                        <Ionicons name="business-outline" size={16} color="#0F766E" />
                        <Text style={styles.handoffMiniTitle}>Official Public Location</Text>
                      </View>
                      <Text style={styles.activeHandoffTitle}>{handoffLocationName}</Text>
                      <Text style={styles.activeHandoffAddress}>{handoffAddress}</Text>
                      {!!handoffNotes && (
                        <Text style={styles.privacyHelper}>{handoffNotes}</Text>
                      )}
                    </View>

                    <View style={styles.handoffMapCard}>
                      <View style={styles.handoffMiniHeader}>
                        <Ionicons name="map-outline" size={16} color="#0F766E" />
                        <Text style={styles.handoffMiniTitle}>Public Map Preview</Text>
                      </View>
                      <EmbeddedGoogleMapPreview
                        url={handoffMapPreviewUrl}
                        locationName={handoffLocationName}
                        address={handoffAddress}
                      />
                      <View style={styles.mapPrivacyStrip}>
                        <Ionicons name="shield-checkmark-outline" size={15} color="#0F766E" />
                        <Text style={styles.mapPrivacyText}>
                          The map shows the LGU-approved public coordination point only. It never uses the Resident's private home location.
                        </Text>
                      </View>
                    </View>
                  </View>

                  {allowInKind && (
                    <>
                      <Text style={styles.label}>Official receiving / handover instructions</Text>
                      <TextInput
                        style={[styles.input, styles.multilineSmall]}
                        value={inKindInstructions}
                        onChangeText={setInKindInstructions}
                        maxLength={1000}
                        multiline
                        placeholder="Explain the LGU receiving or handover procedure."
                        placeholderTextColor="#94A3B8"
                      />
                    </>
                  )}
                </View>
              )}

              {allowInKind && !openedFromAssistance && (
                <View style={[styles.subFormCard, styles.handoffSetupCard]}>
                  <View style={styles.subFormHeader}>
                    <Ionicons name="location-outline" size={18} color="#0F766E" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subFormTitle}>In-kind Donation · Handover & Location</Text>
                      <Text style={styles.handoffHelper}>
                        Select where donors may send goods or, when approved, meet the beneficiary at an authorized public location.
                      </Text>
                    </View>
                  </View>

                  <SelectField
                    label="Handover options"
                    placeholder="Select how goods may be received"
                    value={handoffMode}
                    options={HANDOFF_MODE_OPTIONS}
                    onSelect={(value) => setHandoffMode(value as HandoffMode)}
                  />

                  {(handoffMode === "coordinated_handover" || handoffMode === "both") && (
                    <View style={styles.consentNotice}>
                      <Ionicons name="people-outline" size={18} color="#9A6700" />
                      <Text style={styles.consentNoticeText}>
                        Coordinated beneficiary handover is allowed only when the LGU approves it and the beneficiary agrees. The donor sees only the authorized meeting point.
                      </Text>
                    </View>
                  )}

                  <SelectField
                    label="Location type"
                    placeholder="Select authorized location type"
                    value={handoffLocationType}
                    options={HANDOFF_LOCATION_TYPE_OPTIONS}
                    onSelect={chooseHandoffLocationType}
                  />

                  <SelectField
                    label="Select authorized location"
                    placeholder={
                      handoffLocationType
                        ? "Select the receiving / meeting point"
                        : "Select location type first"
                    }
                    value={handoffLocationPreset}
                    options={handoffLocationOptions}
                    disabled={!handoffLocationType}
                    onSelect={chooseAuthorizedLocation}
                  />

                  <View style={styles.handoffGrid}>
                    <View style={styles.handoffDetailsCard}>
                      <View style={styles.handoffMiniHeader}>
                        <Ionicons name="business-outline" size={16} color="#0F766E" />
                        <Text style={styles.handoffMiniTitle}>Selected Location Details</Text>
                      </View>

                      <Text style={styles.label}>Location name</Text>
                      <TextInput
                        style={styles.input}
                        value={handoffLocationName}
                        onChangeText={(value) => setHandoffLocationName(value.slice(0, 180))}
                        maxLength={180}
                        placeholder="e.g. Barangay Narra Hall - Relief Receiving Desk"
                        placeholderTextColor="#94A3B8"
                      />

                      <Text style={styles.label}>Public delivery / meeting address</Text>
                      <TextInput
                        style={[styles.input, styles.multilineSmall]}
                        value={handoffAddress}
                        onChangeText={(value) => setHandoffAddress(value.slice(0, 320))}
                        maxLength={320}
                        multiline
                        placeholder="Enter the public address donors can safely use. Never enter the beneficiary's home address."
                        placeholderTextColor="#94A3B8"
                      />

                      <Text style={styles.label}>Public handover note (optional)</Text>
                      <TextInput
                        style={[styles.input, styles.multilineSmall]}
                        value={handoffNotes}
                        onChangeText={(value) => setHandoffNotes(value.slice(0, 600))}
                        maxLength={600}
                        multiline
                        placeholder="Office hours, desk name, contact procedure, or coordination note."
                        placeholderTextColor="#94A3B8"
                      />
                    </View>

                    <View style={styles.handoffMapCard}>
                      <View style={styles.handoffMiniHeader}>
                        <Ionicons name="map-outline" size={16} color="#0F766E" />
                        <Text style={styles.handoffMiniTitle}>Location Preview for Donors</Text>
                      </View>

                      <EmbeddedGoogleMapPreview
                        url={handoffMapPreviewUrl}
                        locationName={handoffLocationName}
                        address={handoffAddress}
                      />

                      <View style={styles.mapPrivacyStrip}>
                        <Ionicons name="shield-checkmark-outline" size={15} color="#0F766E" />
                        <Text style={styles.mapPrivacyText}>
                          This map represents the LGU-selected receiving or handover point only. It never exposes the beneficiary's private location.
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.label}>Official receiving / handover instructions</Text>
                  <TextInput
                    style={[styles.input, styles.multilineSmall]}
                    value={inKindInstructions}
                    onChangeText={setInKindInstructions}
                    maxLength={1000}
                    multiline
                    placeholder="Explain drop-off, courier, receiving verification, or LGU-coordinated handover instructions."
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              )}

              <View style={styles.formDivider} />

              <View style={styles.formHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>5</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formTitle}>Review & Publish</Text>
                  <Text style={styles.formSubtitle}>
                    Publishing opens public donation support for this exact verified shortage. It does not assign donations directly to a Resident.
                  </Text>
                </View>
              </View>

              <View style={styles.publicPreviewCard}>
                <View style={styles.publicPreviewHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.publicPreviewEyebrow}>DONOR PAGE PREVIEW</Text>
                    <View style={styles.previewGroupPill}>
                      <Ionicons
                        name={openedFromAssistance ? "heart-outline" : "warning-outline"}
                        size={12}
                        color="#B45309"
                      />
                      <Text style={styles.previewGroupPillText}>
                        {openedFromAssistance
                          ? "COMMUNITY NEED DONATION SUPPORT"
                          : "DISASTER NEED DONATION SUPPORT"}
                      </Text>
                    </View>
                    <Text style={styles.publicPreviewTitle}>{campaignTitle || "Donation Campaign"}</Text>
                    <Text style={styles.publicPreviewLocation}>
                      {publicLocationLabel ||
                        (openedFromAssistance
                          ? communityGeneralArea(assistanceSource)
                          : defaultPublicLocation(selectedAssessment))}
                    </Text>
                  </View>
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={14} color="#15803D" />
                    <Text style={styles.verifiedBadgeText}>LGU VERIFIED</Text>
                  </View>
                </View>
                <Text style={styles.publicPreviewStory}>
                  {publicStory || campaignDescription || "Verified LGU relief situation."}
                </Text>
                <Text style={styles.publicPreviewMeta}>
                  {openedFromAssistance
                    ? `${publicIncidentType || "Verified community need"} · ${publicSeverity || "LGU verified need"} · Verified unmet amount ${money(Number(assistanceSource?.remainingAmount || 0))}`
                    : `${publicIncidentType || "Verified relief need"} · ${publicSeverity || "LGU assessed"} · ${Number(selectedAssessment.affectedHouseholds || 0)} household${Number(selectedAssessment.affectedHouseholds || 0) === 1 ? "" : "s"} · ${Number(selectedAssessment.affectedPeople || 0)} people`}
                </Text>

                {allowMonetary && Number(monetaryGoal || 0) > 0 && (
                  <View style={styles.previewFundingBox}>
                    <View>
                      <Text style={styles.previewFundingLabel}>VERIFIED FUNDING GOAL</Text>
                      <Text style={styles.previewFundingValue}>{money(Number(monetaryGoal || 0))}</Text>
                    </View>
                    <Text style={styles.previewFundingNote}>
                      Public progress starts at ₱0.00 and increases only from confirmed monetary receipts.
                    </Text>
                  </View>
                )}

                {(openedFromAssistance || allowInKind) && !!handoffLocationName.trim() && (
                  <View style={styles.previewHandoffBox}>
                    <Ionicons name="location-outline" size={16} color="#0F766E" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewHandoffLabel}>DONATION HANDOVER LOCATION</Text>
                      <Text style={styles.previewHandoffTitle}>{handoffLocationName}</Text>
                      <Text style={styles.previewHandoffAddress}>
                        {handoffAddress || "Public address must be confirmed before publishing."}
                      </Text>
                      <Text style={styles.previewHandoffMode}>{handoffModeLabel(handoffMode)}</Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.noticeBox}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#0F766E" />
                <Text style={styles.noticeText}>
                  {openedFromAssistance
                    ? "Monetary support is counted only after the LGU confirms the actual receipt or transaction record. The campaign never exposes the Resident's exact home address, contact details, IDs, or private evidence."
                    : "Monetary support is counted only after the LGU confirms it in the official account or transaction record. In-kind goods enter LGU Relief Inventory only after actual physical receipt is verified. Verified resources are later allocated through Relief Operations."}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.publishButton, busyKey === "create_campaign" && styles.disabled]}
                disabled={busyKey === "create_campaign"}
                onPress={() => void createCampaign()}
              >
                {busyKey === "create_campaign" ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons name="megaphone-outline" size={18} color="#FFFFFF" />
                )}
                <Text style={styles.publishButtonText}>Publish Donation Campaign</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.gateCard}>
              <View style={styles.gateIcon}>
                <Ionicons name="megaphone-outline" size={22} color="#0F766E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.gateTitle}>Donation Support is ready</Text>
                <Text style={styles.gateText}>
                  Continue the campaign setup for this exact verified shortage.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.gateButton}
                onPress={openCampaignSetup}
              >
                <Text style={styles.gateButtonText}>Continue Setup</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>AUDIT & MONITORING</Text>
            <Text style={styles.sectionTitle}>Campaign Records</Text>
            <Text style={styles.helperText}>
              Active and past campaigns remain visible for LGU monitoring. Each campaign keeps its verified source, category, funding goal, handoff location, and receipt history.
            </Text>
          </View>

          {campaigns.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="megaphone-outline" size={30} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No donation campaigns yet</Text>
              <Text style={styles.emptyText}>
                A campaign will appear here only after the LGU opens Donation Support for a verified resource shortage.
              </Text>
            </View>
          ) : (
            <View style={styles.cardList}>
              {campaigns.map((campaign) => {
                const campaignDonations = donations.filter((item) => item.campaignId === campaign.id);
                const receivedCampaignDonations = campaignDonations.filter(
                  (item) => item.status === "received",
                );
                const verifiedMoney = receivedCampaignDonations
                  .filter((item) => item.donationType === "monetary")
                  .reduce((sum, item) => sum + Number(item.actualAmountReceived || 0), 0);
                const verifiedGoods = summarizeVerifiedGoods(receivedCampaignDonations);

                return (
                  <View key={campaign.id} style={styles.campaignCard}>
                    <View style={styles.cardHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{campaign.title || "Donation Campaign"}</Text>
                        <View style={styles.recordBadgeRow}>
                          <View
                            style={[
                              styles.recordGroupBadge,
                              String(campaign.campaignGroup || "") === "community_needs_help"
                                ? styles.recordGroupBadgeCommunity
                                : styles.recordGroupBadgeDisaster,
                            ]}
                          >
                            <Text
                              style={[
                                styles.recordGroupBadgeText,
                                String(campaign.campaignGroup || "") === "community_needs_help"
                                  ? styles.recordGroupBadgeTextCommunity
                                  : styles.recordGroupBadgeTextDisaster,
                              ]}
                            >
                              {campaignGroupLabel(campaign).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.recordCategoryBadge}>
                            <Text style={styles.recordCategoryBadgeText}>
                              {campaignCategoryLabel(campaign).toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.cardMeta}>
                          {campaign.generalArea ||
                            campaign.publicLocationLabel ||
                            (campaign.barangays || []).join(" · ") ||
                            "Verified support area"}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          campaign.status === "published" ? styles.statusPublished : styles.statusClosed,
                        ]}
                      >
                        <Text style={styles.statusText}>{statusLabel(campaign.status)}</Text>
                      </View>
                    </View>

                    <Text style={styles.cardDescription}>{campaign.description || "—"}</Text>

                    {!!campaign.publicLocationLabel && (
                      <View style={styles.recordPublicLine}>
                        <Ionicons name="location-outline" size={14} color="#0F766E" />
                        <Text style={styles.recordPublicText}>{campaign.publicLocationLabel}</Text>
                      </View>
                    )}
                    {!!campaign.publicStory && (
                      <Text style={styles.recordPublicStory} numberOfLines={3}>
                        Public story: {campaign.publicStory}
                      </Text>
                    )}

                    <View style={styles.campaignMetrics}>
                      <CompactMetric label="Submissions" value={String(campaignDonations.length)} />
                      <CompactMetric label="Verified" value={String(receivedCampaignDonations.length)} />
                      <CompactMetric label="Monetary" value={money(verifiedMoney)} />
                      {Number(campaign.monetaryGoal || 0) > 0 && (
                        <CompactMetric label="Goal" value={money(Number(campaign.monetaryGoal || 0))} />
                      )}
                    </View>

                    {Number(campaign.monetaryGoal || 0) > 0 && (
                      <View style={styles.recordProgressBox}>
                        <View style={styles.recordProgressTop}>
                          <Text style={styles.recordProgressLabel}>Verified funding progress</Text>
                          <Text style={styles.recordProgressValue}>
                            {Math.min(
                              100,
                              Math.round(
                                (verifiedMoney / Number(campaign.monetaryGoal || 1)) * 100,
                              ),
                            )}%
                          </Text>
                        </View>
                        <View style={styles.recordProgressTrack}>
                          <View
                            style={[
                              styles.recordProgressFill,
                              {
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    (verifiedMoney / Number(campaign.monetaryGoal || 1)) * 100,
                                  ),
                                )}%` as any,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    )}

                    <View style={styles.goodsSummaryBox}>
                      <Text style={styles.goodsSummaryLabel}>Verified in-kind goods</Text>
                      <Text style={styles.goodsSummaryText}>{verifiedGoods}</Text>
                    </View>

                    <Text style={styles.cardMeta}>Created: {formatDate(campaign.createdAt)}</Text>

                    {campaign.status === "published" && (
                      <TouchableOpacity
                        style={styles.closeCampaignButton}
                        disabled={busyKey === `close_${campaign.id}`}
                        onPress={() => void closeCampaign(campaign)}
                      >
                        <Text style={styles.closeCampaignText}>Close Campaign</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.sectionTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionEyebrow}>LGU RECEIPT CHECK</Text>
              <Text style={styles.sectionTitle}>Donation Verification</Text>
              <Text style={styles.helperText}>
                A donor submission is only a claim or pledge until the LGU matches it against the official transaction history or physical receiving log. Uploaded proof is supporting evidence only.
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <SummaryCard label="Pending Review" value={pendingDonations.length} />
            <SummaryCard label="Verified Receipts" value={receivedDonations.length} />
            <SummaryCard label="Verified Monetary" value={money(verifiedMonetaryTotal)} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEyebrow}>ACTION REQUIRED</Text>
            <Text style={styles.sectionTitle}>Pending Donations</Text>
          </View>

          {!dataReady ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color="#0F766E" />
              <Text style={styles.emptyText}>Loading donation submissions...</Text>
            </View>
          ) : pendingDonations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={30} color="#15803D" />
              <Text style={styles.emptyTitle}>No donation waiting for verification</Text>
              <Text style={styles.emptyText}>
                New donor submissions will appear here first and will not count as resources until the LGU verifies actual receipt.
              </Text>
            </View>
          ) : (
            <View style={styles.cardList}>
              {pendingDonations.map((donation) => (
                <DonationReviewCard
                  key={donation.id}
                  donation={donation}
                  form={verificationForms[donation.id] || {
                    actualValue: "",
                    officialReceiptReference: "",
                    rejectionReason: "",
                  }}
                  busy={Boolean(busyKey)}
                  onUpdate={(field, value) => updateVerificationForm(donation.id, field, value)}
                  onOpenProof={openProof}
                  onVerify={() => void verifyDonation(donation)}
                  onReject={() => void rejectDonation(donation)}
                />
              ))}
            </View>
          )}

          <View style={styles.historyHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionEyebrow}>HISTORY</Text>
              <Text style={styles.sectionTitle}>Reviewed Donations</Text>
              <Text style={styles.helperText}>
                Kept collapsed by default so the LGU sees pending verification work first.
              </Text>
            </View>

            {reviewedDonations.length > 0 && (
              <TouchableOpacity
                style={styles.historyToggleButton}
                onPress={() => setShowReviewedHistory((current) => !current)}
              >
                <Text style={styles.historyToggleText}>
                  {showReviewedHistory
                    ? "Hide History"
                    : `Show History (${reviewedDonations.length})`}
                </Text>
                <Ionicons
                  name={showReviewedHistory ? "chevron-up" : "chevron-down"}
                  size={15}
                  color="#475569"
                />
              </TouchableOpacity>
            )}
          </View>

          {reviewedDonations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No reviewed donations yet</Text>
            </View>
          ) : showReviewedHistory ? (
            <View style={styles.cardList}>
              {reviewedDonations.map((donation) => (
                <ReviewedDonationCard key={donation.id} donation={donation} />
              ))}
            </View>
          ) : (
            <View style={styles.historyCollapsedCard}>
              <Ionicons name="archive-outline" size={20} color="#64748B" />
              <Text style={styles.historyCollapsedText}>
                {reviewedDonations.length} reviewed donation
                {reviewedDonations.length === 1 ? "" : "s"} archived below pending work.
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function DonationReviewCard({
  donation,
  form,
  busy,
  onUpdate,
  onOpenProof,
  onVerify,
  onReject,
}: {
  donation: DonationSubmission;
  form: VerificationForm;
  busy: boolean;
  onUpdate: (field: keyof VerificationForm, value: string) => void;
  onOpenProof: (url: string) => Promise<void>;
  onVerify: () => void;
  onReject: () => void;
}) {
  const isInKind = donation.donationType === "in_kind";
  const proofUrls = validProofUrls(donation.proofUrls);

  return (
    <View style={styles.donationCard}>
      <View style={styles.cardHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {donation.donorName || donation.donorDisplayName || "Donor"}
          </Text>
          <Text style={styles.cardMeta}>{donation.campaignTitle || "LGU Donation Campaign"}</Text>
        </View>
        <View style={[styles.statusBadge, styles.statusPending]}>
          <Text style={styles.statusText}>SUBMITTED</Text>
        </View>
      </View>

      <View style={styles.donationInfoGrid}>
        <InfoCell label="Type" value={isInKind ? "In-kind goods" : "Monetary"} />
        <InfoCell
          label={isInKind ? "Pledged" : "Amount Submitted"}
          value={
            isInKind
              ? `${Number(donation.quantityPledged || 0)} ${donation.unit || "unit"}`
              : money(Number(donation.amount || 0))
          }
        />
        <InfoCell
          label="Barangay"
          value={(donation.campaignBarangays || []).join(" · ") || "—"}
        />
        <InfoCell label="Submitted" value={formatDate(donation.createdAt)} />
      </View>

      {isInKind ? (
        <Text style={styles.detailLine}>
          {NEED_CATEGORY_LABELS[String(donation.category || "other")] || donation.category || "Other"}
          {" · "}
          {donation.itemName || "Item not specified"}
        </Text>
      ) : (
        <Text style={styles.detailLine}>
          Donor transaction reference: {donation.transactionReference || "—"}
        </Text>
      )}

      <View style={styles.proofBox}>
        <View style={styles.proofHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.proofTitle}>Donor receipt / proof</Text>
            <Text style={styles.proofHint}>
              Supporting evidence only. Confirm using the official LGU record.
            </Text>
          </View>
          <Text style={styles.proofCountText}>{proofUrls.length} FILE{proofUrls.length === 1 ? "" : "S"}</Text>
        </View>

        {proofUrls.length ? (
          <View style={styles.proofGrid}>
            {proofUrls.slice(0, 5).map((url, index) => (
              <TouchableOpacity
                key={`${donation.id}_proof_${index}`}
                style={styles.proofCard}
                onPress={() => void onOpenProof(url)}
              >
                <Image source={{ uri: url }} style={styles.proofImage} resizeMode="cover" />
                <Text style={styles.proofActionText}>Open proof {index + 1}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.noProofText}>
            No proof attached. Verify only if the donation can still be matched independently in the official LGU record.
          </Text>
        )}
      </View>

      {!!donation.donorNote && <Text style={styles.detailLine}>Donor note: {donation.donorNote}</Text>}

      <View style={styles.reviewPanel}>
        <Text style={styles.reviewTitle}>Confirm actual LGU receipt</Text>
        <Text style={styles.reviewHelp}>
          Enter what the LGU actually received, not only what the donor claimed or pledged.
        </Text>

        <Text style={styles.label}>
          {isInKind ? "Actual quantity received" : "Actual amount received (PHP)"}
        </Text>
        <TextInput
          style={styles.input}
          value={form.actualValue}
          onChangeText={(value) =>
            onUpdate(
              "actualValue",
              isInKind ? value.replace(/[^0-9]/g, "").slice(0, 9) : value.replace(/[^0-9.]/g, "").slice(0, 14),
            )
          }
          keyboardType="numeric"
          placeholder={isInKind ? "e.g. 50" : "e.g. 5000"}
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.label}>Official receipt / receiving-log reference</Text>
        <TextInput
          style={styles.input}
          value={form.officialReceiptReference}
          onChangeText={(value) => onUpdate("officialReceiptReference", value.slice(0, 160))}
          placeholder="Official LGU receipt or receiving record"
          placeholderTextColor="#94A3B8"
        />

        <TouchableOpacity
          style={[styles.verifyButton, busy && styles.disabled]}
          disabled={busy}
          onPress={onVerify}
        >
          <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
          <Text style={styles.verifyButtonText}>Verify Received</Text>
        </TouchableOpacity>

        <View style={styles.rejectDivider} />
        <Text style={styles.label}>Reject only if it cannot be verified</Text>
        <TextInput
          style={[styles.input, styles.multilineSmall]}
          multiline
          value={form.rejectionReason}
          onChangeText={(value) => onUpdate("rejectionReason", value.slice(0, 600))}
          placeholder="Reason the donation cannot be matched or received"
          placeholderTextColor="#94A3B8"
        />

        <TouchableOpacity
          style={[styles.rejectButton, busy && styles.disabled]}
          disabled={busy}
          onPress={onReject}
        >
          <Text style={styles.rejectButtonText}>Reject Submission</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ReviewedDonationCard({ donation }: { donation: DonationSubmission }) {
  const isInKind = donation.donationType === "in_kind";
  const received = donation.status === "received";

  return (
    <View style={styles.historyCard}>
      <View style={styles.cardHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{donation.campaignTitle || "LGU Donation Campaign"}</Text>
          <Text style={styles.cardMeta}>
            {donation.donorName || donation.donorDisplayName || "Donor"} · {formatDate(donation.createdAt)}
          </Text>
        </View>
        <View style={[styles.statusBadge, received ? styles.statusReceived : styles.statusRejected]}>
          <Text style={styles.statusText}>{statusLabel(donation.status)}</Text>
        </View>
      </View>

      <Text style={styles.detailLine}>
        {isInKind
          ? `${Number(donation.actualQuantityReceived || donation.quantityPledged || 0)} ${donation.unit || "unit"} ${donation.itemName || "relief goods"}`
          : money(Number(donation.actualAmountReceived || donation.amount || 0))}
      </Text>

      {received ? (
        <Text style={styles.historySuccessText}>
          Official LGU record: {donation.officialReceiptReference || "—"}
        </Text>
      ) : (
        <Text style={styles.historyRejectedText}>
          Rejected: {donation.rejectionReason || "No reason recorded"}
        </Text>
      )}
    </View>
  );
}

function FlowStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <View style={styles.flowStep}>
      <View style={styles.flowNumber}>
        <Text style={styles.flowNumberText}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.flowTitle}>{title}</Text>
        <Text style={styles.flowText}>{text}</Text>
      </View>
    </View>
  );
}

function FlowConnector() {
  return <Ionicons name="chevron-forward" size={18} color="#94A3B8" />;
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.compactMetric}>
      <Text style={styles.compactMetricLabel}>{label}</Text>
      <Text style={styles.compactMetricValue}>{value}</Text>
    </View>
  );
}

function ToggleChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleChoice, selected && styles.toggleChoiceActive]}
      onPress={onPress}
    >
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={17}
        color={selected ? "#0F766E" : "#64748B"}
      />
      <Text style={[styles.toggleChoiceText, selected && styles.toggleChoiceTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SelectField({
  label,
  placeholder,
  value,
  options,
  disabled = false,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: SelectOption[];
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <TouchableOpacity
        style={[styles.selectField, disabled && styles.selectFieldDisabled]}
        activeOpacity={0.84}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.selectFieldText,
              !value && styles.selectFieldPlaceholder,
            ]}
            numberOfLines={1}
          >
            {selected?.label || (value === "__custom__" ? "Other Authorized Public Location" : value) || placeholder}
          </Text>
          {!!selected?.helper && (
            <Text style={styles.selectFieldHelper} numberOfLines={2}>
              {selected.helper}
            </Text>
          )}
        </View>

        <Ionicons name="chevron-down" size={17} color="#64748B" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.selectModal} onPress={() => undefined}>
            <View style={styles.selectModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectModalEyebrow}>SELECT OPTION</Text>
                <Text style={styles.selectModalTitle}>{label}</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.selectModalList} showsVerticalScrollIndicator>
              {options.length === 0 ? (
                <View style={styles.selectEmptyBox}>
                  <Text style={styles.selectEmptyText}>No options available yet.</Text>
                </View>
              ) : (
                options.map((item) => {
                  const active = value === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[styles.selectOption, active && styles.selectOptionActive]}
                      onPress={() => {
                        onSelect(item.value);
                        setOpen(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.selectOptionText, active && styles.selectOptionTextActive]}>
                          {item.label}
                        </Text>
                        {!!item.helper && (
                          <Text style={styles.selectOptionHelper}>{item.helper}</Text>
                        )}
                      </View>
                      <Ionicons
                        name={active ? "checkmark-circle" : "ellipse-outline"}
                        size={19}
                        color={active ? "#0F766E" : "#CBD5E1"}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function EmbeddedGoogleMapPreview({
  url,
  locationName,
  address,
}: {
  url: string;
  locationName: string;
  address: string;
}) {
  if (!url) {
    return (
      <View style={styles.mapPreviewPlaceholder}>
        <View style={styles.mapPreviewIcon}>
          <Ionicons name="map-outline" size={26} color="#0F766E" />
        </View>
        <Text style={styles.mapPreviewPlaceholderTitle}>Map preview appears here</Text>
        <Text style={styles.mapPreviewPlaceholderText}>
          Select an authorized location, then enter its public delivery or meeting address.
        </Text>
      </View>
    );
  }

  if (Platform.OS !== "web") {
    return (
      <View style={styles.mapPreviewPlaceholder}>
        <View style={styles.mapPreviewIcon}>
          <Ionicons name="location-outline" size={26} color="#0F766E" />
        </View>
        <Text style={styles.mapPreviewPlaceholderTitle}>{locationName || "Authorized location"}</Text>
        <Text style={styles.mapPreviewPlaceholderText}>
          {address || "The public handover address will appear here."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.embeddedMapFrame}>
      {React.createElement("iframe" as any, {
        src: url,
        title: "LGU authorized donation handover location",
        loading: "lazy",
        referrerPolicy: "no-referrer-when-downgrade",
        style: {
          width: "100%",
          height: "100%",
          border: 0,
          borderRadius: 10,
          pointerEvents: "none",
          backgroundColor: "#E2E8F0",
        },
      })}
      <View style={styles.mapReadOnlyBadge}>
        <Ionicons name="shield-checkmark-outline" size={13} color="#0F766E" />
        <Text style={styles.mapReadOnlyText}>LGU-selected public point</Text>
      </View>
    </View>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  container: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 60,
  },
  center: {
    flex: 1,
    minHeight: 520,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F7FB",
  },
  loadingText: { marginTop: 10, color: "#64748B", fontWeight: "700" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DDE5EC",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  headerTextWrap: { flex: 1 },
  eyebrow: { color: "#0F766E", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  title: { marginTop: 3, color: "#0F172A", fontSize: 27, fontWeight: "900" },
  subtitle: { marginTop: 5, maxWidth: 780, color: "#64748B", fontSize: 12, lineHeight: 18 },
  flowCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DDE7E4",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  flowStep: { flex: 1, minWidth: 210, flexDirection: "row", alignItems: "center", gap: 9 },
  flowNumber: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#E8F5F1",
  },
  flowNumberText: { color: "#0F766E", fontSize: 11, fontWeight: "900" },
  flowTitle: { color: "#0F172A", fontSize: 10.5, fontWeight: "900" },
  flowText: { marginTop: 2, color: "#64748B", fontSize: 9.5, lineHeight: 14 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F2C7C2",
    borderRadius: 10,
    backgroundColor: "#FFF1F0",
  },
  errorText: { flex: 1, color: "#B42318", fontSize: 11, fontWeight: "700" },
  viewTabs: {
    flexDirection: "row",
    gap: 8,
    padding: 5,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#DFE7EE",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  viewTab: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 9,
  },
  viewTabActive: { backgroundColor: "#ECFDF5" },
  viewTabText: { color: "#64748B", fontSize: 10.5, fontWeight: "900" },
  viewTabTextActive: { color: "#0F766E" },
  tabCountBadge: {
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  pendingCountBadge: { backgroundColor: "#FDE68A" },
  tabCountText: { color: "#334155", fontSize: 9, fontWeight: "900" },
  sectionTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  sectionHeader: { marginTop: 24, marginBottom: 10 },
  sectionEyebrow: { color: "#0F766E", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  sectionTitle: { marginTop: 2, color: "#0F172A", fontSize: 17, fontWeight: "900" },
  helperText: { marginTop: 5, maxWidth: 780, color: "#64748B", fontSize: 10.5, lineHeight: 16 },
  primaryButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#0F766E",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "900" },
  formCard: {
    padding: 18,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#CFE4DF",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  formHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepBadge: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#0F766E",
  },
  stepBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  formTitle: { color: "#0F172A", fontSize: 13, fontWeight: "900" },
  formSubtitle: { marginTop: 2, color: "#64748B", fontSize: 10, lineHeight: 15 },
  formDivider: { height: 1, marginVertical: 18, backgroundColor: "#E2E8F0" },
  selectedSourceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#BFE1D7",
    borderRadius: 11,
    backgroundColor: "#F2FBF8",
  },
  selectedSourceIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  selectedSourceLabel: { color: "#0F766E", fontSize: 8.5, fontWeight: "900", textTransform: "uppercase" },
  selectedSourceTitle: { marginTop: 2, color: "#0F172A", fontSize: 13, fontWeight: "900" },
  selectedSourceMeta: { marginTop: 2, color: "#64748B", fontSize: 9.5 },
  needChoiceList: { marginTop: 12, gap: 8 },
  needChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: "#DDE5EC",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  needChoiceActive: { borderColor: "#0F766E", backgroundColor: "#ECFDF5" },
  needChoiceDisabled: { opacity: 0.55 },
  needChoiceTitle: { color: "#334155", fontSize: 11, fontWeight: "900" },
  needChoiceTitleActive: { color: "#0F766E" },
  needChoiceMeta: { marginTop: 2, color: "#64748B", fontSize: 9.5 },
  needChoiceStatus: { color: "#0F766E", fontSize: 8.5, fontWeight: "900" },
  needChoiceStatusMuted: { color: "#64748B", fontSize: 8.5, fontWeight: "900" },
  inlineEmpty: { alignItems: "center", padding: 18 },
  inlineEmptyTitle: { marginTop: 5, color: "#334155", fontSize: 11, fontWeight: "900" },
  inlineEmptyText: { marginTop: 3, color: "#64748B", fontSize: 9.5, textAlign: "center" },
  needSummaryCard: {
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#DDE5EC",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  needSummaryHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  needSummaryEyebrow: { color: "#64748B", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.6 },
  needSummaryTitle: { marginTop: 2, color: "#0F172A", fontSize: 14, fontWeight: "900" },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: "#DCFCE7" },
  verifiedBadgeText: { color: "#15803D", fontSize: 8, fontWeight: "900" },
  needStatsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  miniStat: { flex: 1, padding: 9, borderRadius: 9, backgroundColor: "#FFFFFF" },
  miniStatValue: { color: "#0F172A", fontSize: 16, fontWeight: "900" },
  miniStatLabel: { marginTop: 1, color: "#64748B", fontSize: 8.5, fontWeight: "800" },
  needTagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  needTag: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: "#E8F5F1" },
  needTagText: { color: "#0F766E", fontSize: 8.5, fontWeight: "800" },
  otherNeedText: { marginTop: 9, color: "#475569", fontSize: 9.5, lineHeight: 14 },
  warningNotice: { flexDirection: "row", gap: 8, marginTop: 14, padding: 11, borderWidth: 1, borderColor: "#F3D58A", borderRadius: 10, backgroundColor: "#FFF9E8" },
  warningNoticeText: { flex: 1, color: "#7A5A00", fontSize: 9.5, lineHeight: 15 },
  label: { marginTop: 12, marginBottom: 5, color: "#334155", fontSize: 10.5, fontWeight: "900" },
  input: { minHeight: 42, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: "#D9E1E8", borderRadius: 9, backgroundColor: "#FFFFFF", color: "#0F172A", fontSize: 11.5 },
  multiline: { minHeight: 92, textAlignVertical: "top" },
  multilineSmall: { minHeight: 70, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toggleChoice: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#D5DDE5", borderRadius: 9, backgroundColor: "#FFFFFF" },
  toggleChoiceActive: { borderColor: "#A7DCCE", backgroundColor: "#ECFDF5" },
  toggleChoiceText: { color: "#64748B", fontSize: 10.5, fontWeight: "800" },
  toggleChoiceTextActive: { color: "#0F766E" },
  subFormCard: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, backgroundColor: "#FBFCFD" },
  subFormHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  subFormTitle: { color: "#0F172A", fontSize: 11, fontWeight: "900" },
  noticeBox: { marginTop: 13, flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderWidth: 1, borderColor: "#CFE9E2", borderRadius: 10, backgroundColor: "#F3FAF8" },
  noticeText: { flex: 1, color: "#49646F", fontSize: 10, lineHeight: 15 },
  publishButton: { marginTop: 14, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, backgroundColor: "#0F766E" },
  publishButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  cardList: { gap: 9 },
  campaignCard: { padding: 15, borderWidth: 1, borderColor: "#DFE7EE", borderRadius: 12, backgroundColor: "#FFFFFF" },
  donationCard: { padding: 15, borderWidth: 1, borderColor: "#DFE7EE", borderRadius: 12, backgroundColor: "#FFFFFF" },
  historyCard: { padding: 13, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 11, backgroundColor: "#FFFFFF" },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { color: "#0F172A", fontSize: 13.5, fontWeight: "900" },
  cardMeta: { marginTop: 3, color: "#64748B", fontSize: 9.5, lineHeight: 14 },
  cardDescription: { marginTop: 9, color: "#475569", fontSize: 10.5, lineHeight: 16 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  statusPublished: { backgroundColor: "#15803D" },
  statusClosed: { backgroundColor: "#475569" },
  statusPending: { backgroundColor: "#B7791F" },
  statusReceived: { backgroundColor: "#15803D" },
  statusRejected: { backgroundColor: "#B42318" },
  statusText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  campaignMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  compactMetric: { minWidth: 120, padding: 8, borderRadius: 8, backgroundColor: "#F8FAFC" },
  compactMetricLabel: { color: "#94A3B8", fontSize: 7.5, fontWeight: "900", textTransform: "uppercase" },
  compactMetricValue: { marginTop: 2, color: "#334155", fontSize: 10, fontWeight: "900" },
  goodsSummaryBox: { marginTop: 9, padding: 9, borderRadius: 8, backgroundColor: "#F3FAF8" },
  goodsSummaryLabel: { color: "#0F766E", fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  goodsSummaryText: { marginTop: 3, color: "#49646F", fontSize: 9.5, lineHeight: 14 },
  closeCampaignButton: { alignSelf: "flex-start", marginTop: 10, paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, backgroundColor: "#F8FAFC" },
  closeCampaignText: { color: "#475569", fontSize: 9.5, fontWeight: "900" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 16 },
  summaryCard: { flexGrow: 1, flexBasis: 180, minWidth: 160, padding: 12, borderWidth: 1, borderColor: "#DFE7EE", borderRadius: 11, backgroundColor: "#FFFFFF" },
  summaryValue: { color: "#0F172A", fontSize: 20, fontWeight: "900" },
  summaryLabel: { marginTop: 2, color: "#64748B", fontSize: 9.5, fontWeight: "800" },
  donationInfoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
  infoCell: { flexGrow: 1, flexBasis: 150, minWidth: 135, padding: 8, borderRadius: 8, backgroundColor: "#F8FAFC" },
  infoLabel: { color: "#94A3B8", fontSize: 7.5, fontWeight: "900", textTransform: "uppercase" },
  infoValue: { marginTop: 3, color: "#334155", fontSize: 10, fontWeight: "800" },
  detailLine: { marginTop: 8, color: "#475569", fontSize: 10, lineHeight: 15 },
  proofBox: { marginTop: 11, padding: 11, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, backgroundColor: "#FBFCFD" },
  proofHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  proofTitle: { color: "#0F172A", fontSize: 10.5, fontWeight: "900" },
  proofHint: { marginTop: 2, color: "#64748B", fontSize: 9, lineHeight: 13 },
  proofCountText: { color: "#64748B", fontSize: 8, fontWeight: "900" },
  proofGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 },
  proofCard: { width: 150, overflow: "hidden", borderWidth: 1, borderColor: "#DDE5EC", borderRadius: 9, backgroundColor: "#FFFFFF" },
  proofImage: { width: "100%", height: 92, backgroundColor: "#E2E8F0" },
  proofActionText: { padding: 7, color: "#0F766E", fontSize: 8.5, fontWeight: "900" },
  noProofText: { marginTop: 8, color: "#64748B", fontSize: 9, lineHeight: 14 },
  reviewPanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: "#DDE5EC", borderRadius: 10, backgroundColor: "#FBFCFD" },
  reviewTitle: { color: "#0F172A", fontSize: 11.5, fontWeight: "900" },
  reviewHelp: { marginTop: 3, color: "#64748B", fontSize: 9.5, lineHeight: 14 },
  verifyButton: { marginTop: 11, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 13, borderRadius: 9, backgroundColor: "#15803D" },
  verifyButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  rejectDivider: { height: 1, marginTop: 14, backgroundColor: "#E2E8F0" },
  rejectButton: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#F2C7C2", borderRadius: 9, backgroundColor: "#FFF1F0" },
  rejectButtonText: { color: "#B42318", fontSize: 9.5, fontWeight: "900" },
  historySuccessText: { marginTop: 6, color: "#15803D", fontSize: 9.5, fontWeight: "700" },
  historyRejectedText: { marginTop: 6, color: "#B42318", fontSize: 9.5, fontWeight: "700" },
  emptyCard: { minHeight: 130, alignItems: "center", justifyContent: "center", padding: 22, borderWidth: 1, borderColor: "#DFE7EE", borderRadius: 12, backgroundColor: "#FFFFFF" },
  emptyTitle: { marginTop: 8, color: "#0F172A", fontSize: 13, fontWeight: "900" },
  emptyText: { marginTop: 4, maxWidth: 620, color: "#64748B", fontSize: 10.5, textAlign: "center", lineHeight: 16 },

  nextActionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#BFE1D7",
    borderRadius: 14,
    backgroundColor: "#F2FBF8",
  },
  nextActionIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  nextActionBody: { flex: 1, minWidth: 180 },
  nextActionEyebrow: {
    color: "#0F766E",
    fontSize: 8.5,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  nextActionTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  nextActionText: {
    marginTop: 3,
    maxWidth: 760,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14,
  },
  nextActionButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: "#0F766E",
  },
  nextActionButtonText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "900",
  },

  historyHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 24,
    marginBottom: 10,
  },
  historyToggleButton: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#DDE5EC",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  historyToggleText: {
    color: "#475569",
    fontSize: 9.5,
    fontWeight: "900",
  },
  historyCollapsedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  historyCollapsedText: {
    flex: 1,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14,
  },

  gateCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#CFE4DF",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  gateIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
  },
  gateTitle: { color: "#0F172A", fontSize: 13, fontWeight: "900" },
  gateText: { marginTop: 3, maxWidth: 720, color: "#64748B", fontSize: 10, lineHeight: 15 },
  gateButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: "#0F766E",
  },
  gateButtonText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: "900" },
  shortageCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 13,
    padding: 11,
    borderWidth: 1,
    borderColor: "#F3D58A",
    borderRadius: 10,
    backgroundColor: "#FFF9E8",
  },
  shortageTitle: { color: "#7A5A00", fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  shortageText: { marginTop: 2, color: "#7A5A00", fontSize: 9.5, lineHeight: 15 },
  scopeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#E8F5F1",
  },
  scopeBadgeText: { color: "#0F766E", fontSize: 8, fontWeight: "900" },
  activeCampaignFocus: {
    padding: 17,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#BFE1D7",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  activeCampaignActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 13,
  },
  secondaryButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#D5DDE5",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: { color: "#475569", fontSize: 9.5, fontWeight: "900" },

  publicPresentationCard: {
    marginTop: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#DCE8E5",
    borderRadius: 12,
    backgroundColor: "#FBFEFD",
  },
  publicFactRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  publicFactCell: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 150,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#F3FAF8",
  },
  publicFactLabel: { color: "#0F766E", fontSize: 7.5, fontWeight: "900", letterSpacing: 0.5 },
  publicFactValue: { marginTop: 3, color: "#0F172A", fontSize: 10.5, fontWeight: "900" },
  privacyHelper: { marginTop: 5, color: "#64748B", fontSize: 9, lineHeight: 14 },
  publicNeedsBox: {
    marginTop: 12,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  publicNeedsTitle: { color: "#0F172A", fontSize: 10.5, fontWeight: "900" },
  publicNeedsText: { marginTop: 3, color: "#64748B", fontSize: 9, lineHeight: 14 },
  publicNeedsEmpty: { color: "#64748B", fontSize: 9, fontStyle: "italic" },
  photoSectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  photoCountBadge: {
    minWidth: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#E7F6F2",
  },
  photoCountText: { color: "#0F766E", fontSize: 8.5, fontWeight: "900" },
  photoLoadingBox: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  photoLoadingText: { color: "#64748B", fontSize: 9.5, fontWeight: "700" },
  publicPhotoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 9 },
  publicPhotoCard: {
    width: 160,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE5EC",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  publicPhotoCardSelected: { borderColor: "#0F766E", backgroundColor: "#F0FDFA" },
  publicPhotoImage: { width: "100%", height: 100, backgroundColor: "#E2E8F0" },
  publicPhotoFooter: { flexDirection: "row", alignItems: "center", gap: 5, padding: 8 },
  publicPhotoText: { flex: 1, color: "#64748B", fontSize: 8.5, fontWeight: "800" },
  publicPhotoTextSelected: { color: "#0F766E", fontWeight: "900" },
  noPublicPhotoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    padding: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  noPublicPhotoText: { flex: 1, color: "#64748B", fontSize: 9.5, lineHeight: 14 },
  publicPhotoUploadPanel: {
    marginTop: 9,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DDE4FF",
    borderRadius: 12,
    backgroundColor: "#FAFBFF",
  },
  publicPhotoUploadTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  publicPhotoUploadIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EEF2FF",
  },
  publicPhotoUploadTitle: {
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  publicPhotoUploadText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
  },
  publicPhotoUploadButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: "#4F46E5",
  },
  publicPhotoUploadButtonText: {
    color: "#FFFFFF",
    fontSize: 9.2,
    fontWeight: "900",
  },
  publicPhotoUploadStatus: {
    marginTop: 8,
    color: "#4F46E5",
    fontSize: 8.8,
    fontWeight: "800",
  },
  uploadedPublicPhotoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 10,
  },
  uploadedPublicPhotoCard: {
    position: "relative",
    width: 160,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE4FF",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  uploadedPublicPhotoImage: {
    width: "100%",
    height: 100,
    backgroundColor: "#E2E8F0",
  },
  removePublicPhotoButton: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.82)",
  },
  uploadedPublicPhotoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  uploadedPublicPhotoLabelText: {
    color: "#475569",
    fontSize: 8.3,
    fontWeight: "800",
  },
  activePublicPhotosCard: {
    marginTop: 13,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DDE4FF",
    borderRadius: 12,
    backgroundColor: "#FAFBFF",
  },
  activePublicPhotosHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  activePublicPhotosIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
  },
  activePublicPhotosTitle: {
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  activePublicPhotosText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
  },
  activePublicPhotoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  savePublicPhotosButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  savePublicPhotosButtonText: {
    color: "#4F46E5",
    fontSize: 9.2,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.55,
  },
  publicPreviewCard: {
    marginTop: 12,
    marginBottom: 11,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BFE1D7",
    borderRadius: 11,
    backgroundColor: "#F7FCFA",
  },
  publicPreviewHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  publicPreviewEyebrow: { color: "#0F766E", fontSize: 7.8, fontWeight: "900", letterSpacing: 0.6 },
  publicPreviewTitle: { marginTop: 3, color: "#0F172A", fontSize: 12.5, fontWeight: "900" },
  publicPreviewLocation: { marginTop: 3, color: "#0F766E", fontSize: 9.5, fontWeight: "800" },
  publicPreviewStory: { marginTop: 9, color: "#475569", fontSize: 10, lineHeight: 15 },
  publicPreviewMeta: { marginTop: 8, color: "#64748B", fontSize: 8.8, fontWeight: "800" },
  recordPublicLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  recordPublicText: { color: "#0F766E", fontSize: 9.2, fontWeight: "800" },
  recordPublicStory: { marginTop: 5, color: "#64748B", fontSize: 9.2, lineHeight: 14 },

  handoffSetupCard: {
    borderColor: "#BFE1D7",
    backgroundColor: "#FBFEFD",
  },
  handoffHelper: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14,
  },
  consentNotice: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F3D58A",
    borderRadius: 9,
    backgroundColor: "#FFF9E8",
  },
  consentNoticeText: {
    flex: 1,
    color: "#7A5A00",
    fontSize: 9.2,
    lineHeight: 14,
  },
  handoffGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  handoffDetailsCard: {
    flexGrow: 1,
    flexBasis: 390,
    minWidth: 280,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DDE7E4",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  handoffMapCard: {
    flexGrow: 1,
    flexBasis: 390,
    minWidth: 280,
    padding: 12,
    borderWidth: 1,
    borderColor: "#CFE9E2",
    borderRadius: 10,
    backgroundColor: "#F7FCFA",
  },
  handoffMiniHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  handoffMiniTitle: {
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  mapPrivacyStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 9,
    padding: 9,
    borderRadius: 8,
    backgroundColor: "#ECFDF5",
  },
  mapPrivacyText: {
    flex: 1,
    color: "#49646F",
    fontSize: 8.8,
    lineHeight: 13,
  },
  mapPreviewPlaceholder: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    marginTop: 9,
    borderWidth: 1,
    borderColor: "#DDE5EC",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  mapPreviewIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E8F5F1",
  },
  mapPreviewPlaceholderTitle: {
    marginTop: 9,
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  mapPreviewPlaceholderText: {
    marginTop: 4,
    maxWidth: 330,
    color: "#64748B",
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
  },
  embeddedMapFrame: {
    position: "relative",
    height: 245,
    overflow: "hidden",
    marginTop: 9,
    borderWidth: 1,
    borderColor: "#D4E4DF",
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
  },
  mapReadOnlyBadge: {
    position: "absolute",
    left: 9,
    bottom: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  mapReadOnlyText: {
    color: "#0F766E",
    fontSize: 8,
    fontWeight: "900",
  },
  selectField: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#D9E1E8",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  selectFieldDisabled: {
    opacity: 0.55,
    backgroundColor: "#F8FAFC",
  },
  selectFieldText: {
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "800",
  },
  selectFieldPlaceholder: {
    color: "#94A3B8",
    fontWeight: "700",
  },
  selectFieldHelper: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.3,
    lineHeight: 12,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  selectModal: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "76%",
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  selectModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  selectModalEyebrow: {
    color: "#0F766E",
    fontSize: 7.8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  selectModalTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
  },
  selectModalList: {
    padding: 10,
  },
  selectOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  selectOptionActive: {
    borderColor: "#A7DCCE",
    backgroundColor: "#ECFDF5",
  },
  selectOptionText: {
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "900",
  },
  selectOptionTextActive: {
    color: "#0F766E",
  },
  selectOptionHelper: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.7,
    lineHeight: 13,
  },
  selectEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  selectEmptyText: {
    color: "#64748B",
    fontSize: 9.5,
  },
  previewHandoffBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#CFE9E2",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  previewHandoffLabel: {
    color: "#0F766E",
    fontSize: 7.6,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  previewHandoffTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  previewHandoffAddress: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.8,
    lineHeight: 13,
  },
  previewHandoffMode: {
    marginTop: 4,
    color: "#0F766E",
    fontSize: 8.5,
    fontWeight: "800",
  },
  activeHandoffStrip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#CFE9E2",
    borderRadius: 9,
    backgroundColor: "#F3FAF8",
  },
  activeHandoffLabel: {
    color: "#0F766E",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  activeHandoffTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 10.2,
    fontWeight: "900",
  },
  activeHandoffAddress: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.8,
    lineHeight: 13,
  },

  sourceBadgeStack: {
    alignItems: "flex-end",
    gap: 6,
  },
  disasterGroupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
  },
  disasterGroupBadgeText: {
    color: "#B45309",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.35,
  },
  fundingGoalCard: {
    marginTop: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#CFE4DF",
    borderRadius: 11,
    backgroundColor: "#F7FCFA",
  },
  fundingGoalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginBottom: 4,
  },
  fundingGoalIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#E8F5F1",
  },
  fundingGoalTitle: {
    color: "#0F172A",
    fontSize: 10.8,
    fontWeight: "900",
  },
  fundingGoalText: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.8,
    lineHeight: 13,
  },
  previewGroupPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
  },
  previewGroupPillText: {
    color: "#B45309",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  previewFundingBox: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#CFE4DF",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  previewFundingLabel: {
    color: "#0F766E",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  previewFundingValue: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  previewFundingNote: {
    flexGrow: 1,
    flexBasis: 240,
    color: "#64748B",
    fontSize: 8.8,
    lineHeight: 13,
  },
  recordBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 5,
    marginBottom: 2,
  },
  recordGroupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  recordGroupBadgeDisaster: {
    backgroundColor: "#FFF7ED",
  },
  recordGroupBadgeCommunity: {
    backgroundColor: "#EFF6FF",
  },
  recordGroupBadgeText: {
    fontSize: 7.2,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  recordGroupBadgeTextDisaster: {
    color: "#B45309",
  },
  recordGroupBadgeTextCommunity: {
    color: "#1D4ED8",
  },
  recordCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
  },
  recordCategoryBadgeText: {
    color: "#475569",
    fontSize: 7.2,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  recordProgressBox: {
    marginTop: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#DCE8E5",
    borderRadius: 9,
    backgroundColor: "#F8FCFB",
  },
  recordProgressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  recordProgressLabel: {
    color: "#475569",
    fontSize: 8.8,
    fontWeight: "800",
  },
  recordProgressValue: {
    color: "#0F766E",
    fontSize: 9,
    fontWeight: "900",
  },
  recordProgressTrack: {
    height: 7,
    overflow: "hidden",
    marginTop: 7,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  recordProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#0F766E",
  },

  disabled: { opacity: 0.5 },
});
