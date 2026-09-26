import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { Redirect } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type DonationType = "monetary" | "in_kind";
type CampaignGroup = "disaster_affected" | "community_needs_help";
type CampaignFilter = "all" | CampaignGroup;
type HandoffMode = "receiving_point" | "coordinated_handover" | "both";
type HandoffLocationType =
  | "barangay_relief_desk"
  | "evacuation_center"
  | "lgu_relief_center"
  | "city_hall"
  | "hospital"
  | "vet_clinic"
  | "social_welfare_office"
  | "shelter"
  | "public_meeting_point"
  | "other_authorized_location"
  | "other";

type DonationProof = {
  uri: string;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  file?: any;
};

type PublicNeed = {
  category?: string;
  label?: string;
  needed?: number;
  received?: number;
  remaining?: number;
  unit?: string;
};

type PublicStory = {
  id?: string;
  title?: string;
  body?: string;
  text?: string;
  authorLabel?: string;
  publishedAt?: any;
  imageUrls?: string[];
};

type DonationCampaign = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  barangays?: string[];
  acceptedDonationTypes?: DonationType[];
  acceptedCategories?: string[];
  officialChannelLabel?: string;
  officialChannelInstructions?: string;
  inKindInstructions?: string;
  createdAt?: any;
  sourceType?: string;

  // New optional public classification fields.
  // Existing campaigns remain compatible when these are absent.
  campaignGroup?: CampaignGroup | string;
  campaignCategory?: string;
  beneficiaryType?: string;
  generalArea?: string;

  // Optional privacy-safe public presentation fields.
  publicStory?: string;
  publicLocationLabel?: string;
  publicIncidentType?: string;
  publicSeverity?: string;
  publicPhotoUrls?: string[];
  photoUrls?: string[];
  imageUrls?: string[];
  affectedHouseholds?: number;
  affectedPeople?: number;
  publicNeeds?: PublicNeed[];
  publicStories?: PublicStory[];
  publicUpdates?: PublicStory[];

  // Optional public monetary progress fields.
  // These should be updated only from LGU/backend-confirmed payment records.
  monetaryGoal?: number;
  targetAmount?: number;
  fundingGoal?: number;
  verifiedAmountReceived?: number;
  amountRaised?: number;
  monetaryRaised?: number;

  // LGU-controlled public donation handoff / receiving / service location.
  handoffMode?: HandoffMode;
  handoffLocationType?: HandoffLocationType | string;
  handoffLocationName?: string;
  handoffAddress?: string;
  handoffNotes?: string;
};

type MyDonation = {
  id: string;
  campaignId?: string;
  campaignTitle?: string;
  donationType?: DonationType | string;
  category?: string;
  itemName?: string;
  unit?: string;
  quantityPledged?: number;
  amount?: number;
  status?: string;
  rejectionReason?: string;
  transactionReference?: string;
  proofUrls?: string[];
  actualAmountReceived?: number;
  actualQuantityReceived?: number;
  officialReceiptReference?: string;
  donorNote?: string;
  createdAt?: any;
};

type SelectOption = {
  value: string;
  label: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  food: "Food",
  water: "Water",
  hygiene: "Hygiene",
  clothing: "Clothing",
  shelter: "Shelter",
  medical: "Medical",
  medicine: "Medicine",
  surgery: "Surgery / Treatment",
  animal_welfare: "Animal / Pet Welfare",
  pet_food: "Pet Food",
  veterinary: "Veterinary Support",
  elderly: "Elderly Assistance",
  basic_needs: "Basic Needs",
  mobility: "Mobility Aid",
  other: "Other",
};

const CATEGORY_ICONS: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  food: "restaurant-outline",
  water: "water-outline",
  hygiene: "sparkles-outline",
  clothing: "shirt-outline",
  shelter: "home-outline",
  medical: "medkit-outline",
  medicine: "medical-outline",
  surgery: "fitness-outline",
  animal_welfare: "paw-outline",
  pet_food: "paw-outline",
  veterinary: "paw-outline",
  elderly: "accessibility-outline",
  basic_needs: "heart-outline",
  mobility: "accessibility-outline",
  other: "ellipsis-horizontal-circle-outline",
};

const ITEM_SUGGESTIONS: Record<string, SelectOption[]> = {
  food: [
    { value: "Rice", label: "Rice" },
    { value: "Food Pack", label: "Food Pack" },
    { value: "Canned Goods", label: "Canned Goods" },
    { value: "Biscuits", label: "Biscuits" },
    { value: "Ready-to-Eat Meals", label: "Ready-to-Eat Meals" },
    { value: "Other Food Item", label: "Other Food Item" },
  ],
  water: [
    { value: "Bottled Water", label: "Bottled Water" },
    { value: "Drinking Water Container", label: "Drinking Water Container" },
    { value: "Water Refill", label: "Water Refill" },
    { value: "Other Water Item", label: "Other Water Item" },
  ],
  hygiene: [
    { value: "Hygiene Kit", label: "Hygiene Kit" },
    { value: "Soap", label: "Soap" },
    { value: "Toothpaste", label: "Toothpaste" },
    { value: "Sanitary Pads", label: "Sanitary Pads" },
    { value: "Diapers", label: "Diapers" },
    { value: "Other Hygiene Item", label: "Other Hygiene Item" },
  ],
  clothing: [
    { value: "Adult Clothing Set", label: "Adult Clothing Set" },
    { value: "Children's Clothing Set", label: "Children's Clothing Set" },
    { value: "Blanket", label: "Blanket" },
    { value: "Towel", label: "Towel" },
    { value: "Other Clothing Item", label: "Other Clothing Item" },
  ],
  shelter: [
    { value: "Tarpaulin", label: "Tarpaulin" },
    { value: "Roofing Sheet", label: "Roofing Sheet" },
    { value: "Plywood", label: "Plywood" },
    { value: "Sleeping Mat", label: "Sleeping Mat" },
    { value: "Nails / Fasteners", label: "Nails / Fasteners" },
    { value: "Other Shelter Material", label: "Other Shelter Material" },
  ],
  medical: [
    { value: "First Aid Kit", label: "First Aid Kit" },
    { value: "Face Masks", label: "Face Masks" },
    { value: "Basic Medical Supplies", label: "Basic Medical Supplies" },
    { value: "Other Medical Item", label: "Other Medical Item" },
  ],
  medicine: [
    { value: "Prescribed Medical Supplies", label: "Prescribed Medical Supplies" },
    { value: "Adult Diapers", label: "Adult Diapers" },
    { value: "Wound Care Supplies", label: "Wound Care Supplies" },
    { value: "Other Approved Medical Supply", label: "Other Approved Medical Supply" },
  ],
  animal_welfare: [
    { value: "Pet Food", label: "Pet Food" },
    { value: "Animal Care Supplies", label: "Animal Care Supplies" },
    { value: "Carrier / Crate", label: "Carrier / Crate" },
    { value: "Other Animal Welfare Item", label: "Other Animal Welfare Item" },
  ],
  pet_food: [
    { value: "Dog Food", label: "Dog Food" },
    { value: "Cat Food", label: "Cat Food" },
    { value: "Other Pet Food", label: "Other Pet Food" },
  ],
  veterinary: [
    { value: "Animal Care Supplies", label: "Animal Care Supplies" },
    { value: "Recovery Cone", label: "Recovery Cone" },
    { value: "Pet Hygiene Supplies", label: "Pet Hygiene Supplies" },
    { value: "Other Veterinary Support Item", label: "Other Veterinary Support Item" },
  ],
  elderly: [
    { value: "Adult Diapers", label: "Adult Diapers" },
    { value: "Blanket", label: "Blanket" },
    { value: "Nutrition Pack", label: "Nutrition Pack" },
    { value: "Other Elderly Support Item", label: "Other Elderly Support Item" },
  ],
  basic_needs: [
    { value: "Food Pack", label: "Food Pack" },
    { value: "Hygiene Kit", label: "Hygiene Kit" },
    { value: "Clothing Set", label: "Clothing Set" },
    { value: "Blanket", label: "Blanket" },
    { value: "Other Basic Need", label: "Other Basic Need" },
  ],
  mobility: [
    { value: "Wheelchair", label: "Wheelchair" },
    { value: "Walker", label: "Walker" },
    { value: "Cane", label: "Cane" },
    { value: "Other Mobility Aid", label: "Other Mobility Aid" },
  ],
  other: [{ value: "Other Verified Item", label: "Other Verified Item" }],
};

const UNIT_OPTIONS: SelectOption[] = [
  { value: "pack", label: "Pack / packs" },
  { value: "piece", label: "Piece / pieces" },
  { value: "box", label: "Box / boxes" },
  { value: "bottle", label: "Bottle / bottles" },
  { value: "kit", label: "Kit / kits" },
  { value: "set", label: "Set / sets" },
  { value: "sack", label: "Sack / sacks" },
  { value: "kg", label: "Kilogram / kg" },
  { value: "liter", label: "Liter / liters" },
];

const DELIVERY_OPTIONS: SelectOption[] = [
  {
    value: "drop_off",
    label: "Drop off at the LGU-approved receiving point",
  },
  {
    value: "courier",
    label: "Send by courier to the LGU-approved receiving point",
  },
  {
    value: "coordinate_pickup",
    label: "Request an LGU-approved pickup",
  },
  {
    value: "coordinated_handover",
    label: "Meet at the LGU-approved public handoff location",
  },
];

const FILTER_OPTIONS: { value: CampaignFilter; label: string; shortLabel: string }[] = [
  { value: "all", label: "All", shortLabel: "All" },
  {
    value: "disaster_affected",
    label: "Disaster Need Donation Support",
    shortLabel: "Disaster Support",
  },
  {
    value: "community_needs_help",
    label: "Community Need Donation Support",
    shortLabel: "Community Needs",
  },
];

const DISASTER_KEYWORDS = [
  "disaster",
  "fire",
  "flood",
  "typhoon",
  "storm",
  "earthquake",
  "landslide",
  "evacuation",
  "calamity",
  "household relief",
  "community relief",
  "roofing",
  "damaged home",
  "recovery",
];

const COMMUNITY_KEYWORDS = [
  "cancer",
  "medical",
  "surgery",
  "treatment",
  "hospital",
  "dialysis",
  "elderly",
  "senior",
  "homeless",
  "basic needs",
  "animal",
  "pet",
  "veterinary",
  "vet",
  "rescue",
  "wheelchair",
];

const CLOUDINARY_CLOUD_NAME = "netjawtz";
const CLOUDINARY_UPLOAD_PRESET = "volunserve_evidence";
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

const sanitizeMoneyInput = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  const safeWhole = whole.slice(0, 12);

  if (!decimalParts.length) return safeWhole;
  return `${safeWhole}.${decimal}`;
};

const proofFromAsset = (asset: ImagePicker.ImagePickerAsset): DonationProof => ({
  uri: asset.uri,
  fileName: asset.fileName,
  fileSize: asset.fileSize,
  mimeType: asset.mimeType,
  file: (asset as any).file,
});

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

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const maskName = (name: string) => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "Anonymous Donor";

  return parts
    .map((part) => {
      if (part.length === 1) return `${part}*`;
      return `${part[0]}${"*".repeat(Math.max(1, part.length - 2))}${part[part.length - 1]}`;
    })
    .join(" ");
};

const statusLabel = (value?: string) =>
  String(value || "submitted").replaceAll("_", " ").toUpperCase();

const campaignScopeLabel = (campaign: DonationCampaign) => {
  const beneficiary = String(campaign.beneficiaryType || "").trim();
  if (beneficiary) return beneficiary;

  const text = `${campaign.title || ""} ${campaign.description || ""}`.toLowerCase();

  if (text.includes("household relief") || text.includes("verified household relief need")) {
    return "Household Relief";
  }

  if (text.includes("community relief") || text.includes("multiple households")) {
    return "Community Relief";
  }

  return campaignGroupOf(campaign) === "community_needs_help"
    ? "Community Assistance"
    : "Disaster Relief";
};

