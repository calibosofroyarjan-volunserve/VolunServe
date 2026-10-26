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
                  "rgba(0,65,64,0.45)",
                  "rgba(1,44,43,0.75)",
                  "rgba(1,21,30,0.94)",
                ]
              : [
                  "rgba(1,73,71,0.44)",
                  "rgba(4,70,64,0.60)",
                  "rgba(2,23,31,0.94)",
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
        <View style={[styles.heroContent, compact && styles.heroContentCompact, mobile && styles.heroContentMobile]}>
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
  screen: { flex:1,backgroundColor:"#EFF6F4" },
  screenContent: { flexGrow:1 },
  visualPanel: { position:"relative",overflow:"hidden",justifyContent:"space-between" },
  visualPanelDesktop: { width:"53%",minHeight:760,paddingHorizontal:52,paddingTop:48,paddingBottom:34 },
  visualPanelCompact: { width:"100%",minHeight:338,paddingHorizontal:32,paddingTop:25,paddingBottom:20 },
  visualImage: {
    width: "100%",
    height: "100%",
  },
  brandRow: { zIndex:2,flexDirection:"row",alignItems:"center" },
  logoContainer: { width:62,height:62,borderRadius:31,backgroundColor:"#FFFFFF",justifyContent:"center",alignItems:"center",marginRight:14,
  shadowColor:"#000000",shadowOpacity:0.12,shadowRadius:16,shadowOffset:{width:0,height:5} },
  logo: { width:55,height:55 },
  brandName: { color:"#FFFFFF",fontSize:28,fontFamily:"LoginInterExtraBold",letterSpacing:-0.8 },
  brandSubtitle: { color:"#CEF4E8",fontSize:12,fontFamily:"LoginInterMedium",marginTop:3,letterSpacing:0.1 },
  heroContent: { zIndex:2,maxWidth:630,marginTop:30,marginBottom:24 },
  statusBadge: { alignSelf:"flex-start",flexDirection:"row",alignItems:"center",backgroundColor:"rgba(231,255,249,0.94)",paddingHorizontal:13,paddingVertical:9,borderRadius:999,marginBottom:18 },
  statusText: { color:"#126759",fontSize:10,fontFamily:"LoginInterBold",letterSpacing:0.65,marginLeft:7 },
  heroTitle: { color:"#FFFFFF",fontSize:44,lineHeight:52,fontFamily:"LoginInterExtraBold",letterSpacing:-1.4,maxWidth:620,
  textShadowColor:"rgba(0,0,0,0.10)",textShadowRadius:9 },
  heroTitleCompact: { fontSize:29,lineHeight:36,letterSpacing:-0.55 },
  heroDescription: { color:"#E4F5F0",fontSize:15.5,lineHeight:26,fontFamily:"LoginInterMedium",maxWidth:550,marginTop:15 },
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
  carouselFooter: { zIndex:2,flexDirection:"row",alignItems:"center",gap:12,justifyContent:"flex-start" },
  dots: { flexDirection:"row",alignItems:"center",gap:7 },
  dot: { width:7,height:7,borderRadius:4,backgroundColor:"rgba(224,250,241,0.46)" },
  activeDot: { width:28,backgroundColor:"#3CE1AB" },
  slideCounter: { color:"#D5F1E9",fontSize:10.5,fontFamily:"LoginInterSemiBold",letterSpacing:1.1 },
  formPanel: { width:"47%",minHeight:760,paddingHorizontal:35,paddingVertical:34,alignItems:"center",justifyContent:"center",
  backgroundColor:"#F2F8F6" },
  formPanelCompact: { width:"100%",minHeight:0,paddingHorizontal:20,paddingVertical:26 },
  loginCard: { width:"100%",maxWidth:528,backgroundColor:"#FFFFFF",borderRadius:24,padding:36,
  borderWidth:1,borderColor:"#DCEAE4",shadowColor:"#163D38",shadowOpacity:0.09,
  shadowRadius:35,shadowOffset:{width:0,height:14} },
  loginCardCompact: { padding:29,borderRadius:21 },
  welcomeTitle: { color:"#122D31",fontSize:32,lineHeight:39,fontFamily:"LoginInterExtraBold",letterSpacing:-0.9,textAlign:"center" },
  welcomeSubtitle: { color:"#70847F",fontSize:13,lineHeight:21,fontFamily:"LoginInter",textAlign:"center",marginTop:5,marginBottom:21 },
  inputLabel: { color:"#25433F",fontSize:12,fontFamily:"LoginInterSemiBold",marginBottom:8,marginTop:12 },
  inputContainer: { minHeight:54,flexDirection:"row",alignItems:"center",paddingHorizontal:15,
  backgroundColor:"#FAFCFB",borderWidth:1,borderColor:"#D4E3DF",borderRadius:12 },
  inputContainerFocused: { borderColor:"#119878",borderWidth:1.7,backgroundColor:"#FFFFFF" },
  textInput: { flex:1,color:"#223B3B",fontSize:13.5,fontFamily:"LoginInter",marginLeft:10,minWidth:0,outlineStyle:"none" } as any,
  optionsRow: { flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:16,flexWrap:"wrap",gap:10 },
  rememberRow: { flexDirection:"row",alignItems:"center",gap:8 },
  checkbox: { width:19,height:19,borderRadius:5,borderWidth:1,borderColor:"#B2C9C0",
  alignItems:"center",justifyContent:"center" },
  checkboxChecked: { backgroundColor:"#087F63",borderColor:"#087F63" },
  rememberText: { color:"#536B65",fontFamily:"LoginInterMedium",fontSize:12 },
  forgotText: { color:"#078569",fontFamily:"LoginInterSemiBold",fontSize:12 },
  signInButton: { minHeight:55,marginTop:24,borderRadius:12,backgroundColor:"#078B72",
  flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10,
  shadowColor:"#057658",shadowOpacity:0.15,shadowRadius:10,shadowOffset:{width:0,height:5} },
  signInText: { color:"#FFFFFF",fontSize:14,fontFamily:"LoginInterBold" },
  buttonPressed: { opacity:0.76 },
  dividerRow: { flexDirection:"row",alignItems:"center",marginVertical:19 },
  divider: { flex:1,height:1,backgroundColor:"#E1EBE7" },
  dividerText: { color:"#8CA39A",fontSize:12,fontFamily:"LoginInter",marginHorizontal:12 },
  googleButton: { minHeight:54,borderRadius:12,borderWidth:1,borderColor:"#D7E5DF",
  backgroundColor:"#FFFFFF",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:10 },
  googleButtonDisabled: { opacity:0.6 },
  googleMark: { width:26,height:26,borderRadius:13,borderWidth:1,borderColor:"#ECF1EE",
  alignItems:"center",justifyContent:"center",backgroundColor:"#FFFFFF" },
  googleMarkText: { color:"#4285F4",fontSize:15,fontFamily:"LoginInterBold" },
  googleButtonText: { color:"#193336",fontSize:13,fontFamily:"LoginInterSemiBold" },
  guestButton: { minHeight:54,borderRadius:12,borderWidth:1,borderColor:"#A2D4C2",
  backgroundColor:"#FDFEFE",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9 },
  guestButtonSpaced: { marginTop:10 },
  guestButtonText: { color:"#1B4940",fontSize:13,fontFamily:"LoginInterSemiBold" },
  signupRow: { flexDirection:"row",justifyContent:"center",flexWrap:"wrap",marginTop:19,gap:5 },
  signupQuestion: { color:"#73847F",fontSize:12,fontFamily:"LoginInter" },
  signupLink: { color:"#07896A",fontSize:12,fontFamily:"LoginInterBold" },
  securityBox: { flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"#ECF9F3",
  borderRadius:12,padding:12,marginTop:20,borderWidth:1,borderColor:"#DCF0E5" },
  securityText: { color:"#648478",fontSize:10.5,lineHeight:16,fontFamily:"LoginInter" },
  // Mobile presentation: visible rotating carousel above the compact form.
  // All authentication, permissions, and redirects remain untouched.
  hideOnMobile: { display:"none" },
  // Balanced mobile carousel: clear separation between brand, slide text,
  // navigation controls, and the login card below it.
  visualPanelMobile: { width:"100%",height:265,minHeight:265,paddingHorizontal:18,
  paddingTop:17,paddingBottom:13,justifyContent:"space-between",
  borderBottomWidth:2,borderBottomColor:"#12B989" },
  visualPanelNarrow: { height:278,minHeight:278,paddingHorizontal:15 },
  heroContentMobile: { flex:1,justifyContent:"flex-end",marginTop:8,marginBottom:13,maxWidth:"100%" },
  statusBadgeMobile: { paddingHorizontal:9,paddingVertical:5,marginBottom:9 },
  statusTextMobile: { fontSize:8.5,letterSpacing:0.6 },
  heroTitleMobile: { fontSize:20,lineHeight:25,letterSpacing:-0.25,maxWidth:"100%" },
  heroTitleNarrow: { fontSize:18,lineHeight:23,letterSpacing:-0.2 },
  heroDescriptionMobile: { fontSize:11,lineHeight:17,marginTop:6,maxWidth:"100%" },
  heroDescriptionNarrow: { fontSize:10.5,lineHeight:16 },
  carouselFooterMobile: { width:"100%",gap:10,justifyContent:"center",minHeight:30 },
  slideCounterMobile: { fontSize:9.5 },
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
  brandRowMobile: { alignItems:"center" },
  logoContainerMobile: { width:43,height:43,borderRadius:22,marginRight:9 },
  logoMobile: { width:38,height:38 },
  brandNameMobile: { fontSize:20,lineHeight:25,letterSpacing:-0.5 },
  brandSubtitleMobile: { fontSize:9.2,lineHeight:13,marginTop:1 },
  formPanelMobile: { width:"100%",minHeight:0,flexGrow:1,paddingHorizontal:14,
  paddingTop:17,paddingBottom:25,alignItems:"center",justifyContent:"flex-start",
  backgroundColor:"#F3F8F6" },
  loginCardMobile: { width:"100%",maxWidth:480,borderWidth:1,borderColor:"#E0ECE6",
  borderRadius:19,paddingHorizontal:20,paddingTop:23,paddingBottom:25,
  shadowOpacity:0.03,shadowRadius:11,shadowOffset:{width:0,height:5},elevation:0 },
  welcomeTitleMobile: { fontSize:25,lineHeight:32,letterSpacing:-0.6,textAlign:"left" },
  welcomeSubtitleMobile: { fontSize:12,lineHeight:18,textAlign:"left",marginTop:4,marginBottom:12 },
  inputLabelMobile: { fontSize:11.5,marginTop:11,marginBottom:6 },
  inputContainerMobile: { minHeight:49,paddingHorizontal:12,borderRadius:10 },
  textInputMobile: { fontSize:13,minWidth:0 },
  optionsRowMobile: { marginTop:13,flexWrap:"wrap",gap:9 },
  optionTextMobile: { fontSize:11 },
  signInButtonMobile: { minHeight:50,marginTop:18,borderRadius:10 },
  dividerRowMobile: { marginVertical:15 },
  actionButtonMobile: { minHeight:48,borderRadius:10 },
  signupRowMobile: { marginTop:15 },
  // Typography-only adjustments for phone screens. The original carousel
  // dimensions, slide controls, login-card spacing, and auth handlers stay unchanged.
  signInTextMobile: { fontSize:13,fontFamily:"LoginInterBold" },
  googleButtonTextMobile: { fontSize:12.5,fontFamily:"LoginInterSemiBold" },
  guestButtonTextMobile: { fontSize:12.5,fontFamily:"LoginInterSemiBold" },
  signupQuestionMobile: { fontSize:11.5 },
  signupLinkMobile: { fontSize:11.5,fontFamily:"LoginInterBold" },
  heroContentCompact: { marginTop:20,marginBottom:12 },
  featureRow: { zIndex:2,flexDirection:"row",gap:10,paddingVertical:20,marginBottom:14,
  borderTopWidth:1,borderTopColor:"rgba(219,255,242,0.24)",borderBottomWidth:1,borderBottomColor:"rgba(219,255,242,0.24)" },
  featureItem: { flex:1,flexDirection:"row",alignItems:"center",gap:9,minWidth:0 },
  featureIcon: { width:36,height:36,borderRadius:11,justifyContent:"center",alignItems:"center",
  backgroundColor:"rgba(28,194,145,0.14)",borderWidth:1,borderColor:"rgba(138,241,206,0.24)" },
  featureCopy: { flex:1,minWidth:0,gap:3 },
  featureTitle: { color:"#FFFFFF",fontFamily:"LoginInterSemiBold",fontSize:11.5,lineHeight:16 },
  featureSubtitle: { color:"#BDDDD3",fontFamily:"LoginInter",fontSize:10,lineHeight:14 },
  footerArrow: { width:38,height:38,borderRadius:19,backgroundColor:"rgba(10,49,47,0.30)",
  borderWidth:1,borderColor:"rgba(232,255,248,0.42)",alignItems:"center",justifyContent:"center" },
  footerArrowMobile: { width:31,height:31,borderRadius:16 },
  formEyebrowRow: { flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10 },
  formEyebrowDash: { width:15,height:3,borderRadius:2,backgroundColor:"#10A47D" },
  formEyebrow: { fontSize:9,fontFamily:"LoginInterBold",color:"#188063",letterSpacing:1.8 },
  securityIcon: { width:34,height:34,borderRadius:10,backgroundColor:"#D9F5E7",alignItems:"center",justifyContent:"center" },
  securityCopy: { flex:1,gap:3 },
  securityTitle: { color:"#246455",fontSize:11,fontFamily:"LoginInterBold" },
});
