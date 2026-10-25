import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

/**
 * Defense demonstration dashboard.
 *
 * A signed PayMongo paid webhook confirms a test payment, NOT a settlement.
 * Legacy/manual receipts retain their own provenance. No values are fabricated,
 * no spendable account balance is assumed and no actual payouts are initiated.
 */
export type ReconciliationCampaign = {
  id: string;
  title?: string;
  status?: string;
  monetaryGoal?: number;
  verifiedAmountReceived?: number;
  sourceAssistanceRequestId?: string;
};
export type ReconciliationDonation = {
  id: string;
  campaignId?: string;
  donationType?: string;
  status?: string;
  paymentStatus?: string;
  paymentProvider?: string;
  paymongoLivemode?: boolean;
  actualAmountReceived?: number;
};
type Source = "sandbox" | "live" | "legacy" | "pending" | "failed" | "unverified";
const positive = (raw: unknown) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const php = (value: number) => "₱" + positive(value).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const sourceOf = (record: ReconciliationDonation): Source => {
  const status = String(record.status || "").toLowerCase();
  if (status === "rejected" || status === "payment_failed") return "failed";
  if (["submitted", "payment_pending", "payment_creating"].includes(status)) return "pending";
  if (status !== "received") return "unverified";
  if (record.paymentProvider === "paymongo") {
    if (record.paymentStatus !== "paid") return "unverified";
    if (record.paymongoLivemode === false) return "sandbox";
    if (record.paymongoLivemode === true) return "live";
    return "legacy";
  }
  return "legacy";
};
type CampaignSummary = {
  campaign: ReconciliationCampaign;
  recorded: number;
  providerConfirmed: number;
  legacy: number;
  sandbox: number;
  live: number;
  pending: number;
  failed: number;
  goal: number;
  progress: number;
  confirmed: number;
  mismatch: boolean;
};
const summarize = (campaign: ReconciliationCampaign, donations: ReconciliationDonation[]): CampaignSummary => {
  let providerConfirmed = 0, sandbox = 0, live = 0, legacy = 0;
  let pending = 0, failed = 0, confirmed = 0;
  for (const donation of donations) {
    if (donation.campaignId !== campaign.id ||
      (donation.donationType && donation.donationType !== "monetary")) continue;
    const category = sourceOf(donation);
    if (category === "pending") pending++;
    else if (category === "failed") failed++;
    else if (category === "sandbox" || category === "live" || category === "legacy") {
      confirmed++;
      const value = positive(donation.actualAmountReceived);
      if (category === "sandbox") sandbox += value;
      else if (category === "live") live += value;
      else legacy += value;
      if (category === "sandbox" || category === "live") providerConfirmed += value;
    }
  }
  const recorded = sandbox + live + legacy;
  const progress = positive(campaign.verifiedAmountReceived);
  return {
    campaign, recorded, providerConfirmed, legacy, sandbox, live,
    pending, failed, goal: positive(campaign.monetaryGoal), progress,
    confirmed, mismatch: Math.abs(recorded - progress) > 0.01,
  };
};

function Stage({ number, name, detail, current }: {
  number: string; name: string; detail: string; current?: boolean;
}) {
  return <View style={[styles.stage, current && styles.stageCurrent]}>
    <View style={[styles.stageNumber, current && styles.stageNumberCurrent]}>
      <Text style={[styles.stageNumberText, current && styles.stageNumberCurrentText]}>{number}</Text>
    </View>
    <View style={styles.flex}>
      <Text style={styles.stageName}>{name}</Text>
      <Text style={styles.stageDetail}>{detail}</Text>
    </View>
  </View>;
}

