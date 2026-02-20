import { collection, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BarChart, PieChart } from "react-native-chart-kit";
import { db } from "../../lib/firebase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

interface Donation {
  amount: number;
  status: string;
  barangay: string;
  createdAt?: any;
  familiesHelped?: number;
}

export default function Analytics() {
  const [donations, setDonations] = useState<Donation[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "donations"), (snap) => {
      const docs: Donation[] = snap.docs.map((d) => d.data() as Donation);
      setDonations(docs);
    });

    return () => unsub();
  }, []);

  const analytics = useMemo(() => {
    let total = 0;
    let verified = 0;
    let distributed = 0;
    let rejected = 0;
    let families = 0;

    const monthly: Record<string, number> = {};
    const barangayTotals: Record<string, number> = {};

    donations.forEach((d) => {
      const amt = Number(d.amount || 0);
      total += amt;

      if (d.status === "received") verified++;
      if (d.status === "distributed") {
        distributed++;
        families += Number(d.familiesHelped || 0);
      }
      if (d.status === "rejected") rejected++;

      if (d.barangay) {
        barangayTotals[d.barangay] =
          (barangayTotals[d.barangay] || 0) + amt;
      }

      if (d.createdAt?.toDate) {
        const date = d.createdAt.toDate();
        const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
        monthly[key] = (monthly[key] || 0) + amt;
      }
    });

    const sortedBarangays = Object.entries(barangayTotals).sort(
      (a, b) => b[1] - a[1]
    );

    return {
      total,
      verified,
      distributed,
      rejected,
      families,
      monthly,
      topBarangay: sortedBarangays[0],
    };
  }, [donations]);

  const monthLabels = Object.keys(analytics.monthly).slice(-6);
  const monthData = monthLabels.map((m) => analytics.monthly[m]);

  const statusPieData = [
    {
      name: "Verified",
      count: analytics.verified,
      color: "#2563eb",
      legendFontColor: "#334155",
      legendFontSize: 12,
    },
    {
      name: "Distributed",
      count: analytics.distributed,
      color: "#16a34a",
      legendFontColor: "#334155",
      legendFontSize: 12,
    },
    {
      name: "Rejected",
      count: analytics.rejected,
      color: "#dc2626",
      legendFontColor: "#334155",
      legendFontSize: 12,
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Analytics Dashboard</Text>

      {/* SUMMARY CARDS */}
      <View style={styles.grid}>
        <StatCard title="Total Donations" value={`₱${analytics.total.toFixed(2)}`} />
        <StatCard title="Verified" value={String(analytics.verified)} />
        <StatCard title="Distributed" value={String(analytics.distributed)} />
        <StatCard title="Families Helped" value={String(analytics.families)} />
      </View>

      {/* TOP BARANGAY */}
      {analytics.topBarangay && (
        <View style={styles.highlightCard}>
          <Text style={styles.highlightTitle}>Top Barangay</Text>
          <Text style={styles.highlightValue}>
            {analytics.topBarangay[0]}
          </Text>
          <Text style={styles.highlightAmount}>
            ₱{analytics.topBarangay[1].toFixed(2)}
          </Text>
        </View>
      )}

      {/* MONTHLY TREND */}
      {monthData.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Monthly Donation Trend</Text>
          <BarChart
            data={{
              labels: monthLabels.map((m) => m.replace("-", "/")),
              datasets: [{ data: monthData }],
            }}
            width={CARD_WIDTH}
            height={240}
            fromZero
            yAxisLabel="₱"
            yAxisSuffix=""
            chartConfig={chartConfig}
            style={styles.chartStyle}
          />
        </>
      )}

      {/* STATUS BREAKDOWN */}
      <Text style={styles.sectionTitle}>Status Breakdown</Text>
      <PieChart
        data={statusPieData}
        width={CARD_WIDTH}
        height={220}
        chartConfig={chartConfig}
        accessor="count"
        backgroundColor="transparent"
        paddingLeft="15"
      />
    </ScrollView>
  );
}

/* COMPONENT */
const StatCard = ({ title, value }: any) => (
  <View style={styles.card}>
    <Text style={styles.cardTitle}>{title}</Text>
    <Text style={styles.cardValue}>{value}</Text>
  </View>
);

const chartConfig = {
  backgroundGradientFrom: "#ffffff",
  backgroundGradientTo: "#ffffff",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(15, 23, 42, ${opacity})`,
  labelColor: () => "#475569",
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f4f7fb",
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: CARD_WIDTH,
  },
  card: {
    width: CARD_WIDTH / 2 - 10,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    color: "#64748b",
  },
  cardValue: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 6,
  },
  highlightCard: {
    width: CARD_WIDTH,
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  highlightTitle: {
    color: "#94a3b8",
    fontSize: 12,
  },
  highlightValue: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 5,
  },
  highlightAmount: {
    color: "#22c55e",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 20,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  chartStyle: {
    borderRadius: 16,
    marginVertical: 10,
  },
});
    