const donationTypeLabel = (value?: string) =>
  value === "in_kind" ? "In-kind Goods" : "Monetary";

const validPublicPhotoUrls = (campaign?: DonationCampaign) => {
  if (!campaign) return [] as string[];

  const candidates = [
    ...(Array.isArray(campaign.publicPhotoUrls) ? campaign.publicPhotoUrls : []),
    ...(Array.isArray(campaign.photoUrls) ? campaign.photoUrls : []),
    ...(Array.isArray(campaign.imageUrls) ? campaign.imageUrls : []),
  ];

  return Array.from(
    new Set(
      candidates
        .map((item) => String(item || "").trim())
        .filter((item) => item.startsWith("https://")),
    ),
  ).slice(0, 8);
};

const campaignAreaLabel = (campaign?: DonationCampaign) => {
  if (!campaign) return "San Jose del Monte, Bulacan";

  const generalArea = String(campaign.generalArea || "").trim();
  if (generalArea) return generalArea;

  const explicit = String(campaign.publicLocationLabel || "").trim();
  if (explicit) return explicit;

  const barangay = (campaign.barangays || []).filter(Boolean).join(", ");
  return barangay
    ? `${barangay}, San Jose del Monte, Bulacan`
    : "San Jose del Monte, Bulacan";
};

