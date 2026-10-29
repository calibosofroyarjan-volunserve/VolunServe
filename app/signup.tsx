import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { signUpUser } from "../lib/firebaseAuth";
import { SJDM_BARANGAYS } from "../constants/sjdmBarangays";

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "com.froyarjan123.volunserve",
});

type Step = 1 | 2 | 3 | 4;

type FormState = {
  lastName: string;
  firstName: string;
  middleName: string;
  noMiddleName: boolean;
  dateOfBirth: Date | null;
  phoneLocal: string;
  email: string;
  region: string;
  province: string;
  city: string;
  barangay: string;
  occupationCategory: string;
  occupationSpecialization: string;
  occupationOther: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  confirmReview: boolean;
};

const COLORS = {
  primary: "#0f766e",
  primaryDark: "#115e59",
  primarySoft: "#ccfbf1",
  accent: "#2563eb",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#f59e0b",
  text: "#0f172a",
  muted: "#64748b",
  lightText: "#94a3b8",
  border: "#e2e8f0",
  card: "#ffffff",
  bg: "#f1f5f9",
  field: "#f8fafc",
};

const FIXED_REGION = "Region III – Central Luzon";
const FIXED_PROVINCE = "Bulacan";
const FIXED_CITY = "City of San Jose del Monte";

const ALLOWED_PROVINCES = [
  "Bulacan",
  "BULACAN",
  "Province of Bulacan",
];

const ALLOWED_CITIES = [
  "City of San Jose del Monte",
  "CITY OF SAN JOSE DEL MONTE",
  "City of San Jose Del Monte",
  "San Jose del Monte",
  "San Jose Del Monte",
  "SAN JOSE DEL MONTE",
];

const isAllowedProvince = (value: string) =>
  ALLOWED_PROVINCES.includes(value);

const isAllowedCity = (value: string) =>
  ALLOWED_CITIES.includes(value);

const OCCUPATION_OPTIONS = [
  "Medical Professional",
  "Emergency Responder",
  "Government Employee",
  "Student",
  "Private Sector Employee",
  "NGO Worker",
  "Skilled Worker",
  "Unemployed",
  "Retired",
  "Other (Specify)",
];

const SPECIALIZATIONS: Record<string, string[]> = {
  "Medical Professional": ["Doctor", "Nurse", "Midwife", "Medical Technologist", "Pharmacist", "Other Medical Staff"],
  "Emergency Responder": ["Firefighter", "EMT", "Rescue Volunteer", "DRRM Officer", "Other Responder"],
  "Government Employee": ["Health Office", "Social Welfare", "Public Safety", "Administrative Staff", "Other Office"],
  Student: ["Senior High School", "College", "Fresh Graduate", "Technical-Vocational"],
  "Private Sector Employee": ["Operations", "Customer Service", "Engineering", "Management", "Other Department"],
  "NGO Worker": ["Program Officer", "Field Coordinator", "Volunteer Manager", "Other Role"],
  "Skilled Worker": ["Electrician", "Plumber", "Driver", "Welder", "Carpenter", "Other Skill"],
};


const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "qwerty123",
  "12345678",
  "123456789",
  "abc12345",
  "letmein123",
  "admin123",
]);

const SLIDES = [
  {
    title: "Secure Registration",
    body: "Structured multi-step validation for safer community account creation.",
    icon: "🛡️",
  },
  {
    title: "Verified Local Address",
    body: "Controlled Region, Province, City, and Barangay selections for LGU accuracy.",
    icon: "📍",
  },
  {
    title: "Verify When Ready",
    body: "Create a Basic Resident Account first. Identity Verification is a separate step before protected Resident and Volunteer services.",
    icon: "✅",
  },
];

const STEP_META: Record<Step, { title: string; subtitle: string; icon: string }> = {
  1: {
    title: "Personal Details",
    subtitle: "Basic identity and contact information",
    icon: "👤",
  },
  2: {
    title: "Residential Address",
    subtitle: "Location details for LGU verification",
    icon: "🏠",
  },
  3: {
    title: "Resident Profile",
    subtitle: "Occupation and basic resident information",
    icon: "🧰",
  },
  4: {
    title: "Security & Consent",
    subtitle: "Password, privacy, and final confirmation",
    icon: "🔐",
  },
};

