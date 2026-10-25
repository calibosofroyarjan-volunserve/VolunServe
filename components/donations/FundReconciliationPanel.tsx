import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * Phase 1: display recorded donation facts only.
 * Payment confirmation is NOT bank settlement and cannot authorize a payout.
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
const number = (raw: unknown) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const peso = (raw: number) => "₱" + number(raw).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
type Bucket = "test" | "live" | "other" | "pending" | "failed" | "unverified";
const paymentBucket = (item: ReconciliationDonation): Bucket => {
  const status = String(item.status || "").toLowerCase();
  if (status === "payment_failed" || status === "rejected") return "failed";
  if (["payment_creating", "payment_pending", "submitted"].includes(status)) return "pending";
  if (status !== "received") return "unverified";
  if (item.paymentProvider === "paymongo") {
    if (item.paymentStatus !== "paid") return "unverified";
    if (item.paymongoLivemode === false) return "test";
    if (item.paymongoLivemode === true) return "live";
  }
  return "other";
};
type Summary = {
  campaign: ReconciliationCampaign;
  test: number; live: number; other: number;
  pending: number; failed: number; unverified: number; confirmed: number;
  progress: number; goal: number; difference: boolean;
};
const sumCampaign = (campaign: ReconciliationCampaign, donations: ReconciliationDonation[]): Summary => {
  const result: Summary = {
    campaign, test: 0, live: 0, other: 0,
    pending: 0, failed: 0, unverified: 0, confirmed: 0,
    progress: number(campaign.verifiedAmountReceived),
    goal: number(campaign.monetaryGoal), difference: false,
  };
  for (const item of donations) {
    if (item.campaignId !== campaign.id ||
      (item.donationType && item.donationType !== "monetary")) continue;
    const group = paymentBucket(item);
    if (group === "pending" || group === "failed" || group === "unverified") result[group]++;
    else {
      result.confirmed++;
      // Require actual amount confirmed; do not substitute requested checkout value.
      result[group] += number(item.actualAmountReceived);
    }
  }
  result.difference = Math.abs(result.progress -
    (result.test + result.live + result.other)) > 0.01;
  return result;
};

