import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { loginUser } from "../lib/firebaseAuth";

const { width, height } = Dimensions.get("window");

const IMAGES = [
  require("../assets/images/slide1.jpg"),
  require("../assets/images/slide2.jpg"),
  require("../assets/images/slide3.jpg"),
];

export default function Login() {
  const router = useRouter();
  const mainScrollRef = useRef<ScrollView>(null);
  const heroScrollRef = useRef<any>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [heroIndex, setHeroIndex] = useState(0);
  const heroIndexRef = useRef(0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    heroIndexRef.current = heroIndex;
  }, [heroIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      const current = heroIndexRef.current;
      const next = (current + 1) % IMAGES.length;

      heroScrollRef.current?.scrollTo({ x: next * width, animated: true });
      setHeroIndex(next);
      heroIndexRef.current = next;
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const goToSlide = (i: number) => {
    heroScrollRef.current?.scrollTo({ x: i * width, animated: true });
    setHeroIndex(i);
    heroIndexRef.current = i;
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      await loginUser(email.trim(), password);
      router.replace("/(tabs)");
    } catch (error: any) {
      alert(error.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f1f5f9" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.headerLogo}
        />
        <Text style={styles.headerTitle}>VolunServe</Text>
      </View>
      <View style={styles.headerAccent} />

      <View style={{ flex: 1 }}>
        <ScrollView
          ref={mainScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
        >
          {/* HERO */}
          <View style={{ width, height: height - 120 }}>
            <Animated.ScrollView
              ref={heroScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: false }
              )}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(
                  e.nativeEvent.contentOffset.x / width
                );
                setHeroIndex(i);
                heroIndexRef.current = i;
              }}
            >
              {IMAGES.map((img, index) => {
                const inputRange = [
                  (index - 1) * width,
                  index * width,
                  (index + 1) * width,
                ];

                const translateX = scrollX.interpolate({
                  inputRange,
                  outputRange: [-40, 0, 40],
                  extrapolate: "clamp",
                });

                const scale = scrollX.interpolate({
                  inputRange,
                  outputRange: [1.08, 1, 1.08],
                  extrapolate: "clamp",
                });

                return (
                  <View key={index} style={{ width, height: "100%", overflow: "hidden" }}>
                    <Animated.Image
                      source={img}
                      resizeMode="cover"
                      style={[
                        styles.heroImage,
                        { transform: [{ translateX }, { scale }] },
                      ]}
                    />

                    {/* TOP FADE */}
                    <LinearGradient
                      colors={[
                        "rgba(0,0,0,0.65)",
                        "rgba(0,0,0,0.25)",
                        "transparent",
                      ]}
                      style={styles.topFade}
                    />

                    {/* BALANCED CIVIC CINEMATIC BOTTOM FADE */}
                    <LinearGradient
                      colors={[
                        "transparent",
                        "rgba(0,0,0,0.55)",
                        "rgba(0,0,0,0.82)",
                        "#000000",
                      ]}
                      style={styles.bottomFade}
                    />
                  </View>
                );
              })}
            </Animated.ScrollView>

            {/* HERO CONTENT */}
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>
                San Jose del Monte Disaster Response Network
              </Text>

              <Text style={styles.heroText}>
                Structured volunteer coordination and transparent logistics monitoring for LGU operations.
              </Text>

              <TouchableOpacity
                style={styles.accessButton}
                onPress={() =>
                  mainScrollRef.current?.scrollTo({
                    x: width,
                    animated: true,
                  })
                }
              >
                <Text style={styles.accessText}>Access Portal</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* ANIMATED CLICKABLE SLIDEBAR */}
            <View style={styles.dotsContainer}>
              {IMAGES.map((_, i) => {
                const inputRange = [
                  (i - 1) * width,
                  i * width,
                  (i + 1) * width,
                ];

                const w = scrollX.interpolate({
                  inputRange,
                  outputRange: [8, 26, 8],
                  extrapolate: "clamp",
                });

                const opacity = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.35, 1, 0.35],
                  extrapolate: "clamp",
                });

                return (
                  <Pressable key={i} onPress={() => goToSlide(i)}>
                    <Animated.View
                      style={[
                        styles.dot,
                        { width: w, opacity },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* LOGIN */}
          <View style={{ width }}>
            <ScrollView
              contentContainerStyle={styles.loginScroll}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.loginCard}>
                <Text style={styles.welcomeTitle}>Welcome Back</Text>
                <Text style={styles.welcomeSub}>
                  Sign in to continue making a difference
                </Text>

                <Text style={styles.inputLabel}>Email Address</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    focused === "email" && styles.inputFocused,
                  ]}
                >
                  <Ionicons name="mail-outline" size={18} color="#64748b" />
                  <TextInput
                    style={styles.inputField}
                    placeholder="your.email@example.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                  />
                </View>

                <Text style={styles.inputLabel}>Password</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    focused === "password" && styles.inputFocused,
                  ]}
                >
                  <Ionicons name="lock-closed-outline" size={18} color="#64748b" />
                  <TextInput
                    style={styles.inputField}
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={
                        showPassword
                          ? "eye-off-outline"
                          : "eye-outline"
                      }
                      size={18}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && { opacity: 0.9 },
                  ]}
                  onPress={handleLogin}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Sign In
                    </Text>
                  )}
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.orText}>or</Text>
                  <View style={styles.divider} />
                </View>

                <TouchableOpacity
                  style={styles.guestButton}
                  onPress={() => router.replace("/public")}
                >
                  <Ionicons name="globe-outline" size={18} color="#334155" />
                  <Text style={styles.guestText}>
                    Continue as Guest (Public Mode)
                  </Text>
                </TouchableOpacity>

                <View style={styles.signupRow}>
                  <Text style={styles.signupText}>
                    Don’t have an account?
                  </Text>
                  <TouchableOpacity onPress={() => router.push("/signup")}>
                    <Text style={styles.signupLink}>
                      {" "}Sign up
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 52,
    paddingBottom: 20,
    elevation: 10,
  },
  headerAccent: {
    height: 4,
    backgroundColor: "#047857",
  },
  headerLogo: {
    width: 30,
    height: 30,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0f172a",
  },
  heroImage: {
    width,
    height: "100%",
  },
  topFade: {
    position: "absolute",
    top: 0,
    width: "100%",
    height: 160,
  },
  bottomFade: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 360,
  },
  heroContent: {
    position: "absolute",
    bottom: 140,
    left: 28,
    right: 28,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroText: {
    fontSize: 15,
    color: "#ffffff",
    marginTop: 12,
    lineHeight: 24,
  },
  accessButton: {
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accessText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  dotsContainer: {
    position: "absolute",
    bottom: 28,
    flexDirection: "row",
    alignSelf: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    marginHorizontal: 6,
  },

  loginScroll: {
    paddingVertical: 40,
    paddingBottom: 120,
  },
  loginCard: {
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    padding: 28,
    borderRadius: 26,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 20,
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0f172a",
  },
  welcomeSub: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
    marginTop: 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  inputFocused: {
    borderColor: "#047857",
  },
  inputField: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: "#0f172a",
  },
  primaryButton: {
    backgroundColor: "#064e3b",
    marginTop: 28,
    paddingVertical: 20,
    borderRadius: 22,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 22,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  orText: {
    marginHorizontal: 10,
    color: "#64748b",
  },
  guestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  guestText: {
    marginLeft: 8,
    fontWeight: "600",
    color: "#334155",
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  signupText: {
    color: "#64748b",
  },
  signupLink: {
    color: "#047857",
    fontWeight: "700",
  },
});