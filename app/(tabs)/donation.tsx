import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";

import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type DonationType = "monetary";
type CampaignGroup = "disaster_affected" | "community_needs_help";
type CampaignFilter = "all" | CampaignGroup;

type PublicNeed = {
  label?: string;
  needed?: number;
  received?: number;
  remaining?: number;
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
  officialChannelLabel?: string;
  officialChannelInstructions?: string;
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

  // LGU-controlled public service location shown for transparency/coordination.
  handoffLocationName?: string;
  handoffAddress?: string;
  handoffNotes?: string;
};

type MyDonation = {
  id: string;
  campaignId?: string;
  campaignTitle?: string;
  donationType?: DonationType | string;
  amount?: number;
  status?: string;
  rejectionReason?: string;
  transactionReference?: string;
  proofUrls?: string[];
  actualAmountReceived?: number;
  donorNote?: string;
  createdAt?: any;
};

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

const PAYMONGO_BACKEND_URL = "https://volunserve.onrender.com";

const sanitizeMoneyInput = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  const safeWhole = whole.slice(0, 12);

  if (!decimalParts.length) return safeWhole;
  return `${safeWhole}.${decimal}`;
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

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));


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

const donationTypeLabel = (_value?: string) => "Monetary";

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

const publicNeedsForCampaign = (campaign?: DonationCampaign): PublicNeed[] => {
  if (!campaign) return [];
  return Array.isArray(campaign.publicNeeds) ? campaign.publicNeeds.slice(0, 12) : [];
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
  const [showDonationPanel, setShowDonationPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const donationType: DonationType = "monetary";
  const [amount, setAmount] = useState("");
  const [checkoutProgress, setCheckoutProgress] = useState("");
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
          .filter(
            (item) =>
              item.status === "published" &&
              (item.acceptedDonationTypes?.includes("monetary") || campaignGoal(item) > 0),
          )
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
          .filter((item) => String(item.donationType || "monetary") === "monetary")
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
    const term = searchText.trim().toLowerCase();

    return campaigns.filter((campaign) => {
      const groupMatches =
        filter === "all" || campaignGroupOf(campaign) === filter;

      if (!groupMatches) return false;
      if (!term) return true;

      const searchable = [
        campaign.title,
        campaign.description,
        campaign.publicStory,
        campaign.publicLocationLabel,
        campaign.generalArea,
        campaign.campaignCategory,
        ...(campaign.barangays || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
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

  useEffect(() => {
    if (selectedCampaignId || filteredCampaigns.length === 0) return;
    setSelectedCampaignId(filteredCampaigns[0].id);
  }, [filteredCampaigns, selectedCampaignId]);

  const selectedGoal = campaignGoal(selectedCampaign);
  const selectedRaised = campaignRaised(selectedCampaign);
  const selectedPercent =
    selectedGoal > 0 ? clampPercent((selectedRaised / selectedGoal) * 100) : 0;

  const acceptedTypes = selectedCampaign?.acceptedDonationTypes || [];
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

  const resetDonationForm = () => {
    setAmount("");
    setCheckoutProgress("");
  };

  const chooseCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setShowDonationPanel(false);
    resetDonationForm();

  };

  const chooseFilter = (nextFilter: CampaignFilter) => {
    setFilter(nextFilter);

    if (!selectedCampaign) return;
    if (nextFilter === "all") return;
    if (campaignGroupOf(selectedCampaign) !== nextFilter) {
      setSelectedCampaignId("");
      setShowDonationPanel(false);
      resetDonationForm();
    }
  };

  useEffect(() => {
    const location = (globalThis as any)?.location;
    const history = (globalThis as any)?.history;

    if (!location || typeof location.search !== "string") return;

    const params = new URLSearchParams(location.search);
    const paymentState = params.get("payment");

    if (paymentState === "success") {
      Alert.alert(
        "Test Payment Submitted",
        "PayMongo is confirming the sandbox payment. The campaign progress updates only after the signed webhook is received.",
      );
    } else if (paymentState === "cancelled") {
      Alert.alert(
        "Test Payment Cancelled",
        "No donation was counted. You may start another test checkout anytime while the campaign is open.",
      );
    }

    if (paymentState && history?.replaceState) {
      history.replaceState({}, "", location.pathname);
    }
  }, []);

  const currentDonationReturnBaseUrl = () => {
    const location = (globalThis as any)?.location;

    if (!location || typeof location.origin !== "string") {
      return "";
    }

    return `${location.origin}/donation`;
  };

  const submitDonation = async () => {
    if (!user || !profile || !selectedCampaign || submitting) return;

    if (!acceptedTypes.includes("monetary") && campaignGoal(selectedCampaign) <= 0) {
      Alert.alert(
        "Monetary Donation Unavailable",
        "This campaign is not accepting monetary donations.",
      );
      return;
    }

    const numericAmount = Number(amount);

    if (!amount.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid donation amount greater than zero.");
      return;
    }

    const returnBaseUrl = currentDonationReturnBaseUrl();
    if (!returnBaseUrl) {
      Alert.alert(
        "Web Checkout Required",
        "PayMongo sandbox checkout is currently enabled on the VolunServe web app.",
      );
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setCheckoutProgress("Creating secure test checkout...");

      const campaignSnapshotCampaign = campaigns.find(
        (item) => item.id === selectedCampaign.id && item.status === "published",
      );

      if (!campaignSnapshotCampaign) {
        throw new Error("This campaign is no longer open for donations.");
      }

      const firebaseToken = await user.getIdToken();

      const response = await fetch(`${PAYMONGO_BACKEND_URL}/api/paymongo/checkout-session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firebaseToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          amount: numericAmount,
          returnBaseUrl,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.message || `Unable to start PayMongo checkout (HTTP ${response.status}).`,
        );
      }

      const checkoutUrl = String(result?.checkoutUrl || "").trim();
      if (!checkoutUrl.startsWith("https://checkout.paymongo.com/")) {
        throw new Error("PayMongo did not return a valid checkout URL.");
      }

      setCheckoutProgress("Opening PayMongo Test Checkout...");
      await Linking.openURL(checkoutUrl);
    } catch (problem) {
      const message =
        problem instanceof Error ? problem.message : "Unable to start the test donation checkout.";
      setError(message);
      Alert.alert("Checkout Failed", message);
    } finally {
      setSubmitting(false);
      setCheckoutProgress("");
    }
  };

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
      contentContainerStyle={styles.webContainer}
      showsVerticalScrollIndicator
    >
      <View style={styles.webPageHeader}>
        <View style={styles.webHeaderCopy}>
          <Text style={styles.webEyebrow}>VOLUNSERVE · LGU VERIFIED</Text>
          <Text style={styles.webPageTitle}>Donation Campaigns</Text>
          <Text style={styles.webPageSubtitle}>
            Support verified community and disaster needs.
          </Text>
        </View>

        <View style={[styles.webHeaderActions, !medium && styles.webHeaderActionsStack]}>
          <View style={styles.webSearchBox}>
            <Ionicons name="search-outline" size={17} color="#64748B" />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search campaigns or location"
              placeholderTextColor="#94A3B8"
              style={styles.webSearchInput}
            />
            {!!searchText && (
              <TouchableOpacity onPress={() => setSearchText("")}>
                <Ionicons name="close-circle" size={17} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.webHistoryButton, showHistory && styles.webHistoryButtonActive]}
            activeOpacity={0.84}
            onPress={() => setShowHistory((current) => !current)}
          >
            <Ionicons
              name="receipt-outline"
              size={16}
              color={showHistory ? "#FFFFFF" : "#0F766E"}
            />
            <Text
              style={[
                styles.webHistoryButtonText,
                showHistory && styles.webHistoryButtonTextActive,
              ]}
            >
              My Donations{myDonations.length ? ` (${myDonations.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.webFilterBar}>
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
              style={[styles.webFilterChip, active && styles.webFilterChipActive]}
              activeOpacity={0.84}
              onPress={() => chooseFilter(option.value)}
            >
              <Text
                style={[
                  styles.webFilterChipText,
                  active && styles.webFilterChipTextActive,
                ]}
              >
                {option.value === "all"
                  ? "All"
                  : option.value === "disaster_affected"
                    ? "Disaster Affected"
                    : "Community Needs Help"}
              </Text>
              <View style={[styles.webFilterCount, active && styles.webFilterCountActive]}>
                <Text
                  style={[
                    styles.webFilterCountText,
                    active && styles.webFilterCountTextActive,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color="#B42318" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {showHistory ? (
        <View style={styles.webHistoryPanel}>
          <View style={styles.webSectionHeaderRow}>
            <View>
              <Text style={styles.webSectionTitle}>My Donations</Text>
              <Text style={styles.webSectionSubtitle}>Your submitted donation records.</Text>
            </View>
            <TouchableOpacity
              style={styles.webCloseButton}
              onPress={() => setShowHistory(false)}
            >
              <Ionicons name="close" size={18} color="#334155" />
            </TouchableOpacity>
          </View>

          {!historyReady ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color="#0F766E" />
            </View>
          ) : myDonations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={28} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No donation submissions yet</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {myDonations.map((donation) => (
                <DonationHistoryCard key={donation.id} donation={donation} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.webWorkspace, !wide && styles.webWorkspaceStack]}>
          <View style={styles.webCampaignPane}>
            <View style={styles.webSectionHeaderRow}>
              <View>
                <Text style={styles.webSectionTitle}>Active Campaigns</Text>
                <Text style={styles.webSectionSubtitle}>
                  Choose a verified campaign to view details.
                </Text>
              </View>
              <Text style={styles.webCampaignCount}>{filteredCampaigns.length}</Text>
            </View>

            {!campaignsReady ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator color="#0F766E" />
              </View>
            ) : filteredCampaigns.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="search-outline" size={28} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No matching campaigns</Text>
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

          <View style={styles.webDetailPane}>
            {!selectedCampaign ? (
              <View style={styles.webDetailEmpty}>
                <Ionicons name="heart-outline" size={34} color="#0F766E" />
                <Text style={styles.webDetailEmptyTitle}>Select a campaign</Text>
                <Text style={styles.webDetailEmptyText}>Campaign details will appear here.</Text>
              </View>
            ) : (
              <View style={styles.webDetailCard}>
                <PublicPhotoGallery
                  photos={selectedPhotoUrls}
                  title={selectedCampaign.title || "Donation Campaign"}
                  campaign={selectedCampaign}
                />

                <View style={styles.webDetailBody}>
                  <View style={styles.webBadgeRow}>
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="shield-checkmark" size={12} color="#15803D" />
                      <Text style={styles.verifiedBadgeText}>LGU VERIFIED</Text>
                    </View>
                    <View style={styles.webCategoryBadge}>
                      <Text style={styles.webCategoryBadgeText}>
                        {campaignGroupOf(selectedCampaign) === "community_needs_help"
                          ? "COMMUNITY NEED"
                          : "DISASTER"}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.webDetailTitle}>
                    {selectedCampaign.title || "Donation Campaign"}
                  </Text>

                  <View style={styles.webLocationLine}>
                    <Ionicons name="location-outline" size={15} color="#0F766E" />
                    <Text style={styles.webLocationText} numberOfLines={1}>
                      {campaignAreaLabel(selectedCampaign)}
                    </Text>
                  </View>

                  <Text style={styles.webStoryText} numberOfLines={4}>
                    {selectedCampaign.publicStory ||
                      selectedCampaign.description ||
                      "LGU-verified campaign open for public support."}
                  </Text>

                  {selectedGoal > 0 && (
                    <View style={styles.webProgressCard}>
                      <View style={styles.webProgressTop}>
                        <View>
                          <Text style={styles.webRaisedAmount}>{money(selectedRaised)}</Text>
                          <Text style={styles.webProgressLabel}>
                            raised of {money(selectedGoal)}
                          </Text>
                        </View>
                        <Text style={styles.webProgressPercent}>
                          {Math.round(selectedPercent)}%
                        </Text>
                      </View>
                      <View style={styles.progressTrackLarge}>
                        <View
                          style={[
                            styles.progressFillLarge,
                            { width: `${selectedPercent}%` as any },
                          ]}
                        />
                      </View>
                    </View>
                  )}

                  {!!selectedCampaign.handoffLocationName && (
                    <View style={styles.webLocationCard}>
                      <View style={styles.webLocationCardCopy}>
                        <Text style={styles.webLocationCardEyebrow}>OFFICIAL LGU LOCATION</Text>
                        <Text style={styles.webLocationCardTitle}>
                          {selectedCampaign.handoffLocationName}
                        </Text>
                        {!!selectedCampaign.handoffAddress && (
                          <Text style={styles.webLocationCardAddress} numberOfLines={2}>
                            {selectedCampaign.handoffAddress}
                          </Text>
                        )}
                      </View>
                      {!!selectedCampaign.handoffAddress && (
                        <HandoffLocationMap
                          locationName={selectedCampaign.handoffLocationName}
                          address={selectedCampaign.handoffAddress}
                        />
                      )}
                    </View>
                  )}

                  <View style={styles.webSupportTypesRow}>
                    <View style={styles.webSupportTypeChip}>
                      <Ionicons name="cash-outline" size={14} color="#0F766E" />
                      <Text style={styles.webSupportTypeText}>Monetary</Text>
                    </View>
                  </View>

                  {!showDonationPanel ? (
                    <TouchableOpacity
                      style={styles.webDonateButton}
                      activeOpacity={0.88}
                      onPress={() => {
                        setShowDonationPanel(true);
                      }}
                    >
                      <Ionicons name="heart" size={17} color="#FFFFFF" />
                      <Text style={styles.webDonateButtonText}>Donate Now</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.webDonatePanel}>
                      <View style={styles.webDonatePanelHeader}>
                        <Text style={styles.webDonatePanelTitle}>Make a Donation</Text>
                        <TouchableOpacity
                          style={styles.webCloseButton}
                          onPress={() => {
                            setShowDonationPanel(false);
                            resetDonationForm();
                          }}
                        >
                          <Ionicons name="close" size={18} color="#334155" />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.webDonationFields}>
                          <Text style={styles.webFieldLabel}>Amount</Text>
                          <View style={styles.webAmountGrid}>
                            {[100, 500, 1000, 2500, 5000].map((value) => (
                              <TouchableOpacity
                                key={value}
                                style={[
                                  styles.webAmountButton,
                                  Number(amount) === value && styles.webAmountButtonActive,
                                ]}
                                onPress={() => setAmount(String(value))}
                              >
                                <Text
                                  style={[
                                    styles.webAmountButtonText,
                                    Number(amount) === value && styles.webAmountButtonTextActive,
                                  ]}
                                >
                                  ₱{value.toLocaleString("en-PH")}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <TextInput
                            style={styles.input}
                            value={amount}
                            onChangeText={(value) => setAmount(sanitizeMoneyInput(value))}
                            keyboardType="decimal-pad"
                            placeholder="Other amount"
                            placeholderTextColor="#94A3B8"
                          />

                          <View style={styles.webOfficialChannelCard}>
                            <Ionicons name="shield-checkmark-outline" size={18} color="#0F766E" />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.webOfficialChannelTitle}>
                                PayMongo Sandbox · GCash Test Checkout
                              </Text>
                              <Text style={styles.webOfficialChannelText}>
                                Test mode only — no real money will be charged. Payment confirmation is handled automatically by the signed PayMongo webhook; no screenshot or manual transaction reference is required.
                              </Text>
                            </View>
                          </View>
                        </View>

                      <TouchableOpacity
                          style={[styles.webSubmitButton, submitting && styles.disabled]}
                          disabled={submitting}
                          onPress={() => void submitDonation()}
                        >
                          {submitting ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <Ionicons name="card-outline" size={17} color="#FFFFFF" />
                          )}
                          <Text style={styles.webSubmitButtonText}>
                            {checkoutProgress || "Proceed to Test Checkout"}
                          </Text>
                        </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      )}
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
        <Text style={styles.detailPhotoPlaceholderText}>No public photo yet.</Text>
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
            No public monetary goal has been published for this campaign.
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
  const cleanName = String(locationName || "Authorized donation location").trim();
  const cleanAddress = String(address || "").trim();
  const mapQuery = [cleanName, cleanAddress].filter(Boolean).join(", ");
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;

  const openMap = async () => {
    try {
      const supported = await Linking.canOpenURL(mapUrl);
      if (!supported) throw new Error("Google Maps is not available on this device.");
      await Linking.openURL(mapUrl);
    } catch (problem) {
      Alert.alert(
        "Unable to Open Map",
        problem instanceof Error ? problem.message : "Unable to open Google Maps.",
      );
    }
  };

  return (
    <TouchableOpacity
      style={styles.webOpenMapButton}
      activeOpacity={0.84}
      onPress={() => void openMap()}
    >
      <Ionicons name="map-outline" size={16} color="#0F766E" />
      <Text style={styles.webOpenMapButtonText}>Open in Google Maps</Text>
      <Ionicons name="open-outline" size={14} color="#0F766E" />
    </TouchableOpacity>
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
        placeholder="Add a short optional note for the LGU."
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
  const received = ["received", "verified", "completed"].includes(status);
  const valueText = money(Number(donation.amount || 0));

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyTop}>
        <View style={styles.historyIcon}>
          <Ionicons
            name="cash-outline"
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
          <TrackerStep icon="send-outline" label="Submitted" complete active={!received} />
          <View style={styles.trackerLine} />
          <TrackerStep
            icon="shield-checkmark-outline"
            label="Verified"
            complete={received}
            active={received}
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
      ) : received ? (
        <View style={styles.historyMessageReceived}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#15803D" />
          <View style={{ flex: 1 }}>
            <Text style={styles.historyMessageReceivedText}>
              The LGU has verified actual receipt of this donation.
            </Text>
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
    alignItems: "flex-start",
    gap: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: "#DCE7E4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  heroIconWrap: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#0F766E",
  },
  eyebrow: {
    color: "#0F766E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  title: {
    marginTop: 4,
    color: "#0F172A",
    fontSize: 27,
    fontWeight: "900",
  },
  subtitle: {
    maxWidth: 820,
    marginTop: 7,
    color: "#64748B",
    fontSize: 13,
    lineHeight: 20,
  },
  heroTrustBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
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
    borderColor: "#0F766E",
    backgroundColor: "#0F766E",
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
    width: "48.8%",
    minWidth: 255,
  },
  campaignCardSelected: {
    borderColor: "#0F766E",
    shadowOpacity: 0.08,
  },
  campaignVisualWrap: {
    position: "relative",
    height: 148,
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
    height: 148,
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
    padding: 12,
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
    marginTop: 8,
    color: "#0F172A",
    fontSize: 13.5,
    lineHeight: 18,
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
    backgroundColor: "#0F766E",
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
    borderColor: "#D5E2DF",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
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
  detailMainColumn: {
    flex: 1.55,
    gap: 13,
  },
  detailSideColumn: {
    flex: 0.85,
    gap: 13,
  },

  detailPhotoPlaceholder: {
    minHeight: 210,
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
    height: 240,
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
    backgroundColor: "#0F766E",
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
    backgroundColor: "#0F766E",
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
  webContainer: {
    width: "100%",
    maxWidth: 1460,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 34,
  },
  webPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E7ECEF",
  },
  webHeaderCopy: {
    flex: 1,
    minWidth: 220,
  },
  webEyebrow: {
    color: "#0F766E",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  webPageTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
  },
  webPageSubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
  },
  webHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  webHeaderActionsStack: {
    width: "100%",
    alignItems: "stretch",
    flexDirection: "column",
  },
  webSearchBox: {
    minWidth: 300,
    maxWidth: 440,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  webSearchInput: {
    flex: 1,
    minHeight: 42,
    color: "#0F172A",
    fontSize: 10.5,
    outlineStyle: "none" as any,
  },
  webHistoryButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#B9D8D3",
    borderRadius: 12,
    backgroundColor: "#F5FBFA",
  },
  webHistoryButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#0F766E",
  },
  webHistoryButtonText: {
    color: "#0F766E",
    fontSize: 10,
    fontWeight: "900",
  },
  webHistoryButtonTextActive: {
    color: "#FFFFFF",
  },
  webFilterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    marginBottom: 16,
  },
  webFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  webFilterChipActive: {
    borderColor: "#5B4CF0",
    backgroundColor: "#5B4CF0",
  },
  webFilterChipText: {
    color: "#475569",
    fontSize: 9.5,
    fontWeight: "800",
  },
  webFilterChipTextActive: {
    color: "#FFFFFF",
  },
  webFilterCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#EEF2F6",
  },
  webFilterCountActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  webFilterCountText: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
  },
  webFilterCountTextActive: {
    color: "#FFFFFF",
  },
  webWorkspace: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 18,
  },
  webWorkspaceStack: {
    flexDirection: "column",
  },
  webCampaignPane: {
    flex: 1.2,
    minWidth: 0,
  },
  webDetailPane: {
    flex: 0.8,
    minWidth: 0,
  },
  webSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  webSectionTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  webSectionSubtitle: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 9.5,
    lineHeight: 14,
  },
  webCampaignCount: {
    minWidth: 30,
    paddingHorizontal: 9,
    paddingVertical: 6,
    textAlign: "center",
    borderRadius: 999,
    overflow: "hidden",
    color: "#0F766E",
    backgroundColor: "#E8F6F3",
    fontSize: 9,
    fontWeight: "900",
  },
  webDetailCard: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  webDetailBody: {
    padding: 15,
  },
  webBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    alignItems: "center",
  },
  webCategoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFF3E8",
  },
  webCategoryBadgeText: {
    color: "#B45309",
    fontSize: 7.8,
    fontWeight: "900",
  },
  webDetailTitle: {
    marginTop: 10,
    color: "#0F172A",
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "900",
  },
  webLocationLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  webLocationText: {
    flex: 1,
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },
  webStoryText: {
    marginTop: 10,
    color: "#475569",
    fontSize: 10.3,
    lineHeight: 16,
  },
  webProgressCard: {
    marginTop: 13,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  webProgressTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  webRaisedAmount: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  webProgressLabel: {
    marginTop: 1,
    color: "#64748B",
    fontSize: 8.8,
  },
  webProgressPercent: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "900",
  },
  webLocationCard: {
    marginTop: 13,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  webLocationCardCopy: {
    flex: 1,
  },
  webLocationCardEyebrow: {
    color: "#0F766E",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  webLocationCardTitle: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900",
  },
  webLocationCardAddress: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9,
    lineHeight: 13,
  },
  webOpenMapButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#B9D8D3",
    borderRadius: 9,
    backgroundColor: "#F5FBFA",
  },
  webOpenMapButtonText: {
    color: "#0F766E",
    fontSize: 8.8,
    fontWeight: "900",
  },
  webSupportTypesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 12,
  },
  webSupportTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EEF7F5",
  },
  webSupportTypeText: {
    color: "#0F766E",
    fontSize: 8.5,
    fontWeight: "800",
  },
  webDonateButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 13,
    borderRadius: 11,
    backgroundColor: "#5B4CF0",
  },
  webDonateButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  webDonatePanel: {
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#E7ECEF",
  },
  webDonatePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  webDonatePanelTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  webCloseButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  webDonationTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 11,
  },
  webDonationTypeButton: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#B9D8D3",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  webDonationTypeButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#0F766E",
  },
  webDonationTypeText: {
    color: "#0F766E",
    fontSize: 9.5,
    fontWeight: "900",
  },
  webDonationTypeTextActive: {
    color: "#FFFFFF",
  },
  webDonationFields: {
    gap: 9,
    marginTop: 12,
  },
  webFieldLabel: {
    color: "#334155",
    fontSize: 9.5,
    fontWeight: "900",
  },
  webAmountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  webAmountButton: {
    minWidth: 84,
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  webAmountButtonActive: {
    borderColor: "#5B4CF0",
    backgroundColor: "#5B4CF0",
  },
  webAmountButtonText: {
    color: "#334155",
    fontSize: 9.5,
    fontWeight: "900",
  },
  webAmountButtonTextActive: {
    color: "#FFFFFF",
  },
  webOfficialChannelCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F5FBFA",
  },
  webOfficialChannelTitle: {
    color: "#0F172A",
    fontSize: 9.8,
    fontWeight: "900",
  },
  webOfficialChannelText: {
    marginTop: 2,
    color: "#64748B",
    fontSize: 8.8,
    lineHeight: 13,
  },
  webSubmitButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: "#0F766E",
  },
  webSubmitButtonText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  webDetailEmpty: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  webDetailEmptyTitle: {
    marginTop: 8,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  webDetailEmptyText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 9.5,
  },
  webHistoryPanel: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },

});