function sanitizeName(input: string) {
  return input.replace(/[^A-Za-z\s'-]/g, "");
}

function sanitizePhoneLocal(input: string) {
  return input.replace(/\D/g, "").slice(0, 10);
}

function toE164FromLocal(local: string) {
  return `+63${local}`;
}

function calculateAge(birthDate: Date) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function formatDOB(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function getFriendlyAuthError(error: any) {
  const code = error?.code || "";
  if (code === "auth/email-already-in-use") return "This email address is already registered.";
  if (code === "auth/invalid-email") return "The email address format is invalid.";
  if (code === "auth/weak-password") return "Your password is too weak.";
  if (code === "auth/network-request-failed") return "Network error. Please check your internet connection and try again.";
  if (code === "auth/account-exists-with-different-credential") return "An account already exists with this email using a different sign-in method.";
  return error?.message || "Something went wrong. Please try again.";
}

function splitDisplayName(displayName: string) {
  const clean = displayName.trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const SectionTitle = memo(function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubheader}>{subtitle}</Text> : null}
    </View>
  );
});

const Field = memo(function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  secureTextEntry,
  showPassword,
  onTogglePassword,
  editable = true,
  invalid = false,
  returnKeyType,
  onSubmitEditing,
  autoCapitalize,
  autoCorrect = false,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  secureTextEntry?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  editable?: boolean;
  invalid?: boolean;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  icon?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{icon ? `${icon} ` : ""}{label}</Text>
      <View style={styles.passwordInputContainer}>
        <TextInput
        style={[
          styles.input,
          onTogglePassword && styles.passwordInput,
          focused && styles.inputFocused,
          !editable && styles.disabledInput,
          invalid && styles.inputInvalid,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.lightText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ? autoCapitalize : keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={autoCorrect}
        secureTextEntry={secureTextEntry}
        editable={editable}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        />
        {onTogglePassword ? <TouchableOpacity style={styles.passwordEyeButton} onPress={onTogglePassword} accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} hitSlop={8}><Feather name={showPassword ? "eye-off" : "eye"} size={20} color={COLORS.muted} /></TouchableOpacity> : null}
      </View>
    </View>
  );
});

const ValidationText = memo(function ValidationText({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Text style={[styles.validation, { color: ok ? COLORS.success : COLORS.danger }]}> 
      {ok ? "✓" : "•"} {children}
    </Text>
  );
});

const CheckRow = memo(function CheckRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Text style={styles.checkboxTick}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
});

