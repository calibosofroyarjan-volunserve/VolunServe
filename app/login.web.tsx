import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { useRouter } from "expo-router";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
} from "firebase/auth";
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
import { auth } from "../lib/firebase";
import {
  connectGoogleAccountWeb,
  getUserProfile,
  homeRouteForProfile,
  isApprovedProfile,
  loginUser,
  logoutUser,
} from "../lib/firebaseAuth";

// Keep original VolunServe photography; no generated imagery.
const FEATURES = [
  { icon: "alert-circle-outline" as const, title: "Emergency reports", subtitle: "Connect with responders" },
  { icon: "hand-left-outline" as const, title: "Assistance requests", subtitle: "Support when needed" },
  { icon: "people-outline" as const, title: "Community events", subtitle: "Make an impact" },
];
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
  useFonts({
    LoginInter: Inter_400Regular,
    LoginInterMedium: Inter_500Medium,
    LoginInterSemiBold: Inter_600SemiBold,
    LoginInterBold: Inter_700Bold,
    LoginInterExtraBold: Inter_800ExtraBold,
  });
  const { width, height } = useWindowDimensions();
  const compact = width < 960;
  const mobile = width < 640;
  const narrowMobile = width < 360;
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
    }, 7000;
    return () => clearInterval(timer);
  }, []);
  const changeSlide = (direction: number) => {
    setSlideIndex((current) => {
      return (current + direction + SLIDES.length) % SLIDES.length;
    });
  };
  const applySessionPersistence = async () => {
    await setPersistence(
      auth,
      rememberMe
        ? browserLocalPersistence
        : browserSessionPersistence
    );
  };
  const handleLogin = async () => {
    if (loading) return;
    if (!email.trim() || !password) {
      alert("Please enter your email address and password.");
      return;
    }
    try {
      setLoading(true);
      await applySessionPersistence();
      const { profile } = await loginUser(
        email.trim().toLowerCase(),
        password
      );
      router.replace(homeRouteForProfile(profile) as any);
    } catch (error: any) {
      alert(error?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };
  const handleGoogleLogin = async () => {
    if (loading) return;

    try {
      setLoading(true);
      await applySessionPersistence();

      const googleUser = await connectGoogleAccountWeb();
      let profile;
      try {
        profile = await getUserProfile(googleUser.uid);
      } catch (profileError: any) {
        if (String(profileError?.message || "").trim() === "Profile not found.") {
          // A Google identity is not a completed Resident account.
          // Keep the Firebase session so Signup can prefill Google details.
          router.replace("/signup");
          return;
        }
        throw profileError;
      }

      if (!isApprovedProfile(profile)) {
        await logoutUser();

        if (profile.status === "rejected") {
          throw new Error(
            profile.rejectedReason
              ? `Registration rejected: ${profile.rejectedReason}`
              : "Your registration was rejected. Please contact an administrator."
          );
        }

        if (profile.status === "suspended") {
          throw new Error(
            "Your account is suspended. Please contact an administrator."
          );
        }

        throw new Error(
          "This legacy account is still pending administrative review."
        );
      }

      router.replace(homeRouteForProfile(profile) as any);
    } catch (error: any) {
      try {
        if (!String(error?.message || "").toLowerCase().includes("cancelled")) {
          await logoutUser();
        }
      } catch {
        // Keep the original authentication error as the user-facing message.
      }

      alert(error?.message || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loading) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      alert(
        "Enter your email address first, then select Forgot password."
      );
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, cleanEmail);
      const isGmail = cleanEmail.endsWith("@gmail.com");
      const message = isGmail
        ? "Password reset request sent. If this Gmail account uses Email/Password sign-in, check Gmail and the Spam folder for the Firebase reset link. If this account was created with Google only, use Continue with Google instead."
        : "Password reset request sent. Check your inbox and Spam folder for the Firebase reset link. Google-only accounts should use Continue with Google.";
      if (typeof window !== "undefined" && isGmail) {
        const openGmail = window.confirm(
          `${message}\n\nOpen Gmail now?`
        );
        if (openGmail) {
          window.open(
            "https://mail.google.com/mail/u/0/#inbox",
            "_blank",
            "noopener,noreferrer"
          );
        }
      } else {
        alert(message);
      }
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "auth/invalid-email") {
        alert("Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        alert(
          "Too many reset attempts. Please wait and try again later."
        );
      } else {
        alert(
          error?.message ||
            "Unable to send the password reset email."
        );
      }
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
          mobile
            ? styles.visualPanelMobile
            : compact
              ? styles.visualPanelCompact
              : styles.visualPanelDesktop,
          narrowMobile && styles.visualPanelNarrow,
        ]}
        imageStyle={styles.visualImage}
      >
        <LinearGradient
          colors={
            mobile
              ? [
                  "rgba(2,64,61,0.48)",
                  "rgba(3,57,57,0.52)",
                  "rgba(2,24,39,0.88)",
                ]
              : [
                  "rgba(4,120,87,0.90)",
                  "rgba(15,118,110,0.70)",
                  "rgba(15,23,42,0.78)",
                ]
          }
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.brandRow, mobile && styles.brandRowMobile]}>
          <View style={[styles.logoContainer, mobile && styles.logoContainerMobile]}>
            <Image
              source={require("../assets/images/logo.png")}
              style={[styles.logo, mobile && styles.logoMobile]}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={[styles.brandName, mobile && styles.brandNameMobile]}>
              VolunServe
            </Text>
            <Text style={[styles.brandSubtitle, mobile && styles.brandSubtitleMobile]}>
              City Disaster Response Platform
            </Text>
          </View>
        </View>
        <View style={[styles.heroContent, mobile && styles.heroContentMobile]}>
          <View style={[styles.statusBadge, mobile && styles.statusBadgeMobile]}>
            <Ionicons
              name="shield-checkmark"
              size={17}
              color="#10b981"
            />
            <Text style={[styles.statusText, mobile && styles.statusTextMobile]}>
              BUILT FOR A SAFER COMMUNITY
            </Text>
          </View>
          <Text
            style={[
              styles.heroTitle,
              compact && styles.heroTitleCompact,
              mobile && styles.heroTitleMobile,
              narrowMobile && styles.heroTitleNarrow,
            ]}
          >
            {currentSlide.title}
          </Text>
          <Text style={[
            styles.heroDescription,
            mobile && styles.heroDescriptionMobile,
            narrowMobile && styles.heroDescriptionNarrow,
          ]}>
            {currentSlide.description}
          </Text>
        </View>
        {!compact && (
          <View style={styles.featureRow}>
            {FEATURES.map((item) => (
              <View key={item.title} style={styles.featureItem}>
                <View style={styles.featureIcon}>
                  <Ionicons name={item.icon} size={19} color="#5AF0C0" />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{item.title}</Text>
                  <Text style={styles.featureSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={[styles.carouselFooter, mobile && styles.carouselFooterMobile]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            style={[styles.footerArrow, mobile && styles.footerArrowMobile]}
            onPress={() => changeSlide(-1)}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={18} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.dots}>
            {SLIDES.map((_, index) => (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={`Show carousel slide ${index + 1} of ${SLIDES.length}`}
                accessibilityState={{ selected: index === slideIndex }}
                onPress={() => setSlideIndex(index)}
                style={[styles.dot,index === slideIndex && styles.activeDot]}
              />
            ))}
          </View>
          <Text style={[styles.slideCounter, mobile && styles.slideCounterMobile]}>
            {String(slideIndex + 1).padStart(2,"0")} / {String(SLIDES.length).padStart(2,"0")}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Next slide"
            style={[styles.footerArrow, mobile && styles.footerArrowMobile]}
            onPress={() => changeSlide(1)}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </ImageBackground>
      <View
        style={[
          styles.formPanel,
          compact && styles.formPanelCompact,
          mobile && styles.formPanelMobile,
        ]}
      >
        <View
          style={[
            styles.loginCard,
            compact && styles.loginCardCompact,
            mobile && styles.loginCardMobile,
          ]}
        >
          <View style={styles.formEyebrowRow}>
            <View style={styles.formEyebrowDash}/>
            <Text style={styles.formEyebrow}>VOLUNSERVE ACCOUNT</Text>
          </View>
          <Text style={[styles.welcomeTitle, mobile && styles.welcomeTitleMobile]}>
            Welcome back
          </Text>
          <Text style={[styles.welcomeSubtitle, mobile && styles.welcomeSubtitleMobile]}>
            Sign in to stay connected with your community.
          </Text>
          <Text style={[styles.inputLabel, mobile && styles.inputLabelMobile]}>
            Email Address
          </Text>
          <View
            style={[
              styles.inputContainer,
              mobile && styles.inputContainerMobile,
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
              editable={!loading}
              style={[styles.textInput, mobile && styles.textInputMobile]}
            />
          </View>
          <Text style={[styles.inputLabel, mobile && styles.inputLabelMobile]}>
            Password
          </Text>
          <View
            style={[
              styles.inputContainer,
              mobile && styles.inputContainerMobile,
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
              editable={!loading}
              style={[styles.textInput, mobile && styles.textInputMobile]}
            />
            <TouchableOpacity
              disabled={loading}
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
          <View style={[styles.optionsRow, mobile && styles.optionsRowMobile]}>
            <Pressable
              disabled={loading}
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
              <Text style={[styles.rememberText, mobile && styles.optionTextMobile]}>
                Remember me
              </Text>
            </Pressable>
            <TouchableOpacity
              disabled={loading}
              onPress={handleForgotPassword}
            >
              <Text style={[styles.forgotText, mobile && styles.optionTextMobile]}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          </View>
          <Pressable
            disabled={loading}
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.signInButton,
              mobile && styles.signInButtonMobile,
              (pressed || loading) &&
                styles.buttonPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={[styles.signInText, mobile && styles.signInTextMobile]}>
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
          <View style={[styles.dividerRow, mobile && styles.dividerRowMobile]}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>
          <TouchableOpacity
            style={[
              styles.googleButton,
              mobile && styles.actionButtonMobile,
              loading && styles.googleButtonDisabled,
            ]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <View style={styles.googleMark}>
              <Text style={styles.googleMarkText}>G</Text>
            </View>
            <Text style={[styles.googleButtonText, mobile && styles.googleButtonTextMobile]}>Continue with Google</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.guestButton,
              styles.guestButtonSpaced,
              mobile && styles.actionButtonMobile,
            ]}
            onPress={() => router.replace("/public")}
            disabled={loading}
          >
            <Ionicons
              name="person-outline"
              size={21}
              color="#0f172a"
            />
            <Text style={[styles.guestButtonText, mobile && styles.guestButtonTextMobile]}>
              Continue as Guest
            </Text>
          </TouchableOpacity>
          <View style={[styles.signupRow, mobile && styles.signupRowMobile]}>
            <Text style={[styles.signupQuestion, mobile && styles.signupQuestionMobile]}>
              Don&apos;t have an account?
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/signup")}
            >
              <Text style={[styles.signupLink, mobile && styles.signupLinkMobile]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.securityBox, mobile && styles.hideOnMobile]}>
            <View style={styles.securityIcon}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#078365"/>
            </View>
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>Protected VolunServe access</Text>
              <Text style={styles.securityText}>
                For registered Residents, Volunteers, and administrators.
              </Text>
            </View>
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
  googleButton: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  googleMarkText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "900",
  },
  googleButtonText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
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
  guestButtonSpaced: {
    marginTop: 12,
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
  // Mobile presentation: visible rotating carousel above the compact form.
  // All authentication, permissions, and redirects remain untouched.
  hideOnMobile: {
    display: "none",
  },
  // Balanced mobile carousel: clear separation between brand, slide text,
  // navigation controls, and the login card below it.
  visualPanelMobile: {
    width: "100%",
    height: 302,
    minHeight: 302,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    justifyContent: "space-between",
    borderBottomWidth: 3,
    borderBottomColor: "#10b981",
  },
  visualPanelNarrow: {
    height: 318,
    minHeight: 318,
    paddingHorizontal: 15,
  },
  heroContentMobile: {
    flex: 1,
    justifyContent: "flex-end",
    marginTop: 14,
    marginBottom: 13,
    paddingTop: 0,
    maxWidth: "100%",
  },
  statusBadgeMobile: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 11,
    backgroundColor: "rgba(255,255,255,0.96)",
  },
  statusTextMobile: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  heroTitleMobile: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: 0.18,
    maxWidth: "100%",
  },
  heroTitleNarrow: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0.12,
  },
  heroDescriptionMobile: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "500",
    letterSpacing: 0.18,
    marginTop: 8,
    maxWidth: "100%",
  },
  heroDescriptionNarrow: {
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 0.12,
  },
  carouselFooterMobile: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 30,
  },
  slideCounterMobile: {
    fontSize: 11,
    marginLeft: 4,
  },
  mobileSlideArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.50)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandRowMobile: {
    alignItems: "center",
  },
  logoContainerMobile: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
  },
  logoMobile: {
    width: 38,
    height: 38,
  },
  brandNameMobile: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: 0.12,
  },
  brandSubtitleMobile: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
    letterSpacing: 0.12,
    marginTop: 2,
  },
  formPanelMobile: {
    width: "100%",
    minHeight: 0,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 22,
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: "#f3f8f7",
  },
  loginCardMobile: {
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderColor: "#e2ebe8",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 26,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  welcomeTitleMobile: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: 0.12,
    textAlign: "left",
  },
  welcomeSubtitleMobile: {
    fontSize: 12.5,
    lineHeight: 19,
    letterSpacing: 0.15,
    textAlign: "left",
    marginTop: 3,
    marginBottom: 12,
  },
  inputLabelMobile: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.15,
    marginTop: 11,
    marginBottom: 6,
  },
  inputContainerMobile: {
    minHeight: 49,
    paddingHorizontal: 13,
    borderRadius: 12,
  },
  textInputMobile: {
    fontSize: 14.5,
    letterSpacing: 0.14,
    minWidth: 0,
  },
  optionsRowMobile: {
    marginTop: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  optionTextMobile: {
    fontSize: 12,
    letterSpacing: 0.08,
  },
  signInButtonMobile: {
    minHeight: 50,
    marginTop: 17,
    borderRadius: 12,
  },
  dividerRowMobile: {
    marginVertical: 16,
  },
  actionButtonMobile: {
    minHeight: 49,
    borderRadius: 12,
  },
  signupRowMobile: {
    marginTop: 16,
  },
  // Typography-only adjustments for phone screens. The original carousel
  // dimensions, slide controls, login-card spacing, and auth handlers stay unchanged.
  signInTextMobile: {
    fontSize: 14.5,
    fontWeight: "800",
    letterSpacing: 0.18,
  },
  googleButtonTextMobile: {
    fontSize: 13.5,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  guestButtonTextMobile: {
    fontSize: 13.5,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  signupQuestionMobile: {
    fontSize: 12.5,
    letterSpacing: 0.12,
  },
  signupLinkMobile: {
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 0.12,
  },
});
