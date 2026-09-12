import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, {
  useEffect,
  useState,
} from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type CaseRow = {
  id: string;
  title?: string;
  category?: string;
  location?: string;
  severity?: string;
  status?: string;
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: any;
};

type CenterRow = {
  id: string;
  name?: string;
  address?: string;
  barangay?: string;
  status?: string;
};

export default function WebMapTracking() {
  const { user, profile } = useUserSession();

  const [cases, setCases] = useState<
    CaseRow[]
  >([]);

  const [centers, setCenters] = useState<
    CenterRow[]
  >([]);

  useEffect(() => {
    if (!user || !profile) {
      return;
    }

    const isAdministrator = [
      "admin",
      "superadmin",
    ].includes(profile.role);

    const casesQuery = isAdministrator
      ? query(
          collection(db, "disasterCases")
        )
      : profile.role === "volunteer"
        ? query(
            collection(db, "disasterCases"),
            where("status", "in", [
              "validated",
              "assigned",
              "in_progress",
              "resolved",
            ])
          )
        : query(
            collection(db, "disasterCases"),
            where(
              "reporterUid",
              "==",
              user.uid
            )
          );

    return onSnapshot(
      casesQuery,
      (snapshot) => {
        const nextCases = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as any),
          }))
          .filter(
            (item) =>
              profile.role !== "volunteer" ||
              ![
                "reported",
                "closed",
              ].includes(
                item.status || "reported"
              )
          )
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() ||
                0) -
              (a.createdAt?.toMillis?.() ||
                0)
          );

        setCases(nextCases);
      }
    );
  }, [profile, user]);

  useEffect(() => {
    return onSnapshot(
      collection(db, "evacuation_centers"),
      (snapshot) => {
        setCenters(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...(item.data() as any),
          }))
        );
      }
    );
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
    >
      <View style={styles.hero}>
        <Text style={styles.title}>
          Response Map Status
        </Text>

        <Text style={styles.subtitle}>
          The web view provides incident and
          evacuation-center status. Open the Android
          app for GPS routing and the interactive
          native map.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Current Disaster Cases
      </Text>

      {cases.length === 0 ? (
        <Text style={styles.empty}>
          No visible cases.
        </Text>
      ) : (
        cases.map((item) => (
          <View
            key={item.id}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>
              {item.title || "Untitled case"}
            </Text>

            <Text style={styles.meta}>
              {item.category ||
                "Uncategorized"}{" "}
              ·{" "}
              {String(
                item.severity || "medium"
              ).toUpperCase()}
            </Text>

            <Text style={styles.meta}>
              {item.location ||
                "Location pending"}
            </Text>

            <Text style={styles.mapStatus}>
              {Number.isFinite(
                item.latitude
              ) &&
              Number.isFinite(
                item.longitude
              )
                ? "GPS mapped"
                : "Address only — GPS not captured"}
            </Text>

            <Text style={styles.status}>
              {String(
                item.status || "reported"
              )
                .replace("_", " ")
                .toUpperCase()}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>
        Evacuation Centers
      </Text>

      {centers.length === 0 ? (
        <Text style={styles.empty}>
          No evacuation centers published.
        </Text>
      ) : (
        centers.map((item) => (
          <View
            key={item.id}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>
              {item.name || "Evacuation Center"}
            </Text>

            <Text style={styles.meta}>
              {item.address ||
                item.barangay ||
                "Address pending"}
            </Text>

            <Text style={styles.status}>
              {String(
                item.status || "available"
              ).toUpperCase()}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
    padding: 24,
    paddingBottom: 60,
    backgroundColor: "#F1F5F9",
  },

  hero: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: "#0F766E",
  },

  title: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
  },

  subtitle: {
    marginTop: 7,
    color: "#CCFBF1",
    lineHeight: 20,
  },

  sectionTitle: {
    marginTop: 22,
    marginBottom: 10,
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "900",
  },

  empty: {
    color: "#64748B",
  },

  card: {
    padding: 16,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  cardTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },

  meta: {
    marginTop: 4,
    color: "#64748B",
  },

  mapStatus: {
    marginTop: 6,
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
  },

  status: {
    marginTop: 8,
    color: "#0F766E",
    fontSize: 11,
    fontWeight: "900",
  },
});