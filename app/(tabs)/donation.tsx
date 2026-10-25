import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import DonationHeroArt from "../../components/donations/DonationHeroArt";
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
  Modal,
  Platform,
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
  paymentStatus?: string;
  paymentProvider?: string;
  paymongoLivemode?: boolean;
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

const campaignFullyFunded = (campaign?: DonationCampaign) => {
  const goal = campaignGoal(campaign);
  return goal > 0 && campaignRaised(campaign) >= goal - 0.01;
};
// Admin-closed campaigns are no longer eligible for new donations, regardless
// of whether they reached their funding goal. Show them in the past tab.
const campaignFinished = (campaign?: DonationCampaign) =>
  campaign?.status === "closed" || campaignFullyFunded(campaign);

export default function Donation() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1080;
  const medium = width >= 760;
  const spacious = width >= 1300;

  const { loading, user, profile } = useUserSession();

  const [campaigns, setCampaigns] = useState<DonationCampaign[]>([]);
  const [myDonations, setMyDonations] = useState<MyDonation[]>([]);
  const [campaignsReady, setCampaignsReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [returnedDonationId, setReturnedDonationId] = useState("");
  const [returnedPaymentState, setReturnedPaymentState] = useState("");
  const [error, setError] = useState("");

  const [filter, setFilter] = useState<CampaignFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [showDonationPanel, setShowDonationPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCompletedCampaigns, setShowCompletedCampaigns] = useState(false);
  // Mobile: the detail page opens only after the user taps a campaign.
  const pageScrollRef = React.useRef<ScrollView>(null);
  const donationType: DonationType = "monetary";
  const [amount, setAmount] = useState("");
  const [donorNote, setDonorNote] = useState("");
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
          .filter((item) => {
            const monetaryReady =
              item.acceptedDonationTypes?.includes("monetary") ||
              campaignGoal(item) > 0;
            const goalReady = campaignGoal(item) > 0;
            const locationReady =
              String(item.handoffLocationName || "").trim().length >= 3 &&
              String(item.handoffAddress || "").trim().length >= 5;
            const photoReady = validPublicPhotoUrls(item).length > 0;

            return (
              (item.status === "published" || item.status === "closed") &&
              monetaryReady &&
              goalReady &&
              locationReady &&
              photoReady
            );
          })
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

  const completedCampaignCount = campaigns.filter(campaignFinished).length;
  const activeCampaignCount = campaigns.length - completedCampaignCount;
  const verifiedRaisedTotal = useMemo(
    () => campaigns.reduce((total, campaign) => total + campaignRaised(campaign), 0),
    [campaigns],
  );
  // Keep funded campaigns out of Active Campaigns. They remain inspectable
  // under Completed Campaigns, with their verified amount and outcome.
  const visibleCampaigns = useMemo(
    () => campaigns.filter(campaign => campaignFinished(campaign) === showCompletedCampaigns),
    [campaigns, showCompletedCampaigns],
  );
  const listedCampaigns = useMemo(
    () => filteredCampaigns.filter(campaign => campaignFinished(campaign) === showCompletedCampaigns),
    [filteredCampaigns, showCompletedCampaigns],
  );
  const returnedDonation = myDonations.find((d) => d.id === returnedDonationId);
  const returnIsConfirmed = returnedDonation?.status === "received" && returnedDonation?.paymentStatus === "paid";

  const disasterCount = useMemo(
    () => visibleCampaigns.filter((campaign) => campaignGroupOf(campaign) === "disaster_affected").length,
    [visibleCampaigns],
  );

  const communityCount = useMemo(
    () =>
      visibleCampaigns.filter((campaign) => campaignGroupOf(campaign) === "community_needs_help").length,
    [visibleCampaigns],
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((item) => item.id === selectedCampaignId),
    [campaigns, selectedCampaignId],
  );

  // No automatic campaign selection: a donor must open the campaign card first.
  // This prevents "Donate Now" from appearing before the donor chooses a campaign.
  const mobileDetailOpen = false; // Details open in a responsive overlay on all screen sizes.

  const selectedGoal = campaignGoal(selectedCampaign);
  const selectedFunded = campaignFinished(selectedCampaign);
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
    setDonorNote("");
    setCheckoutProgress("");
  };

  const chooseCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setShowDonationPanel(false);
    resetDonationForm();
    // Keep the grid in place; the campaign opens in a dedicated detail overlay.
  };

  const closeMobileCampaignDetails = () => {
    setSelectedCampaignId("");
    setShowDonationPanel(false);
    resetDonationForm();
    pageScrollRef.current?.scrollTo({ y: 0, animated: true });
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

    if (paymentState === "success" || paymentState === "cancelled") {
      // A return URL only says checkout finished; it is NOT proof of payment.
      setReturnedPaymentState(paymentState);
      setReturnedDonationId(String(params.get("donationId") || ""));
      setShowHistory(true);
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
          donorNote: donorNote.trim().slice(0, 200),
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

      if (Platform.OS === "web") {
        const browserWindow = (globalThis as any)?.window;
        if (browserWindow?.location?.assign) {
          browserWindow.location.assign(checkoutUrl);
          return;
        }
      }

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
      ref={pageScrollRef}
      style={styles.screen}
      contentContainerStyle={[styles.webContainer, !medium && styles.mobileContainer]}
      showsVerticalScrollIndicator
    >
      {mobileDetailOpen && (
        <TouchableOpacity
          style={styles.mobileBackButton}
          onPress={closeMobileCampaignDetails}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Back to donation campaigns"
        >
          <Ionicons name="arrow-back" size={19} color="#0F766E" />
          <Text style={styles.mobileBackText}>Back to Campaigns</Text>
        </TouchableOpacity>
      )}
      <View style={[styles.donationHero, !spacious && styles.donationHeroMobile]}>
        <DonationHeroArt />
        <View style={[styles.donationHeroBody, !spacious && styles.donationHeroBodyMobile]}>
          <Text style={styles.donationHeroEyebrow}>VOLUNSERVE  ·  LGU VERIFIED</Text>
          <Text style={[styles.donationHeroTitle, !spacious && styles.donationHeroTitleMobile]}>Donations</Text>
          <Text style={styles.donationHeroTagline}>Give hope. Support your community.</Text>
          <Text style={styles.donationHeroDescription}>
            Support verified community campaigns and help build a safer, stronger San Jose del Monte.
          </Text>
        </View>
        <View style={[styles.donationHeroStats, !spacious && styles.donationHeroStatsMobile]}>
          {([
            {icon:"heart" as const, value:String(activeCampaignCount), caption:"Active campaigns"},
            {icon:"checkmark-circle" as const, value:String(completedCampaignCount), caption:"Past campaigns"},
            {icon:"wallet" as const, value:money(verifiedRaisedTotal), caption:"Verified raised"},
          ]).map(s=>(
            <View key={s.caption} style={styles.donationHeroStat}>
              <Ionicons name={s.icon} size={20} color="#05986E" />
              <View style={{minWidth:0, flexShrink:1}}>
                <Text style={styles.donationHeroStatNumber} numberOfLines={1}>{s.value}</Text>
                <Text style={styles.donationHeroStatCaption}>{s.caption}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.donationToolbar, !medium && styles.donationToolbarMobile]}>
      <View style={[styles.webPrimaryTabs, mobileDetailOpen && styles.mobileHidden]}>
        {[
          { key: "active", label: "Active Campaigns", count: activeCampaignCount },
          { key: "history", label: "My Donations", count: myDonations.length },
          { key: "completed", label: "Completed Campaigns", count: completedCampaignCount },
        ].map(tab => {
          const active = tab.key === "history" ? showHistory :
            !showHistory && (tab.key === "completed" ? showCompletedCampaigns : !showCompletedCampaigns);
          return <TouchableOpacity key={tab.key} accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.webPrimaryTab, active && styles.webPrimaryTabActive]}
            onPress={() => {
              if (tab.key === "history") {
                setShowHistory(true);
                setSelectedCampaignId("");
                setShowDonationPanel(false);
              } else {
                setShowHistory(false);
                setShowCompletedCampaigns(tab.key === "completed");
                setSelectedCampaignId("");
                setShowDonationPanel(false);
                resetDonationForm();
              }
            }}>
            <Text style={[styles.webPrimaryTabText, active && styles.webPrimaryTabTextActive]}>{tab.label}</Text>
            <Text style={[styles.webTabCount, active && styles.webTabCountActive]}>{tab.count}</Text>
          </TouchableOpacity>;
        })}
      </View>
      <View style={[styles.donationToolbarActions, !medium && styles.donationToolbarActionsMobile]}>
        <View style={[styles.webSearchBox, !medium && styles.mobileSearchBox]}>
          <Ionicons name="search-outline" size={18} color="#64748B" />
          <TextInput
            value={searchText} onChangeText={setSearchText}
            placeholder="Search campaigns or location..."
            placeholderTextColor="#94A3B8"
            style={styles.webSearchInput}
          />
          {!!searchText && (
            <TouchableOpacity accessibilityLabel="Clear campaign search" onPress={()=>setSearchText("")}>
              <Ionicons name="close-circle" size={17} color="#94A3B8"/>
            </TouchableOpacity>
          )}
        </View>
        {!showHistory && (
          <TouchableOpacity
            style={styles.donationFilterButton}
            accessibilityRole="button"
            accessibilityLabel="Filter donation campaigns"
            onPress={()=>setFilterMenuOpen(open=>!open)}
          >
            <Ionicons name="funnel-outline" size={17} color="#164B55"/>
            <Text style={styles.donationFilterButtonText}>
              {filter === "all" ? "All Causes" : filter === "disaster_affected" ? "Disaster Relief" : "Community Needs"}
            </Text>
            <Ionicons name={filterMenuOpen ? "chevron-up" : "chevron-down"} size={14} color="#164B55" />
          </TouchableOpacity>
        )}
      </View>
      </View>
      {!showHistory && filterMenuOpen && (
        <View style={styles.donationFilterMenu}>
          {FILTER_OPTIONS.map(option=>(
            <TouchableOpacity key={option.value} style={[styles.donationFilterOption,filter===option.value && styles.donationFilterOptionActive]}
              onPress={()=>{chooseFilter(option.value);setFilterMenuOpen(false);}}>
              <Ionicons name={filter===option.value?"checkmark-circle":"ellipse-outline"} size={17} color="#078F73"/>
              <Text style={styles.donationFilterOptionText}>{option.value==="all"?"All Causes":option.value==="disaster_affected"?"Disaster Relief":"Community Needs"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {!!returnedPaymentState && (
        <View style={[styles.webReturnBanner, returnedPaymentState === "cancelled" && styles.webReturnCancelled]}>
          <Ionicons
            name={returnedPaymentState === "cancelled" ? "close-circle" :
              returnIsConfirmed ? "checkmark-circle" : "time-outline"}
            size={23}
            color={returnedPaymentState === "cancelled" ? "#AB5A09" : "#00856A"}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.webReturnTitle}>
              {returnedPaymentState === "cancelled" ? "Test checkout cancelled" :
                returnIsConfirmed ? "Donation confirmed — thank you!" : "Checking donation payment"}
            </Text>
            <Text style={styles.webReturnText}>
              {returnedPaymentState === "cancelled"
                ? "No payment was confirmed. You may choose another campaign."
                : returnIsConfirmed
                  ? "The PayMongo signed webhook verified this sandbox transaction. See My Donations for your receipt status."
                  : "Payment is not counted yet. VolunServe is waiting for a verified PayMongo webhook; My Donations updates automatically."}
            </Text>
            <Text style={styles.webReturnText}>Sandbox/Test Mode · No real funds are transferred.</Text>
          </View>
          <TouchableOpacity accessibilityLabel="Dismiss payment status" onPress={() => {
            setReturnedPaymentState("");
            setReturnedDonationId("");
          }}>
            <Ionicons name="close" size={18} color="#587687" />
          </TouchableOpacity>
        </View>
      )}

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
          <View style={[styles.webCampaignPane, styles.webFullCampaignPane]}>
            {showCompletedCampaigns && (
              <Text style={styles.donationPastHint}>Past campaigns stay visible for transparency. Donations to closed or fully funded causes are unavailable.</Text>
            )}

            {!campaignsReady ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator color="#0F766E" />
              </View>
            ) : listedCampaigns.length === 0 ? (
              <LinearGradient colors={["#F3FFF9","#EDFAF5","#DDF5EB"]} style={styles.donationEmptyState}>
                <View style={styles.donationEmptyDecoRight}>
                  <Ionicons name="leaf-outline" color="rgba(15,137,94,0.2)" size={92} />
                </View>
                <View style={styles.donationEmptyIconRing}>
                  <Ionicons name={showCompletedCampaigns ? "ribbon-outline" : "heart-outline"} size={33} color="#078D6A" />
                </View>
                <View style={styles.donationEmptyCopy}>
                  <Text style={styles.donationEmptyTitle}>
                    {showCompletedCampaigns ? "No completed campaigns yet" : searchText.trim() ? "No campaigns match your search" : "Every act of giving starts somewhere"}
                  </Text>
                  <Text style={styles.donationEmptyDescription}>
                    {showCompletedCampaigns
                      ? "Closed or fully funded campaigns will appear here once verified."
                      : searchText.trim()
                        ? "Try a different keyword or clear your search to see available causes."
                        : "There are no open verified fundraising campaigns right now. Explore completed causes while new campaigns are being approved."}
                  </Text>
                </View>
                {!showCompletedCampaigns && !searchText.trim() ? (
                  <TouchableOpacity accessibilityRole="button"
                    accessibilityLabel="Explore completed donation campaigns"
                    onPress={() => setShowCompletedCampaigns(true)}
                    style={styles.donationEmptyExplore}>
                    <Text style={styles.donationEmptyExploreText}>Explore completed campaigns</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF"/>
                  </TouchableOpacity>
                ) : null}
              </LinearGradient>
            ) : (
              <View style={[styles.campaignGrid, styles.campaignGridFull]}>
                {listedCampaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    selected={selectedCampaignId === campaign.id}
                    wide={wide}
                    fullGrid={width >= 1390}
                    onPress={() => chooseCampaign(campaign.id)}
                  />
                ))}
              </View>
            )}
            {campaignsReady ? (
              <LinearGradient colors={["#F4FFFC","#FFFFFF","#F3FBF6"]}
                start={{x:0,y:0}} end={{x:1,y:1}} style={styles.webHowItWorks}>
                <View style={styles.donationHowHeading}>
                  <View style={styles.donationHowIcon}><Ionicons name="gift-outline" size={21} color="#07916D"/></View>
                  <View style={{flex:1}}>
                    <Text style={styles.webHowItWorksTitle}>How Donations Work</Text>
                    <Text style={styles.donationHowSubtitle}>Simple, transparent support for verified community causes.</Text>
                  </View>
                </View>
                <View style={styles.webHowSteps}>
                  {[
                    { icon: "heart-outline" as const, title: "Choose a Cause", body: "Select a verified campaign and view its progress.", gradient:["#EAFBF4","#F9FFFC"] as const },
                    { icon: "card-outline" as const, title: "Make a Donation", body: "Choose an amount using PayMongo Test Mode.", gradient:["#E9F6FF","#F8FCFF"] as const },
                    { icon: "shield-checkmark-outline" as const, title: "Verify Payment", body: "We wait for secure webhook confirmation.", gradient:["#EAF8EF","#F7FFF9"] as const },
                    { icon: "people-outline" as const, title: "Track Your Support", body: "View your donation history and receipts.", gradient:["#F5FAE4","#FCFFF7"] as const },
                  ].map((step,index) => (
                    <LinearGradient key={step.title}
                      colors={step.gradient} start={{x:0,y:0}} end={{x:1,y:1}}
                      style={styles.webHowStep}>
                      <View style={styles.donationHowStepIcon}>
                        <Ionicons name={step.icon} size={23} color={index===1?"#1577C9":"#009474"} />
                      </View>
                      <View style={styles.donationStepNumber}>
                        <Text style={styles.donationStepNumberText}>{index+1}</Text>
                      </View>
                      <View style={styles.donationHowStepCopy}>
                        <Text style={styles.webHowStepTitle}>{step.title}</Text>
                        <Text style={styles.webHowStepBody}>{step.body}</Text>
                      </View>
                    </LinearGradient>
                  ))}
                </View>
                <Text style={styles.webHowDisclaimer}>PayMongo Sandbox · Test Mode only — no real money will be transferred.</Text>
              </LinearGradient>
            ) : null}
            <LinearGradient colors={["#FFFFFF","#F8FFFC"]} start={{x:0,y:0}} end={{x:1,y:1}}
              style={styles.donationRecentPanel}>
              <View style={styles.donationRecentHeading}>
                <View style={styles.donationHowIcon}>
                  <Ionicons name="receipt-outline" size={21} color="#07916D"/>
                </View>
                <View style={{flex:1}}>
                  <Text style={styles.webHowItWorksTitle}>Recent Donations (My History)</Text>
                  <Text style={styles.donationHowSubtitle}>Your own donation records, confirmed payment status, and receipts.</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="View all my donations"
                  style={styles.donationRecentViewAll}
                  onPress={()=>{setSelectedCampaignId("");setShowHistory(true);pageScrollRef.current?.scrollTo({y:0,animated:true});}}>
                  <Text style={styles.donationRecentViewText}>View All</Text>
                  <Ionicons name="arrow-forward" size={14} color="#2675D2"/>
                </TouchableOpacity>
              </View>
              {!historyReady ? (
                <ActivityIndicator style={{marginVertical:18}} color="#008B6A"/>
              ) : myDonations.length === 0 ? (
                <View style={styles.donationRecentEmpty}>
                  <Ionicons name="receipt-outline" size={23} color="#8AA5A3"/>
                  <Text style={styles.donationRecentEmptyText}>No donations yet. Your confirmed and pending support will appear here.</Text>
                </View>
              ) : (
                <View style={styles.donationRecentTable}>
                  {medium && (
                    <View style={styles.donationRecentTableHead}>
                      {["Date", "Campaign", "Amount", "Status", "Receipt"].map(label=>(
                        <Text key={label} style={styles.donationRecentHeadText}>{label}</Text>
                      ))}
                    </View>
                  )}
                  {myDonations.slice(0,3).map(d=>{
                    const paid = d.status === "received" &&
                      (d.paymentProvider !== "paymongo" || d.paymentStatus === "paid");
                    const sandbox = paid && d.paymentProvider === "paymongo" && d.paymongoLivemode === false;
                    const label = paid ? (sandbox ? "Paid (Test)" : "Confirmed") :
                      d.status === "payment_failed" ? "Failed" :
                      d.status === "rejected" ? "Rejected" : "Pending";
                    const date = timestampMillis(d.createdAt);
                    return (
                      <View key={d.id} style={[styles.donationRecentRow,!medium&&styles.donationRecentRowMobile]}>
                        <Text style={styles.donationRecentCellText}>
                          {date ? new Date(date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}) : "—"}
                        </Text>
                        <Text style={[styles.donationRecentCellText,styles.donationRecentCampaignText]} numberOfLines={2}>
                          {d.campaignTitle || "Donation campaign"}
                        </Text>
                        <Text style={styles.donationRecentAmount}>{money(Number(d.amount || 0))}</Text>
                        <View style={[styles.donationRecentStatusChip,paid?styles.donationRecentChipPaid:styles.donationRecentChipPending]}>
                          <Ionicons name={paid?"checkmark-circle":"time-outline"} size={14} color={paid?"#007C5C":"#AA7A17"} />
                          <Text style={[styles.donationRecentStatus,paid?styles.donationRecentStatusPaid:styles.donationRecentStatusPending]}>
                            {label}
                          </Text>
                        </View>
                        {paid ? (
                          <TouchableOpacity accessibilityRole="button"
                            accessibilityLabel={`View receipt for ${d.campaignTitle || "donation"}`}
                            style={styles.donationReceiptLink}
                            onPress={()=>router.push({pathname:"/receipt/[id]",params:{id:d.id}})}>
                            <Text style={styles.donationReceiptLinkText}>View Receipt</Text>
                          </TouchableOpacity>
                        ) : <Text style={styles.donationRecentCellText}>—</Text>}
                      </View>
                    );
                  })}
                </View>
              )}
            </LinearGradient>
          </View>

          {/* Campaign details are only available after selecting a card. */}
        </View>
      )}
      <Modal visible={!!selectedCampaign && !showHistory}
        transparent animationType="fade" onRequestClose={closeMobileCampaignDetails}>
        <View style={styles.donationModalShade}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject}
            accessible={false} activeOpacity={1} onPress={closeMobileCampaignDetails}/>
          <View style={[styles.donationModalSurface,!medium&&styles.donationModalSurfaceMobile]}>
            <View style={styles.donationModalTopbar}>
              <View style={styles.donationModalTopbarLeft}>
                <Ionicons name="shield-checkmark" size={18} color="#078869"/>
                <Text style={styles.donationModalTopTitle}>LGU-verified campaign details</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close donation details"
                onPress={closeMobileCampaignDetails} style={styles.webCloseButton}>
                <Ionicons name="close" size={19} color="#1B4350"/>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator
              style={styles.donationModalScroller}
              contentContainerStyle={styles.donationModalScroll}>
          {selectedCampaign ? <View style={[styles.webDetailPane,styles.donationModalDetailPane]}>
            <View style={styles.webDetailCard}>
                <View style={styles.webDetailNavRow}>
                  <TouchableOpacity style={styles.webBackToCampaigns} accessibilityRole="button" onPress={closeMobileCampaignDetails}>
                    <Ionicons name="arrow-back" size={15} color="#087E69" />
                    <Text style={styles.webBackToCampaignsText}>All campaigns</Text>
                  </TouchableOpacity>
                  <Text style={styles.webDetailNavLabel}>Campaign Details</Text>
                </View>
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

                  <View style={styles.webGeneralAreaCard}>
                    <Text style={styles.webGeneralAreaEyebrow}>BENEFICIARY GENERAL AREA</Text>
                    <View style={styles.webLocationLine}>
                      <Ionicons name="location-outline" size={15} color="#0F766E" />
                      <Text style={styles.webLocationText} numberOfLines={2}>
                        {campaignAreaLabel(selectedCampaign)}
                      </Text>
                    </View>
                    <Text style={styles.webGeneralAreaNote}>
                      General barangay/city area only. Exact beneficiary location is coordinated privately with the LGU when needed.
                    </Text>
                  </View>

                  <Text style={styles.webStoryText} numberOfLines={4}>
                    {selectedCampaign.publicStory ||
                      selectedCampaign.description ||
                      "LGU-verified campaign open for public support."}
                  </Text>

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

                  <View style={styles.webLocationCard}>
                    <View style={styles.webLocationCardCopy}>
                      <Text style={styles.webLocationCardEyebrow}>OFFICIAL LGU LOCATION</Text>
                      <Text style={styles.webLocationCardTitle}>
                        {selectedCampaign.handoffLocationName}
                      </Text>
                      <Text style={styles.webLocationCardAddress} numberOfLines={2}>
                        {selectedCampaign.handoffAddress}
                      </Text>
                    </View>
                    <HandoffLocationMap
                      locationName={selectedCampaign.handoffLocationName || "LGU public service point"}
                      address={selectedCampaign.handoffAddress || ""}
                    />
                  </View>

                  <View style={styles.webSupportTypesRow}>
                    <View style={styles.webSupportTypeChip}>
                      <Ionicons name="cash-outline" size={14} color="#0F766E" />
                      <Text style={styles.webSupportTypeText}>Monetary</Text>
                    </View>
                  </View>

                  {selectedFunded ? (
                    <View style={styles.webFundedNotice}>
                      <Ionicons name="checkmark-circle" size={22} color="#0C9B75" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.webFundedTitle}>
                          {selectedCampaign?.status === "closed" ? "Campaign closed" : "Funding goal reached"}
                        </Text>
                        <Text style={styles.webFundedText}>
                          {selectedCampaign?.status === "closed"
                            ? "The authorized Admin has closed this campaign. Its verified funding progress remains visible, but new donations are no longer accepted."
                            : "This campaign has reached its verified target. New donations are unavailable. Browse other approved campaigns to support."}
                        </Text>
                      </View>
                    </View>
                  ) : !showDonationPanel ? (
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
                      <View style={styles.webDonationStepper}>
                        {["Amount", "Payment", "Confirmation"].map((step, index) => (
                          <View key={step} style={styles.webStepperItem}>
                            <View style={[styles.webStepperCircle, index === 0 && styles.webStepperCircleActive]}>
                              <Text style={[styles.webStepperNumber, index === 0 && styles.webStepperNumberActive]}>{index + 1}</Text>
                            </View>
                            <Text style={styles.webStepperLabel}>{step}</Text>
                          </View>
                        ))}
                      </View>
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
                            placeholder="Enter custom donation amount"
                            placeholderTextColor="#94A3B8"
                          />

                          <Text style={styles.webFieldLabel}>Message (Optional)</Text>
                          <TextInput
                            style={styles.webNoteInput}
                            value={donorNote}
                            onChangeText={(value) => setDonorNote(value.slice(0, 200))}
                            multiline
                            numberOfLines={3}
                            placeholder="Add a message of support…"
                            placeholderTextColor="#94A3B8"
                            accessibilityLabel="Optional message to campaign"
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
          </View> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  fullGrid,
  onPress,
}: {
  campaign: DonationCampaign;
  selected: boolean;
  wide: boolean;
  fullGrid: boolean;
  onPress: () => void;
}) {
  const photos = validPublicPhotoUrls(campaign);
  const raised = campaignRaised(campaign);
  const goal = campaignGoal(campaign);
  const percentage = goal > 0 ? clampPercent((raised / goal) * 100) : 0;
  const group = campaignGroupOf(campaign);
  const landscape = wide && fullGrid;

  return (
    <TouchableOpacity
      style={[
        styles.campaignCard,
        wide && (fullGrid ? styles.campaignCardFull : styles.campaignCardWide),
        landscape && styles.donationCardLandscape,
        selected && styles.campaignCardSelected,
      ]}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${campaign.title || "donation campaign"}`}
      onPress={onPress}
    >
      <LinearGradient colors={["#FFFFFF", "#FBFFFD", "#F2FAF8"]}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={[styles.donationCardContent,landscape&&styles.donationCardContentLandscape]}>
        <CampaignVisual campaign={campaign} photoUrl={photos[0]} landscape={landscape} />

        <View style={[styles.campaignCardBody,landscape&&styles.donationCardBodyLandscape]}>
        <View style={styles.badgeRow}>
          <View style={[styles.groupBadge,group==="community_needs_help"&&styles.groupBadgeCommunity]}>
            <Ionicons name={group==="community_needs_help"?"heart-outline":"shield-checkmark-outline"} size={12}
              color={group==="community_needs_help"?"#225BC3":"#C03935"}/>
            <Text style={[styles.groupBadgeText,group==="community_needs_help"&&styles.groupBadgeTextCommunity]}>
              {campaignCategoryLabel(campaign)}
            </Text>
          </View>
          <View style={styles.donationVerifiedBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#007E59"/>
            {!landscape && <Text style={styles.donationVerifiedText}>LGU verified</Text>}
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

        <Text numberOfLines={2} style={styles.donationCardDescription}>
          {campaign.publicStory || campaign.description || "Explore this verified community campaign and its current funding progress."}
        </Text>
        <View style={styles.cardProgressWrap}>
          <View style={styles.cardProgressTop}>
            <Text style={styles.cardProgressRaised}>{money(raised)} raised</Text>
            <Text style={styles.cardProgressGoal}>of {money(goal)}</Text>
          </View>
          <View style={styles.progressTrack}>
            <LinearGradient colors={["#007E70","#09BC78"]} start={{x:0,y:0}} end={{x:1,y:0}}
              style={[styles.progressFill, { width: `${percentage}%` as any }]} />
          </View>
          <Text style={styles.cardProgressPercent}>{Math.round(percentage)}% of funding goal</Text>
        </View>

        <View style={styles.donationCardFooter}>
          <View style={[styles.donationCardFooterCopy,landscape&&styles.donationCardFooterCompact]}>
            <Ionicons name={campaignFinished(campaign)?"checkmark-circle":"heart-outline"} size={15} color="#05896B"/>
            <Text style={styles.donationCardFooterText} numberOfLines={2}>
              {campaignFinished(campaign) ? "Past campaign" : "View details to support"}
            </Text>
          </View>
          <LinearGradient colors={["#03B981","#007C66"]} start={{x:0,y:0}} end={{x:1,y:1}}
            style={styles.donationCardFooterArrow}>
            <Ionicons name="arrow-forward" size={17} color="#FFFFFF"/>
          </LinearGradient>
        </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function CampaignVisual({
  campaign,
  photoUrl,
  landscape = false,
}: {
  campaign: DonationCampaign;
  photoUrl?: string;
  landscape?: boolean;
}) {
  if (photoUrl) {
    return (
      <View style={[styles.campaignVisualWrap,landscape&&styles.donationCardVisualLandscape]}>
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
        landscape && styles.donationCardVisualLandscape,
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
  const cleanName = String(locationName || "LGU public service point").trim();
  const cleanAddress = String(address || "").trim();
  const normalizedAddress = cleanAddress.toLowerCase();
  const genericAddresses = new Set([
    "public service address",
    "official public service address",
    "lgu public service address",
    "barangay address",
    "address pending",
    "to be confirmed",
  ]);
  const hasSpecificPublicAddress =
    cleanAddress.length >= 8 && !genericAddresses.has(normalizedAddress);

  if (!hasSpecificPublicAddress) {
    return (
      <View style={styles.webMapUnavailableNote}>
        <Ionicons name="information-circle-outline" size={15} color="#64748B" />
        <Text style={styles.webMapUnavailableText}>
          Google Maps will be available after the LGU saves the verified public address for this donation point.
        </Text>
      </View>
    );
  }

  return (
    <LocationMapButton
      eyebrow="OFFICIAL LGU DONATION LOCATION"
      title={cleanName || "LGU public service point"}
      address={cleanAddress}
      mapQuery={[cleanName, cleanAddress].filter(Boolean).join(", ")}
      buttonLabel="View Map"
      privacyText="This is the LGU-approved public coordination or service point for the campaign. It is separate from the beneficiary's home and private verification location."
    />
  );
}

function LocationMapButton({
  eyebrow,
  title,
  address,
  mapQuery,
  buttonLabel,
  privacyText,
}: {
  eyebrow: string;
  title: string;
  address: string;
  mapQuery: string;
  buttonLabel: string;
  privacyText: string;
}) {
  const [visible, setVisible] = useState(false);
  const { height } = useWindowDimensions();

  const cleanQuery = String(mapQuery || "").trim();
  const externalMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
  const embeddedMapUrl = `https://www.google.com/maps?q=${encodeURIComponent(cleanQuery)}&output=embed`;
  const mapHeight = Math.max(280, Math.min(560, height - 280));

  const openGoogleMaps = async () => {
    if (!cleanQuery) return;

    try {
      const supported = await Linking.canOpenURL(externalMapUrl);
      if (!supported) throw new Error("Google Maps is not available on this device.");
      await Linking.openURL(externalMapUrl);
    } catch (problem) {
      Alert.alert(
        "Unable to Open Map",
        problem instanceof Error ? problem.message : "Unable to open Google Maps.",
      );
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.webOpenMapButton}
        activeOpacity={0.84}
        disabled={!cleanQuery}
        onPress={() => setVisible(true)}
      >
        <Ionicons name="map-outline" size={16} color="#0F766E" />
        <Text style={styles.webOpenMapButtonText}>{buttonLabel}</Text>
        <Ionicons name="chevron-forward" size={14} color="#0F766E" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.mapModalOverlay}>
          <View style={styles.mapModalCard}>
            <View style={styles.mapModalHeader}>
              <View style={styles.mapModalHeaderIcon}>
                <Ionicons name="map-outline" size={18} color="#0F766E" />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.mapModalEyebrow}>{eyebrow}</Text>
                <Text style={styles.mapModalTitle}>{title}</Text>
                {!!address && <Text style={styles.mapModalAddress}>{address}</Text>}
              </View>

              <TouchableOpacity
                style={styles.mapModalClose}
                activeOpacity={0.82}
                onPress={() => setVisible(false)}
              >
                <Ionicons name="close" size={19} color="#475569" />
              </TouchableOpacity>
            </View>

            {Platform.OS === "web" ? (
              <View style={[styles.mapModalFrame, { height: mapHeight }]}> 
                {React.createElement(
                  "iframe",
                  {
                    title: `${title} map`,
                    src: embeddedMapUrl,
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
              <View style={[styles.embeddedMapNativeFallback, { minHeight: mapHeight }]}> 
                <Ionicons name="map-outline" size={34} color="#0F766E" />
                <Text style={styles.embeddedMapNativeTitle}>Map preview</Text>
                <Text style={styles.embeddedMapNativeText}>
                  The map details are shown inside VolunServe. Use Google Maps below only when you need turn-by-turn directions.
                </Text>
                <Text style={styles.embeddedMapLocationName}>{title}</Text>
                {!!address && <Text style={styles.embeddedMapLocationText}>{address}</Text>}
              </View>
            )}

            <View style={styles.mapModalPrivacy}>
              <Ionicons name="shield-checkmark-outline" size={17} color="#0F766E" />
              <Text style={styles.mapModalPrivacyText}>{privacyText}</Text>
            </View>

            <View style={styles.mapModalFooter}>
              <TouchableOpacity
                style={styles.mapModalSecondaryButton}
                activeOpacity={0.82}
                onPress={() => setVisible(false)}
              >
                <Text style={styles.mapModalSecondaryButtonText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mapModalPrimaryButton}
                activeOpacity={0.84}
                onPress={() => void openGoogleMaps()}
              >
                <Ionicons name="navigate-outline" size={15} color="#FFFFFF" />
                <Text style={styles.mapModalPrimaryButtonText}>Open in Google Maps</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  const rejected = status === "rejected" || status === "payment_failed";
  const paymongo = donation.paymentProvider === "paymongo";
  // Never call a checkout "paid" from a redirect or an unverified record.
  const received = paymongo
    ? status === "received" && donation.paymentStatus === "paid"
    : ["received", "verified", "completed"].includes(status);
  const sandboxPaid = received && paymongo && donation.paymongoLivemode === false;
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
          <Text style={styles.statusText}>{sandboxPaid ? "PAID · TEST" : received && paymongo ? "PAID" : statusLabel(status)}</Text>
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
              {sandboxPaid
                ? "PayMongo confirmed this sandbox payment. No real money was received or transferred."
                : paymongo
                  ? "PayMongo confirmed this payment through the verified backend webhook."
                  : "This donation has a confirmed receipt recorded by the authorized team."}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.historyMessagePending}>
          <Ionicons name="time-outline" size={16} color="#B7791F" />
          <Text style={styles.historyMessagePendingText}>
            {paymongo
              ? "Payment is not confirmed yet. VolunServe waits for PayMongo webhook verification before counting this donation. Sandbox checkout never transfers real funds."
              : "This donation is not counted until its receipt is verified by the authorized team."}
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
  campaignCardFull: { width: "31.8%", minWidth: 270, maxWidth: 490 },
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
    padding: 17,
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
    lineHeight: 21,
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
  campaignStatusFunded: { color: "#8D5300", fontSize: 10, fontWeight: "900" },
  campaignStatusActive: { color: "#087F67", fontSize: 10, fontWeight: "900" },
  cardPrimaryAction: {
    minHeight: 43, marginTop: 13, borderRadius: 9, backgroundColor: "#009775",
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9,
  },
  cardPrimaryActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
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
  mapModalHeaderIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
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
    width: "100%",
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
  mapModalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E7EDF1",
    backgroundColor: "#FFFFFF",
  },
  mapModalSecondaryButton: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  mapModalSecondaryButtonText: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
  },
  mapModalPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#0F766E",
  },
  mapModalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
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
  // Mobile-only overrides; preserve existing desktop layout and donation behavior.
  mobileContainer: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 32,
  },
  mobilePageHeader: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
  },
  mobileSearchBox: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
  },
  mobileHidden: {
    display: "none",
  },
  webPaneStacked: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
  },
  mobileBackButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#CDE4DF",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  mobileBackText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F766E",
  },
  // Premium Donations layout: live data on top of original vector-only artwork.
  donationHero: {
    position: "relative",
    minHeight: 192,
    borderRadius: 20,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#CBEADD",
    marginBottom: 15,
    shadowColor: "#095D4B",
    shadowOpacity: 0.07,
    shadowRadius: 20,
    shadowOffset: {width:0,height:7},
    elevation: 2,
  },
  donationHeroMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    paddingTop: 17,
    paddingBottom: 14,
  },
  donationHeroBody: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
    paddingLeft: 165,
    paddingRight: 8,
    paddingVertical: 23,
  },
  donationHeroBodyMobile: { flex: 0, paddingLeft: 118, paddingRight: 15, paddingTop: 13, paddingBottom: 10 },
  donationHeroEyebrow: {
    fontSize: 10, letterSpacing: 1.2, fontWeight: "900", color: "#087D5A",
  },
  donationHeroTitle: {
    marginTop: 1, fontSize: 49, lineHeight: 54, letterSpacing: -1.8,
    color: "#064838", fontWeight: "900",
  },
  donationHeroTitleMobile: { fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  donationHeroTagline: {
    fontSize: 15, fontWeight: "900", lineHeight: 21, color: "#105D4D", marginTop: 2,
  },
  donationHeroDescription: {
    fontSize: 11, lineHeight: 16, color: "#426B6D", marginTop: 7, maxWidth: 420,
  },
  donationHeroStats: {
    zIndex: 1,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    paddingHorizontal: 17,
    maxWidth: "49%",
  },
  donationHeroStatsMobile: {
    maxWidth: "100%",
    paddingHorizontal: 13,
    paddingTop: 8,
    flexWrap: "wrap",
    alignSelf: "stretch",
    justifyContent: "space-between",
  },
  donationHeroStat: {
    flexGrow: 1, flexShrink: 1, minWidth: 103,
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 9, paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.86)",
    backgroundColor: "rgba(255,255,255,.84)",
  },
  donationHeroStatNumber: { color: "#102E46", fontSize: 16, fontWeight: "900" },
  donationHeroStatCaption: { color: "#5B7A83", fontSize: 8.5, marginTop: 1 },
  donationToolbar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap", gap: 12, marginTop: 2, marginBottom: 5,
  },
  donationToolbarMobile: { flexDirection: "column", alignItems: "stretch" },
  donationToolbarActions: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", flexShrink: 1,
  },
  donationToolbarActionsMobile: { alignItems: "stretch", width: "100%" },
  donationFilterButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, minHeight: 44, paddingHorizontal: 13,
    borderRadius: 12, borderWidth: 1, borderColor: "#D6E9E8", backgroundColor: "#FFFFFF",
  },
  donationFilterButtonText: { color: "#193951", fontWeight: "800", fontSize: 11 },
  donationFilterMenu: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
    alignSelf: "flex-end", marginBottom: 10, padding: 8,
    borderRadius: 12, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: "#DAEAE8",
  },
  donationFilterOption: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9,
  },
  donationFilterOptionActive: { backgroundColor: "#EAF9F3" },
  donationFilterOptionText: { color: "#26465A", fontWeight: "700", fontSize: 11 },
  donationPastHint: { color:"#567580",fontSize:11,lineHeight:18,marginVertical:6 },
  donationCardDescription: { color: "#5E7687", fontSize: 11, lineHeight: 17, marginTop: 9, minHeight: 34 },
  donationCardFooter: {
    borderTopWidth: 1, borderColor: "#E9F0F2", paddingTop: 12, marginTop: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  donationCardFooterCopy: { flexDirection: "row", alignItems: "center", gap: 6 },
  donationCardFooterText: { color:"#087A66",fontWeight:"800",fontSize:11 },
  donationCardFooterArrow: {
    width: 33, height: 33, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: "#009879",
  },
  donationHowHeading: { flexDirection:"row",alignItems:"center",gap:11 },
  donationHowIcon: {
    width: 39,height:39,borderRadius:12,alignItems:"center",justifyContent:"center",
    backgroundColor:"#DDF8EC",
  },
  donationHowSubtitle: { fontSize: 10.5, color:"#718A98",marginTop:3 },
  donationHowStepIcon: {
    width: 42,height:42,borderRadius:22,alignItems:"center",justifyContent:"center",
    backgroundColor:"#E0F7ED",
  },
  donationHowStepCopy: { flex:1, minWidth:0 },
  donationRecentPanel: {
    marginTop:14,padding:18,backgroundColor:"#FFFFFF",borderRadius:17,
    borderWidth:1,borderColor:"#D9E9E8",
  },
  donationRecentHeading: {flexDirection:"row",alignItems:"center",gap:10,marginBottom:12},
  donationRecentViewAll: {flexDirection:"row",alignItems:"center",gap:5,padding:6},
  donationRecentViewText: { color:"#2877C8",fontSize:10.5,fontWeight:"900" },
  donationRecentEmpty: {
    flexDirection:"row",gap:11,alignItems:"center",backgroundColor:"#F7FAFB",
    borderRadius:10,padding:16,
  },
  donationRecentEmptyText: { flex:1,color:"#688293",fontSize:11,lineHeight:16 },
  donationRecentTable: { borderWidth:1,borderColor:"#E8EEF0",borderRadius:11,overflow:"hidden" },
  donationRecentTableHead: {
    flexDirection:"row",alignItems:"center",backgroundColor:"#F0F7FA",padding:12,gap:10,
  },
  donationRecentHeadText: {flex:1,fontSize:10,fontWeight:"800",color:"#678095"},
  donationRecentRow: {
    flexDirection:"row",alignItems:"center",gap:10,padding:12,
    borderTopWidth:1,borderColor:"#EFF3F5",
  },
  donationRecentRowMobile: {flexWrap:"wrap",gap:8},
  donationRecentCellText: {flex:1,color:"#61798C",fontSize:10.5},
  donationRecentCampaignText: {flex:1,color:"#102E50",fontWeight:"800"},
  donationRecentAmount: {flex:1,color:"#0B2C49",fontWeight:"900",fontSize:11},
  donationRecentStatus: {flex:1,fontSize:10,fontWeight:"900"},
  donationRecentStatusPaid: {color:"#008B69"},
  donationRecentStatusPending: {color:"#A7730D"},
  donationReceiptLink: {
    flex:1,paddingVertical:8,borderRadius:9,backgroundColor:"#EEF6FF",
    alignItems:"center",justifyContent:"center",
  },
  donationReceiptLinkText: {color:"#2477D2",fontWeight:"900",fontSize:10},
  donationModalShade: {
    flex:1,justifyContent:"center",alignItems:"center",
    backgroundColor:"rgba(5,23,32,0.66)",padding:16,
  },
  donationModalSurface: {
    width:"100%",maxWidth:860,height:"90%",maxHeight:"92%",backgroundColor:"#FFFFFF",
    borderRadius:19,borderWidth:1,borderColor:"#D8E9E6",
    shadowColor:"#021A1C",shadowOpacity:.24,shadowRadius:30,elevation:20,
    overflow:"hidden",
  },
  donationModalSurfaceMobile: {height:"94%",maxHeight:"96%",borderRadius:14},
  donationModalTopbar: {
    flexDirection:"row",alignItems:"center",justifyContent:"space-between",
    backgroundColor:"#F5FCF9",paddingHorizontal:15,paddingVertical:11,
    borderBottomWidth:1,borderColor:"#E3EEEA",
  },
  donationModalTopbarLeft: {flexDirection:"row",alignItems:"center",gap:8,flex:1},
  donationModalTopTitle: {fontSize:12,color:"#0E604F",fontWeight:"900"},
  donationModalScroller: {flex:1},
  donationModalScroll: {padding:13,paddingBottom:26},
  donationModalDetailPane: {flex:0,width:"100%"},
  webContainer: {
    width: "100%",
    maxWidth: 1660,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 22,
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
    fontSize: 30,
    lineHeight: 38,
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
    minWidth: 230,
    maxWidth: 345,
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
  webPrimaryTabs: {
    flexDirection: "row", flexWrap: "wrap", alignItems: "center",
    gap: 9, marginTop: 0, marginBottom: 0,
  },
  webPrimaryTab: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingHorizontal: 17, minHeight: 42, borderWidth: 1,
    borderColor: "#DCE8E9", borderRadius: 10, backgroundColor: "#FFFFFF",
  },
  webPrimaryTabActive: { borderColor: "#009879", backgroundColor: "#009879" },
  webPrimaryTabText: { color: "#355267", fontSize: 12, fontWeight: "800" },
  webPrimaryTabTextActive: { color: "#FFFFFF" },
  webTabCount: {
    paddingHorizontal: 7, paddingVertical: 3, overflow: "hidden",
    borderRadius: 99, backgroundColor: "#F0F5F6", color: "#64748B",
    fontSize: 9.5, fontWeight: "900",
  },
  webTabCountActive: { backgroundColor: "rgba(255,255,255,0.22)", color: "#FFFFFF" },
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
    borderColor: "#009474",
    backgroundColor: "#009474",
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
    flex: 1.45,
    minWidth: 0,
  },
  webFullCampaignPane: { flex: 1 },
  campaignGridFull: { width: "100%", gap: 16 },
  webDetailPane: {
    flex: 0.85,
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
    fontSize: 11,
    lineHeight: 16,
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
  webHowItWorks: {
    marginTop: 17, padding: 18, borderRadius: 17, backgroundColor: "#FAFEFC",
    borderColor: "#D5EAE5", borderWidth: 1,
  },
  webHowItWorksTitle: { color: "#163447", fontSize: 16, fontWeight: "900" },
  webHowSteps: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 13 },
  webHowStep: {
    flexGrow: 1, flexBasis: 196, padding: 14, borderRadius: 12,
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F4F9FA", minWidth: 190, gap: 9,
    borderWidth: 1, borderColor: "#E8F0F2",
  },
  webHowStepTitle: { fontSize: 12, fontWeight: "900", color: "#173B49" },
  webHowStepBody: { fontSize: 11, lineHeight: 17, color: "#557383" },
  webHowDisclaimer: { marginTop: 12, color: "#658090", fontSize: 10.5 },
  webDetailNavRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 15, gap: 10,
    borderBottomWidth: 1, borderColor: "#ECF1F2",
  },
  webBackToCampaigns: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 24 },
  webBackToCampaignsText: { color: "#087E69", fontSize: 11, fontWeight: "900" },
  webDetailNavLabel: { color: "#77909D", fontSize: 10.5, fontWeight: "800" },
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
  webGeneralAreaCard: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  webGeneralAreaEyebrow: {
    color: "#0F766E",
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  webGeneralAreaNote: {
    marginTop: 5,
    color: "#64748B",
    fontSize: 8.4,
    lineHeight: 12,
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
  webMapUnavailableNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 9,
    padding: 9,
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
  },
  webMapUnavailableText: {
    flex: 1,
    color: "#64748B",
    fontSize: 8.5,
    lineHeight: 12,
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
    backgroundColor: "#009474",
  },
  webDonateButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  webFundedNotice: {
    marginTop: 14, padding: 15, flexDirection: "row", alignItems: "flex-start",
    gap: 10, borderRadius: 11, backgroundColor: "#EAF9F0",
    borderWidth: 1, borderColor: "#C8EBDC",
  },
  webFundedTitle: { fontSize: 12.5, fontWeight: "900", color: "#067554" },
  webFundedText: { fontSize: 10.5, lineHeight: 16, color: "#3D7769", marginTop: 3 },
  webDonationStepper: { flexDirection: "row", justifyContent: "space-between", gap: 7, marginBottom: 15 },
  webStepperItem: { flex: 1, justifyContent: "center", alignItems: "center", gap: 6 },
  webStepperCircle: {
    width: 28, height: 28, borderRadius: 15,
    alignItems: "center", justifyContent: "center", backgroundColor: "#E3E9EE",
  },
  webStepperCircleActive: { backgroundColor: "#009879" },
  webStepperNumber: { color: "#64748B", fontSize: 12, fontWeight: "900" },
  webStepperNumberActive: { color: "#FFFFFF" },
  webStepperLabel: { color: "#677E90", fontSize: 10, fontWeight: "800" },
  webDonatePanel: {
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#E7ECEF",
  },
  webNoteInput: {
    minHeight: 74, maxHeight: 130, textAlignVertical: "top",
    padding: 11, borderRadius: 11, borderWidth: 1,
    borderColor: "#DCE7E9", backgroundColor: "#F8FAFB",
    fontSize: 12, color: "#162E41",
  },
  webDonatePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  webDonatePanelTitle: {
    color: "#0F172A",
    fontSize: 17,
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
    borderColor: "#009879",
    backgroundColor: "#009879",
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
  webReturnBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    borderRadius: 13, padding: 14, marginBottom: 13,
    backgroundColor: "#EAF9F2", borderWidth: 1, borderColor: "#C6EEDB",
  },
  webReturnCancelled: { backgroundColor: "#FFF8E9", borderColor: "#F2DEAF" },
  webReturnTitle: { color: "#0E4C42", fontSize: 14, fontWeight: "900" },
  webReturnText: { marginTop: 4, color: "#416E68", lineHeight: 17, fontSize: 11 },
  webHistoryPanel: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#DDE5EA",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },

});