const Dropdown = memo(function Dropdown({
  label,
  value,
  options,
  placeholder = "Select...",
  enabled = true,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  enabled?: boolean;
  onChange: (v: string) => void;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const triggerRef = useRef<any>(null);

  const openMenu = useCallback(() => {
    if (!enabled) return;
    triggerRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  }, [enabled]);

  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{icon ? `${icon} ` : ""}{label}</Text>
      <Pressable ref={triggerRef} onPress={openMenu} style={[styles.ddTrigger, !enabled && styles.disabledInput]}>
        <Text style={[styles.ddValue, !value && styles.ddPlaceholder]}>{value || placeholder}</Text>
        <Text style={styles.ddChevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.ddBackdrop} onPress={closeMenu}>
          <View
            style={[
              styles.ddPanel,
              anchor && { position: "absolute", width: anchor.w, left: anchor.x, top: anchor.y + anchor.h + 6 },
            ]}
          >
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {options.length === 0 ? (
                <View style={styles.ddEmpty}><Text style={styles.ddEmptyText}>No options available</Text></View>
              ) : (
                options.map((opt) => {
                  const active = opt === value;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        onChange(opt);
                        closeMenu();
                      }}
                      style={[styles.ddItem, active && styles.ddItemActive]}
                    >
                      <Text style={[styles.ddItemText, active && styles.ddItemTextActive]}>{opt}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
});

function TermsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.termsModalWrap}>
        <View style={styles.termsHeader}>
          <View>
            <Text style={styles.termsHeaderTitle}>Terms & Data Privacy</Text>
            <Text style={styles.termsHeaderSub}>VolunServe registration agreement</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.termsCloseBtn}>
            <Text style={styles.termsCloseText}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.termsBody} showsVerticalScrollIndicator>
          <Text style={styles.termsH1}>VolunServe Registration Terms</Text>
          <Text style={styles.termsP}>By registering, you confirm the information you provide is accurate and complete. Your Basic Resident Account becomes active after successful registration. Identity Verification is a separate trust step for protected Resident and Volunteer services.</Text>
          <Text style={styles.termsH2}>Data Privacy</Text>
          <Text style={styles.termsP}>We collect your personal data including name, contact information, and address to support community services and account management. If you later use Identity Verification, verification evidence is handled as private data and must only be used for the verification process.</Text>
          <Text style={styles.termsH2}>Consent</Text>
          <Text style={styles.termsP}>You consent to secure processing of your registration data for VolunServe services and communication. Identity Verification and the Volunteer Application are separate steps after account creation.</Text>
          <Text style={styles.termsH2}>Security</Text>
          <Text style={styles.termsP}>Use a strong password. Do not share your login credentials. Suspicious activity may result in account review.</Text>
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function Signup() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [googleBound, setGoogleBound] = useState(false);
  const [googleProfileLoaded, setGoogleProfileLoaded] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [termsOpen, setTermsOpen] = useState(false);
  const barangays = SJDM_BARANGAYS;
  const loadingAddress = false;
  const [dobOpen, setDobOpen] = useState(false);

  const [formData, setFormData] = useState<FormState>({
    lastName: "",
    firstName: "",
    middleName: "",
    noMiddleName: false,
    dateOfBirth: null,
    phoneLocal: "",
    email: "",
    region: FIXED_REGION,
    province: FIXED_PROVINCE,
    city: FIXED_CITY,
    barangay: "",
    occupationCategory: "",
    occupationSpecialization: "",
    occupationOther: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    confirmReview: false,
  });

  const updateField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);


  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: "233201250762-ton2r7m31pomrc42rgfjl7vb292e0var.apps.googleusercontent.com",
    androidClientId: "233201250762-d7tnic7h4q3f6ohip52a36ng22uqrvl5.apps.googleusercontent.com",
    redirectUri,
    scopes: ["openid", "profile", "email"],
  });

  const today = new Date();
  const maxDOB = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const minDOB = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());

  const progressPercent = (step / 4) * 100;

  useEffect(() => {
    const handleGoogleSuccess = async () => {
      if (response?.type !== "success") return;
      try {
        const idToken = response.params?.id_token;
        if (!idToken) {
          Alert.alert("Google Error", "No ID token returned.");
          return;
        }

        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);
        const user = userCred.user;
        const parsed = splitDisplayName(user.displayName || "");
        const googleEmail = (user.email || "").trim().toLowerCase();

        updateField("email", googleEmail);
        if (parsed.firstName) updateField("firstName", sanitizeName(parsed.firstName));
        if (parsed.lastName) updateField("lastName", sanitizeName(parsed.lastName));

        setGoogleBound(true);
        setGoogleProfileLoaded(true);
        setStep(1);
        setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 0);

        Alert.alert("Google Account Connected", "Your Google account information has been added to the registration form.");
      } catch (error: any) {
        Alert.alert("Firebase Error", getFriendlyAuthError(error));
      }
    };
    handleGoogleSuccess();
  }, [response, updateField]);

  const specializationOptions = useMemo(() => SPECIALIZATIONS[formData.occupationCategory] ?? [], [formData.occupationCategory]);

  const validation = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nameOk = (s: string) => s.trim().length >= 2;
    const lastNameValid = nameOk(formData.lastName);
    const firstNameValid = nameOk(formData.firstName);
    const middleNameValid = formData.noMiddleName || nameOk(formData.middleName);
    const ageNumber = formData.dateOfBirth ? calculateAge(formData.dateOfBirth) : 0;
    const ageValid = !!formData.dateOfBirth && ageNumber >= 18;
    const phoneValid = true;
    const emailValid = emailRegex.test(formData.email.trim().toLowerCase());
    const step1Valid = lastNameValid && firstNameValid && middleNameValid && ageValid && phoneValid && emailValid;
    const step2Valid =
      !!formData.region &&
      isAllowedProvince(formData.province) &&
      isAllowedCity(formData.city) &&
      !!formData.barangay;
    const needsSpec = specializationOptions.length > 0;
    const isOther = formData.occupationCategory === "Other (Specify)";
    const occupationOtherValid = !isOther || formData.occupationOther.trim().length >= 2;
    const specializationValid = !needsSpec || !!formData.occupationSpecialization;
    const step3Valid = !!formData.occupationCategory && occupationOtherValid && specializationValid;
    const passwordChecks = {
      minLength: formData.password.length >= 8,
      upper: /[A-Z]/.test(formData.password),
      lower: /[a-z]/.test(formData.password),
      number: /\d/.test(formData.password),
      special: /[^A-Za-z0-9]/.test(formData.password),
      notCommon: !COMMON_PASSWORDS.has(formData.password.toLowerCase()),
      matches: formData.password === formData.confirmPassword && !!formData.confirmPassword,
    };
    const passwordScore = Object.values(passwordChecks).filter(Boolean).length;
    const passwordStrength = passwordScore <= 2 ? "Weak" : passwordScore <= 5 ? "Medium" : "Strong";
    const passwordValid = passwordScore === Object.keys(passwordChecks).length;
    const step4Valid = passwordValid && formData.acceptTerms && formData.confirmReview;
    return {
      lastNameValid,
      firstNameValid,
      middleNameValid,
      ageValid,
      ageNumber,
      phoneValid,
      emailValid,
      step1Valid,
      step2Valid,
      step3Valid,
      step4Valid,
      passwordChecks,
      passwordStrength,
      needsSpec,
      isOther,
    };
  }, [formData, googleBound, specializationOptions.length]);

  const isStepValid = useCallback((s: Step) => {
    if (s === 1) return validation.step1Valid;
    if (s === 2) return validation.step2Valid;
    if (s === 3) return validation.step3Valid;
    return validation.step4Valid;
  }, [validation]);

  const scrollTop = useCallback(() => setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 0), []);

  const goNext = useCallback(() => {
    if (!isStepValid(step)) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      
      const stepMessages: Record<Step, string> = {
        1: "Please complete your personal information and contact details.",
        2: "Please select a valid City of San Jose del Monte, Bulacan residential address.",
        3: "Please complete your occupation information.",
        4: "Please create a password and agree to the terms.",
      };
      
      Alert.alert("Incomplete Step", stepMessages[step]);
      return;
    }
    Keyboard.dismiss();
    if (step < 4) {
      setStep((prev) => (prev + 1) as Step);
      scrollTop();
    }
  }, [googleBound, isStepValid, scrollTop, step]);

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    if (step > 1) {
      setStep((prev) => (prev - 1) as Step);
      scrollTop();
    }
  }, [scrollTop, step]);

  const handleGooglePress = useCallback(async () => {
    try {
      await promptAsync();
    } catch (error: any) {
      Alert.alert("Google Error", getFriendlyAuthError(error));
    }
  }, [promptAsync]);

  const handleSubmit = useCallback(async () => {
    if (loadingSubmit) return;
    if (!validation.step4Valid) {
      Alert.alert("Incomplete", "Please satisfy all security and compliance requirements.");
      return;
    }
    if (!formData.dateOfBirth || !validation.ageValid) {
      Alert.alert("Ineligible", "Residents must be at least 18 years old at the time of registration.");
      return;
    }
    try {
      setLoadingSubmit(true);
      await signUpUser({
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        middleName: formData.noMiddleName ? "" : formData.middleName.trim(),
        age: validation.ageNumber,
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        authProvider: "email",
        phoneNumber: "",
        region: formData.region,
        province: formData.province,
        city: formData.city,
        barangay: formData.barangay,
        occupationCategory: formData.occupationCategory,
        occupationSpecialization: formData.occupationSpecialization || "",
        occupationOther: formData.occupationOther || "",
      });

      Alert.alert(
        "Welcome to VolunServe",
        "Your Basic Resident Account is ready. You can sign in and use basic safety services now. Complete Identity Verification later to unlock protected Resident services and become eligible to apply for Volunteer access.",
        [{ text: "Continue", onPress: () => router.replace("/(tabs)") }]
      );
    } catch (e: any) {
      Alert.alert("Registration Error", getFriendlyAuthError(e));
    } finally {
      setLoadingSubmit(false);
    }
  }, [formData, googleBound, loadingSubmit, router, validation]);

  const currentMeta = STEP_META[step];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <ScrollView
        ref={(r) => { scrollRef.current = r; }}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.brandTitle}>VolunServe</Text>
              <Text style={styles.brandSub}>Community Volunteer Platform</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Create your account</Text>
          <Text style={styles.heroText}>Create one Basic Resident Account first. Identity Verification and Volunteer access are separate steps completed later from your account.</Text>
        </View>

        <View style={styles.carouselWrap}>
          <FlatList
            data={SLIDES}
            keyExtractor={(item) => item.title}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={1}
            windowSize={2}
            onScroll={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / (width - 40));
              setSlideIndex(idx);
            }}
            scrollEventThrottle={16}
            renderItem={({ item }) => (
              <View style={[styles.carouselCard, { width: width - 40 }]}>
                <Text style={styles.carouselIcon}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.carouselTitle}>{item.title}</Text>
                  <Text style={styles.carouselText}>{item.body}</Text>
                </View>
              </View>
            )}
          />
          <View style={styles.dots}>
            {SLIDES.map((_, i) => <View key={i} style={[styles.dot, i === slideIndex ? styles.dotOn : styles.dotOff]} />)}
          </View>
        </View>

        <View style={styles.stepperCard}>
          <View style={styles.stepperTop}>
            <View style={styles.stepIconBubble}><Text style={styles.stepIcon}>{currentMeta.icon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepperTitle}>{currentMeta.title}</Text>
              <Text style={styles.stepperSub}>{currentMeta.subtitle}</Text>
            </View>
            <Text style={styles.stepCounter}>{step}/4</Text>
          </View>

          <View style={styles.stepRow}>
            {[1, 2, 3, 4].map((n) => {
              const active = step >= n;
              return (
                <View key={n} style={styles.stepItem}>
                  <View style={[styles.stepCircle, active && styles.stepCircleActive]}>
                    <Text style={[styles.stepCircleText, active && styles.stepCircleTextActive]}>{n}</Text>
                  </View>
                  {n < 4 ? <View style={[styles.stepLine, step > n && styles.stepLineActive]} /> : null}
                </View>
              );
            })}
          </View>

          <View style={styles.progressBarWrap}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressText}>{progressPercent}% completed</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          {step === 1 && (
            <View>
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>
                  Basic Resident Account — all public users start here. Identity Verification is completed separately. After verification, Residents can access protected services and may apply for Volunteer access.
                </Text>
              </View>



              <SectionTitle title="Personal Information" subtitle="Use accurate details for your Basic Resident profile." />
              <Field icon="📧" label="Email Address *" value={formData.email} onChange={(v) => updateField("email", v.trim().toLowerCase())} keyboardType="email-address" invalid={!validation.emailValid && formData.email.length > 0} returnKeyType="next" editable autoCapitalize="none" />
              <ValidationText ok={validation.emailValid}>{validation.emailValid && formData.email.length > 0 ? "✓ Valid email address" : googleBound ? "Email is linked to your connected Google account." : "Enter a valid email format."}</ValidationText>

              <Field icon="👤" label="Last Name *" value={formData.lastName} onChange={(v) => updateField("lastName", sanitizeName(v))} invalid={!validation.lastNameValid && formData.lastName.length > 0} returnKeyType="next" />
              <Field icon="👤" label="First Name *" value={formData.firstName} onChange={(v) => updateField("firstName", sanitizeName(v))} invalid={!validation.firstNameValid && formData.firstName.length > 0} returnKeyType="next" />
              <Field icon="👤" label="Middle Name *" value={formData.middleName} onChange={(v) => updateField("middleName", sanitizeName(v))} editable={!formData.noMiddleName} invalid={!formData.noMiddleName && formData.middleName.length > 0 && !validation.middleNameValid} returnKeyType="next" />
              <CheckRow label="No Middle Name" checked={formData.noMiddleName} onPress={() => {
                const next = !formData.noMiddleName;
                updateField("noMiddleName", next);
                if (next) updateField("middleName", "");
              }} />

              <SectionTitle title="Birthdate & Contact" />
              <View style={styles.field}>
                <Text style={styles.label}>🎂 Date of Birth *</Text>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setDobOpen(true)} style={[styles.input, !validation.ageValid && formData.dateOfBirth !== null && styles.inputInvalid, { justifyContent: "center" }]}>
                  <Text style={{ fontSize: 15, color: formData.dateOfBirth ? COLORS.text : COLORS.lightText, fontWeight: "700" }}>
                    {formData.dateOfBirth ? formatDOB(formData.dateOfBirth) : "MM/DD/YYYY"}
                  </Text>
                </TouchableOpacity>
                {dobOpen && (
                  <DateTimePicker
                    value={formData.dateOfBirth || maxDOB}
                    mode="date"
                    display="default"
                    maximumDate={maxDOB}
                    minimumDate={minDOB}
                    onChange={(_, selectedDate) => {
                      setDobOpen(false);
                      if (selectedDate) updateField("dateOfBirth", selectedDate);
                    }}
                  />
                )}
                <ValidationText ok={validation.ageValid}>{formData.dateOfBirth ? validation.ageValid ? `✓ Age verified: ${validation.ageNumber} years old` : "You must be at least 18 years old to proceed." : "Residents must be at least 18 years old at the time of registration."}</ValidationText>
              </View>


            </View>
          )}

          {step === 2 && (
            <View>
              <SectionTitle title="Residential Address" subtitle="VolunServe currently serves residents of the City of San Jose del Monte, Bulacan." />
              {loadingAddress ? <View style={styles.loadingRow}><ActivityIndicator color={COLORS.primary} /><Text style={styles.loadingText}>Loading address options…</Text></View> : null}
              <View style={styles.field}><Text style={styles.label}>🌐 Region</Text><View style={styles.fixedLocationField}><Text style={styles.fixedLocationText}>{formData.region}</Text></View></View>
              <View style={styles.field}><Text style={styles.label}>🗺️ Province</Text><View style={styles.fixedLocationField}><Text style={styles.fixedLocationText}>{formData.province}</Text></View></View>
              <View style={styles.field}><Text style={styles.label}>🏙️ City / Municipality</Text><View style={styles.fixedLocationField}><Text style={styles.fixedLocationText}>{formData.city}</Text></View></View>
              <Dropdown icon="📍" label="Barangay *" value={formData.barangay} options={barangays} enabled={!!formData.city && barangays.length > 0} onChange={(value) => updateField("barangay", value)} />
            </View>
          )}

          {step === 3 && (
            <View>
              <SectionTitle title="Occupation" subtitle="This helps identify how you may contribute during community activities." />
              <Dropdown icon="💼" label="Occupation Category *" value={formData.occupationCategory} options={OCCUPATION_OPTIONS} onChange={(value) => {
                updateField("occupationCategory", value); updateField("occupationSpecialization", ""); updateField("occupationOther", "");
              }} />
              {validation.needsSpec && <Dropdown icon="📌" label="Specialization *" value={formData.occupationSpecialization} options={specializationOptions} enabled={!!formData.occupationCategory} onChange={(value) => updateField("occupationSpecialization", value)} />}
              {validation.isOther && <Field icon="✍️" label="Specify Occupation *" value={formData.occupationOther} onChange={(v) => updateField("occupationOther", v)} invalid={formData.occupationOther.length > 0 && formData.occupationOther.trim().length < 2} />}

              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>
                  Volunteer skills and availability are not collected during signup. After your identity is verified, you can submit a Volunteer Application with those details for Admin review.
                </Text>
              </View>
            </View>
          )}

          {step === 4 && (
            <View>
              <SectionTitle title="Review Your Information" subtitle="Please verify all details are correct before proceeding." />
              <View style={styles.reviewBox}>
                <Text style={styles.reviewText}>
                  👤 {formData.firstName} {formData.middleName && !formData.noMiddleName ? formData.middleName + " " : ""}{formData.lastName}
                </Text>
                <Text style={styles.reviewText}>📧 {formData.email}</Text>
                <Text style={styles.reviewText}>
                  📍 {formData.barangay}, {formData.city}, {formData.province}
                </Text>
                <Text style={styles.reviewText}>🏘️ Basic Resident Account</Text>
                {formData.occupationCategory && (
                  <Text style={styles.reviewText}>💼 {formData.occupationCategory}</Text>
                )}
              </View>
 
              {googleBound ? (
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>
                    ✓ Google account connected. Your Google sign-in will be used for this Basic Resident Account, so no additional password is required here.
                  </Text>
                </View>
              ) : (
                <>
                  <SectionTitle title="Password Security" subtitle="Create a strong password to protect your account." />
                  <Field label="Password *" value={formData.password} onChange={(v) => updateField("password", v)} secureTextEntry={!showPassword} showPassword={showPassword} onTogglePassword={() => setShowPassword((prev) => !prev)} autoCapitalize="none" />
                  <Field label="Confirm Password *" value={formData.confirmPassword} onChange={(v) => updateField("confirmPassword", v)} secureTextEntry={!showConfirmPassword} showPassword={showConfirmPassword} onTogglePassword={() => setShowConfirmPassword((prev) => !prev)} autoCapitalize="none" />

                  <View style={styles.passwordPanel}>
                    <Text style={styles.passwordStrength}>Password Strength: {validation.passwordStrength}</Text>
                    <ValidationText ok={validation.passwordChecks.minLength}>Minimum 8 characters.</ValidationText>
                    <ValidationText ok={validation.passwordChecks.upper}>At least one uppercase letter.</ValidationText>
                    <ValidationText ok={validation.passwordChecks.lower}>At least one lowercase letter.</ValidationText>
                    <ValidationText ok={validation.passwordChecks.number}>At least one number.</ValidationText>
                    <ValidationText ok={validation.passwordChecks.special}>At least one special character.</ValidationText>
                    <ValidationText ok={validation.passwordChecks.notCommon}>Must not be a common password.</ValidationText>
                    <ValidationText ok={validation.passwordChecks.matches}>Passwords must match.</ValidationText>
                  </View>
                </>
              )}

              <SectionTitle title="Compliance & Data Privacy" subtitle="Review and confirm before submitting your registration." />
              <TouchableOpacity onPress={() => setTermsOpen(true)} style={styles.termsOpenBtn}><Text style={styles.termsOpenText}>View Terms & Data Privacy</Text></TouchableOpacity>
              <CheckRow label="I agree to the compliance and data privacy statements." checked={formData.acceptTerms} onPress={() => updateField("acceptTerms", !formData.acceptTerms)} />
              <CheckRow label="I confirm the details I provided are final and correct." checked={formData.confirmReview} onPress={() => updateField("confirmReview", !formData.confirmReview)} />
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {step > 1 ? (
            <TouchableOpacity style={[styles.navBtn, styles.secondaryBtn]} onPress={goBack} disabled={loadingSubmit}>
              <Text style={styles.secondaryText}>Back</Text>
            </TouchableOpacity>
          ) : <View style={{ flex: 1 }} />}

          {step < 4 ? (
            <TouchableOpacity style={[styles.navBtn, styles.primaryBtn, !isStepValid(step) && styles.disabledBtn]} onPress={goNext} disabled={!isStepValid(step)}>
              <Text style={styles.primaryText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.navBtn, styles.primaryBtn, (!validation.step4Valid || loadingSubmit) && styles.disabledBtn]} onPress={handleSubmit} disabled={!validation.step4Valid || loadingSubmit}>
              {loadingSubmit ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Basic Account</Text>}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity onPress={() => router.push("/login")} style={styles.loginLinkWrap}>
          <Text style={styles.link}>Already have an account? <Text style={styles.linkStrong}>Sign in</Text></Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {loadingSubmit && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.overlayTitle}>Creating Your Account...</Text>
            <Text style={styles.overlayText}>Please wait while we set up your Basic Resident Account.</Text>
          </View>
        </View>
      )}

      <TermsModal visible={termsOpen} onClose={() => setTermsOpen(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },

  hero: {
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  logo: { width: 42, height: 42, marginRight: 10, backgroundColor: "#fff", borderRadius: 12 },
  brandTitle: { color: "#fff", fontSize: 21, fontWeight: "900" },
  brandSub: { color: "#d1fae5", fontSize: 12, fontWeight: "700", marginTop: 2 },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "900", marginBottom: 8 },
  heroText: { color: "#ecfeff", fontSize: 13.5, lineHeight: 20, fontWeight: "600" },

  carouselWrap: { marginBottom: 16 },
  carouselCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  carouselIcon: { fontSize: 28, marginRight: 14 },
  carouselTitle: { fontSize: 15.5, fontWeight: "900", marginBottom: 4, color: COLORS.text },
  carouselText: { fontSize: 12.5, color: COLORS.muted, lineHeight: 18, fontWeight: "600" },
  dots: { flexDirection: "row", justifyContent: "center", marginTop: 10, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 99 },
  dotOn: { backgroundColor: COLORS.primary },
  dotOff: { backgroundColor: "#cbd5e1" },

  stepperCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperTop: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  stepIconBubble: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primarySoft, justifyContent: "center", alignItems: "center", marginRight: 12 },
  stepIcon: { fontSize: 22 },
  stepperTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  stepperSub: { color: COLORS.muted, fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  stepCounter: { color: COLORS.primary, fontSize: 14, fontWeight: "900" },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  stepCircle: { width: 28, height: 28, borderRadius: 999, backgroundColor: "#e2e8f0", justifyContent: "center", alignItems: "center" },
  stepCircleActive: { backgroundColor: COLORS.primary },
  stepCircleText: { color: COLORS.muted, fontSize: 12, fontWeight: "900" },
  stepCircleTextActive: { color: "#fff" },
  stepLine: { flex: 1, height: 3, backgroundColor: "#e2e8f0", marginHorizontal: 6, borderRadius: 999 },
  stepLineActive: { backgroundColor: COLORS.primary },

  progressBarWrap: { marginTop: 12 },
  progressBar: { height: 6, backgroundColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 10 },
  progressText: { fontSize: 11, marginTop: 6, color: COLORS.muted, fontWeight: "700", textAlign: "center" },

  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionHeaderWrap: { marginBottom: 14 },
  sectionHeader: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  sectionSubheader: { fontSize: 12.5, color: COLORS.muted, fontWeight: "600", marginTop: 4, lineHeight: 18 },

  googleBtn: { backgroundColor: "#fff", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  googleBtnDisabled: { opacity: 0.82 },
  googleBtnText: { fontWeight: "900", color: COLORS.text },
  infoBox: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: "#99f6e4", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },
  infoBoxText: { color: COLORS.primaryDark, fontSize: 12.5, fontWeight: "800", lineHeight: 18 },

  field: { marginBottom: 16 },
  passwordInputContainer: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 60 },
  passwordEyeButton: { position: "absolute", right: 4, top: 0, bottom: 0, minWidth: 48, alignItems: "center", justifyContent: "center" },
  fixedLocationField: { minHeight: 54, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: "#f1f5f9", paddingHorizontal: 14, justifyContent: "center" },
  fixedLocationText: { fontSize: 15, color: COLORS.text, fontWeight: "700" },
  label: { fontSize: 14, fontWeight: "800", color: "#1f2937", marginBottom: 8 },
  input: { backgroundColor: COLORS.field, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 14, fontSize: 15, color: COLORS.text, fontWeight: "700" },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: "#fff" },
  inputInvalid: { borderColor: COLORS.danger },
  disabledInput: { backgroundColor: "#f1f5f9", opacity: 0.85 },

  validation: { fontSize: 12, marginBottom: 10, fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  checkLabel: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: "700", lineHeight: 18 },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderColor: "#cbd5e1", borderRadius: 7, marginRight: 10, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxTick: { color: "#fff", fontWeight: "900", fontSize: 13 },

  phoneWrap: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.field, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  phonePrefix: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 54, borderRightWidth: 1, borderRightColor: COLORS.border, backgroundColor: "#fff" },
  flag: { fontSize: 18 },
  phonePrefixText: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  phoneInput: { flex: 1, height: 54, paddingHorizontal: 14, fontSize: 15, backgroundColor: COLORS.field, color: COLORS.text, fontWeight: "700" },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, backgroundColor: COLORS.field, padding: 12, borderRadius: 14 },
  loadingText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },

  passwordPanel: { backgroundColor: COLORS.field, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 18 },
  passwordStrength: { color: COLORS.text, fontWeight: "900", fontSize: 14, marginBottom: 8 },

  reviewBox: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#99f6e4",
  },
  reviewText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primaryDark,
    marginBottom: 8,
    lineHeight: 18,
  },

  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 2, gap: 10 },
  navBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: "center" },
  primaryBtn: { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4 },
  secondaryBtn: { backgroundColor: "#e2e8f0" },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondaryText: { color: COLORS.text, fontWeight: "900" },
  disabledBtn: { opacity: 0.5 },
  loginLinkWrap: { marginTop: 16 },
  link: { textAlign: "center", fontSize: 14, color: COLORS.muted, fontWeight: "700" },
  linkStrong: { color: COLORS.primary, fontWeight: "900" },

  ddTrigger: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.field, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 14 },
  ddValue: { fontSize: 15, color: COLORS.text, fontWeight: "800", flex: 1, paddingRight: 8 },
  ddPlaceholder: { color: COLORS.lightText, fontWeight: "800" },
  ddChevron: { fontSize: 14, color: COLORS.muted, fontWeight: "900" },
  ddBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.22)" },
  ddPanel: { position: "absolute", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", elevation: 8 },
  ddItem: { paddingVertical: 14, paddingHorizontal: 14 },
  ddItemActive: { backgroundColor: COLORS.primarySoft },
  ddItemText: { fontSize: 15, color: COLORS.text, fontWeight: "800" },
  ddItemTextActive: { color: COLORS.primaryDark },
  ddEmpty: { padding: 14 },
  ddEmptyText: { color: COLORS.muted, fontWeight: "800" },

  termsOpenBtn: { borderWidth: 1, borderColor: "#99f6e4", backgroundColor: COLORS.primarySoft, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14, marginBottom: 12, alignItems: "center" },
  termsOpenText: { color: COLORS.primaryDark, fontWeight: "900" },
  termsModalWrap: { flex: 1, backgroundColor: COLORS.bg },
  termsHeader: { paddingTop: Platform.OS === "ios" ? 54 : 18, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  termsHeaderTitle: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  termsHeaderSub: { fontSize: 12, color: COLORS.muted, fontWeight: "700", marginTop: 2 },
  termsCloseBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#e2e8f0" },
  termsCloseText: { fontWeight: "900", color: COLORS.text },
  termsBody: { padding: 16, paddingBottom: 40 },
  termsH1: { fontSize: 18, fontWeight: "900", color: COLORS.text, marginBottom: 10 },
  termsH2: { fontSize: 15, fontWeight: "900", color: COLORS.text, marginTop: 14, marginBottom: 8 },
  termsP: { fontSize: 14, color: "#334155", lineHeight: 20, fontWeight: "600" },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  overlayCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    maxWidth: 280,
  },
  overlayTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  overlayText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  }, 
})