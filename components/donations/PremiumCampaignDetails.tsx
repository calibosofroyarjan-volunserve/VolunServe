import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import Ionicons from "@expo/vector-icons/Ionicons";

type PublicCampaign = {
  id: string;
  title?: string;
  publicStory?: string;
  description?: string;
  campaignCategory?: string;
  status?: string;
  createdAt?: any;
  handoffLocationName?: string;
  handoffAddress?: string;
};

type Props = {
  campaign: PublicCampaign;
  photos: string[];
  wide: boolean;
  area: string;
  category: string;
  group: "community_needs_help" | "disaster_affected";
  raised: number;
  goal: number;
  percent: number;
  finished: boolean;
  money: (value: number) => string;
  children: React.ReactNode;
};

const campaignDate = (value: any) => {
  if (!value) return "";
  const time = typeof value.toMillis === "function"
    ? value.toMillis()
    : value instanceof Date ? value.getTime()
      : typeof value === "number" ? value : 0;
  if (!time || !Number.isFinite(time)) return "";
  return new Date(time).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
  });
};

/** A public LGU office must come from actual campaign data, not a placeholder. */
const publicCoordinationPoint = (campaign: PublicCampaign) => {
  const name = String(campaign.handoffLocationName || "").trim();
  const address = String(campaign.handoffAddress || "").trim();
  const invalid = /^(n\/a|none|pending|tbd|not applicable|online only)$/i;
  const vagueAddress = /^(public service address|official public service address|lgu public service address|barangay address|address pending|to be confirmed)$/i;
  if (name.length < 3 || address.length < 5) return "";
  if (invalid.test(name) || invalid.test(address) || vagueAddress.test(address)) return "";
  return name;
};

function SectionTitle({ name, icon }: { name: string; icon: React.ComponentProps<typeof Ionicons>["name"] }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionIcon}><Ionicons name={icon} size={18} color="#087E61" /></View>
      <Text style={styles.sectionTitle}>{name}</Text>
    </View>
  );
}