function campaignGroupOf(campaign?: DonationCampaign): CampaignGroup {
  if (!campaign) return "disaster_affected";

  const explicit = String(campaign.campaignGroup || "").trim().toLowerCase();
  if (explicit === "community_needs_help") return "community_needs_help";
  if (explicit === "disaster_affected") return "disaster_affected";

  const searchText = [
    campaign.title,
    campaign.description,
    campaign.publicStory,
    campaign.publicIncidentType,
    campaign.campaignCategory,
    campaign.beneficiaryType,
    campaign.sourceType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (COMMUNITY_KEYWORDS.some((keyword) => searchText.includes(keyword))) {
    return "community_needs_help";
  }

  if (DISASTER_KEYWORDS.some((keyword) => searchText.includes(keyword))) {
    return "disaster_affected";
  }

  // Existing VolunServe campaigns were disaster/relief campaigns before
  // campaignGroup existed, so keep them in Disaster Support by default.
  return "disaster_affected";
}

const campaignGroupLabel = (campaign?: DonationCampaign) =>
  campaignGroupOf(campaign) === "community_needs_help"
    ? "Community Need Donation Support"
    : "Disaster Need Donation Support";

const campaignCategoryLabel = (campaign?: DonationCampaign) => {
  const explicit = String(campaign?.campaignCategory || "").trim();
  if (explicit) return explicit.replaceAll("_", " ");

  if (campaignGroupOf(campaign) === "community_needs_help") {
    const text = `${campaign?.title || ""} ${campaign?.publicStory || ""}`.toLowerCase();
    if (text.includes("animal") || text.includes("pet") || text.includes("vet")) {
      return "Animal / Pet Welfare";
    }
    if (text.includes("elderly") || text.includes("senior")) return "Elderly Assistance";
    if (text.includes("homeless")) return "Homeless / Basic Needs";
    if (
      text.includes("cancer") ||
      text.includes("medical") ||
      text.includes("surgery") ||
      text.includes("hospital") ||
      text.includes("treatment")
    ) {
      return "Medical Assistance";
    }
    return "Community Assistance";
  }

  return campaign?.publicIncidentType || "Disaster Relief";
};

const campaignVisualIcon = (
  campaign?: DonationCampaign,
): React.ComponentProps<typeof Ionicons>["name"] => {
  if (campaignGroupOf(campaign) === "disaster_affected") {
    const text = `${campaign?.title || ""} ${campaign?.publicIncidentType || ""}`.toLowerCase();
    if (text.includes("fire")) return "flame-outline";
    if (text.includes("flood") || text.includes("water")) return "water-outline";
    if (text.includes("typhoon") || text.includes("storm")) return "thunderstorm-outline";
    return "alert-circle-outline";
  }

  const text = `${campaign?.title || ""} ${campaign?.campaignCategory || ""}`.toLowerCase();
  if (text.includes("animal") || text.includes("pet") || text.includes("vet")) return "paw-outline";
  if (text.includes("elderly") || text.includes("senior")) return "accessibility-outline";
  if (text.includes("medical") || text.includes("cancer") || text.includes("surgery")) {
    return "medkit-outline";
  }
  return "heart-outline";
};

const handoffModeLabel = (value?: string) => {
  if (value === "coordinated_handover") return "Coordinated Public Handover";
  if (value === "both") return "Receiving Point + Coordinated Handover";
  return "Official Receiving Point";
};

const handoffLocationTypeLabel = (value?: string) => {
  if (value === "barangay_relief_desk") return "Barangay Hall / Relief Desk";
  if (value === "evacuation_center") return "Authorized Evacuation Center";
  if (value === "lgu_relief_center") return "LGU Relief Operations Center";
  if (value === "city_hall") return "City Hall Receiving Area";
  if (value === "hospital") return "Hospital / Social Service Office";
  if (value === "vet_clinic") return "Veterinary Clinic / Animal Care Point";
  if (value === "social_welfare_office") return "Social Welfare Office";
  if (value === "shelter") return "Authorized Shelter / Care Center";
  if (value === "public_meeting_point") return "LGU-Approved Public Meeting Point";
  if (value === "other_authorized_location" || value === "other") {
    return "Other Authorized Public Location";
  }
  return "Authorized Public Location";
};

const deliveryOptionsForCampaign = (campaign?: DonationCampaign): SelectOption[] => {
  const mode = String(campaign?.handoffMode || "receiving_point");

  if (mode === "coordinated_handover") {
    return DELIVERY_OPTIONS.filter((item) =>
      ["coordinated_handover", "coordinate_pickup"].includes(item.value),
    );
  }

  if (mode === "both") return DELIVERY_OPTIONS;

  return DELIVERY_OPTIONS.filter((item) =>
    ["drop_off", "courier", "coordinate_pickup"].includes(item.value),
  );
};

const deliveryLabel = (value: string) =>
  DELIVERY_OPTIONS.find((item) => item.value === value)?.label || "";

const publicNeedsForCampaign = (campaign?: DonationCampaign): PublicNeed[] => {
  if (!campaign) return [] as PublicNeed[];

  if (Array.isArray(campaign.publicNeeds) && campaign.publicNeeds.length > 0) {
    return campaign.publicNeeds.slice(0, 12);
  }

  return (campaign.acceptedCategories || []).map<PublicNeed>((category) => ({
    category,
    label: CATEGORY_LABELS[category] || category,
  }));
};

const publicStoriesForCampaign = (campaign?: DonationCampaign): PublicStory[] => {
  if (!campaign) return [];

  const stories = [
    ...(Array.isArray(campaign.publicStories) ? campaign.publicStories : []),
    ...(Array.isArray(campaign.publicUpdates) ? campaign.publicUpdates : []),
  ];

  return stories
    .filter((story) => String(story?.body || story?.text || "").trim().length > 0)
    .sort((a, b) => timestampMillis(b.publishedAt) - timestampMillis(a.publishedAt))
    .slice(0, 10);
};

const campaignGoal = (campaign?: DonationCampaign) => {
  if (!campaign) return 0;
  const candidates = [campaign.monetaryGoal, campaign.targetAmount, campaign.fundingGoal];
  const value = candidates.find((item) => typeof item === "number" && Number.isFinite(item));
  return Math.max(0, Number(value || 0));
};

const campaignRaised = (campaign?: DonationCampaign) => {
  if (!campaign) return 0;
  const candidates = [
    campaign.verifiedAmountReceived,
    campaign.amountRaised,
    campaign.monetaryRaised,
  ];
  const value = candidates.find((item) => typeof item === "number" && Number.isFinite(item));
  return Math.max(0, Number(value || 0));
};

export default function Donation() {
  const { width } = useWindowDimensions();
  const wide = width >= 1080;
  const medium = width >= 760;

  const { loading, user, profile } = useUserSession();

  const [campaigns, setCampaigns] = useState<DonationCampaign[]>([]);
  const [myDonations, setMyDonations] = useState<MyDonation[]>([]);
  const [campaignsReady, setCampaignsReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState<CampaignFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [donationType, setDonationType] = useState<DonationType | "">("");
  const [category, setCategory] = useState("");
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [donorNote, setDonorNote] = useState("");
  const [proof, setProof] = useState<DonationProof | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canUseDonationPage =
    !!profile &&
    isApprovedProfile(profile) &&
    profile.role !== "admin" &&
    profile.role !== "superadmin";

  useEffect(() => {
    if (!user || !canUseDonationPage) return;

    const unsubscribe = onSnapshot(
      collection(db, "donationCampaigns"),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<DonationCampaign, "id">),
          }))
          .filter((item) => item.status === "published")
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));

        setCampaigns(rows);
        setCampaignsReady(true);
        setError("");
      },
      (problem) => {
        console.log("Donation campaigns listener failed", problem);
        setCampaignsReady(true);
        setError("Unable to load current LGU donation campaigns.");
      },
    );

    return unsubscribe;
  }, [user?.uid, canUseDonationPage]);

  useEffect(() => {
    if (!user || !canUseDonationPage) return;

    const myDonationsQuery = query(
      collection(db, "donations"),
      where("donorUid", "==", user.uid),
    );

    const unsubscribe = onSnapshot(
      myDonationsQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<MyDonation, "id">),
          }))
          .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));

        setMyDonations(rows);
        setHistoryReady(true);
      },
      (problem) => {
        console.log("My donations listener failed", problem);
        setHistoryReady(true);
      },
    );

    return unsubscribe;
  }, [user?.uid, canUseDonationPage]);

  const filteredCampaigns = useMemo(() => {
    const scoped =
      filter === "all"
        ? campaigns
        : campaigns.filter((campaign) => campaignGroupOf(campaign) === filter);

    const queryText = searchText.trim().toLowerCase();
    if (!queryText) return scoped;

    return scoped.filter((campaign) =>
      [
        campaign.title,
        campaign.description,
        campaign.publicStory,
        campaign.publicLocationLabel,
        campaign.generalArea,
        campaign.campaignCategory,
        campaign.beneficiaryType,
        ...(campaign.barangays || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(queryText),
    );
  }, [campaigns, filter, searchText]);

  const disasterCount = useMemo(
    () => campaigns.filter((campaign) => campaignGroupOf(campaign) === "disaster_affected").length,
    [campaigns],
  );

  const communityCount = useMemo(
    () =>
      campaigns.filter((campaign) => campaignGroupOf(campaign) === "community_needs_help").length,
    [campaigns],
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((item) => item.id === selectedCampaignId),
    [campaigns, selectedCampaignId],
  );

  const acceptedTypes = selectedCampaign?.acceptedDonationTypes || [];
  const acceptedCategories = selectedCampaign?.acceptedCategories || [];

  const selectedPublicNeeds = useMemo(
    () => publicNeedsForCampaign(selectedCampaign),
    [selectedCampaign],
  );

  const selectedPhotoUrls = useMemo(
    () => validPublicPhotoUrls(selectedCampaign),
    [selectedCampaign],
  );

  const selectedStories = useMemo(
    () => publicStoriesForCampaign(selectedCampaign),
    [selectedCampaign],
  );

  const selectedDeliveryOptions = useMemo(
    () => deliveryOptionsForCampaign(selectedCampaign),
    [selectedCampaign?.handoffMode],
  );

  const suggestedItemOptions = useMemo(
    () => ITEM_SUGGESTIONS[category] || ITEM_SUGGESTIONS.other,
    [category],
  );

  const resetDonationForm = () => {
    setDonationType("");
    setCategory("");
    setItemName("");
    setUnit("");
    setQuantity("");
    setAmount("");
    setTransactionReference("");
    setDeliveryMethod("");
    setDonorNote("");
    setProof(null);
    setUploadProgress("");
  };

  const chooseCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    resetDonationForm();

    const campaign = campaigns.find((item) => item.id === campaignId);
    const types = campaign?.acceptedDonationTypes || [];
    if (types.length === 1) setDonationType(types[0]);
  };

  const chooseFilter = (nextFilter: CampaignFilter) => {
    setFilter(nextFilter);

    if (!selectedCampaign) return;
    if (nextFilter === "all") return;
    if (campaignGroupOf(selectedCampaign) !== nextFilter) {
      setSelectedCampaignId("");
      resetDonationForm();
    }
  };

  const chooseProof = async () => {
    if (submitting) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Gallery Permission",
        "Allow photo library access to attach your donation receipt or proof.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
    });

    if (result.canceled) return;

    const selected = proofFromAsset(result.assets[0]);

    if (typeof selected.fileSize === "number" && selected.fileSize > MAX_PROOF_BYTES) {
      Alert.alert("Proof Too Large", "Use an image smaller than 10 MB.");
      return;
    }

    setProof(selected);
  };

  const uploadProof = async (asset: DonationProof) => {
    setUploadProgress("Uploading receipt / proof...");

    const fileName =
      asset.fileName ||
      asset.uri.split("/").pop()?.split("?")[0] ||
      `donation-proof-${Date.now()}.jpg`;

    const contentType = asset.mimeType || "image/jpeg";
    const body = new FormData();

    if (asset.file) {
      body.append("file", asset.file);
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
          `Receipt upload failed with HTTP ${response.status}.`,
      );
    }

    return result.secure_url as string;
  };

  const submitDonation = async () => {
    if (!user || !profile || !selectedCampaign || submitting) return;

    if (!acceptedTypes.includes(donationType as DonationType)) {
      Alert.alert("Donation Type", "Select an available donation type for this campaign.");
      return;
    }

    let cleanNote = donorNote.trim();

    let numericAmount = 0;
    let numericQuantity = 0;
    let cleanCategory = "";
    let cleanItemName = "";
    let cleanUnit = "";
    let cleanReference = "";

    if (donationType === "monetary") {
      numericAmount = Number(amount);
      cleanReference = transactionReference.trim();

      if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
        Alert.alert(
          "Invalid Amount",
          "Enter any valid positive amount that you actually sent through the official LGU channel.",
        );
        return;
      }

      if (cleanReference.length < 4) {
        Alert.alert(
          "Transaction Reference Required",
          "Enter the reference shown by the official LGU payment/receiving channel.",
        );
        return;
      }

      if (!proof) {
        Alert.alert(
          "Receipt / Proof Required",
          "Attach the receipt or transaction screenshot so the LGU can match it with the official receiving account.",
        );
        return;
      }
    }

    if (donationType === "in_kind") {
      numericQuantity = Number(quantity);
      cleanCategory = category.trim().toLowerCase();
      cleanItemName = itemName.trim();
      cleanUnit = unit.trim();

      if (!acceptedCategories.includes(cleanCategory)) {
        Alert.alert("Item Category", "Select one of the categories requested by the LGU campaign.");
        return;
      }

      if (cleanItemName.length < 2) {
        Alert.alert("Item Name", "Select the item you intend to donate.");
        return;
      }

      if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
        Alert.alert("Quantity", "Enter a whole quantity greater than zero.");
        return;
      }

      if (cleanUnit.length < 1) {
        Alert.alert("Unit", "Select the unit for the pledged goods.");
        return;
      }

      if (
        !deliveryMethod ||
        !selectedDeliveryOptions.some((option) => option.value === deliveryMethod)
      ) {
        Alert.alert(
          "Delivery / Handover Method",
          "Select one of the delivery or handover methods approved by the LGU for this campaign.",
        );
        return;
      }

      const deliveryText = deliveryLabel(deliveryMethod);
      cleanNote = [`Delivery plan: ${deliveryText}`, cleanNote]
        .filter(Boolean)
        .join(" | ");
    }

    if (cleanNote.length > 600) {
      Alert.alert(
        "Donor Note",
        "Keep the delivery details and optional note to 600 characters or fewer.",
      );
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const campaignSnapshotCampaign = campaigns.find(
        (item) => item.id === selectedCampaign.id && item.status === "published",
      );

      if (!campaignSnapshotCampaign) {
        throw new Error("This campaign is no longer open for donations.");
      }

      const proofUrls = proof ? [await uploadProof(proof)] : [];
      setUploadProgress("Saving donation submission...");

      const donationRef = doc(collection(db, "donations"));
      const fullName = String(profile.fullName || user.displayName || "Donor").trim() || "Donor";

      // IMPORTANT: Keep the current donation document shape so existing strict
      // Firestore rules are not broken by this resident-page redesign.
      await setDoc(donationRef, {
        donationId: donationRef.id,
        source: "campaign_submission",
        campaignId: selectedCampaign.id,
        campaignTitle: String(selectedCampaign.title || "LGU Donation Campaign").slice(0, 160),
        campaignBarangays: Array.isArray(selectedCampaign.barangays)
          ? selectedCampaign.barangays.slice(0, 20)
          : [],
        donorUid: user.uid,
        donorName: fullName.slice(0, 160),
        donorDisplayName: maskName(fullName).slice(0, 160),
        donationType,
        category: donationType === "in_kind" ? cleanCategory : "",
        itemName: donationType === "in_kind" ? cleanItemName.slice(0, 160) : "",
        unit: donationType === "in_kind" ? cleanUnit.slice(0, 60) : "",
        quantityPledged: donationType === "in_kind" ? numericQuantity : 0,
        amount: donationType === "monetary" ? numericAmount : 0,
        transactionReference:
          donationType === "monetary" ? cleanReference.slice(0, 160) : "",
        donorNote: cleanNote.slice(0, 600),
        proofUrls,
        status: "submitted",
        actualQuantityReceived: 0,
        actualAmountReceived: 0,
        officialReceiptReference: "",
        rejectionReason: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetDonationForm();

      Alert.alert(
        "Donation Submitted",
        donationType === "in_kind"
          ? "Your goods pledge was submitted. It will be counted only after the LGU physically receives and verifies the actual quantity."
          : "Your transaction details were submitted for LGU verification. VolunServe does not process the money transfer itself yet.",
      );
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : "Unable to submit the donation.";
      setError(message);
      Alert.alert("Submission Failed", message);
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  };

  const residentDisplayName = String(
    profile?.fullName || user?.displayName || "Resident",
  ).trim();
  const residentFirstName =
    residentDisplayName.split(/\s+/).filter(Boolean)[0] || "Resident";

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Loading donation support...</Text>
      </View>
    );
  }

  if (!user || !profile || !isApprovedProfile(profile)) {
    return <Redirect href="/login" />;
  }

  if (!canUseDonationPage) {
    return <Redirect href={profile.role === "superadmin" ? "/(superadmin)" : "/(admin)"} />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator
    >
      <View style={styles.heroCard}>
        <View style={styles.heroIconWrap}>
          <Ionicons name="heart" size={26} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>VOLUNSERVE · RESIDENT DONATION HUB</Text>
          <Text style={styles.title}>Good day, {residentFirstName}!</Text>
          <Text style={styles.subtitle}>
            Together for a safer San Jose del Monte. Browse LGU-verified disaster and community
            support campaigns, review approved public photos, and donate only through the official
            channels published for each campaign.
          </Text>
        </View>
        <View style={styles.heroTrustBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#15803D" />
          <Text style={styles.heroTrustText}>LGU VERIFIED</Text>
        </View>
      </View>

      <View style={styles.filterPanel}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionEyebrow}>BROWSE VERIFIED CAMPAIGNS</Text>
          <Text style={styles.sectionTitle}>Donation Campaigns</Text>
          <Text style={styles.sectionSubtitle}>
            Support verified community needs in San Jose del Monte, Bulacan. Open a campaign to
            view its approved public photos, verified funding progress, and official LGU receiving
            details.
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#64748B" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search campaigns, causes, or location..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
          />
          {!!searchText && (
            <TouchableOpacity onPress={() => setSearchText("")} style={styles.searchClearButton}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.filterRow}>
          {FILTER_OPTIONS.map((option) => {
            const active = filter === option.value;
            const count =
              option.value === "all"
                ? campaigns.length
                : option.value === "disaster_affected"
                  ? disasterCount
                  : communityCount;

            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                activeOpacity={0.86}
                onPress={() => chooseFilter(option.value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {wide ? option.label : option.shortLabel}
                </Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text
                    style={[
                      styles.filterCountText,
                      active && styles.filterCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color="#B42318" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={[styles.webWorkspace, !wide && styles.webWorkspaceStack]}>
        <View style={[styles.webCampaignPane, !wide && styles.webPaneFull]}>
          {!campaignsReady ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color="#4F46E5" />
              <Text style={styles.emptyText}>Loading active LGU campaigns...</Text>
            </View>
          ) : filteredCampaigns.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkmark-circle-outline" size={36} color="#15803D" />
              <Text style={styles.emptyTitle}>No active campaigns in this category</Text>
              <Text style={styles.emptyText}>
                Only LGU-verified campaigns that are currently open for public support appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.campaignGrid}>
              {filteredCampaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  selected={selectedCampaignId === campaign.id}
                  wide={wide}
                  onPress={() => chooseCampaign(campaign.id)}
                />
              ))}
            </View>
          )}
        </View>

        {(wide || selectedCampaign) && (
          <View style={[styles.webDetailPane, !wide && styles.webPaneFull]}>
            {wide && !selectedCampaign && (
              <View style={styles.drawerPlaceholder}>
                <View style={styles.drawerPlaceholderIcon}>
                  <Ionicons name="heart-outline" size={30} color="#4F46E5" />
                </View>
                <Text style={styles.drawerPlaceholderTitle}>Choose a campaign</Text>
                <Text style={styles.drawerPlaceholderText}>
                  Select any verified campaign on the left to open its photos, story, progress,
                  official receiving location, and donation options here.
                </Text>
              </View>
            )}

            {!!selectedCampaign && (
        <View style={[styles.detailShell, wide && styles.detailShellWeb]}>
          <View style={styles.detailTopBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailEyebrow}>SELECTED VERIFIED CAMPAIGN</Text>
              <Text style={styles.detailTitle}>{selectedCampaign.title || "Donation Campaign"}</Text>
              <View style={styles.locationLine}>
                <Ionicons name="location-outline" size={15} color="#0F766E" />
                <Text style={styles.detailLocation}>{campaignAreaLabel(selectedCampaign)}</Text>
              </View>
            </View>
            <View style={styles.openSupportBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.openSupportText}>OPEN FOR SUPPORT</Text>
            </View>
          </View>

          <View
            style={[
              styles.detailGrid,
              wide && styles.detailGridDrawer,
              !wide && styles.stackGrid,
            ]}
          >
            <View style={styles.detailMainColumn}>
              <PublicPhotoGallery
                photos={selectedPhotoUrls}
                title={selectedCampaign.title || "Donation Campaign"}
                campaign={selectedCampaign}
              />

              <View style={styles.storyCard}>
                <View style={styles.storyHeaderRow}>
                  <View style={styles.storyHeaderIcon}>
                    <Ionicons name="book-outline" size={18} color="#0F766E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storyEyebrow}>LGU-PUBLISHED VERIFIED STORY</Text>
                    <Text style={styles.storyTitle}>Why this campaign needs support</Text>
                  </View>
                </View>

                <Text style={styles.storyText}>
                  {selectedCampaign.publicStory ||
                    selectedCampaign.description ||
                    "The LGU verified this assistance need and opened this campaign for public support."}
                </Text>

                <View style={styles.factGrid}>
                  <Fact
                    icon="shield-checkmark-outline"
                    label="Verification"
                    value="LGU Verified"
                  />
                  <Fact
                    icon={campaignGroupOf(selectedCampaign) === "community_needs_help" ? "heart-outline" : "alert-circle-outline"}
                    label="Campaign Group"
                    value={campaignGroupLabel(selectedCampaign)}
                  />
                  <Fact
                    icon="pricetag-outline"
                    label="Category"
                    value={campaignCategoryLabel(selectedCampaign)}
                  />
                  <Fact
                    icon="people-outline"
                    label="Beneficiary / Scope"
                    value={campaignScopeLabel(selectedCampaign)}
                  />
                  {!!selectedCampaign.publicSeverity && (
                    <Fact
                      icon="speedometer-outline"
                      label="Priority"
                      value={selectedCampaign.publicSeverity}
                    />
                  )}
                  <Fact
                    icon="calendar-outline"
                    label="Campaign Opened"
                    value={formatDate(selectedCampaign.createdAt)}
                  />
                </View>
              </View>

              <StoryUpdates stories={selectedStories} />

              <View style={styles.needsCard}>
                <View style={styles.blockHeader}>
                  <View style={styles.blockIcon}>
                    <Ionicons name="list-outline" size={18} color="#0F766E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.blockTitle}>Verified Needs</Text>
                    <Text style={styles.blockSubtitle}>
                      Public support is limited to the needs approved by the LGU for this campaign.
                    </Text>
                  </View>
                </View>

                <View style={styles.needGrid}>
                  {selectedPublicNeeds.length === 0 ? (
                    <Text style={styles.needEmptyText}>
                      The LGU has not published an item-by-item breakdown for this campaign.
                    </Text>
                  ) : (
                    selectedPublicNeeds.map((need, index) => {
                      const key = need.category || need.label || `need-${index}`;
                      const label =
                        need.label ||
                        CATEGORY_LABELS[String(need.category || "")] ||
                        "Verified Need";
                      const remaining =
                        typeof need.remaining === "number"
                          ? need.remaining
                          : typeof need.needed === "number" && typeof need.received === "number"
                            ? Math.max(0, need.needed - need.received)
                            : null;

                      return (
                        <View key={`${key}-${index}`} style={styles.needCard}>
                          <View style={styles.needIcon}>
                            <Ionicons
                              name={
                                CATEGORY_ICONS[String(need.category || "other")] ||
                                "pricetag-outline"
                              }
                              size={17}
                              color="#0F766E"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.needCardTitle}>{label}</Text>
                            {typeof need.needed === "number" ? (
                              <Text style={styles.needCardMeta}>
                                Needed: {need.needed} {need.unit || ""}
                                {typeof need.received === "number"
                                  ? ` · Received: ${need.received}`
                                  : ""}
                                {remaining !== null ? ` · Remaining: ${remaining}` : ""}
                              </Text>
                            ) : (
                              <Text style={styles.needCardMeta}>LGU-verified need</Text>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </View>

            <View style={styles.detailSideColumn}>
              <FundingProgressCard campaign={selectedCampaign} />

              <View style={styles.locationCard}>
                <View style={styles.locationCardTop}>
                  <View style={styles.locationPinCircle}>
                    <Ionicons name="navigate" size={20} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationCardEyebrow}>LGU-APPROVED PUBLIC LOCATION</Text>
                    <Text style={styles.locationCardTitle}>
                      {selectedCampaign.handoffLocationName ||
                        "Official receiving / service / handoff point"}
                    </Text>
                  </View>
                </View>

                <View style={styles.locationInfoRows}>
                  <InfoRow
                    label="Setup"
                    value={handoffModeLabel(selectedCampaign.handoffMode)}
                  />
                  <InfoRow
                    label="Location type"
                    value={handoffLocationTypeLabel(selectedCampaign.handoffLocationType)}
                  />
                  <InfoRow
                    label="Address"
                    value={
                      selectedCampaign.handoffAddress ||
                      "The LGU has not published a public handoff address yet."
                    }
                  />
                </View>

                {!!selectedCampaign.handoffAddress && (
                  <HandoffLocationMap
                    locationName={
                      selectedCampaign.handoffLocationName ||
                      "LGU-approved donation location"
                    }
                    address={selectedCampaign.handoffAddress}
                  />
                )}

                {!!selectedCampaign.handoffNotes && (
                  <View style={styles.handoffNotesBox}>
                    <Text style={styles.handoffNotesLabel}>LGU instructions</Text>
                    <Text style={styles.handoffNotesText}>{selectedCampaign.handoffNotes}</Text>
                  </View>
                )}

                <View style={styles.privacyNotice}>
                  <Ionicons name="lock-closed-outline" size={16} color="#0F766E" />
                  <Text style={styles.privacyNoticeText}>
                    This map is controlled by the LGU and shows only an approved receiving,
                    service, or public handoff point. A beneficiary's home address and live GPS
                    are never shown to donors.
                  </Text>
                </View>
              </View>

              <View style={styles.areaCard}>
                <View style={styles.areaHeader}>
                  <Ionicons name="map-outline" size={18} color="#0F766E" />
                  <Text style={styles.areaTitle}>General Area</Text>
                </View>
                <Text style={styles.areaValue}>{campaignAreaLabel(selectedCampaign)}</Text>
                <Text style={styles.areaHelp}>
                  General public context only. This is not the beneficiary's exact location.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.supportSection}>
            <Text style={styles.supportSectionEyebrow}>CHOOSE HOW YOU WANT TO HELP</Text>
            <Text style={styles.supportSectionTitle}>Support this verified campaign</Text>
            <Text style={styles.supportSectionText}>
              Choose one option. VolunServe shows only the fields required for the selected type
              of support.
            </Text>

            <View style={[styles.supportTypeGrid, !medium && styles.stackGrid]}>
              {acceptedTypes.includes("monetary") && (
                <SupportTypeCard
                  icon="cash-outline"
                  title="Monetary Support"
                  text="Send financial support using the official channel currently published by the LGU."
                  selected={donationType === "monetary"}
                  onPress={() => {
                    setDonationType("monetary");
                    setCategory("");
                    setItemName("");
                    setUnit("");
                    setQuantity("");
                    setDeliveryMethod("");
                    setProof(null);
                  }}
                />
              )}

              {acceptedTypes.includes("in_kind") && (
                <SupportTypeCard
                  icon="cube-outline"
                  title="In-kind Goods"
                  text="Donate LGU-requested goods and deliver them only through an approved receiving or handoff setup."
                  selected={donationType === "in_kind"}
                  onPress={() => {
                    setDonationType("in_kind");
                    setAmount("");
                    setTransactionReference("");
                    setProof(null);
                  }}
                />
              )}
            </View>

            {acceptedTypes.length === 0 && (
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color="#0F766E" />
                <Text style={styles.infoBoxText}>
                  The LGU has not published an active donation method for this campaign yet.
                </Text>
              </View>
            )}

            {donationType === "monetary" && (
              <View style={styles.donationFormCard}>
                <StepHeader
                  number="1"
                  title="Use the Official Monetary Channel"
                  text="For now, this screen keeps the current LGU verification flow. The planned GCash sandbox/payment-gateway integration will later replace manual transaction proof as the main payment path."
                />

                <View style={styles.instructionsBox}>
                  <Text style={styles.instructionsEyebrow}>OFFICIAL RECEIVING CHANNEL</Text>
                  <Text style={styles.instructionsTitle}>
                    {selectedCampaign.officialChannelLabel || "Official LGU receiving channel"}
                  </Text>
                  <Text style={styles.instructionsText}>
                    {selectedCampaign.officialChannelInstructions ||
                      "Follow the official payment and receipt instructions published by the LGU for this campaign."}
                  </Text>
                </View>

                <StepHeader
                  number="2"
                  title="Enter the Payment Details"
                  text="Only an amount confirmed through the official receiving record should later count toward the public campaign total."
                />

                <Text style={styles.label}>Choose donation amount</Text>
                <View style={styles.quickAmountGrid}>
                  {[100, 500, 1000, 2500, 5000].map((preset) => {
                    const active = Number(amount) === preset;
                    return (
                      <TouchableOpacity
                        key={preset}
                        style={[
                          styles.quickAmountButton,
                          active && styles.quickAmountButtonActive,
                        ]}
                        onPress={() => setAmount(String(preset))}
                      >
                        <Text
                          style={[
                            styles.quickAmountText,
                            active && styles.quickAmountTextActive,
                          ]}
                        >
                          ₱{preset.toLocaleString("en-PH")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[
                      styles.quickAmountButton,
                      amount === "" && styles.quickAmountButtonActive,
                    ]}
                    onPress={() => setAmount("")}
                  >
                    <Text
                      style={[
                        styles.quickAmountText,
                        amount === "" && styles.quickAmountTextActive,
                      ]}
                    >
                      Other
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.twoColumnRow, !medium && styles.stackGrid]}>
                  <View style={styles.flexField}>
                    <Text style={styles.label}>Amount actually sent (PHP)</Text>
                    <TextInput
                      style={styles.input}
                      value={amount}
                      onChangeText={(value) => setAmount(sanitizeMoneyInput(value))}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 500"
                      placeholderTextColor="#94A3B8"
                    />
                    <Text style={styles.helperText}>Any positive amount is allowed.</Text>
                  </View>

                  <View style={styles.flexField}>
                    <Text style={styles.label}>Transaction / payment reference</Text>
                    <TextInput
                      style={styles.input}
                      value={transactionReference}
                      onChangeText={(value) => setTransactionReference(value.slice(0, 160))}
                      placeholder="Reference from the official channel"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                <ProofSection
                  proof={proof}
                  required
                  submitting={submitting}
                  onChoose={() => void chooseProof()}
                  onRemove={() => setProof(null)}
                  title="Receipt / transaction proof"
                  description="Attach the receipt or transaction screenshot. It remains supporting evidence only until the LGU confirms the actual payment record."
                />

                <DonationNote value={donorNote} onChange={setDonorNote} />
              </View>
            )}

            {donationType === "in_kind" && (
              <View style={styles.donationFormCard}>
                <StepHeader
                  number="1"
                  title="Choose the Requested Goods"
                  text="Select from the categories approved for this campaign."
                />

                <Text style={styles.label}>Requested category</Text>
                <View style={styles.choiceRow}>
                  {acceptedCategories.map((item) => (
                    <Choice
                      key={item}
                      label={CATEGORY_LABELS[item] || item.replaceAll("_", " ")}
                      icon={CATEGORY_ICONS[item] || "pricetag-outline"}
                      selected={category === item}
                      onPress={() => {
                        setCategory(item);
                        setItemName("");
                        setUnit("");
                      }}
                    />
                  ))}
                </View>

                <View style={[styles.twoColumnRow, !medium && styles.stackGrid]}>
                  <View style={styles.flexField}>
                    <SelectField
                      label="Item"
                      placeholder={category ? "Select item" : "Select category first"}
                      value={itemName}
                      options={category ? suggestedItemOptions : []}
                      disabled={!category}
                      onSelect={setItemName}
                    />
                  </View>

                  <View style={styles.flexField}>
                    <SelectField
                      label="Unit"
                      placeholder="Select unit"
                      value={unit}
                      options={UNIT_OPTIONS}
                      disabled={!category}
                      onSelect={setUnit}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Quantity pledged</Text>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={(value) =>
                    setQuantity(value.replace(/[^0-9]/g, "").slice(0, 9))
                  }
                  keyboardType="number-pad"
                  placeholder="Enter quantity"
                  placeholderTextColor="#94A3B8"
                />

                <StepHeader
                  number="2"
                  title="Choose the Delivery / Handover Method"
                  text="Use only the public location and delivery options selected by the LGU for this campaign."
                />

                <View style={styles.handoffSummaryCard}>
                  <View style={styles.handoffSummaryHeader}>
                    <View style={styles.handoffSummaryIcon}>
                      <Ionicons name="navigate-outline" size={19} color="#0F766E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.handoffSummaryEyebrow}>AUTHORIZED LOCATION</Text>
                      <Text style={styles.handoffSummaryTitle}>
                        {selectedCampaign.handoffLocationName ||
                          "Official receiving / handoff point"}
                      </Text>
                    </View>
                  </View>

                  <InfoRow
                    label="Location type"
                    value={handoffLocationTypeLabel(selectedCampaign.handoffLocationType)}
                  />
                  <InfoRow
                    label="Public address"
                    value={
                      selectedCampaign.handoffAddress ||
                      "Follow the official LGU instructions for this campaign."
                    }
                  />
                </View>

                <SelectField
                  label="How will the goods reach the approved location?"
                  placeholder="Select delivery / handover method"
                  value={deliveryMethod}
                  options={selectedDeliveryOptions}
                  onSelect={setDeliveryMethod}
                />

                <ProofSection
                  proof={proof}
                  required={false}
                  submitting={submitting}
                  onChoose={() => void chooseProof()}
                  onRemove={() => setProof(null)}
                  title="Supporting photo"
                  description="Optional. Attach a photo of the goods you plan to deliver. Only the quantity physically received and verified by authorized staff will count."
                />

                <DonationNote value={donorNote} onChange={setDonorNote} />
              </View>
            )}

            {!!donationType && (
              <View style={styles.submitSection}>
                <StepHeader
                  number="3"
                  title="Submit for LGU Verification"
                  text={
                    donationType === "in_kind"
                      ? "Your pledge is not inventory yet. Authorized staff must receive and verify the actual goods first."
                      : "Your submitted payment information is not counted toward the public total until it is confirmed through the official receiving record."
                  }
                />

                <View style={styles.processStrip}>
                  <ProcessPoint icon="send-outline" title="Submitted" />
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                  <ProcessPoint icon="shield-checkmark-outline" title="LGU Verifies" />
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                  <ProcessPoint
                    icon={donationType === "in_kind" ? "cube-outline" : "cash-outline"}
                    title={donationType === "in_kind" ? "Resource Recorded" : "Funds Confirmed"}
                  />
                  <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                  <ProcessPoint icon="people-outline" title="Allocation / Handover" />
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, submitting && styles.disabled]}
                  disabled={submitting}
                  onPress={() => void submitDonation()}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send-outline" size={18} color="#FFFFFF" />
                  )}

                  <Text style={styles.submitButtonText}>
                    {uploadProgress ||
                      (donationType === "in_kind"
                        ? "Submit Goods Pledge"
                        : "Submit Monetary Donation")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.historySection}>
        <Text style={styles.sectionEyebrow}>YOUR ACTIVITY</Text>
        <Text style={styles.sectionTitle}>My Donation Submissions</Text>
        <Text style={styles.sectionSubtitle}>
          Track what you submitted and whether the LGU has confirmed actual receipt.
        </Text>

        {!historyReady ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color="#0F766E" />
            <Text style={styles.emptyText}>Loading your donation history...</Text>
          </View>
        ) : myDonations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={30} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No donation submissions yet</Text>
            <Text style={styles.emptyText}>
              Your submissions will appear here after you support an active LGU campaign.
            </Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {myDonations.map((donation) => (
              <DonationHistoryCard key={donation.id} donation={donation} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  value: number;
  label: string;
  tone: "all" | "disaster" | "community";
}) {
  return (
    <View
      style={[
        styles.summaryCard,
        tone === "disaster" && styles.summaryCardDisaster,
        tone === "community" && styles.summaryCardCommunity,
      ]}
    >
      <View style={styles.summaryIcon}>
        <Ionicons name={icon} size={19} color="#0F766E" />
      </View>
      <View>
        <Text style={styles.summaryValue}>{value}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
    </View>
  );
}

function CampaignCard({
  campaign,
  selected,
  wide,
  onPress,
}: {
  campaign: DonationCampaign;
  selected: boolean;
  wide: boolean;
  onPress: () => void;
}) {
  const photos = validPublicPhotoUrls(campaign);
  const raised = campaignRaised(campaign);
  const goal = campaignGoal(campaign);
  const percentage = goal > 0 ? clampPercent((raised / goal) * 100) : 0;
  const group = campaignGroupOf(campaign);

  return (
    <TouchableOpacity
      style={[
        styles.campaignCard,
        wide && styles.campaignCardWide,
        selected && styles.campaignCardSelected,
      ]}
      activeOpacity={0.88}
      onPress={onPress}
    >
      <CampaignVisual campaign={campaign} photoUrl={photos[0]} />

      <View style={styles.campaignCardBody}>
        <View style={styles.badgeRow}>
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={12} color="#15803D" />
            <Text style={styles.verifiedBadgeText}>LGU VERIFIED</Text>
          </View>
          <View
            style={[
              styles.groupBadge,
              group === "community_needs_help" && styles.groupBadgeCommunity,
            ]}
          >
            <Text
              style={[
                styles.groupBadgeText,
                group === "community_needs_help" && styles.groupBadgeTextCommunity,
              ]}
            >
              {group === "community_needs_help" ? "COMMUNITY NEED" : "DISASTER"}
            </Text>
          </View>
        </View>

        <Text style={styles.campaignTitle} numberOfLines={2}>
          {campaign.title || "LGU Donation Campaign"}
        </Text>

        <View style={styles.locationLine}>
          <Ionicons name="location-outline" size={14} color="#0F766E" />
          <Text style={styles.campaignLocation} numberOfLines={1}>
            {campaignAreaLabel(campaign)}
          </Text>
        </View>

        <Text style={styles.campaignDescription} numberOfLines={3}>
          {campaign.publicStory ||
            campaign.description ||
            "LGU-verified campaign currently open for public support."}
        </Text>

        {goal > 0 && (
          <View style={styles.cardProgressWrap}>
            <View style={styles.cardProgressTop}>
              <Text style={styles.cardProgressRaised}>{money(raised)} raised</Text>
              <Text style={styles.cardProgressGoal}>of {money(goal)}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percentage}%` as any }]} />
            </View>
            <Text style={styles.cardProgressPercent}>{Math.round(percentage)}% verified</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardCategory}>{campaignCategoryLabel(campaign)}</Text>
          <View style={styles.viewCampaignButton}>
            <Text style={styles.viewCampaignText}>
              {selected ? "Selected" : "View campaign"}
            </Text>
            <Ionicons
              name={selected ? "checkmark-circle" : "arrow-forward"}
              size={15}
              color="#0F766E"
            />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function CampaignVisual({
  campaign,
  photoUrl,
}: {
  campaign: DonationCampaign;
  photoUrl?: string;
}) {
  if (photoUrl) {
    return (
      <View style={styles.campaignVisualWrap}>
        <Image source={{ uri: photoUrl }} style={styles.campaignVisualImage} resizeMode="cover" />
        <View style={styles.photoApprovalBadge}>
          <Ionicons name="checkmark-circle" size={12} color="#FFFFFF" />
          <Text style={styles.photoApprovalText}>LGU-approved photo</Text>
        </View>
      </View>
    );
  }

  const group = campaignGroupOf(campaign);

  return (
    <View
      style={[
        styles.campaignVisualPlaceholder,
        group === "community_needs_help" && styles.campaignVisualPlaceholderCommunity,
      ]}
    >
      <View style={styles.campaignVisualIconCircle}>
        <Ionicons name={campaignVisualIcon(campaign)} size={34} color="#0F766E" />
      </View>
      <Text style={styles.campaignVisualPlaceholderTitle}>
        {campaignCategoryLabel(campaign)}
      </Text>
      <Text style={styles.campaignVisualPlaceholderText}>
        LGU-approved campaign photo will appear here.
      </Text>
    </View>
  );
}

function PublicPhotoGallery({
  photos,
  title,
  campaign,
}: {
  photos: string[];
  title: string;
  campaign: DonationCampaign;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [title]);

  if (!photos.length) {
    return (
      <View style={styles.detailPhotoPlaceholder}>
        <View style={styles.detailPhotoPlaceholderIcon}>
          <Ionicons name={campaignVisualIcon(campaign)} size={38} color="#0F766E" />
        </View>
        <Text style={styles.detailPhotoPlaceholderTitle}>{campaignCategoryLabel(campaign)}</Text>
        <Text style={styles.detailPhotoPlaceholderText}>
          No LGU-approved public photo has been published for this campaign yet. Private evidence
          is never shown automatically.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.galleryWrap}>
      <Image
        source={{ uri: photos[selectedIndex] }}
        style={styles.galleryHero}
        resizeMode="cover"
      />
      <View style={styles.galleryBadge}>
        <Text style={styles.galleryBadgeText}>
          {selectedIndex + 1}/{photos.length}
        </Text>
      </View>
      <View style={styles.galleryVerifiedBadge}>
        <Ionicons name="shield-checkmark" size={13} color="#FFFFFF" />
        <Text style={styles.galleryVerifiedBadgeText}>LGU-approved public photo</Text>
      </View>

      {photos.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.galleryThumbRow}
        >
          {photos.map((url, index) => (
            <TouchableOpacity
              key={`${url}-${index}`}
              onPress={() => setSelectedIndex(index)}
              style={[
                styles.galleryThumbButton,
                selectedIndex === index && styles.galleryThumbButtonActive,
              ]}
            >
              <Image source={{ uri: url }} style={styles.galleryThumb} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function StoryUpdates({ stories }: { stories: PublicStory[] }) {
  return (
    <View style={styles.updatesCard}>
      <View style={styles.blockHeader}>
        <View style={styles.blockIcon}>
          <Ionicons name="chatbubbles-outline" size={18} color="#0F766E" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.blockTitle}>Shared Stories & Updates</Text>
          <Text style={styles.blockSubtitle}>
            Residents or beneficiaries may share updates, but only LGU-approved public stories
            appear here.
          </Text>
        </View>
      </View>

      {stories.length === 0 ? (
        <View style={styles.noUpdatesBox}>
          <Ionicons name="newspaper-outline" size={22} color="#94A3B8" />
          <View style={{ flex: 1 }}>
            <Text style={styles.noUpdatesTitle}>No additional public update yet</Text>
            <Text style={styles.noUpdatesText}>
              New resident stories, progress notes, or thank-you updates can appear here after LGU
              review and publication.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.storyTimeline}>
          {stories.map((story, index) => (
            <View key={story.id || `story-${index}`} style={styles.storyUpdateItem}>
              <View style={styles.storyTimelineMarker} />
              <View style={{ flex: 1 }}>
                <View style={styles.storyUpdateTop}>
                  <Text style={styles.storyUpdateTitle}>
                    {story.title || (index === 0 ? "Latest Campaign Update" : "Campaign Update")}
                  </Text>
                  <Text style={styles.storyUpdateDate}>{formatDate(story.publishedAt)}</Text>
                </View>
                <Text style={styles.storyUpdateBody}>{story.body || story.text}</Text>
                <Text style={styles.storyUpdateAuthor}>
                  {story.authorLabel || "Published by LGU/Admin"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function FundingProgressCard({ campaign }: { campaign: DonationCampaign }) {
  const goal = campaignGoal(campaign);
  const raised = campaignRaised(campaign);
  const percentage = goal > 0 ? clampPercent((raised / goal) * 100) : 0;
  const remaining = goal > 0 ? Math.max(0, goal - raised) : 0;

  return (
    <View style={styles.fundingCard}>
      <View style={styles.fundingHeader}>
        <View style={styles.fundingIcon}>
          <Ionicons name="trending-up-outline" size={19} color="#0F766E" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fundingEyebrow}>VERIFIED FUNDING PROGRESS</Text>
          <Text style={styles.fundingTitle}>Confirmed monetary support</Text>
        </View>
      </View>

      {goal > 0 ? (
        <>
          <Text style={styles.fundingAmount}>{money(raised)}</Text>
          <Text style={styles.fundingGoal}>raised of {money(goal)} goal</Text>

          <View style={styles.progressTrackLarge}>
            <View style={[styles.progressFillLarge, { width: `${percentage}%` as any }]} />
          </View>

          <View style={styles.fundingStatsRow}>
            <View>
              <Text style={styles.fundingStatValue}>{Math.round(percentage)}%</Text>
              <Text style={styles.fundingStatLabel}>Verified</Text>
            </View>
            <View style={styles.fundingStatDivider} />
            <View>
              <Text style={styles.fundingStatValue}>{money(remaining)}</Text>
              <Text style={styles.fundingStatLabel}>Remaining</Text>
            </View>
          </View>
        </>
      ) : (
        <View style={styles.noGoalBox}>
          <Ionicons name="information-circle-outline" size={18} color="#64748B" />
          <Text style={styles.noGoalText}>
            No public monetary goal has been published for this campaign. In-kind support can still
            be tracked separately when enabled.
          </Text>
        </View>
      )}

      <View style={styles.fundingTrustNote}>
        <Ionicons name="shield-checkmark-outline" size={15} color="#0F766E" />
        <Text style={styles.fundingTrustText}>
          Only LGU/backend-confirmed funds should be included in this public total. Pending or
          unverified claims must not increase the progress bar.
        </Text>
      </View>
    </View>
  );
}

function HandoffLocationMap({
  locationName,
  address,
}: {
  locationName: string;
  address: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cleanName = String(locationName || "Authorized donation location").trim();
  const cleanAddress = String(address || "").trim();
  const mapQuery = [cleanName, cleanAddress].filter(Boolean).join(", ");
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;

  const webMap = (height: number) =>
    React.createElement("iframe" as any, {
      src: embedUrl,
      title: `LGU-approved donation location: ${cleanName}`,
      loading: "lazy",
      referrerPolicy: "no-referrer-when-downgrade",
      allowFullScreen: true,
      style: {
        width: "100%",
        height,
        border: 0,
        display: "block",
        backgroundColor: "#E2E8F0",
      },
    } as any);

  return (
    <>
      <View style={styles.embeddedMapCard}>
        <View style={styles.embeddedMapHeader}>
          <View style={styles.embeddedMapHeaderIcon}>
            <Ionicons name="map-outline" size={17} color="#0F766E" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.embeddedMapEyebrow}>GOOGLE MAP</Text>
            <Text style={styles.embeddedMapTitle}>LGU-approved public location</Text>
          </View>
          {Platform.OS === "web" && (
            <TouchableOpacity
              style={styles.expandMapButton}
              activeOpacity={0.82}
              onPress={() => setExpanded(true)}
            >
              <Ionicons name="expand-outline" size={15} color="#0F766E" />
              <Text style={styles.expandMapButtonText}>Expand</Text>
            </TouchableOpacity>
          )}
        </View>

        {Platform.OS === "web" ? (
          <View style={styles.embeddedMapFrame}>{webMap(250)}</View>
        ) : (
          <View style={styles.embeddedMapNativeFallback}>
            <Ionicons name="map-outline" size={34} color="#0F766E" />
            <Text style={styles.embeddedMapNativeTitle}>{cleanName}</Text>
            <Text style={styles.embeddedMapNativeText}>{cleanAddress}</Text>
          </View>
        )}

        <View style={styles.embeddedMapLocationRow}>
          <Ionicons name="location-outline" size={15} color="#0F766E" />
          <View style={{ flex: 1 }}>
            <Text style={styles.embeddedMapLocationName}>{cleanName}</Text>
            <Text style={styles.embeddedMapLocationText}>{cleanAddress}</Text>
          </View>
        </View>
      </View>

      {Platform.OS === "web" && (
        <Modal
          visible={expanded}
          transparent
          animationType="fade"
          onRequestClose={() => setExpanded(false)}
        >
          <View style={styles.mapModalOverlay}>
            <View style={styles.mapModalCard}>
              <View style={styles.mapModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mapModalEyebrow}>AUTHORIZED DONATION LOCATION</Text>
                  <Text style={styles.mapModalTitle}>{cleanName}</Text>
                  <Text style={styles.mapModalAddress}>{cleanAddress}</Text>
                </View>
                <TouchableOpacity
                  style={styles.mapModalClose}
                  activeOpacity={0.82}
                  onPress={() => setExpanded(false)}
                >
                  <Ionicons name="close" size={20} color="#334155" />
                </TouchableOpacity>
              </View>

              <View style={styles.mapModalFrame}>{webMap(520)}</View>

              <View style={styles.mapModalPrivacy}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#0F766E" />
                <Text style={styles.mapModalPrivacyText}>
                  This is an LGU-approved public receiving, service, or handoff point. It is not the
                  beneficiary's home or live GPS location.
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={styles.infoRowValue}>{value}</Text>
    </View>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>
        <Ionicons name={icon} size={16} color="#0F766E" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
    </View>
  );
}

function SupportTypeCard({
  icon,
  title,
  text,
  selected,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  text: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.supportTypeCard, selected && styles.supportTypeCardSelected]}
      activeOpacity={0.86}
      onPress={onPress}
    >
      <View style={[styles.supportTypeIcon, selected && styles.supportTypeIconSelected]}>
        <Ionicons name={icon} size={24} color={selected ? "#FFFFFF" : "#0F766E"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.supportTypeTitle, selected && styles.supportTypeTitleSelected]}>
          {title}
        </Text>
        <Text style={styles.supportTypeText}>{text}</Text>
      </View>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={selected ? "#0F766E" : "#CBD5E1"}
      />
    </TouchableOpacity>
  );
}

function StepHeader({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.stepHeader}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

function Choice({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.choice, selected && styles.choiceSelected]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Ionicons
        name={selected ? "checkmark-circle" : icon || "ellipse-outline"}
        size={16}
        color={selected ? "#0F766E" : "#64748B"}
      />
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
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
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.selectField, disabled && styles.selectFieldDisabled]}
        activeOpacity={0.82}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text
          style={[
            styles.selectFieldText,
            !selectedLabel && styles.selectFieldPlaceholder,
          ]}
        >
          {selectedLabel || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={17} color="#64748B" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.selectModal} onPress={(event) => event.stopPropagation()}>
            <View style={styles.selectModalHeader}>
              <Text style={styles.selectModalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={20} color="#334155" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.selectModalScroll}>
              {options.length === 0 ? (
                <Text style={styles.selectModalEmpty}>No options available.</Text>
              ) : (
                options.map((option) => {
                  const active = option.value === value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.selectOption, active && styles.selectOptionActive]}
                      onPress={() => {
                        onSelect(option.value);
                        setOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.selectOptionText,
                          active && styles.selectOptionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {active && <Ionicons name="checkmark" size={18} color="#0F766E" />}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ProofSection({
  proof,
  required,
  submitting,
  onChoose,
  onRemove,
  title,
  description,
}: {
  proof: DonationProof | null;
  required: boolean;
  submitting: boolean;
  onChoose: () => void;
  onRemove: () => void;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.proofSection}>
      <Text style={styles.label}>
        {title} {required ? "*" : "(optional)"}
      </Text>

      {!proof ? (
        <TouchableOpacity
          style={styles.proofPicker}
          activeOpacity={0.82}
          disabled={submitting}
          onPress={onChoose}
        >
          <Ionicons name="cloud-upload-outline" size={27} color="#0F766E" />
          <View style={{ flex: 1 }}>
            <Text style={styles.proofPickerTitle}>Choose image</Text>
            <Text style={styles.proofPickerText}>{description}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.proofPreviewCard}>
          <Image source={{ uri: proof.uri }} style={styles.proofImage} />
          <View style={styles.proofPreviewInfo}>
            <Text style={styles.proofPreviewTitle}>{proof.fileName || "Selected image"}</Text>
            <Text style={styles.proofPreviewText}>
              {typeof proof.fileSize === "number"
                ? `${(proof.fileSize / (1024 * 1024)).toFixed(2)} MB`
                : "Ready to upload"}
            </Text>
            <TouchableOpacity
              style={styles.removeProofButton}
              disabled={submitting}
              onPress={onRemove}
            >
              <Ionicons name="trash-outline" size={14} color="#B42318" />
              <Text style={styles.removeProofText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function DonationNote({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View>
      <Text style={styles.label}>Optional donor note</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        multiline
        value={value}
        onChangeText={(text) => onChange(text.slice(0, 600))}
        placeholder="Add a short note or delivery detail for the LGU."
        placeholderTextColor="#94A3B8"
      />
      <Text style={styles.helperText}>{value.length}/600</Text>
    </View>
  );
}

function ProcessPoint({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
}) {
  return (
    <View style={styles.processPoint}>
      <View style={styles.processPointIcon}>
        <Ionicons name={icon} size={16} color="#0F766E" />
      </View>
      <Text style={styles.processPointText}>{title}</Text>
    </View>
  );
}

function DonationHistoryCard({ donation }: { donation: MyDonation }) {
  const status = String(donation.status || "submitted").toLowerCase();
  const rejected = status === "rejected";
  const received = [
    "received",
    "verified",
    "resource_recorded",
    "allocated",
    "out_for_distribution",
    "delivered",
    "completed",
  ].includes(status);
  const verified = [
    "verified",
    "resource_recorded",
    "allocated",
    "out_for_distribution",
    "delivered",
    "completed",
  ].includes(status);
  const allocated = ["allocated", "out_for_distribution", "delivered", "completed"].includes(status);
  const completed = ["delivered", "completed"].includes(status);

  const valueText =
    donation.donationType === "in_kind"
      ? `${donation.quantityPledged || 0} ${donation.unit || ""} ${donation.itemName || "goods"}`.trim()
      : money(Number(donation.amount || 0));

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyTop}>
        <View style={styles.historyIcon}>
          <Ionicons
            name={donation.donationType === "in_kind" ? "cube-outline" : "cash-outline"}
            size={19}
            color="#0F766E"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.historyTitle}>
            {donation.campaignTitle || "Donation Campaign"}
          </Text>
          <Text style={styles.historyMeta}>
            {donationTypeLabel(donation.donationType)} · {formatDate(donation.createdAt)}
          </Text>
          <Text style={styles.historyValue}>{valueText}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            rejected
              ? styles.statusRejected
              : received
                ? styles.statusReceived
                : styles.statusSubmitted,
          ]}
        >
          <Text style={styles.statusText}>{statusLabel(status)}</Text>
        </View>
      </View>

      {!rejected && (
        <View style={styles.historyTracker}>
          <TrackerStep
            icon="send-outline"
            label="Submitted"
            complete
            active={!received}
          />
          <View style={styles.trackerLine} />
          <TrackerStep
            icon="shield-checkmark-outline"
            label="Verified"
            complete={verified}
            active={received && !verified}
          />
          <View style={styles.trackerLine} />
          <TrackerStep
            icon="people-outline"
            label="Allocated"
            complete={allocated}
            active={verified && !allocated}
          />
          <View style={styles.trackerLine} />
          <TrackerStep
            icon="checkmark-done-outline"
            label="Completed"
            complete={completed}
            active={allocated && !completed}
          />
        </View>
      )}

      {rejected ? (
        <View style={styles.historyMessageRejected}>
          <Ionicons name="alert-circle-outline" size={16} color="#B42318" />
          <Text style={styles.historyMessageRejectedText}>
            {donation.rejectionReason ||
              "The LGU could not verify this donation submission. Contact the authorized office if you need clarification."}
          </Text>
        </View>
      ) : verified ? (
        <View style={styles.historyMessageReceived}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#15803D" />
          <View style={{ flex: 1 }}>
            <Text style={styles.historyMessageReceivedText}>
              The LGU has verified actual receipt of this donation.
            </Text>
            {!!donation.officialReceiptReference && (
              <Text style={styles.receiptReferenceText}>
                Official receipt / log: {donation.officialReceiptReference}
              </Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.historyMessagePending}>
          <Ionicons name="time-outline" size={16} color="#B7791F" />
          <Text style={styles.historyMessagePendingText}>
            This submission is not counted as confirmed support until the LGU verifies actual
            receipt or payment.
          </Text>
        </View>
      )}
    </View>
  );
}

function TrackerStep({
  icon,
  label,
  complete,
  active,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  complete: boolean;
  active: boolean;
}) {
  return (
    <View style={styles.trackerStep}>
      <View
        style={[
          styles.trackerDot,
          complete && styles.trackerDotComplete,
          active && styles.trackerDotActive,
        ]}
      >
        <Ionicons name={icon} size={14} color={complete || active ? "#FFFFFF" : "#94A3B8"} />
      </View>
      <Text style={[styles.trackerLabel, (complete || active) && styles.trackerLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7F9",
  },
  container: {
    width: "100%",
    maxWidth: 1500,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 56,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#F4F7F9",
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
  },

  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: "#17375F",
    borderRadius: 18,
    backgroundColor: "#17375F",
    shadowColor: "#0F172A",
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  heroIconWrap: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#5B4EF5",
  },
  eyebrow: {
    color: "#C7D2FE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "900",
  },
  subtitle: {
    maxWidth: 900,
    marginTop: 7,
    color: "#DCE7F4",
    fontSize: 13,
    lineHeight: 20,
  },
  heroTrustBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#F0FDF4",
  },
  heroTrustText: {
    color: "#0F766E",
    fontSize: 9,
    fontWeight: "900",
  },

  summaryGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  stackGrid: {
    flexDirection: "column",
  },
  summaryCard: {
    flex: 1,
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  summaryCardDisaster: {
    borderColor: "#F0D7C4",
    backgroundColor: "#FFFDFC",
  },
  summaryCardCommunity: {
    borderColor: "#D8E8E3",
    backgroundColor: "#FCFFFE",
  },
  summaryIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
  },
  summaryValue: {
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "900",
  },
  summaryLabel: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "800",
  },

  filterPanel: {
    marginTop: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  sectionEyebrow: {
    color: "#0F766E",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionSubtitle: {
    maxWidth: 850,
    marginTop: 5,
    color: "#64748B",
    fontSize: 11.5,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 15,
  },
  filterChip: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#D6E0E6",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: {
    borderColor: "#5B4EF5",
    backgroundColor: "#5B4EF5",
  },
  filterChipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  filterCount: {
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: "#EEF2F6",
  },
  filterCountActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  filterCountText: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "900",
  },
  filterCountTextActive: {
    color: "#FFFFFF",
  },
  searchBox: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 15,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#D9E1EA",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    color: "#0F172A",
    fontSize: 11,
  },
  searchClearButton: {
    padding: 4,
  },

  webWorkspace: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginTop: 16,
  },
  webWorkspaceStack: {
    flexDirection: "column",
  },
  webCampaignPane: {
    flex: 1.05,
    minWidth: 0,
  },
  webDetailPane: {
    flex: 0.95,
    minWidth: 0,
  },
  webPaneFull: {
    width: "100%",
  },
  drawerPlaceholder: {
    minHeight: 430,
    alignItems: "center",
    justifyContent: "center",
    padding: 38,
    borderWidth: 1,
    borderColor: "#E0E7FF",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  drawerPlaceholderIcon: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
  },
  drawerPlaceholderTitle: {
    marginTop: 16,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },
  drawerPlaceholderText: {
    maxWidth: 430,
    marginTop: 8,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F2C7C2",
    borderRadius: 11,
    backgroundColor: "#FFF7F6",
  },
  errorText: {
    flex: 1,
    color: "#B42318",
    fontSize: 10.5,
    lineHeight: 16,
  },

  campaignGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
  },
  campaignCard: {
    width: "100%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  campaignCardWide: {
    width: "48.6%",
    minWidth: 250,
  },
  campaignCardSelected: {
    borderColor: "#0F766E",
    shadowOpacity: 0.08,
  },
  campaignVisualWrap: {
    position: "relative",
    height: 165,
    backgroundColor: "#DDE7E5",
  },
  campaignVisualImage: {
    width: "100%",
    height: "100%",
  },
  photoApprovalBadge: {
    position: "absolute",
    left: 11,
    bottom: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,118,110,0.92)",
  },
  photoApprovalText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "900",
  },
  campaignVisualPlaceholder: {
    height: 165,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    backgroundColor: "#EEF7F5",
  },
  campaignVisualPlaceholderCommunity: {
    backgroundColor: "#F5F0FA",
  },
  campaignVisualIconCircle: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  campaignVisualPlaceholderTitle: {
    marginTop: 10,
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  campaignVisualPlaceholderText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.3,
    textAlign: "center",
  },
  campaignCardBody: {
    padding: 15,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  verifiedBadgeText: {
    color: "#15803D",
    fontSize: 7.8,
    fontWeight: "900",
  },
  groupBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFF3E8",
  },
  groupBadgeCommunity: {
    backgroundColor: "#F2EBFA",
  },
  groupBadgeText: {
    color: "#B45309",
    fontSize: 7.8,
    fontWeight: "900",
  },
  groupBadgeTextCommunity: {
    color: "#7C3AED",
  },
  campaignTitle: {
    marginTop: 10,
    color: "#0F172A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  locationLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 7,
  },
  campaignLocation: {
    flex: 1,
    color: "#64748B",
    fontSize: 9.5,
    fontWeight: "700",
  },
  campaignDescription: {
    marginTop: 9,
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15.5,
  },
  cardProgressWrap: {
    marginTop: 13,
  },
  cardProgressTop: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
  },
  cardProgressRaised: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  cardProgressGoal: {
    color: "#94A3B8",
    fontSize: 8.7,
    fontWeight: "700",
  },
  progressTrack: {
    height: 7,
    overflow: "hidden",
    marginTop: 7,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#5B4EF5",
  },
  cardProgressPercent: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 8.5,
    fontWeight: "800",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F5",
  },
  cardCategory: {
    flex: 1,
    color: "#64748B",
    fontSize: 8.8,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  viewCampaignButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  viewCampaignText: {
    color: "#0F766E",
    fontSize: 9.5,
    fontWeight: "900",
  },

  detailShell: {
    marginTop: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#DDE4F0",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  detailShellWeb: {
    marginTop: 0,
    shadowColor: "#0F172A",
    shadowOpacity: 0.055,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  detailTopBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EEF2",
  },
  detailEyebrow: {
    color: "#0F766E",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  detailTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 21,
    fontWeight: "900",
  },
  detailLocation: {
    flex: 1,
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "700",
  },
  openSupportBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#16A34A",
  },
  openSupportText: {
    color: "#15803D",
    fontSize: 8.5,
    fontWeight: "900",
  },
  detailGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginTop: 16,
  },
  detailGridDrawer: {
    flexDirection: "column",
  },
  detailMainColumn: {
    flex: 1.55,
    gap: 13,
  },
  detailSideColumn: {
    flex: 0.85,
    gap: 13,
  },

  detailPhotoPlaceholder: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    borderWidth: 1,
    borderColor: "#DDE7E4",
    borderRadius: 14,
    backgroundColor: "#F4FAF8",
  },
  detailPhotoPlaceholderIcon: {
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  detailPhotoPlaceholderTitle: {
    marginTop: 12,
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  detailPhotoPlaceholderText: {
    maxWidth: 520,
    marginTop: 6,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 16,
    textAlign: "center",
  },
  galleryWrap: {
    position: "relative",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  galleryHero: {
    width: "100%",
    height: 330,
    backgroundColor: "#E2E8F0",
  },
  galleryBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  galleryBadgeText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "900",
  },
  galleryVerifiedBadge: {
    position: "absolute",
    left: 12,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,118,110,0.92)",
  },
  galleryVerifiedBadgeText: {
    color: "#FFFFFF",
    fontSize: 8.4,
    fontWeight: "900",
  },
  galleryThumbRow: {
    gap: 8,
    padding: 10,
  },
  galleryThumbButton: {
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 8,
  },
  galleryThumbButtonActive: {
    borderColor: "#0F766E",
  },
  galleryThumb: {
    width: 72,
    height: 54,
    backgroundColor: "#E2E8F0",
  },

  storyCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  storyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  storyHeaderIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
  },
  storyEyebrow: {
    color: "#0F766E",
    fontSize: 8.3,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  storyTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  storyText: {
    marginTop: 13,
    color: "#475569",
    fontSize: 11,
    lineHeight: 18,
  },
  factGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 15,
  },
  fact: {
    width: "48%",
    minWidth: 190,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E3E9EE",
    borderRadius: 10,
    backgroundColor: "#FAFCFD",
  },
  factIcon: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#ECFDF5",
  },
  factLabel: {
    color: "#94A3B8",
    fontSize: 7.8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  factValue: {
    marginTop: 2,
    color: "#334155",
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "800",
  },

  updatesCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  blockIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#ECFDF5",
  },
  blockTitle: {
    color: "#0F172A",
    fontSize: 12.5,
    fontWeight: "900",
  },
  blockSubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14.5,
  },
  noUpdatesBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 13,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  noUpdatesTitle: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900",
  },
  noUpdatesText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.3,
    lineHeight: 14,
  },
  storyTimeline: {
    marginTop: 13,
    gap: 10,
  },
  storyUpdateItem: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5EBEF",
    borderRadius: 10,
    backgroundColor: "#FCFDFD",
  },
  storyTimelineMarker: {
    width: 9,
    height: 9,
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: "#5B4EF5",
  },
  storyUpdateTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  storyUpdateTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  storyUpdateDate: {
    color: "#94A3B8",
    fontSize: 8,
  },
  storyUpdateBody: {
    marginTop: 5,
    color: "#475569",
    fontSize: 9.8,
    lineHeight: 15,
  },
  storyUpdateAuthor: {
    marginTop: 6,
    color: "#0F766E",
    fontSize: 8.3,
    fontWeight: "800",
  },

  needsCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  needGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 13,
  },
  needCard: {
    width: "48%",
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E1E8EC",
    borderRadius: 10,
    backgroundColor: "#FAFCFD",
  },
  needIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#ECFDF5",
  },
  needCardTitle: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900",
  },
  needCardMeta: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.5,
    lineHeight: 12.5,
  },
  needEmptyText: {
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 15,
  },

  fundingCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#CFE2DD",
    borderRadius: 14,
    backgroundColor: "#F9FDFC",
  },
  fundingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  fundingIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#E7F6F2",
  },
  fundingEyebrow: {
    color: "#0F766E",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  fundingTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  fundingAmount: {
    marginTop: 15,
    color: "#0F172A",
    fontSize: 27,
    fontWeight: "900",
  },
  fundingGoal: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },
  progressTrackLarge: {
    height: 10,
    overflow: "hidden",
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: "#DFE8E5",
  },
  progressFillLarge: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#5B4EF5",
  },
  fundingStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 13,
  },
  fundingStatValue: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  fundingStatLabel: {
    marginTop: 2,
    color: "#94A3B8",
    fontSize: 8.2,
    fontWeight: "800",
  },
  fundingStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#D9E2E7",
  },
  noGoalBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 13,
    padding: 11,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  noGoalText: {
    flex: 1,
    color: "#64748B",
    fontSize: 9.4,
    lineHeight: 14,
  },
  fundingTrustNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: "#DDE8E4",
  },
  fundingTrustText: {
    flex: 1,
    color: "#49646F",
    fontSize: 8.8,
    lineHeight: 13.5,
  },

  locationCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  locationCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  locationPinCircle: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#0F766E",
  },
  locationCardEyebrow: {
    color: "#0F766E",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  locationCardTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  locationInfoRows: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F5",
  },
  infoRow: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F5",
  },
  infoRowLabel: {
    color: "#94A3B8",
    fontSize: 7.8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  infoRowValue: {
    marginTop: 3,
    color: "#334155",
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  handoffNotesBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
  },
  handoffNotesLabel: {
    color: "#0F766E",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  handoffNotesText: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 9.2,
    lineHeight: 14,
  },
  privacyNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginTop: 11,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#F1FAF8",
  },
  privacyNoticeText: {
    flex: 1,
    color: "#49646F",
    fontSize: 8.8,
    lineHeight: 13.5,
  },

  areaCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  areaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  areaTitle: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  areaValue: {
    marginTop: 9,
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "900",
  },
  areaHelp: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 8.8,
    lineHeight: 13,
  },

  embeddedMapCard: {
    overflow: "hidden",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  embeddedMapHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E7EDF1",
  },
  embeddedMapHeaderIcon: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#ECFDF5",
  },
  embeddedMapEyebrow: {
    color: "#0F766E",
    fontSize: 7.4,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  embeddedMapTitle: {
    marginTop: 1,
    color: "#0F172A",
    fontSize: 9.5,
    fontWeight: "900",
  },
  expandMapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#CFE2DD",
    borderRadius: 8,
    backgroundColor: "#F7FCFB",
  },
  expandMapButtonText: {
    color: "#0F766E",
    fontSize: 8,
    fontWeight: "900",
  },
  embeddedMapFrame: {
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  embeddedMapNativeFallback: {
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    backgroundColor: "#F8FAFC",
  },
  embeddedMapNativeTitle: {
    marginTop: 9,
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  embeddedMapNativeText: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 9.2,
    lineHeight: 14,
    textAlign: "center",
  },
  embeddedMapLocationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#E7EDF1",
  },
  embeddedMapLocationName: {
    color: "#334155",
    fontSize: 9.5,
    fontWeight: "900",
  },
  embeddedMapLocationText: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.5,
    lineHeight: 12.5,
  },
  mapModalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(15,23,42,0.58)",
  },
  mapModalCard: {
    width: "100%",
    maxWidth: 1120,
    maxHeight: "92%",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  mapModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#E7EDF1",
  },
  mapModalEyebrow: {
    color: "#0F766E",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  mapModalTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  mapModalAddress: {
    marginTop: 4,
    color: "#64748B",
    fontSize: 10,
  },
  mapModalClose: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#F1F5F9",
  },
  mapModalFrame: {
    backgroundColor: "#E2E8F0",
  },
  mapModalPrivacy: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 12,
    backgroundColor: "#F3FAF8",
  },
  mapModalPrivacyText: {
    flex: 1,
    color: "#49646F",
    fontSize: 9,
    lineHeight: 14,
  },

  supportSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#E7EDF1",
  },
  supportSectionEyebrow: {
    color: "#0F766E",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  supportSectionTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },
  supportSectionText: {
    maxWidth: 800,
    marginTop: 5,
    color: "#64748B",
    fontSize: 10.5,
    lineHeight: 16,
  },
  supportTypeGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 13,
  },
  supportTypeCard: {
    flex: 1,
    minHeight: 105,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  supportTypeCardSelected: {
    borderColor: "#8BCDBD",
    backgroundColor: "#F2FBF8",
  },
  supportTypeIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
  },
  supportTypeIconSelected: {
    backgroundColor: "#0F766E",
  },
  supportTypeTitle: {
    color: "#0F172A",
    fontSize: 11.5,
    fontWeight: "900",
  },
  supportTypeTitleSelected: {
    color: "#0F766E",
  },
  supportTypeText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.3,
    lineHeight: 14,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    padding: 11,
    borderRadius: 9,
    backgroundColor: "#F3FAF8",
  },
  infoBoxText: {
    flex: 1,
    color: "#49646F",
    fontSize: 9.3,
    lineHeight: 14,
  },

  donationFormCard: {
    marginTop: 13,
    padding: 15,
    borderWidth: 1,
    borderColor: "#DDE6EC",
    borderRadius: 13,
    backgroundColor: "#FBFCFD",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 4,
    marginBottom: 9,
  },
  stepBadge: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#0F766E",
  },
  stepBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  stepTitle: {
    color: "#0F172A",
    fontSize: 11.5,
    fontWeight: "900",
  },
  stepText: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 9.2,
    lineHeight: 14,
  },

  instructionsBox: {
    marginTop: 8,
    marginBottom: 13,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DCE8E5",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  instructionsEyebrow: {
    color: "#0F766E",
    fontSize: 7.8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  instructionsTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  instructionsText: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 9.8,
    lineHeight: 15,
  },

  label: {
    marginTop: 12,
    marginBottom: 5,
    color: "#334155",
    fontSize: 10,
    fontWeight: "900",
  },
  input: {
    minHeight: 43,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#D9E1E8",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 11,
  },
  helperText: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 9.2,
    lineHeight: 14,
  },
  multiline: {
    minHeight: 82,
    textAlignVertical: "top",
  },
  quickAmountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 8,
    marginBottom: 14,
  },
  quickAmountButton: {
    minWidth: 96,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#D9E1EA",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  quickAmountButtonActive: {
    borderColor: "#5B4EF5",
    backgroundColor: "#5B4EF5",
  },
  quickAmountText: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  quickAmountTextActive: {
    color: "#FFFFFF",
  },

  twoColumnRow: {
    flexDirection: "row",
    gap: 10,
  },
  flexField: {
    flex: 1,
  },

  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  choice: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#D5DDE5",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  choiceSelected: {
    borderColor: "#A7DCCE",
    backgroundColor: "#ECFDF5",
  },
  choiceText: {
    color: "#64748B",
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  choiceTextSelected: {
    color: "#0F766E",
  },

  selectField: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#D9E1E8",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  selectFieldDisabled: {
    opacity: 0.5,
    backgroundColor: "#F8FAFC",
  },
  selectFieldText: {
    flex: 1,
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "700",
  },
  selectFieldPlaceholder: {
    color: "#94A3B8",
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  selectModal: {
    width: "100%",
    maxWidth: 520,
    maxHeight: 520,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  selectModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  selectModalTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  selectModalScroll: {
    maxHeight: 430,
  },
  selectOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  selectOptionActive: {
    backgroundColor: "#F0FBF8",
  },
  selectOptionText: {
    flex: 1,
    color: "#334155",
    fontSize: 10.5,
    fontWeight: "700",
  },
  selectOptionTextActive: {
    color: "#0F766E",
    fontWeight: "900",
  },
  selectModalEmpty: {
    padding: 18,
    color: "#64748B",
    fontSize: 10,
    textAlign: "center",
  },

  proofSection: {
    marginTop: 2,
  },
  proofPicker: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#9FD8CB",
    borderRadius: 10,
    backgroundColor: "#F6FBFA",
  },
  proofPickerTitle: {
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  proofPickerText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.3,
    lineHeight: 14,
  },
  proofPreviewCard: {
    flexDirection: "row",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#D9E1E8",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  proofImage: {
    width: 76,
    height: 76,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  proofPreviewInfo: {
    flex: 1,
    justifyContent: "center",
  },
  proofPreviewTitle: {
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },
  proofPreviewText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.5,
  },
  removeProofButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 9,
  },
  removeProofText: {
    color: "#B42318",
    fontSize: 9.5,
    fontWeight: "800",
  },

  handoffSummaryCard: {
    marginTop: 6,
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DCE8E5",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  handoffSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 5,
  },
  handoffSummaryIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#ECFDF5",
  },
  handoffSummaryEyebrow: {
    color: "#0F766E",
    fontSize: 7.8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  handoffSummaryTitle: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 10.5,
    fontWeight: "900",
  },

  submitSection: {
    marginTop: 13,
    padding: 14,
    borderWidth: 1,
    borderColor: "#CFE4DF",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  processStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 10,
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  processPoint: {
    alignItems: "center",
    gap: 4,
  },
  processPointIcon: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#E7F6F2",
  },
  processPointText: {
    maxWidth: 86,
    color: "#475569",
    fontSize: 7.8,
    fontWeight: "800",
    textAlign: "center",
  },
  submitButton: {
    marginTop: 12,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: "#0F766E",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },

  historySection: {
    marginTop: 28,
  },
  historyList: {
    gap: 10,
    marginTop: 12,
  },
  historyCard: {
    padding: 13,
    borderWidth: 1,
    borderColor: "#DFE7EE",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  historyTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  historyIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
  },
  historyTitle: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },
  historyMeta: {
    marginTop: 2,
    color: "#94A3B8",
    fontSize: 9,
  },
  historyValue: {
    marginTop: 9,
    color: "#334155",
    fontSize: 11,
    fontWeight: "800",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusSubmitted: {
    backgroundColor: "#B7791F",
  },
  statusReceived: {
    backgroundColor: "#15803D",
  },
  statusRejected: {
    backgroundColor: "#B42318",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "900",
  },
  historyTracker: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  trackerStep: {
    width: 88,
    alignItems: "center",
  },
  trackerDot: {
    width: 29,
    height: 29,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  trackerDotComplete: {
    backgroundColor: "#0F766E",
  },
  trackerDotActive: {
    backgroundColor: "#2563EB",
  },
  trackerLabel: {
    marginTop: 5,
    color: "#94A3B8",
    fontSize: 7.5,
    fontWeight: "800",
    textAlign: "center",
  },
  trackerLabelActive: {
    color: "#334155",
  },
  trackerLine: {
    flex: 1,
    minWidth: 10,
    height: 2,
    marginTop: 14,
    backgroundColor: "#CBD5E1",
  },
  historyMessagePending: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 9,
    marginTop: 10,
    borderRadius: 9,
    backgroundColor: "#FFF8E6",
  },
  historyMessagePendingText: {
    flex: 1,
    color: "#7A5A12",
    fontSize: 9.2,
    lineHeight: 14,
  },
  historyMessageReceived: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 9,
    marginTop: 10,
    borderRadius: 9,
    backgroundColor: "#F0FDF4",
  },
  historyMessageReceivedText: {
    color: "#166534",
    fontSize: 9.2,
    lineHeight: 14,
    fontWeight: "800",
  },
  receiptReferenceText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 8.8,
    lineHeight: 13,
  },
  historyMessageRejected: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 9,
    marginTop: 10,
    borderRadius: 9,
    backgroundColor: "#FFF1F0",
  },
  historyMessageRejectedText: {
    flex: 1,
    color: "#B42318",
    fontSize: 9.2,
    lineHeight: 14,
  },

  emptyCard: {
    minHeight: 145,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#DFE7EE",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  emptyTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontSize: 12.5,
    fontWeight: "900",
  },
  emptyText: {
    maxWidth: 580,
    marginTop: 4,
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
});
