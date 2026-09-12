import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    ImageBackground,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import {
    homeRouteForProfile,
    loginUser,
} from "../lib/firebaseAuth";

const SLIDES = [
  {
    image: require("../assets/images/slide1.jpg"),
    title: "Together for a Safer Community",
    description:
      "Report hazards, request assistance, and stay connected with your community.",
  },
  {
    image: require("../assets/images/slide2.jpg"),
    title: "Report Emergencies Quickly",
    description:
      "Send important incident details and locations to local responders.",
  },
  {
    image: require("../assets/images/slide3.jpg"),
    title: "Help. Support. Rebuild.",
    description:
      "Volunteer, provide support, and help communities recover together.",
  },
];

export default function WebLogin() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const compact = width < 900;

  const [slideIndex, setSlideIndex] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [focusedInput, setFocusedInput] = useState<
    "email" | "password" | null
  >(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((current) => (current + 1) % SLIDES.length);
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const changeSlide = (direction: number) => {
    setSlideIndex((current) => {
      return (current + direction + SLIDES.length) % SLIDES.length;
    });
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      alert("Please enter your email address and password.");
      return;
    }

    try {
      setLoading(true);

      const { profile } = await loginUser(
        email.trim(),
        password
      );

      router.replace(homeRouteForProfile(profile));
    } catch (error: any) {
      alert(error?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const currentSlide = SLIDES[slideIndex];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.screenContent,
        {
          minHeight: height,
          flexDirection: compact ? "column" : "row",
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <ImageBackground
        source={currentSlide.image}
        resizeMode="cover"
        style={[
          styles.visualPanel,
          compact
            ? styles.visualPanelCompact
            : styles.visualPanelDesktop,
        ]}
        imageStyle={styles.visualImage}
      >
        <LinearGradient
          colors={[
            "rgba(4,120,87,0.90)",
            "rgba(15,118,110,0.70)",
            "rgba(15,23,42,0.78)",
          ]}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.brandRow}>
          <View style={styles.logoContainer}>
            <Image
              source={require("../assets/images/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View>
            <Text style={styles.brandName}>VolunServe</Text>
            <Text style={styles.brandSubtitle}>
              City Disaster Response Platform
            </Text>
          </View>
        </View>

        <View style={styles.heroContent}>
          <View style={styles.statusBadge}>
            <Ionicons
              name="shield-checkmark"
              size={17}
              color="#10b981"
            />
            <Text style={styles.statusText}>
              Community Response System
            </Text>
          </View>

          <Text
            style={[
              styles.heroTitle,
              compact && styles.heroTitleCompact,
            ]}
          >
            {currentSlide.title}
          </Text>

          <Text style={styles.heroDescription}>
            {currentSlide.description}
          </Text>
        </View>

        {!compact && (
          <>
            <TouchableOpacity
              style={[styles.arrowButton, styles.leftArrow]}
              onPress={() => changeSlide(-1)}
            >
              <Ionicons
                name="chevron-back"
                size={25}
                color="#0f172a"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.arrowButton, styles.rightArrow]}
              onPress={() => changeSlide(1)}
            >
              <Ionicons
                name="chevron-forward"
                size={25}
                color="#0f172a"
              />
            </TouchableOpacity>
          </>
        )}

        <View style={styles.carouselFooter}>
          <View style={styles.dots}>
            {SLIDES.map((_, index) => (
              <Pressable
                key={index}
                onPress={() => setSlideIndex(index)}
                style={[
                  styles.dot,
                  index === slideIndex && styles.activeDot,
                ]}
              />
            ))}
          </View>

          <Text style={styles.slideCounter}>
            {slideIndex + 1} / {SLIDES.length}
          </Text>
        </View>
      </ImageBackground>

      <View
        style={[
          styles.formPanel,
          compact && styles.formPanelCompact,
        ]}
      >
        <View
          style={[
            styles.loginCard,
            compact && styles.loginCardCompact,
          ]}
        >
          <Text style={styles.welcomeTitle}>Welcome back</Text>

          <Text style={styles.welcomeSubtitle}>
            Sign in to continue to VolunServe
          </Text>

          <Text style={styles.inputLabel}>
            Email Address
          </Text>

          <View
            style={[
              styles.inputContainer,
              focusedInput === "email" &&
                styles.inputContainerFocused,
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={21}
              color="#64748b"
            />

            <TextInput
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusedInput("email")}
              onBlur={() => setFocusedInput(null)}
              placeholder="Enter your email address"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              style={styles.textInput}
            />
          </View>

          <Text style={styles.inputLabel}>Password</Text>

          <View
            style={[
              styles.inputContainer,
              focusedInput === "password" &&
                styles.inputContainerFocused,
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={21}
              color="#64748b"
            />

            <TextInput
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedInput("password")}
              onBlur={() => setFocusedInput(null)}
              onSubmitEditing={handleLogin}
              placeholder="Enter your password"
              placeholderTextColor="#94a3b8"
              secureTextEntry={!showPassword}
              returnKeyType="done"
              style={styles.textInput}
            />

            <TouchableOpacity
              onPress={() => setShowPassword((current) => !current)}
            >
              <Ionicons
                name={
                  showPassword
                    ? "eye-off-outline"
                    : "eye-outline"
                }
                size={21}
                color="#64748b"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.optionsRow}>
            <Pressable
              style={styles.rememberRow}
              onPress={() =>
                setRememberMe((current) => !current)
              }
            >
              <View
                style={[
                  styles.checkbox,
                  rememberMe && styles.checkboxChecked,
                ]}
              >
                {rememberMe && (
                  <Ionicons
                    name="checkmark"
                    size={15}
                    color="#ffffff"
                  />
                )}
              </View>

              <Text style={styles.rememberText}>
                Remember me
              </Text>
            </Pressable>

            <TouchableOpacity
              onPress={() =>
                alert(
                  "Password recovery will be added next."
                )
              }
            >
              <Text style={styles.forgotText}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          </View>

          <Pressable
            disabled={loading}
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.signInButton,
              (pressed || loading) &&
                styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.signInText}>
                  Sign In
                </Text>

                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color="#ffffff"
                />
              </>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={() => router.replace("/public")}
          >
            <Ionicons
              name="person-outline"
              size={21}
              color="#0f172a"
            />

            <Text style={styles.guestButtonText}>
              Continue as Guest
            </Text>
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.signupQuestion}>
              Don&apos;t have an account?
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/signup")}
            >
              <Text style={styles.signupLink}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.securityBox}>
            <Ionicons
              name="shield-checkmark"
              size={22}
              color="#0f766e"
            />

            <Text style={styles.securityText}>
              Secure access for residents, volunteers,
              and administrators.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef6f8",
  },

  screenContent: {
    flexGrow: 1,
  },

  visualPanel: {
    position: "relative",
    overflow: "hidden",
    justifyContent: "space-between",
  },

  visualPanelDesktop: {
    width: "55%",
    minHeight: 720,
    padding: 48,
  },

  visualPanelCompact: {
    width: "100%",
    minHeight: 380,
    padding: 25,
  },

  visualImage: {
    width: "100%",
    height: "100%",
  },

  brandRow: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
  },

  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },

  logo: {
    width: 56,
    height: 56,
  },

  brandName: {
    color: "#ffffff",
    fontSize: 29,
    fontWeight: "900",
  },

  brandSubtitle: {
    color: "#d1fae5",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },

  heroContent: {
    zIndex: 2,
    maxWidth: 650,
    marginBottom: 80,
  },

  statusBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 20,
  },

  statusText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 7,
  },

  heroTitle: {
    color: "#ffffff",
    fontSize: 52,
    lineHeight: 59,
    fontWeight: "900",
    maxWidth: 650,
  },

  heroTitleCompact: {
    fontSize: 32,
    lineHeight: 38,
  },

  heroDescription: {
    color: "#ecfeff",
    fontSize: 18,
    lineHeight: 29,
    fontWeight: "500",
    maxWidth: 570,
    marginTop: 17,
  },

  arrowButton: {
    position: "absolute",
    top: "50%",
    zIndex: 3,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },

  leftArrow: {
    left: 22,
  },

  rightArrow: {
    right: 22,
  },

  carouselFooter: {
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  dots: {
    flexDirection: "row",
    alignItems: "center",
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.48)",
    marginHorizontal: 5,
  },

  activeDot: {
    width: 30,
    backgroundColor: "#ffffff",
  },

  slideCounter: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 14,
  },

  formPanel: {
    width: "45%",
    minHeight: 720,
    padding: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fbfc",
  },

  formPanelCompact: {
    width: "100%",
    minHeight: 0,
    padding: 20,
  },

  loginCard: {
    width: "100%",
    maxWidth: 540,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 42,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 30,
    shadowOffset: {
      width: 0,
      height: 16,
    },
  },

  loginCardCompact: {
    padding: 25,
    borderRadius: 22,
  },

  welcomeTitle: {
    color: "#0f172a",
    fontSize: 37,
    fontWeight: "900",
    textAlign: "center",
  },

  welcomeSubtitle: {
    color: "#64748b",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 27,
  },

  inputLabel: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 13,
  },

  inputContainer: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
  },

  inputContainerFocused: {
    borderColor: "#0f766e",
    borderWidth: 2,
  },

  textInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 15,
    marginLeft: 11,
    outlineStyle: "none",
  } as any,

  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 17,
  },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  checkboxChecked: {
    backgroundColor: "#0f766e",
    borderColor: "#0f766e",
  },

  rememberText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },

  forgotText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
  },

  signInButton: {
    minHeight: 60,
    marginTop: 27,
    borderRadius: 14,
    backgroundColor: "#0f8f83",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  signInText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },

  buttonPressed: {
    opacity: 0.76,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 23,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
  },

  dividerText: {
    color: "#94a3b8",
    fontSize: 13,
    marginHorizontal: 13,
  },

  guestButton: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#0284c7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },

  guestButtonText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
  },

  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 24,
    gap: 5,
  },

  signupQuestion: {
    color: "#64748b",
    fontSize: 14,
  },

  signupLink: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "800",
  },

  securityBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderRadius: 14,
    padding: 14,
    marginTop: 25,
  },

  securityText: {
    flex: 1,
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 10,
  },
});