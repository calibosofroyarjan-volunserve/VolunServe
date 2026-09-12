import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    collection,
    onSnapshot,
} from "firebase/firestore";
import React, {
    useEffect,
    useState,
} from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { db } from "../../lib/firebase";
import { usePublicSettings } from "../../lib/usePublicSettings";

type EvacuationCenter = {
  id: string;
  name?: string;
  address?: string;
  barangay?: string;
  status?: string;
  capacity?: number;
  occupied?: number;
};

export default function PublicMapStatusWeb() {
  const router = useRouter();
  const { settings } = usePublicSettings();

  const [centers, setCenters] = useState<
    EvacuationCenter[]
  >([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      collection(db, "evacuation_centers"),
      (snapshot) => {
        const nextCenters = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<
              EvacuationCenter,
              "id"
            >),
          }))
          .sort((a, b) =>
            (a.name || "").localeCompare(
              b.name || ""
            )
          );

        setCenters(nextCenters);
        setLoading(false);
      },
      (error) => {
        console.log(
          "Public evacuation-center subscription error:",
          error
        );

        setLoading(false);
      }
    );
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
    >
      <View style={styles.hero}>
        <Ionicons
          name="map"
          size={34}
          color="#FFFFFF"
        />

        <Text style={styles.title}>
          Public Evacuation Information
        </Text>

        <Text style={styles.subtitle}>
          View official evacuation-center
          availability without exposing private
          resident or responder locations.
        </Text>
      </View>

      <View style={styles.notice}>
        <Ionicons
          name="shield-checkmark-outline"
          size={22}
          color="#0F766E"
        />

        <Text style={styles.noticeText}>
          Live disaster-case coordinates are
          available only to authorized users.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Evacuation Centers
      </Text>

      {loading ? (
        <ActivityIndicator
          size="large"
          color="#0F766E"
        />
      ) : centers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            No centers published yet
          </Text>

          <Text style={styles.emptyText}>
            {settings.emergencyHotline}
          </Text>
        </View>
      ) : (
        centers.map((center) => {
          const capacity = Number(
            center.capacity || 0
          );

          const occupied = Number(
            center.occupied || 0
          );

          const available =
            capacity > 0
              ? Math.max(
                  0,
                  capacity - occupied
                )
              : null;

          return (
            <View
              key={center.id}
              style={styles.card}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name="home"
                  size={22}
                  color="#0F766E"
                />

                <Text style={styles.cardTitle}>
                  {center.name ||
                    "Evacuation Center"}
                </Text>
              </View>

              <Text style={styles.meta}>
                {center.address ||
                  center.barangay ||
                  "Address pending"}
              </Text>

              <Text style={styles.status}>
                {String(
                  center.status || "available"
                ).toUpperCase()}
              </Text>

              {available !== null ? (
                <Text style={styles.capacity}>
                  {available} of {capacity} spaces
                  currently available
                </Text>
              ) : null}
            </View>
          );
        })
      )}

      <Pressable
        style={styles.signInButton}
        onPress={() => router.push("/login")}
      >
        <Text style={styles.signInText}>
          Sign In for Authorized Map Access
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 90,
    backgroundColor: "#F1F5F9",
  },

  hero: {
    borderRadius: 20,
    padding: 21,
    backgroundColor: "#0F766E",
  },

  title: {
    marginTop: 9,
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },

  subtitle: {
    marginTop: 7,
    color: "#CCFBF1",
    lineHeight: 20,
  },

  notice: {
    marginTop: 14,
    borderRadius: 14,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#ECFDF5",
  },

  noticeText: {
    flex: 1,
    color: "#065F46",
    lineHeight: 18,
    fontWeight: "600",
  },

  sectionTitle: {
    marginTop: 20,
    marginBottom: 10,
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "900",
  },

  emptyCard: {
    borderRadius: 15,
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  emptyTitle: {
    color: "#0F172A",
    fontWeight: "900",
  },

  emptyText: {
    marginTop: 5,
    color: "#64748B",
    lineHeight: 19,
  },

  card: {
    marginBottom: 11,
    borderRadius: 15,
    padding: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  cardTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },

  meta: {
    marginTop: 7,
    color: "#64748B",
  },

  status: {
    marginTop: 9,
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
  },

  capacity: {
    marginTop: 4,
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },

  signInButton: {
    minHeight: 49,
    marginTop: 9,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  signInText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});