function CampaignGallery({ photos, campaign }: { photos: string[]; campaign: PublicCampaign }) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [campaign.id]);
  const current = photos[Math.min(active, Math.max(0, photos.length - 1))];
  if (!current) {
    return (
      <View style={styles.photoFallback}>
        <Ionicons name="images-outline" size={38} color="#6EAB9A" />
        <Text style={styles.photoFallbackTitle}>No approved public photo available</Text>
        <Text style={styles.photoFallbackNote}>Campaign information is still available below.</Text>
      </View>
    );
  }
  const go = (direction: number) => {
    setActive((previous) => (previous + direction + photos.length) % photos.length);
  };
  return (
    <View style={styles.gallery}>
      <View style={styles.photoStage}>
        <Image source={{ uri: current }} style={styles.mainPhoto} resizeMode="contain" />
        <View style={styles.counter}><Text style={styles.counterText}>{active + 1}/{photos.length}</Text></View>
        <View style={styles.photoCaption}>
          <Ionicons name="images-outline" size={13} color="#D9ECE6" />
          <Text style={styles.photoCaptionText}>Public campaign photo</Text>
        </View>
        {photos.length > 1 && (
          <View style={styles.galleryArrows}>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel="Previous campaign photo"
              style={styles.galleryArrow} onPress={() => go(-1)}>
              <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button" accessibilityLabel="Next campaign photo"
              style={styles.galleryArrow} onPress={() => go(1)}>
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {photos.length > 1 && (
        <ScrollView
          horizontal nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}>
          {photos.map((photo, index) => (
            <TouchableOpacity
              key={photo + index}
              accessibilityRole="button"
              accessibilityLabel={"Show campaign photo " + (index + 1)}
              onPress={() => setActive(index)}
              style={[styles.thumbFrame, active === index && styles.thumbActive]}>
              <Image source={{ uri: photo }} style={styles.thumbImage} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function PremiumCampaignDetails({
  campaign, photos, wide, area, category, group,
  raised, goal, percent, finished, money, children,
}: Props) {
  useFonts({
    DonationInterRegular: Inter_400Regular,
    DonationInterMedium: Inter_500Medium,
    DonationInterSemiBold: Inter_600SemiBold,
    DonationInterBold: Inter_700Bold,
    DonationInterExtraBold: Inter_800ExtraBold,
  });
  const coord = publicCoordinationPoint(campaign);
  const posted = campaignDate(campaign.createdAt);
  const ended = campaign.status === "closed";
  const remaining = Math.max(0, goal - raised);
  const description = String(campaign.publicStory || campaign.description || "").trim();
  const status = ended ? "Closed" : finished ? "Goal Reached" : "Ongoing";
  return (
    <View style={[styles.columns, !wide && styles.stacked]}>
      <View style={[styles.leftColumn, !wide && styles.stackColumn]}>
        <CampaignGallery campaign={campaign} photos={photos} />
        <View style={styles.badges}>
          <View style={[styles.badge, styles.verifiedBadge]}>
            <Ionicons name="shield-checkmark" size={14} color="#087D56" />
            <Text style={styles.verifiedText}>LGU VERIFIED</Text>
          </View>
          <View style={[styles.badge, styles.categoryBadge]}>
            <Ionicons name="people-outline" size={14} color="#A85714" />
            <Text style={styles.categoryText}>{group === "community_needs_help" ? "COMMUNITY NEED" : "DISASTER SUPPORT"}</Text>
          </View>
        </View>

        <Text style={styles.campaignEyebrow}>CAMPAIGN PROFILE</Text>
        <Text style={styles.campaignTitle}>{campaign.title || "Donation Campaign"}</Text>
        <View style={styles.areaLine}>
          <Ionicons name="location-outline" size={19} color="#0A9471" />
          <Text style={styles.area}>{area}</Text>
        </View>
        <Text style={styles.privacyNote}>General barangay/city area only. Exact beneficiary location remains private.</Text>

        <View style={styles.overviewCard}>
          <SectionTitle name="About this campaign" icon="document-text-outline" />
          <Text style={styles.overviewText}>
            {description || "This LGU-verified campaign has been published for community support."}
          </Text>
        </View>
        <View style={styles.supportStrip}>
          <View style={styles.supportStripIcon}>
            <Ionicons name="heart-outline" size={20} color="#0B8C66" />
          </View>
          <View style={styles.supportStripCopy}>
            <Text style={styles.supportStripLabel}>SUPPORT CATEGORY</Text>
            <Text style={styles.supportStripValue}>Monetary donation  ·  {category}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.rightColumn, !wide && styles.stackColumn]}>
        <View style={styles.fundingCard}>
          <View style={styles.fundingHeading}>
            <View style={styles.sectionIcon}><Ionicons name="layers-outline" size={20} color="#087E61" /></View>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>Funding progress</Text>
            <View style={styles.statusChip}>
              <Ionicons name={finished ? "checkmark-circle" : "ellipse"} size={12} color="#038958" />
              <Text style={styles.statusText}>{status}</Text>
            </View>
          </View>
          <Text style={styles.bigAmount}>{money(raised)}</Text>
          <View style={styles.goalLine}>
            <Text style={styles.goalText}>raised of {money(goal)}</Text>
            <Text style={styles.percentText}>{Math.round(percent)}%</Text>
          </View>
          <View style={styles.track}>
            <LinearGradient
              colors={["#067D60", "#08AD7B"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.fill, { width: (percent + "%") as any }]}
            />
          </View>
          <View style={styles.fundingStats}>
            {[
              { label: "Raised", value: money(raised) },
              { label: "Goal", value: money(goal) },
              { label: "Remaining", value: money(remaining) },
            ].map((stat) => (
              <View style={styles.fundingStat} key={stat.label}>
                <Text style={styles.fundingStatAmount} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                <Text style={styles.fundingStatLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.testNotice}>
            <Ionicons name="information-circle-outline" size={15} color="#5C7682" />
            <Text style={styles.testNoticeText}>PayMongo Sandbox · Test mode only. This does not represent real-money collections.</Text>
          </View>
        </View>

        {/* The parent owns ALL of the existing checkout and funded rules. */}
        {children}

        {!!coord && (
          <View style={styles.coordinationCard}>
            <SectionTitle name="LGU coordination" icon="business-outline" />
            <Text style={styles.coordinationLabel}>DESIGNATED PUBLIC SERVICE POINT</Text>
            <Text style={styles.coordinationName}>{coord}</Text>
            <View style={styles.coordPrivacy}>
              <Ionicons name="lock-closed-outline" size={17} color="#2874B4" />
              <Text style={styles.coordPrivacyText}>For official coordination only. Exact beneficiary location remains private.</Text>
            </View>
          </View>
        )}

        <View style={styles.detailsCard}>
          <SectionTitle name="Campaign information" icon="calendar-outline" />
          {!!posted && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date Posted</Text>
              <Text style={styles.detailValue}>{posted}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Campaign Status</Text>
            <Text style={styles.detailValue}>{ended ? "Closed" : finished ? "Funding goal reached" : "Published"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Campaign ID</Text>
            <Text style={styles.detailId} selectable>{campaign.id}</Text>
          </View>
          <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.detailLabel}>Verification</Text>
            <Text style={styles.detailVerified}><Ionicons name="checkmark-circle" size={14} color="#009163" /> LGU verified</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Quiet editorial system: Inter text, deliberate weights, fewer painted cards.
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 27 },
  stacked: { flexDirection: "column", gap: 24 },
  leftColumn: { flex: 1.47, minWidth: 0 },
  rightColumn: { flex: 1, minWidth: 0, gap: 15 },
  stackColumn: { flex: 0, width: "100%" },

  gallery: { gap: 9 },
  photoStage: {
    width: "100%", height: 244, overflow: "hidden",
    borderRadius: 14, backgroundColor: "#18352F",
    borderWidth: 1, borderColor: "#D4E4DF",
  },
  mainPhoto: { width: "100%", height: "100%" },
  counter: {
    position: "absolute", top: 13, left: 13,
    paddingHorizontal: 11, paddingVertical: 6,
    backgroundColor: "rgba(6,37,33,0.84)", borderRadius: 7,
  },
  counterText: {
    fontFamily: "DonationInterSemiBold", fontSize: 10.5, color: "#FFFFFF",
  },
  galleryArrows: {
    position: "absolute", top: "42%", left: 10, right: 10,
    flexDirection: "row", justifyContent: "space-between",
  },
  galleryArrow: {
    width: 37, height: 37, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(8,55,46,0.86)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.24)",
  },
  photoCaption: {
    position: "absolute", bottom: 10, left: 11,
    flexDirection: "row", gap: 6, alignItems: "center",
    borderRadius: 7, backgroundColor: "rgba(4,38,33,0.79)",
    paddingHorizontal: 9, paddingVertical: 6,
  },
  photoCaptionText: {
    fontFamily: "DonationInterMedium", fontSize: 9, color: "#EAF8F2",
  },
  thumbs: { paddingVertical: 3, gap: 9 },
  thumbFrame: {
    height: 65, width: 83, borderRadius: 9,
    borderWidth: 2, borderColor: "transparent",
    overflow: "hidden", backgroundColor: "#EFF4F1",
  },
  thumbActive: { borderColor: "#0B906C" },
  thumbImage: { width: "100%", height: "100%" },
  photoFallback: {
    height: 198, borderRadius: 14, backgroundColor: "#EDF7F2",
    borderWidth: 1, borderColor: "#D9E9E1",
    alignItems: "center", justifyContent: "center", gap: 5, padding: 18,
  },
  photoFallbackTitle: {
    fontFamily: "DonationInterSemiBold", color: "#245844", fontSize: 13,
  },
  photoFallbackNote: {
    fontFamily: "DonationInterRegular", fontSize: 11, color: "#627E73",
  },
  badges: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: 8, marginTop: 20,
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7,
  },
  verifiedBadge: { backgroundColor: "#E3F5EB" },
  verifiedText: {
    fontFamily: "DonationInterSemiBold", color: "#11734F", fontSize: 9,
    letterSpacing: 0.2,
  },
  categoryBadge: { backgroundColor: "#FFF2E8" },
  categoryText: {
    fontFamily: "DonationInterSemiBold", color: "#9C572B", fontSize: 9,
    letterSpacing: 0.2,
  },
  pastBadge: { backgroundColor: "#E9F8EF" },
  campaignEyebrow: {
    fontFamily: "DonationInterSemiBold", color: "#0C8A65",
    fontSize: 10, letterSpacing: 1.4, marginTop: 21,
  },
  campaignTitle: {
    marginTop: 6, color: "#173744",
    fontFamily: "DonationInterBold", fontSize: 28,
    lineHeight: 37, letterSpacing: -0.35,
  },
  areaLine: { flexDirection: "row", gap: 7, alignItems: "flex-start", marginTop: 13 },
  area: {
    flex: 1, fontFamily: "DonationInterSemiBold",
    fontSize: 12, lineHeight: 19, color: "#3C6270",
  },
  privacyNote: {
    marginTop: 5, marginLeft: 26, fontFamily: "DonationInterRegular",
    fontSize: 10.5, lineHeight: 16.5, color: "#778F94",
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#E6F6ED", alignItems: "center", justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: "DonationInterSemiBold", fontSize: 14,
    lineHeight: 21, color: "#203D48", letterSpacing: -0.15,
  },
  overviewCard: {
    marginTop: 22, paddingVertical: 18, paddingHorizontal: 18,
    borderRadius: 12, borderWidth: 1, borderColor: "#DDEAE6",
    backgroundColor: "#FCFEFD", borderLeftWidth: 3, borderLeftColor: "#1BAA80",
  },
  overviewText: {
    marginTop: 12, fontFamily: "DonationInterRegular",
    fontSize: 12, lineHeight: 20, color: "#4D6772",
  },
  supportStrip: {
    flexDirection: "row", alignItems: "center", gap: 11,
    marginTop: 13, paddingVertical: 13, paddingHorizontal: 15,
    borderWidth: 1, borderColor: "#E0EAE7",
    backgroundColor: "#F8FCFA", borderRadius: 10,
  },
  supportStripIcon: {
    width: 35, height: 35, borderRadius: 10,
    backgroundColor: "#E7F7EC", alignItems: "center", justifyContent: "center",
  },
  supportStripCopy: { flex: 1, minWidth: 0 },
  supportStripLabel: {
    fontFamily: "DonationInterSemiBold", color: "#728B90",
    fontSize: 9, letterSpacing: 0.8,
  },
  supportStripValue: {
    fontFamily: "DonationInterMedium", color: "#355864",
    fontSize: 11, lineHeight: 18, marginTop: 3,
  },

  fundingCard: {
    borderWidth: 1, borderColor: "#CFE7DA", borderRadius: 14,
    backgroundColor: "#F5FBF8", padding: 20,
    shadowColor: "#0A654E", shadowOpacity: 0.055,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 1,
  },
  fundingHeading: {
    flexDirection: "row", gap: 9, flexWrap: "wrap", alignItems: "center",
  },
  statusChip: {
    flexDirection: "row", gap: 5, alignItems: "center",
    borderRadius: 6, backgroundColor: "#DCEFE4",
    paddingHorizontal: 8, paddingVertical: 6,
  },
  statusText: {
    fontFamily: "DonationInterSemiBold", fontSize: 9, color: "#086D4C",
  },
  bigAmount: {
    fontFamily: "DonationInterBold", fontSize: 30,
    lineHeight: 39, letterSpacing: -0.55,
    color: "#163947", marginTop: 22,
  },
  goalLine: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginTop: 4, gap: 8,
  },
  goalText: {
    fontFamily: "DonationInterRegular", fontSize: 11, color: "#587685",
  },
  percentText: {
    fontFamily: "DonationInterSemiBold", fontSize: 13, color: "#0B7455",
  },
  track: {
    height: 9, borderRadius: 999, overflow: "hidden",
    backgroundColor: "#D3E7DC", marginTop: 17,
  },
  fill: { height: "100%", borderRadius: 999 },
  fundingStats: {
    flexDirection: "row", justifyContent: "space-between",
    gap: 9, marginTop: 21, paddingTop: 17,
    borderTopWidth: 1, borderColor: "#DCEDE4",
  },
  fundingStat: { flex: 1, minWidth: 0 },
  fundingStatAmount: {
    fontFamily: "DonationInterSemiBold", fontSize: 12,
    color: "#294954", fontVariant: ["tabular-nums"],
  },
  fundingStatLabel: {
    fontFamily: "DonationInterRegular", fontSize: 10,
    color: "#78909A", marginTop: 5,
  },
  testNotice: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginTop: 19, paddingTop: 12,
    borderTopWidth: 1, borderColor: "#DCEDE4",
  },
  testNoticeText: {
    flex: 1, fontFamily: "DonationInterRegular",
    fontSize: 9.7, lineHeight: 15, color: "#627C84",
  },

  coordinationCard: {
    backgroundColor: "#FFFFFF", borderWidth: 1,
    borderColor: "#E0EAE7", borderRadius: 13, padding: 18,
  },
  coordinationLabel: {
    fontFamily: "DonationInterMedium", fontSize: 9,
    color: "#63818A", marginTop: 15, letterSpacing: 0.75,
  },
  coordinationName: {
    fontFamily: "DonationInterBold", fontSize: 16,
    color: "#234753", marginTop: 4,
  },
  coordPrivacy: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderTopWidth: 1, borderColor: "#E8EFED",
    paddingTop: 13, marginTop: 15,
  },
  coordPrivacyText: {
    flex: 1, fontFamily: "DonationInterRegular",
    fontSize: 10.5, lineHeight: 16.5, color: "#5B7F90",
  },

  detailsCard: {
    borderWidth: 1, borderColor: "#E0EAE7",
    borderRadius: 13, padding: 18, backgroundColor: "#FFFFFF",
  },
  detailRow: {
    flexDirection: "row", gap: 11,
    paddingVertical: 12, borderBottomWidth: 1, borderColor: "#ECF1EF",
  },
  detailLabel: {
    flex: 1, minWidth: 0, fontFamily: "DonationInterRegular",
    color: "#718893", fontSize: 10.5, lineHeight: 16,
  },
  detailValue: {
    flex: 1.2, minWidth: 0, fontFamily: "DonationInterSemiBold",
    color: "#2E535D", fontSize: 10.5,
    lineHeight: 16, textAlign: "right",
  },
  detailId: {
    flex: 1.2, minWidth: 0, fontFamily: "DonationInterRegular",
    color: "#53707B", fontSize: 10, lineHeight: 16, textAlign: "right",
  },
  detailVerified: {
    flex: 1.2, fontFamily: "DonationInterSemiBold",
    color: "#087D5E", fontSize: 10.5, lineHeight: 16, textAlign: "right",
  },
});
