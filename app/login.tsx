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

const SLIDES = [
  {
    image: require("../assets/images/slide1.jpg"),
    title: "San Jose del Monte\nDisaster Monitoring",
    desc: "Real-time monitoring of hazards, floods, and emergency incidents across the city.",
  },
  {
    image: require("../assets/images/slide2.jpg"),
    title: "Volunteer Coordination\nNetwork",
    desc: "Organize trained volunteers and response teams during disasters and emergencies.",
  },
  {
    image: require("../assets/images/slide3.jpg"),
    title: "Community Assistance\nPlatform",
    desc: "Residents can request help, report hazards, and coordinate disaster response.",
  },
];

export default function Login() {
  const router = useRouter();

  const mainScrollRef = useRef<ScrollView>(null);
  const heroScrollRef = useRef<ScrollView>(null);

  const scrollX = useRef(new Animated.Value(0)).current;
  const zoomAnim = useRef(new Animated.Value(1)).current;

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
    Animated.loop(
      Animated.sequence([
        Animated.timing(zoomAnim, {
          toValue: 1.08,
          duration: 7000,
          useNativeDriver: true,
        }),
        Animated.timing(zoomAnim, {
          toValue: 1,
          duration: 7000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [zoomAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next = (heroIndexRef.current + 1) % SLIDES.length;

      heroScrollRef.current?.scrollTo({
        x: next * width,
        animated: true,
      });

      setHeroIndex(next);
      heroIndexRef.current = next;
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const goToSlide = (index: number) => {
    heroScrollRef.current?.scrollTo({
      x: index * width,
      animated: true,
    });
    setHeroIndex(index);
    heroIndexRef.current = index;
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
      style={styles.root}
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

      {/* TWO-PAGE HORIZONTAL SWIPE */}
      <ScrollView
        ref={mainScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        {/* PAGE 1: CAROUSEL */}
        <View style={styles.carouselPage}>
          <Animated.ScrollView
            ref={heroScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: false }
            )}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(
                e.nativeEvent.contentOffset.x / width
              );
              setHeroIndex(index);
              heroIndexRef.current = index;
            }}
          >
            {SLIDES.map((slide, index) => {
              const inputRange = [
                (index - 1) * width,
                index * width,
                (index + 1) * width,
              ];

              const translateX = scrollX.interpolate({
                inputRange,
                outputRange: [-30, 0, 30],
                extrapolate: "clamp",
              });

              return (
                <View
                  key={index}
                  style={styles.slide}
                >
                  <Animated.Image
                    source={slide.image}
                    resizeMode="cover"
                    style={[
                      styles.heroImage,
                      {
                        transform: [
                          { translateX },
                          { scale: zoomAnim },
                        ],
                      },
                    ]}
                  />

                  <LinearGradient
                    colors={[
                      "rgba(0,0,0,0.65)",
                      "rgba(0,0,0,0.25)",
                      "transparent",
                    ]}
                    style={styles.topFade}
                  />

                  <LinearGradient
                    colors={[
                      "transparent",
                      "rgba(0,0,0,0.55)",
                      "rgba(0,0,0,0.85)",
                      "#000000",
                    ]}
                    style={styles.bottomFade}
                  />

                  <View style={styles.heroContent}>
                    <View style={styles.systemBadge}>
                      <Ionicons
                        name="shield-checkmark"
                        size={14}
                        color="#10b981"
                      />
                      <Text style={styles.systemText}>
                        CITY RESPONSE SYSTEM
                      </Text>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>Operational</Text>
                    </View>

                    <Text style={styles.heroTitle}>{slide.title}</Text>

                    <Text style={styles.heroText}>{slide.desc}</Text>

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
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </Animated.ScrollView>

          {/* NETFLIX-STYLE DOTS WITHOUT WIDTH ANIMATION */}
          <View style={styles.dotsContainer}>
            {SLIDES.map((_, index) => (
              <Pressable
                key={index}
                onPress={() => goToSlide(index)}
                style={[
                  styles.dot,
                  index === heroIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </View>

        {/* PAGE 2: LOGIN */}
        <View style={styles.loginPage}>
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
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color="#64748b"
                />
                <TextInput
                  style={styles.inputField}
                  placeholder="Enter your password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
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
                  <Text style={styles.primaryButtonText}>Sign In</Text>
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
                  <Text style={styles.signupLink}> Sign up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },

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

  carouselPage: {
    width,
    height: height - 120,
  },

  slide: {
    width,
    height: "100%",
    overflow: "hidden",
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

  systemBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 14,
  },

  systemText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
    marginRight: 10,
  },

  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginRight: 6,
  },

  liveText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
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
    justifyContent: "center",
    gap: 8,
  },

  accessText: {
    color: "#ffffff",
    fontWeight: "700",
  },

  dotsContainer: {
    position: "absolute",
    bottom: 32,
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.45)",
    marginHorizontal: 6,
  },

  dotActive: {
    width: 28,
    borderRadius: 6,
    backgroundColor: "#ffffff",
  },

  loginPage: {
    width,
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