function Metric({ caption, value, footnote, icon }: {
  caption: string; value: string; footnote: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return <View style={s.metric}>
    <View style={s.metricHead}>
      <Text style={s.metricCaption}>{caption}</Text>
      <Ionicons name={icon} size={18} color="#13795D"/>
    </View>
    <Text style={s.metricValue} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
    <Text style={s.metricFootnote}>{footnote}</Text>
  </View>;
}
function AmountRow({ label, value, footnote }: {
  label: string; value: number; footnote: string;
}) {
  return <View style={s.amountRow}>
    <View style={s.flex}>
      <Text style={s.amountLabel}>{label}</Text>
      <Text style={s.amountFootnote}>{footnote}</Text>
    </View>
    <Text style={s.amountValue}>{peso(value)}</Text>
  </View>;
}

export default function FundReconciliationPanel({ campaigns, donations, ready }: {
  campaigns: ReconciliationCampaign[];
  donations: ReconciliationDonation[];
  ready: boolean;
}) {
  const rows = useMemo(() =>
    campaigns.map(c => sumCampaign(c, donations)).sort(
      (a, b) => Number(!!b.campaign.sourceAssistanceRequestId) -
        Number(!!a.campaign.sourceAssistanceRequestId),
    ), [campaigns, donations],
  );
  const totals = rows.reduce((a, x) => ({
    test: a.test + x.test, live: a.live + x.live, other: a.other + x.other,
    mismatches: a.mismatches + Number(x.difference),
  }), { test: 0, live: 0, other: 0, mismatches: 0 });
  const unmatched = donations.filter(d => !!d.campaignId &&
    !campaigns.some(c => c.id === d.campaignId)).length;

  return <View style={s.root}>
    <View style={s.head}>
      <View style={s.flex}>
        <Text style={s.eyebrow}>FINANCIAL OVERSIGHT · PHASE 1</Text>
        <Text style={s.title}>Fund reconciliation</Text>
        <Text style={s.subtitle}>Monitor confirmed donation records by campaign before settlement review and approved fund release.</Text>
      </View>
      <View style={s.readOnly}>
        <Ionicons name="lock-closed-outline" size={15} color="#0D785C"/>
        <Text style={s.readOnlyText}>Read-only</Text>
      </View>
    </View>

    <View style={s.notice}>
      <Ionicons name="shield-checkmark-outline" size={20} color="#0D785C"/>
      <Text style={s.noticeText}>
        Payment confirmed does not mean funds settled to the LGU or transferred to
        a resident. No spendable bank balance can be established from these records.
        PayMongo Sandbox totals are test data; this screen cannot initiate a transfer.
      </Text>
    </View>

    <View style={s.metrics}>
      <Metric caption="Confirmed sandbox" value={ready ? peso(totals.test) : "Loading"}
        footnote="Test payments · not real money" icon="flask-outline"/>
      <Metric caption="Confirmed live payments" value={ready ? peso(totals.live) : "Loading"}
        footnote="Settlement not independently checked" icon="card-outline"/>
      <Metric caption="Manual / unknown" value={ready ? peso(totals.other) : "Loading"}
        footnote="Requires separate supporting evidence" icon="document-text-outline"/>
      <Metric caption="Available for release" value="Not verified"
        footnote="Requires authorized settlement records" icon="lock-closed-outline"/>
    </View>

    <View style={s.workCard}>
      <Text style={s.sectionTitle}>Required financial controls</Text>
      <View style={s.steps}>
        {[
          ["01", "Review donor payment", "Match payment reference and recorded amount"],
          ["02", "Confirm settlement", "Reconcile provider and authorized bank records"],
          ["03", "Approve fund release", "Verify recipient and require separate approval"],
          ["04", "Confirm transfer", "Record provider-verified GCash/Maya outcome"],
          ["05", "Resident acknowledgment", "Confirm full, partial, or disputed receipt"],
        ].map(([n, title, desc]) => <View key={n} style={s.step}>
          <Text style={s.stepNumber}>{n}</Text>
          <View style={s.flex}><Text style={s.stepTitle}>{title}</Text>
            <Text style={s.stepDesc}>{desc}</Text></View>
        </View>)}
      </View>
      <Text style={s.workFootnote}>Steps 2–5 are future approval stages; no actual settlement or transfer is being claimed.</Text>
    </View>

    <View style={s.sectionHead}>
      <View style={s.flex}>
        <Text style={s.sectionTitle}>Campaign reconciliation register</Text>
        <Text style={s.sectionDesc}>Linked assistance request appears when present in verified campaign data.</Text>
      </View>
      <Text style={s.count}>{rows.length} campaigns</Text>
    </View>
    {!ready ? <Text style={s.empty}>Loading current records…</Text> :
    !rows.length ? <View style={s.emptyCard}>
      <Ionicons name="folder-open-outline" size={29} color="#83A59A"/>
      <Text style={s.empty}>No campaign records to reconcile.</Text>
    </View> : rows.map(row => {
      const percent = row.goal > 0 ? Math.min(100, row.progress / row.goal * 100) : 0;
      return <View key={row.campaign.id} style={s.campaignCard}>
        <View style={s.campaignTop}>
          <View style={s.flex}>
            <Text style={s.eyebrow}>CAMPAIGN · {String(row.campaign.status || "RECORDED").toUpperCase()}</Text>
            <Text style={s.campaignName}>{row.campaign.title || "Donation campaign"}</Text>
            {!!row.campaign.sourceAssistanceRequestId && (
              <Text style={s.sourceId} selectable>Linked assistance request: {row.campaign.sourceAssistanceRequestId}</Text>
            )}
          </View>
          <View style={s.pendingChip}><Ionicons name="time-outline" color="#936C2B" size={13}/>
            <Text style={s.pendingText}>Settlement unverified</Text></View>
        </View>
        <View style={s.progressHeader}>
          <Text style={s.progressLabel}>Recorded campaign progress: {peso(row.progress)}</Text>
          <Text style={s.progressPercent}>{row.goal ? Math.round(percent) + "%" : "No goal"}</Text>
        </View>
        <View style={s.track}><View style={[s.fillTrack, {width: (percent + "%") as any}]}/></View>
        <Text style={s.goal}>Approved campaign target: {row.goal ? peso(row.goal) : "Not recorded"}</Text>
        <View style={s.amounts}>
          <AmountRow label="Sandbox verified" value={row.test} footnote="For testing only"/>
          <AmountRow label="Live payment confirmed" value={row.live} footnote="Settlement is not proven"/>
          <AmountRow label="Other confirmed records" value={row.other} footnote="Mode or manual receipt needs review"/>
        </View>
        <Text style={s.footer}>{row.confirmed} confirmed · {row.pending} pending · {row.failed} failed · {row.unverified} unverified</Text>
        {row.difference && <View style={s.warning}>
          <Ionicons name="alert-circle-outline" color="#987129" size={17}/>
          <Text style={s.warningText}>Recorded campaign progress and linked confirmed donations do not match. Investigate before settlement review; no record was modified.</Text>
        </View>}
      </View>;
    })}
    {ready && (totals.mismatches > 0 || unmatched > 0) &&
      <Text style={s.audit}>Audit flags: {totals.mismatches} progress mismatch(es), {unmatched} donation(s) linked to an unrecognized campaign.</Text>}
  </View>;
}

const s = StyleSheet.create({
  root: {gap: 15},
  flex: {flex: 1, minWidth: 0},
  head: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12},
  eyebrow: {fontSize: 10, letterSpacing: 1, color: "#0E8865", fontWeight: "700"},
  title: {fontSize: 24, color: "#163E44", fontWeight: "700", marginTop: 5},
  subtitle: {fontSize: 11.5, lineHeight: 18, color: "#60817A", marginTop: 5},
  readOnly: {flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#E7F6ED", borderRadius: 8},
  readOnlyText: {fontSize: 11, fontWeight: "700", color: "#0D785C"},
  notice: {flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 15, borderRadius: 11, backgroundColor: "#EFF9F3", borderWidth: 1, borderColor: "#D2E9DE"},
  noticeText: {flex: 1, color: "#355F54", fontSize: 11, lineHeight: 18},
  metrics: {flexDirection: "row", flexWrap: "wrap", gap: 10},
  metric: {flexGrow: 1, flexBasis: 190, minWidth: 160, borderRadius: 12, padding: 16, gap: 8, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DEEBE5"},
  metricHead: {flexDirection: "row", gap: 8, alignItems: "center"},
  metricCaption: {flex: 1, color: "#64827B", fontSize: 10.5, fontWeight: "600"},
  metricValue: {fontSize: 20, color: "#1B4846", fontWeight: "700"},
  metricFootnote: {fontSize: 9.7, lineHeight: 15, color: "#79958C"},
  workCard: {padding: 18, borderRadius: 13, backgroundColor: "#FCFEFD", borderWidth: 1, borderColor: "#DDECE5", gap: 12},
  sectionTitle: {fontSize: 15, fontWeight: "700", color: "#22474C"},
  sectionHead: {flexDirection: "row", gap: 8, alignItems: "center"},
  sectionDesc: {fontSize: 10.5, color: "#7C948C", marginTop: 4},
  count: {fontSize: 10.5, fontWeight: "700", color: "#187F65"},
  steps: {flexDirection: "row", flexWrap: "wrap", gap: 9},
  step: {flexDirection: "row", gap: 9, flexBasis: 180, flexGrow: 1, minWidth: 162, borderWidth: 1, borderColor: "#E5EFEA", borderRadius: 10, padding: 12, backgroundColor: "#FFFFFF"},
  stepNumber: {fontSize: 10.5, color: "#118466", fontWeight: "700"},
  stepTitle: {fontSize: 11, fontWeight: "700", color: "#31564F"},
  stepDesc: {fontSize: 9.6, lineHeight: 15, marginTop: 4, color: "#728F83"},
  workFootnote: {fontSize: 10, lineHeight: 16, color: "#74918A"},
  emptyCard: {minHeight: 115, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCEAE3", borderRadius: 12, gap: 8},
  empty: {fontSize: 11, color: "#789389", textAlign: "center"},
  campaignCard: {padding: 17, borderRadius: 13, borderWidth: 1, borderColor: "#DCEAE3", backgroundColor: "#FFFFFF", gap: 10},
  campaignTop: {flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10},
  campaignName: {fontSize: 15, fontWeight: "700", color: "#284B4D", marginTop: 5},
  sourceId: {fontSize: 10, color: "#6E8980", marginTop: 7},
  pendingChip: {flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "#FFF2DE", paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8},
  pendingText: {fontSize: 10, color: "#926B2A", fontWeight: "700"},
  progressHeader: {flexDirection: "row", gap: 8, justifyContent: "space-between"},
  progressLabel: {fontSize: 11, fontWeight: "700", color: "#3D655A", flex: 1},
  progressPercent: {fontSize: 11.5, fontWeight: "700", color: "#138264"},
  track: {height: 9, borderRadius: 9, overflow: "hidden", backgroundColor: "#DCEEE4"},
  fillTrack: {height: "100%", borderRadius: 9, backgroundColor: "#11A67D"},
  goal: {fontSize: 10, color: "#779188"},
  amounts: {paddingHorizontal: 12, backgroundColor: "#F8FCFA", borderRadius: 9},
  amountRow: {flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 10, borderBottomWidth: 1, borderBottomColor: "#E6EFEB"},
  amountLabel: {color: "#37665D", fontWeight: "700", fontSize: 10.5},
  amountFootnote: {fontSize: 9.5, color: "#7E948D", marginTop: 3},
  amountValue: {fontWeight: "700", fontSize: 11.5, color: "#2B5550"},
  footer: {fontSize: 10, color: "#68867C"},
  warning: {flexDirection: "row", gap: 9, alignItems: "flex-start", backgroundColor: "#FFF7EA", borderColor: "#F1E0BF", borderWidth: 1, padding: 10, borderRadius: 9},
  warningText: {flex: 1, color: "#906A2C", fontSize: 10.2, lineHeight: 16},
  audit: {fontSize: 10.5, color: "#926F30"},
});
