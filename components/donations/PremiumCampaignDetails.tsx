import React, { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
          <View style={[styles.badge, styles.pastBadge]}>
            <Ionicons name={finished ? "checkmark-circle" : "heart-outline"} size={14} color="#087D56" />
            <Text style={styles.verifiedText}>{ended ? "CLOSED CAMPAIGN" : finished ? "GOAL REACHED" : "ACTIVE CAMPAIGN"}</Text>
          </View>
        </View>

        <Text style={styles.campaignTitle}>{campaign.title || "Donation Campaign"}</Text>
        <View style={styles.areaLine}>
          <Ionicons name="location-outline" size={19} color="#0A9471" />
          <Text style={styles.area}>{area}</Text>
        </View>
        <Text style={styles.privacyNote}>General barangay/city area only. Exact beneficiary location remains private.</Text>

        <View style={styles.overviewCard}>
          <SectionTitle name="Campaign Overview" icon="document-text-outline" />
          <Text style={styles.overviewText}>
            {description || "This LGU-verified campaign has been published for community support."}
          </Text>
        </View>
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}><Ionicons name="people-outline" size={23} color="#078864" /></View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Beneficiary Area</Text>
              <Text style={styles.infoValue}>{area}</Text>
            </View>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.infoIcon}><Ionicons name="heart-outline" size={23} color="#078864" /></View>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Type of Support</Text>
              <Text style={styles.infoValue}>Monetary Donation</Text>
              <Text style={styles.infoHint}>{category}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.rightColumn, !wide && styles.stackColumn]}>
        <View style={styles.fundingCard}>
          <View style={styles.fundingHeading}>
            <View style={styles.sectionIcon}><Ionicons name="layers-outline" size={20} color="#087E61" /></View>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>Funding Progress</Text>
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
            <SectionTitle name="LGU Coordination" icon="business-outline" />
            <Text style={styles.coordinationLabel}>Official coordination point</Text>
            <Text style={styles.coordinationName}>{coord}</Text>
            <View style={styles.coordPrivacy}>
              <Ionicons name="lock-closed-outline" size={17} color="#2874B4" />
              <Text style={styles.coordPrivacyText}>For official coordination only. Exact beneficiary location remains private.</Text>
            </View>
          </View>
        )}

        <View style={styles.detailsCard}>
          <SectionTitle name="Campaign Details" icon="calendar-outline" />
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
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  stacked: { flexDirection: "column", gap: 16 },
  leftColumn: { flex: 1.45, minWidth: 0, gap: 0 },
  rightColumn: { flex: 1, minWidth: 0, gap: 13 },
  stackColumn: { flex: 0, width: "100%" },
  gallery: { gap: 9 },
  photoStage: { width: "100%", height: 254, overflow: "hidden", borderRadius: 15, backgroundColor: "#17352F" },
  mainPhoto: { width: "100%", height: "100%" },
  counter: { position: "absolute", left: 13, top: 13, borderRadius: 999, backgroundColor: "rgba(4,35,34,0.78)", paddingHorizontal: 12, paddingVertical: 7 },
  counterText: { fontSize: 11, fontWeight: "900", color: "#FFFFFF" },
  galleryArrows: { position: "absolute", left: 10, right: 10, top: "44%", flexDirection: "row", justifyContent: "space-between" },
  galleryArrow: { width: 35, height: 35, borderRadius: 18, backgroundColor: "rgba(2,48,40,0.86)", alignItems: "center", justifyContent: "center" },
  thumbs: { gap: 9, paddingVertical: 2 },
  thumbFrame: { width: 78, height: 62, overflow: "hidden", borderRadius: 9, borderWidth: 2, borderColor: "transparent", backgroundColor: "#F3F7F5" },
  thumbActive: { borderColor: "#019C6A" },
  thumbImage: { width: "100%", height: "100%" },
  photoFallback: { height: 190, borderRadius: 15, backgroundColor: "#E8F6EF", alignItems: "center", justifyContent: "center", padding: 18, gap: 4 },
  photoFallbackTitle: { fontSize: 12, fontWeight: "800", color: "#115642" },
  photoFallbackNote: { fontSize: 10, color: "#5D837B" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 19 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 },
  verifiedBadge: { backgroundColor: "#DDF9E9" },
  verifiedText: { fontSize: 9, fontWeight: "900", color: "#067349" },
  categoryBadge: { backgroundColor: "#FFF0E4" },
  categoryText: { fontSize: 9, fontWeight: "900", color: "#AF5412" },
  pastBadge: { backgroundColor: "#E7F8F0" },
  campaignTitle: { fontSize: 27, lineHeight: 34, fontWeight: "900", color: "#103347", letterSpacing: -0.65, marginTop: 12 },
  areaLine: { flexDirection: "row", gap: 7, alignItems: "flex-start", marginTop: 11 },
  area: { fontSize: 12, lineHeight: 18, fontWeight: "800", color: "#476982", flex: 1 },
  privacyNote: { marginTop: 3, fontSize: 10, lineHeight: 16, color: "#728593", marginLeft: 26 },
  overviewCard: { marginTop: 18, borderWidth: 1, borderColor: "#E1EAE9", borderRadius: 15, backgroundColor: "#F8FBFB", padding: 15 },
  sectionHead: { flexDirection: "row", gap: 9, alignItems: "center" },
  sectionIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#DEF8EC", justifyContent: "center", alignItems: "center" },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: "#123648" },
  overviewText: { marginTop: 10, fontSize: 11.5, lineHeight: 18, color: "#597187" },
  infoCards: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  infoCard: { flex: 1, minWidth: 185, borderRadius: 13, backgroundColor: "#F7FAFA", borderWidth: 1, borderColor: "#E1E8E9", flexDirection: "row", gap: 10, padding: 11, alignItems: "center" },
  infoIcon: { width: 41, height: 41, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#E2F8ED" },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: { fontSize: 10.5, fontWeight: "800", color: "#3C5971" },
  infoValue: { fontSize: 10.5, fontWeight: "700", color: "#547086", marginTop: 3 },
  infoHint: { fontSize: 9, color: "#79909F", marginTop: 3 },
  fundingCard: { borderWidth: 1, borderColor: "#D5E6E5", borderRadius: 16, backgroundColor: "#FFFFFF", padding: 16 },
  fundingHeading: { flexDirection: "row", alignItems: "center", gap: 9, flexWrap: "wrap" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#DEF8E8" },
  statusText: { fontSize: 9, color: "#087246", fontWeight: "900" },
  bigAmount: { fontSize: 27, fontWeight: "900", color: "#102F43", marginTop: 16 },
  goalLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3, gap: 8 },
  goalText: { fontSize: 11, color: "#678098" },
  percentText: { fontSize: 14, fontWeight: "900", color: "#123649" },
  track: { height: 11, borderRadius: 999, backgroundColor: "#DDEBE6", overflow: "hidden", marginTop: 12 },
  fill: { height: "100%", borderRadius: 999 },
  fundingStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 6 },
  fundingStat: { flex: 1, minWidth: 0 },
  fundingStatAmount: { fontSize: 12, fontWeight: "900", color: "#163447" },
  fundingStatLabel: { fontSize: 10, color: "#71869C", marginTop: 3 },
  testNotice: { marginTop: 17, flexDirection: "row", gap: 7, alignItems: "flex-start", borderTopWidth: 1, borderColor: "#EDF1F2", paddingTop: 11 },
  testNoticeText: { fontSize: 9.5, lineHeight: 14, color: "#688392", flex: 1 },
  coordinationCard: { borderWidth: 1, borderColor: "#DCE8E7", borderRadius: 15, backgroundColor: "#FFFFFF", padding: 15 },
  coordinationLabel: { marginTop: 13, fontSize: 10, color: "#6E8499" },
  coordinationName: { marginTop: 3, fontSize: 15, fontWeight: "900", color: "#123648" },
  coordPrivacy: { flexDirection: "row", gap: 9, alignItems: "flex-start", backgroundColor: "#EFF7FF", borderRadius: 11, padding: 11, marginTop: 12, borderWidth: 1, borderColor: "#E3EDFA" },
  coordPrivacyText: { fontSize: 10.5, lineHeight: 16, color: "#356B9A", flex: 1 },
  detailsCard: { borderWidth: 1, borderColor: "#DCE8E7", borderRadius: 15, backgroundColor: "#FFFFFF", padding: 15 },
  detailRow: { flexDirection: "row", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#EFF3F2" },
  detailLabel: { flex: 1, minWidth: 0, color: "#698095", fontSize: 10 },
  detailValue: { flex: 1.2, minWidth: 0, color: "#26495D", fontWeight: "800", fontSize: 10, textAlign: "right" },
  detailId: { flex: 1.2, minWidth: 0, color: "#426577", fontSize: 9.5, textAlign: "right" },
  detailVerified: { flex: 1.2, color: "#058458", fontWeight: "800", fontSize: 10, textAlign: "right" },
});
