import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRootNavigationState, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SideDrawer from "../../components/SideDrawer";
import { getUserProfile, onAuthChange, UserProfile } from "../../lib/firebaseAuth";

const { width } = Dimensions.get("window");

export default function Dashboard() {
  const router = useRouter();
  const rootNavState = useRootNavigationState(); // ✅ ADDED
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  // Animated color for "VolunServe SJDM"
  const colorAnim = useRef(new Animated.Value(0)).current;

  // ✅ Keep your animations as-is (separate effect)
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.timing(colorAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: false,
      })
    ).start();
  }, []);

  // ✅ FIX: only start auth + navigation when root nav is mounted
  useEffect(() => {
    if (!rootNavState?.key) return; // ✅ ADDED GUARD (prevents crash)

    const unsub = onAuthChange(async (user) => {
      if (!user) {
        // Delay one tick to ensure router is ready everywhere
        setTimeout(() => router.replace("/login"), 0);
        return;
      }

      const data = await getUserProfile(user.uid);
      setProfile(data);
      setLoading(false);
    });

    return unsub;
  }, [rootNavState?.key]);

  // ✅ If router isn't ready yet, show loading (prevents early render crash)
  if (!rootNavState?.key || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const firstName = profile?.fullName?.split(" ")[0] || "User";

  const blobTranslate = scrollY.interpolate({
    inputRange: [0, 400],
    outputRange: [0, -60],
    extrapolate: "clamp",
  });

  const animatedBrandColor = colorAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["#8b5cf6", "#6366f1", "#2fa9a0"],
  });

  return (
    <>
      <View style={styles.root}>
        {/* Background Blobs */}
        <Animated.View
          style={[styles.blob1, { transform: [{ translateY: blobTranslate }] }]}
        />
        <Animated.View
          style={[styles.blob2, { transform: [{ translateY: blobTranslate }] }]}
        />

        {/* HEADER */}
        <View style={styles.whiteHeader}>
          <View style={styles.brandRow}>
            <View style={styles.logoWrap}>
              <Image
                source={require("../../assets/images/logo.png")}
                style={styles.logo}
              />
            </View>
            <View>
              <Text style={styles.brandTitle}>VolunServe</Text>
              <Text style={styles.brandSub}>
                Disaster Relief & Emergency Response
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={() => setDrawerOpen(true)}>
            <Ionicons name="menu" size={26} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <Animated.ScrollView
          contentContainerStyle={styles.container}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          <View style={styles.heroSection}>
            <Text style={styles.welcomePlain}>Welcome {firstName} to</Text>

            <Animated.Text style={[styles.welcomeBrand, { color: animatedBrandColor }]}>
              VolunServe SJDM
            </Animated.Text>

            <Text style={styles.subText}>
              San Jose del Monte's disaster relief and emergency response network.
              Together, we prepare for emergencies and support our community when
              disaster strikes.
            </Text>
          </View>

          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <ModuleCard
              icon="heart"
              title="Donate Relief Funds"
              desc="Support disaster relief efforts with secure donations."
              colors={["#c4b5fd", "#a78bfa"]}
              onPress={() => router.push("/donation")}
            />

            <ModuleCard
              icon="people"
              title="Be a Volunteer"
              desc="Join emergency response teams and help residents."
              colors={["#86efac", "#34d399"]}
              onPress={() => router.push("/volunteer")}
            />

            <ModuleCard
              icon="home"
              title="Request Emergency Aid"
              desc="Submit a request for immediate assistance."
              colors={["#5fd0c7", "#2fa9a0"]}
              onPress={() => router.push("/resident")}
            />

            <ModuleCard
              icon="warning"
              title="Disaster Response"
              desc="Submit disaster reports with photo and video proof."
              colors={["#f87171", "#dc2626"]}
              onPress={() => router.push("/disaster-response")}
            />

            <ModuleCard
              icon="map"
              title="Live Map Tracking"
              desc="Monitor ongoing emergency events in real-time."
              colors={["#bfdbfe", "#60a5fa"]}
              onPress={() => router.push("/map-tracking")}
            />
          </Animated.View>
        </Animated.ScrollView>
      </View>

      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        name={profile?.fullName || "User"}
        email={profile?.email || ""}
      />
    </>
  );
}

/* Luxury Glass Module */
function ModuleCard({ icon, title, desc, onPress, colors }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
        }
        activeOpacity={0.9}
      >
        <LinearGradient colors={colors} style={styles.card}>
          <Animated.View
            style={[styles.shimmer, { transform: [{ translateX: shimmerTranslate }] }]}
          />
          <View style={styles.cardContent}>
            <View style={styles.iconWrap}>
              <Ionicons name={icon} size={22} color="#ffffff" />
            </View>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDesc}>{desc}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fb" },

  blob1: {
    position: "absolute",
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 120,
    backgroundColor: "#c4b5fd",
    opacity: 0.25,
  },

  blob2: {
    position: "absolute",
    bottom: 100,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 140,
    backgroundColor: "#86efac",
    opacity: 0.25,
  },

  whiteHeader: {
    backgroundColor: "#2fa9a0",
    paddingTop: 55,
    paddingHorizontal: 24,
    paddingBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  brandRow: { flexDirection: "row", alignItems: "center" },

  logoWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  logo: { width: 38, height: 38 },

  brandTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#ffffff",
  },

  brandSub: { fontSize: 12, color: "#e5e7eb" },

  container: { paddingHorizontal: 24, paddingBottom: 80 },

  heroSection: {
    alignItems: "center",
    marginTop: 30,
    marginBottom: 40,
  },

  welcomePlain: {
    fontSize: 22,
    fontWeight: "400",
    color: "#4b5563",
    marginBottom: 4,
  },

  welcomeBrand: {
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },

  subText: {
    fontSize: 16,
    textAlign: "center",
    color: "#4b5563",
    lineHeight: 24,
    paddingHorizontal: 10,
    marginTop: 12,
  },

  card: {
    borderRadius: 30,
    paddingVertical: 30,
    paddingHorizontal: 26,
    marginBottom: 24,
    overflow: "hidden",
  },

  shimmer: {
    position: "absolute",
    width: 120,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.2)",
    transform: [{ skewX: "-20deg" }],
  },

  cardContent: { gap: 10 },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },

  cardDesc: { fontSize: 15, color: "#1f2937" },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});