export default function FundReconciliationPanel({ campaigns, donations, ready }: {
  campaigns: ReconciliationCampaign[];
  donations: ReconciliationDonation[];
  ready: boolean;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 1020;
  useFonts({
    FundInterRegular: Inter_400Regular,
    FundInterMedium: Inter_500Medium,
    FundInterSemiBold: Inter_600SemiBold,
    FundInterBold: Inter_700Bold,
  });
  const summaries = useMemo(() =>
    campaigns.map(item => summarize(item, donations)).sort(
      (a, b) => Number(!!b.campaign.sourceAssistanceRequestId) -
        Number(!!a.campaign.sourceAssistanceRequestId),
    ), [campaigns, donations]);
  const totals = useMemo(() => summaries.reduce((acc, row) => ({
    recorded: acc.recorded + row.recorded,
    providerConfirmed: acc.providerConfirmed + row.providerConfirmed,
    legacy: acc.legacy + row.legacy,
    sandbox: acc.sandbox + row.sandbox,
    live: acc.live + row.live,
    pending: acc.pending + row.pending,
    mismatches: acc.mismatches + Number(row.mismatch),
  }), {
    recorded: 0, providerConfirmed: 0, legacy: 0, sandbox: 0,
    live: 0, pending: 0, mismatches: 0,
  }), [summaries]);
  const orphanCount = useMemo(() => donations.filter(row =>
    !!row.campaignId && !campaigns.some(campaign => campaign.id === row.campaignId)).length,
  [donations, campaigns]);

  return <View style={styles.root}>
    <View style={styles.headingRow}>
      <View style={styles.flex}>
        <Text style={styles.eyebrow}>VOLUNSERVE · DONATION OPERATIONS</Text>
        <Text style={styles.heading}>Fund management</Text>
        <Text style={styles.subtitle}>
          Track campaign funds, verify donation records, and review assistance-release readiness.
        </Text>
      </View>
      <View style={styles.demoBadge}>
        <Ionicons name="flask-outline" size={16} color="#0A7D5B" />
        <Text style={styles.demoBadgeText}>DEFENSE DEMO · SIMULATED FUNDS</Text>
      </View>
    </View>

    <View style={[styles.overview, compact && styles.overviewStack]}>
      <LinearGradient
        colors={["#064E40", "#087A5C", "#0CA77A"]}
        start={{x:0,y:0}}
        end={{x:1,y:1}}
        style={[styles.hero, compact && styles.heroStack]}>
        <View style={styles.heroHeading}>
          <View style={styles.heroIcon}><Ionicons name="wallet-outline" size={21} color="#DBFFF0" /></View>
          <Text style={styles.heroEyebrow}>DONATIONS RECORDED</Text>
        </View>
        <Text style={styles.heroAmount}>{ready ? php(totals.recorded) : "Loading"}</Text>
        <Text style={styles.heroDescription}>Combined confirmed donation entries across linked campaigns</Text>
        <View style={styles.heroDivider} />
        <View style={styles.heroBreakdown}>
          <Text style={styles.heroBreakdownText}>
            {ready ? php(totals.providerConfirmed) : "—"} provider-confirmed
          </Text>
          <Text style={styles.heroBreakdownText}>
            {ready ? php(totals.legacy) : "—"} legacy / admin-recorded
          </Text>
        </View>
      </LinearGradient>
      <View style={[styles.reviewCard, compact && styles.reviewCardStack]}>
        <View style={styles.reviewTop}>
          <View style={styles.reviewIcon}><Ionicons name="shield-checkmark-outline" size={19} color="#098565"/></View>
          <Text style={styles.reviewEyebrow}>LGU FUND VERIFICATION</Text>
        </View>
        <Text style={styles.reviewTitle}>Settlement not confirmed</Text>
        <Text style={styles.reviewCopy}>
          Donor payment records are available for review. The actual amount
          received by the LGU must be checked against authorized settlement evidence.
        </Text>
        <View style={styles.reviewBottom}>
          <Ionicons name="lock-closed-outline" size={16} color="#678679"/>
          <Text style={styles.reviewBottomText}>Available for release: Not yet verified</Text>
        </View>
      </View>
    </View>

    <View style={styles.demoNotice}>
      <Ionicons name="information-circle-outline" size={18} color="#467C72"/>
      <Text style={styles.demoText}>
        Demonstration data only. PayMongo Sandbox payments do not transfer real money.
        Existing legacy/manual records are shown together for reporting, but are not
        relabeled as verified PayMongo payments. No wallet transfer is active.
      </Text>
    </View>

    <View style={styles.sectionHeading}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>Fund release workflow</Text>
        <Text style={styles.sectionSubtitle}>How an approved donation moves toward resident assistance</Text>
      </View>
    </View>
    <View style={styles.stages}>
      <Stage number="01" name="Donations recorded" detail="Actual saved donation history" current/>
      <Stage number="02" name="LGU fund review" detail="Reconcile payment and settlement" />
      <Stage number="03" name="Authorize release" detail="Verify recipient and approval" />
      <Stage number="04" name="Resident confirmation" detail="Confirm funds received or report an issue" />
    </View>
    <Text style={styles.workflowNote}>
      Phase 1 is a read-only demonstration. Stages 2–4 require separate secure implementation and evidence.
    </Text>

    <View style={styles.sectionHeading}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>Campaign fund overview</Text>
        <Text style={styles.sectionSubtitle}>Approved targets and recorded contributions from linked campaign data</Text>
      </View>
      <Text style={styles.count}>{summaries.length} campaigns</Text>
    </View>
    {!ready ? <Text style={styles.empty}>Loading donation and campaign records…</Text> :
      summaries.length === 0 ? <View style={styles.emptyCard}>
        <Ionicons name="heart-outline" size={28} color="#83A598"/>
        <Text style={styles.empty}>No campaign records are available yet.</Text>
      </View> :
      <View style={styles.campaignGrid}>
        {summaries.map(row => {
          const percent = row.goal > 0 ? Math.min(100, row.progress / row.goal * 100) : 0;
          const goalReached = row.goal > 0 && row.progress >= row.goal - 0.01;
          return <View key={row.campaign.id} style={[styles.campaignCard, !compact && styles.campaignCardWide]}>
            <View style={styles.campaignHead}>
              <View style={styles.flex}>
                <Text style={styles.campaignKicker}>COMMUNITY FUNDRAISING</Text>
                <Text style={styles.campaignTitle}>{row.campaign.title || "Donation campaign"}</Text>
              </View>
              <View style={[styles.statusChip, goalReached && styles.statusChipReached]}>
                <Ionicons name={goalReached ? "checkmark-circle" : "ellipse-outline"} size={13} color="#118265"/>
                <Text style={styles.statusText}>{goalReached ? "Goal reached" : "In progress"}</Text>
              </View>
            </View>
            <View style={styles.progressValues}>
              <Text style={styles.progressAmount}>{php(row.progress)}</Text>
              <Text style={styles.progressPercentage}>{row.goal ? Math.round(percent) + "%" : "—"}</Text>
            </View>
            <View style={styles.track}><View style={[styles.fillTrack, {width: (percent + "%") as any}]}/></View>
            <Text style={styles.goalCaption}>of {row.goal ? php(row.goal) : "unrecorded target"} approved goal</Text>
            <View style={styles.campaignFooter}>
              <View>
                <Text style={styles.footerLabel}>RECORDED CONTRIBUTIONS</Text>
                <Text style={styles.footerAmount}>{php(row.recorded)}</Text>
              </View>
              <View style={styles.footerRight}>
                <Text style={styles.footerLabel}>DONATIONS</Text>
                <Text style={styles.footerAmount}>{row.confirmed} confirmed · {row.pending} pending</Text>
              </View>
            </View>
            {!!row.campaign.sourceAssistanceRequestId &&
              <Text selectable style={styles.requestLink}>
                <Ionicons name="link-outline" size={12} color="#648578" />{" "}
                Request ID: {row.campaign.sourceAssistanceRequestId}
              </Text>}
            {row.mismatch && <View style={styles.auditWarning}>
              <Ionicons name="alert-circle-outline" size={15} color="#946D27"/>
              <Text style={styles.auditWarningText}>
                Recorded contributions and campaign progress differ. Review source records.
              </Text>
            </View>}
          </View>;
        })}
      </View>}
    {ready && (totals.mismatches > 0 || orphanCount > 0) &&
      <Text style={styles.audit}>
        Reconciliation flags: {totals.mismatches} campaign mismatch(es), {orphanCount} unmatched donation link(s).
        No financial data was changed.
      </Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: {gap: 17},
  flex: {flex: 1, minWidth: 0},
  headingRow: {flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 13},
  eyebrow: {fontFamily: "FundInterSemiBold", fontSize: 10, letterSpacing: 1.3, color: "#098466"},
  heading: {fontFamily: "FundInterBold", fontSize: 26, letterSpacing: -0.45, marginTop: 5, color: "#193F49"},
  subtitle: {fontFamily: "FundInterRegular", fontSize: 11.5, lineHeight: 19, color: "#6A868E", marginTop: 5},
  demoBadge: {flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "#CEE8D9", backgroundColor: "#EAF9F1", borderRadius: 8},
  demoBadgeText: {fontFamily: "FundInterSemiBold", color: "#0D7759", fontSize: 9.3, letterSpacing: 0.35},
  overview: {flexDirection: "row", gap: 13, alignItems: "stretch"},
  overviewStack: {flexDirection: "column"},
  hero: {flex: 1.28, minWidth: 0, minHeight: 205, borderRadius: 16, padding: 23, justifyContent: "center"},
  heroStack: {flex: 0, width: "100%"},
  heroHeading: {flexDirection: "row", alignItems: "center", gap: 10},
  heroIcon: {width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center"},
  heroEyebrow: {fontFamily: "FundInterSemiBold", color: "#D3FBE6", fontSize: 10, letterSpacing: 1.15},
  heroAmount: {fontFamily: "FundInterBold", fontSize: 35, letterSpacing: -0.8, color: "#FFFFFF", marginTop: 10},
  heroDescription: {fontFamily: "FundInterRegular", color: "#D5F5E8", fontSize: 11.3, lineHeight: 18, marginTop: 2},
  heroDivider: {height: 1, backgroundColor: "rgba(255,255,255,0.21)", marginTop: 18, marginBottom: 12},
  heroBreakdown: {flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 9},
  heroBreakdownText: {fontFamily: "FundInterMedium", color: "#F1FFFA", fontSize: 10.5, lineHeight: 17},
  reviewCard: {flex: 1, minWidth: 0, minHeight: 205, padding: 21, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9EAE3"},
  reviewCardStack: {flex: 0, width: "100%"},
  reviewTop: {flexDirection: "row", gap: 9, alignItems: "center"},
  reviewIcon: {width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#E5F7ED"},
  reviewEyebrow: {fontFamily: "FundInterSemiBold", fontSize: 9.3, letterSpacing: 0.85, color: "#0D8462"},
  reviewTitle: {fontFamily: "FundInterBold", color: "#244850", fontSize: 18, marginTop: 15},
  reviewCopy: {fontFamily: "FundInterRegular", color: "#668188", fontSize: 11.1, lineHeight: 18, marginTop: 7},
  reviewBottom: {flexDirection: "row", gap: 8, alignItems: "center", paddingTop: 13, borderTopWidth: 1, borderTopColor: "#E7EFEB", marginTop: 18},
  reviewBottomText: {fontFamily: "FundInterSemiBold", color: "#57796F", fontSize: 10.3, flex: 1},
  demoNotice: {flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 11, backgroundColor: "#F1F8F4", borderWidth: 1, borderColor: "#DDECE3"},
  demoText: {flex: 1, fontFamily: "FundInterRegular", color: "#537970", fontSize: 10.5, lineHeight: 17},
  sectionHeading: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12},
  sectionTitle: {fontFamily: "FundInterBold", fontSize: 15.5, color: "#23444C"},
  sectionSubtitle: {fontFamily: "FundInterRegular", fontSize: 10.8, lineHeight: 17, color: "#77908D", marginTop: 5},
  stages: {flexDirection: "row", flexWrap: "wrap", gap: 9},
  stage: {flexGrow: 1, flexBasis: 194, minWidth: 172, paddingVertical: 14, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: "#E0ECE6", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "flex-start", gap: 10},
  stageCurrent: {backgroundColor: "#F2FCF6", borderColor: "#C9E8D8"},
  stageNumber: {width: 30, height: 30, borderRadius: 9, backgroundColor: "#F0F5F2", alignItems: "center", justifyContent: "center"},
  stageNumberCurrent: {backgroundColor: "#0E8D6C"},
  stageNumberText: {fontFamily: "FundInterBold", fontSize: 10, color: "#5B8273"},
  stageNumberCurrentText: {color: "#FFFFFF"},
  stageName: {fontFamily: "FundInterSemiBold", fontSize: 11.1, color: "#31534F"},
  stageDetail: {fontFamily: "FundInterRegular", fontSize: 9.7, lineHeight: 16, color: "#728D84", marginTop: 4},
  workflowNote: {fontFamily: "FundInterRegular", fontSize: 10, lineHeight: 17, color: "#789089", marginTop: -7},
  count: {fontFamily: "FundInterSemiBold", fontSize: 10.5, color: "#137F62"},
  campaignGrid: {flexDirection: "row", flexWrap: "wrap", gap: 13},
  campaignCard: {backgroundColor: "#FFFFFF", width: "100%", borderRadius: 14, borderWidth: 1, borderColor: "#DEEBE5", padding: 18, gap: 12},
  campaignCardWide: {width: "48.8%", flexGrow: 1, flexBasis: 320},
  campaignHead: {flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", justifyContent: "space-between", gap: 10},
  campaignKicker: {fontFamily: "FundInterSemiBold", fontSize: 9.3, letterSpacing: 0.85, color: "#0A8464"},
  campaignTitle: {fontFamily: "FundInterBold", fontSize: 15, lineHeight: 23, color: "#24454E", marginTop: 6},
  statusChip: {flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EDF8F1", borderRadius: 7, paddingVertical: 6, paddingHorizontal: 9},
  statusChipReached: {backgroundColor: "#DEF7E8"},
  statusText: {fontFamily: "FundInterSemiBold", fontSize: 9.3, color: "#12805E"},
  progressValues: {flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12},
  progressAmount: {fontFamily: "FundInterBold", fontSize: 20, color: "#194A45"},
  progressPercentage: {fontFamily: "FundInterSemiBold", fontSize: 11.5, color: "#078963"},
  track: {height: 9, borderRadius: 9, overflow: "hidden", backgroundColor: "#DAEDE3"},
  fillTrack: {height: "100%", backgroundColor: "#10A87A", borderRadius: 9},
  goalCaption: {fontFamily: "FundInterRegular", fontSize: 10.5, color: "#79928A", marginTop: -6},
  campaignFooter: {flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8, borderTopWidth: 1, borderTopColor: "#EAF1ED", paddingTop: 13},
  footerRight: {alignItems: "flex-end"},
  footerLabel: {fontFamily: "FundInterMedium", fontSize: 9, letterSpacing: 0.5, color: "#78938B"},
  footerAmount: {fontFamily: "FundInterSemiBold", fontSize: 11, color: "#315950", marginTop: 5},
  requestLink: {fontFamily: "FundInterRegular", fontSize: 10, color: "#638779", marginTop: 1},
  auditWarning: {flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 8, padding: 10, backgroundColor: "#FFF7EB", borderWidth: 1, borderColor: "#F5E2C4"},
  auditWarningText: {fontFamily: "FundInterRegular", fontSize: 10, lineHeight: 16, color: "#86682D", flex: 1},
  audit: {fontFamily: "FundInterRegular", fontSize: 10.5, lineHeight: 17, color: "#936C33"},
  emptyCard: {alignItems: "center", justifyContent: "center", minHeight: 135, gap: 10, borderWidth: 1, borderColor: "#DAEAE1", backgroundColor: "#FFFFFF", borderRadius: 13},
  empty: {fontFamily: "FundInterRegular", textAlign: "center", color: "#7A9088", fontSize: 11},
});
