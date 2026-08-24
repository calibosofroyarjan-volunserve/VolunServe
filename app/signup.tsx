import DateTimePicker from "@react-native-community/datetimepicker";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
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
import { auth, db } from "../lib/firebase";
import { signUpUser } from "../lib/firebaseAuth";

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({
  scheme: "com.froyarjan123.volunserve",
});

type Step = 1 | 2 | 3 | 4;

type FormState = {
  role: "resident" | "volunteer";
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
  skills: string[];
  skillOther: string;
  availability: string[];
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

const ALLOWED_REGIONS = ["Region III – Central Luzon"];

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

const SKILL_OPTIONS = [
  "First Aid",
  "Medical Assistance",
  "Search and Rescue",
  "Driving",
  "Cooking / Relief Packing",
  "Construction",
  "Logistics",
  "IT / Technology",
  "Teaching",
  "Counseling",
  "Other (Specify)",
];

const AVAILABILITY_OPTIONS = [
  "Weekdays (Mon–Fri)",
  "Weekends (Sat–Sun)",
  "Evenings",
  "Anytime",
  "Emergency Response",
  "Specific Days",
];

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
    title: "Administrative Review",
    body: "New accounts are reviewed before activation to protect the platform.",
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
    title: "Profile & Availability",
    subtitle: "Skills, occupation, and volunteer availability",
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
      <TextInput
        style={[
          styles.input,
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
          <Text style={styles.termsP}>By registering, you confirm the information you provide is accurate and complete. Your account may be subject to administrative review before activation.</Text>
          <Text style={styles.termsH2}>Data Privacy</Text>
          <Text style={styles.termsP}>We collect your personal data including name, contact information, and address to support LGU service delivery, coordination, and verification. Access is restricted to authorized administrators.</Text>
          <Text style={styles.termsH2}>Consent</Text>
          <Text style={styles.termsP}>You consent to secure processing of your data for registration verification, volunteer coordination, and program communication. You may request correction of incorrect information via the administrator.</Text>
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
  const [specificDays, setSpecificDays] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const [termsOpen, setTermsOpen] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [barangays, setBarangays] = useState<string[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [dobOpen, setDobOpen] = useState(false);

  const [formData, setFormData] = useState<FormState>({
    role: "resident",
    lastName: "",
    firstName: "",
    middleName: "",
    noMiddleName: false,
    dateOfBirth: null,
    phoneLocal: "",
    email: "",
    region: "",
    province: "",
    city: "",
    barangay: "",
    occupationCategory: "",
    occupationSpecialization: "",
    occupationOther: "",
    skills: [],
    skillOther: "",
    availability: [],
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    confirmReview: false,
  });

  const updateField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const toggleSelection = useCallback((list: string[], item: string) => {
    return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
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
    setRegions(ALLOWED_REGIONS);
    if (ALLOWED_REGIONS.length === 1) updateField("region", ALLOWED_REGIONS[0]);
  }, [updateField]);

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

  useEffect(() => {
    const fetchProvinces = async () => {
      if (!formData.region) return;
      try {
        setLoadingAddress(true);
        setProvinces([]);
        setCities([]);
        setBarangays([]);
        const snap = await getDocs(collection(db, "address_regions", formData.region, "provinces"));
        setProvinces(snap.docs.map((d) => d.id).sort());
      } catch (err: any) {
        Alert.alert("Address Error", err?.message || "Failed to load provinces.");
      } finally {
        setLoadingAddress(false);
      }
    };
    fetchProvinces();
  }, [formData.region]);

  useEffect(() => {
    const fetchCities = async () => {
      if (!formData.region || !formData.province) return;
      try {
        setLoadingAddress(true);
        setCities([]);
        setBarangays([]);
        const snap = await getDocs(collection(db, "address_regions", formData.region, "provinces", formData.province, "cities"));
        setCities(snap.docs.map((d) => d.id).sort());
      } catch (err: any) {
        Alert.alert("Address Error", err?.message || "Failed to load cities.");
      } finally {
        setLoadingAddress(false);
      }
    };
    fetchCities();
  }, [formData.region, formData.province]);

  useEffect(() => {
    const fetchBarangays = async () => {
      if (!formData.region || !formData.province || !formData.city) return;
      try {
        setLoadingAddress(true);
        setBarangays([]);
        const snap = await getDocs(collection(db, "address_regions", formData.region, "provinces", formData.province, "cities", formData.city, "barangays"));
        setBarangays(snap.docs.map((d) => d.id).sort());
      } catch (err: any) {
        Alert.alert("Address Error", err?.message || "Failed to load barangays.");
      } finally {
        setLoadingAddress(false);
      }
    };
    fetchBarangays();
  }, [formData.region, formData.province, formData.city]);

  const specializationOptions = useMemo(() => SPECIALIZATIONS[formData.occupationCategory] ?? [], [formData.occupationCategory]);

  const validation = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const nameOk = (s: string) => s.trim().length >= 2;
    const lastNameValid = nameOk(formData.lastName);
    const firstNameValid = nameOk(formData.firstName);
    const middleNameValid = formData.noMiddleName ? true : nameOk(formData.middleName);
    const ageNumber = formData.dateOfBirth ? calculateAge(formData.dateOfBirth) : 0;
    const ageValid = !!formData.dateOfBirth && ageNumber >= 18;
    const phoneValid = /^9\d{9}$/.test(formData.phoneLocal);
    const emailValid = emailRegex.test(formData.email.trim().toLowerCase());
    const step1Valid = lastNameValid && firstNameValid && middleNameValid && ageValid && phoneValid && emailValid && !!formData.role;
    const step2Valid = !!formData.region && !!formData.province && !!formData.city && !!formData.barangay;
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
  }, [formData, specializationOptions.length]);

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
        2: "Please select your complete residential address.",
        3: "Please complete your occupation, skills, and availability information.",
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
  }, [isStepValid, scrollTop, step]);

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
      Alert.alert("Ineligible", "Applicants must be at least 18 years old at the time of registration.");
      return;
    }
    try {
      setLoadingSubmit(true);
      await signUpUser({
        role: formData.role,
        lastName: formData.lastName.trim(),
        firstName: formData.firstName.trim(),
        middleName: formData.noMiddleName ? "" : formData.middleName.trim(),
        age: validation.ageNumber,
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        phoneNumber: toE164FromLocal(formData.phoneLocal),
        region: formData.region,
        province: formData.province,
        city: formData.city,
        barangay: formData.barangay,
        occupationCategory: formData.occupationCategory,
        occupationSpecialization: formData.occupationSpecialization || "",
        occupationOther: formData.occupationOther || "",
        skills: formData.skills,
        skillOther: formData.skillOther,
        availability: formData.availability,
      } as any);

      Alert.alert(
        "✅ Registration Successful",
        "Your registration has been submitted and is pending administrative review. You will receive a notification once your account is activated.",
        [{ text: "OK", onPress: () => router.replace("/login") }]
      );
    } catch (e: any) {
      Alert.alert("Registration Error", getFriendlyAuthError(e));
    } finally {
      setLoadingSubmit(false);
    }
  }, [formData, loadingSubmit, router, validation]);

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
          <Text style={styles.heroText}>Register as a verified resident or volunteer for local community response and service programs.</Text>
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
              <SectionTitle title="Account Type" subtitle="Choose how you want to register in VolunServe." />

              <View style={styles.roleRow}>
                <TouchableOpacity
                  disabled={step !== 1}
                  style={[
                    styles.roleBtn,
                    formData.role === "resident" && styles.roleBtnActive,
                    step !== 1 && { opacity: 0.6 },
                  ]}
                  onPress={() => updateField("role", "resident")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.roleIcon}>🏘️</Text>
                  <Text style={[styles.roleBtnText, formData.role === "resident" && styles.roleBtnTextActive]}>Resident</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={step !== 1}
                  style={[
                    styles.roleBtn,
                    formData.role === "volunteer" && styles.roleBtnActive,
                    step !== 1 && { opacity: 0.6 },
                  ]}
                  onPress={() => updateField("role", "volunteer")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.roleIcon}>🤝</Text>
                  <Text style={[styles.roleBtnText, formData.role === "volunteer" && styles.roleBtnTextActive]}>Volunteer</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleGooglePress}
                disabled={!request || googleProfileLoaded}
                style={[styles.googleBtn, (!request || googleProfileLoaded) && styles.googleBtnDisabled]}
              >
                <Text style={styles.googleBtnText}>{googleProfileLoaded ? "✓ Google Account Connected" : "Continue with Google"}</Text>
              </TouchableOpacity>

              {googleBound ? (
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>Google account linked. Your email is locked to your connected Google account.</Text>
                </View>
              ) : null}

              <SectionTitle title="Personal Information" subtitle="Use accurate details for LGU account verification." />
              <Field icon="📧" label="Email Address *" value={formData.email} onChange={(v) => updateField("email", v.trim().toLowerCase())} keyboardType="email-address" invalid={!validation.emailValid && formData.email.length > 0} returnKeyType="next" editable={!googleBound} autoCapitalize="none" />
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
                <ValidationText ok={validation.ageValid}>{formData.dateOfBirth ? validation.ageValid ? `✓ Age verified: ${validation.ageNumber} years old` : "You must be at least 18 years old to proceed." : "Applicants must be at least 18 years old at the time of registration."}</ValidationText>
              </View>

              <Text style={styles.label}>📱 Mobile Number *</Text>
              <View style={styles.phoneWrap}>
                <View style={styles.phonePrefix}><Text style={styles.flag}>🇵🇭</Text><Text style={styles.phonePrefixText}>+63</Text></View>
                <TextInput
                  style={[styles.phoneInput, !validation.phoneValid && formData.phoneLocal.length > 0 && styles.inputInvalid]}
                  value={formData.phoneLocal}
                  onChangeText={(v) => updateField("phoneLocal", sanitizePhoneLocal(v.trim()))}
                  keyboardType="phone-pad"
                  placeholder="9123456789"
                  placeholderTextColor={COLORS.lightText}
                  maxLength={10}
                  returnKeyType="next"
                />
              </View>
              <ValidationText ok={validation.phoneValid}>{validation.phoneValid ? "✓ Valid Philippine mobile number" : "Enter a valid Philippine mobile number starting with 9."}</ValidationText>
            </View>
          )}

          {step === 2 && (
            <View>
              <SectionTitle title="Residential Address" subtitle="This helps LGUs assign services and volunteers to nearby areas." />
              {loadingAddress ? <View style={styles.loadingRow}><ActivityIndicator color={COLORS.primary} /><Text style={styles.loadingText}>Loading address options…</Text></View> : null}
              <Dropdown icon="🌐" label="Region *" value={formData.region} options={regions} enabled={false} onChange={(value) => {
                updateField("region", value); updateField("province", ""); updateField("city", ""); updateField("barangay", "");
              }} />
              <Dropdown icon="🗺️" label="Province *" value={formData.province} options={provinces} enabled={!!formData.region && provinces.length > 0} onChange={(value) => {
                updateField("province", value); updateField("city", ""); updateField("barangay", "");
              }} />
              <Dropdown icon="🏙️" label="City / Municipality *" value={formData.city} options={cities} enabled={!!formData.province && cities.length > 0} onChange={(value) => {
                updateField("city", value); updateField("barangay", "");
              }} />
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

              <SectionTitle title="Skills" subtitle="Select all skills that apply." />
              <View style={styles.cardBox}>
                <View style={styles.skillWrap}>
                  {SKILL_OPTIONS.map((skill) => {
                    const active = formData.skills.includes(skill);
                    return (
                      <Pressable key={skill} onPress={() => updateField("skills", toggleSelection(formData.skills, skill))} style={[styles.skillTag, active && styles.skillTagActive]}>
                        <Text style={[styles.skillText, active && styles.skillTextActive]}>{skill}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {formData.skills.includes("Other (Specify)") && <Field icon="✍️" label="Specify Skill" value={formData.skillOther} onChange={(v) => updateField("skillOther", v)} />}
              </View>

              <SectionTitle title="Availability" subtitle="Select when you are usually available." />
              <View style={styles.cardBox}>
                {AVAILABILITY_OPTIONS.map((item) => {
                  const active = formData.availability.includes(item);
                  return (
                    <TouchableOpacity key={item} style={styles.checkboxRow} onPress={() => updateField("availability", toggleSelection(formData.availability, item))} activeOpacity={0.85}>
                      <View style={[styles.checkbox, active && styles.checkboxOn]}>{active ? <Text style={styles.checkboxTick}>✓</Text> : null}</View>
                      <Text style={styles.checkboxLabel}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
                {formData.availability.includes("Specific Days") && <TextInput style={styles.input} placeholder="Example: Monday, Wednesday" placeholderTextColor={COLORS.lightText} value={specificDays} onChangeText={setSpecificDays} />}
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
                <Text style={styles.reviewText}>📱 +63{formData.phoneLocal}</Text>
                <Text style={styles.reviewText}>
                  📍 {formData.barangay}, {formData.city}, {formData.province}
                </Text>
                <Text style={styles.reviewText}>{formData.role === "resident" ? "🏘️" : "🤝"} {formData.role === "resident" ? "Resident" : "Volunteer"}</Text>
                {formData.occupationCategory && (
                  <Text style={styles.reviewText}>💼 {formData.occupationCategory}</Text>
                )}
              </View>

              <SectionTitle title="Password Security" subtitle="Create a strong password to protect your account." />
              <Field icon="🔒" label="Password *" value={formData.password} onChange={(v) => updateField("password", v)} secureTextEntry={!showPassword} autoCapitalize="none" />
              <TouchableOpacity style={styles.passwordToggleBtn} onPress={() => setShowPassword((prev) => !prev)}><Text style={styles.passwordToggleText}>{showPassword ? "Hide Password" : "Show Password"}</Text></TouchableOpacity>
              <Field icon="🔐" label="Confirm Password *" value={formData.confirmPassword} onChange={(v) => updateField("confirmPassword", v)} secureTextEntry={!showConfirmPassword} autoCapitalize="none" />
              <TouchableOpacity style={styles.passwordToggleBtn} onPress={() => setShowConfirmPassword((prev) => !prev)}><Text style={styles.passwordToggleText}>{showConfirmPassword ? "Hide Confirm Password" : "Show Confirm Password"}</Text></TouchableOpacity>

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
              {loadingSubmit ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit Registration</Text>}
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
            <Text style={styles.overlayTitle}>Submitting Registration...</Text>
            <Text style={styles.overlayText}>Please wait while we process your information.</Text>
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

  roleRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  roleBtn: { flex: 1, backgroundColor: COLORS.field, borderWidth: 1, borderColor: COLORS.border, paddingVertical: 14, borderRadius: 16, alignItems: "center" },
  roleBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleIcon: { fontSize: 22, marginBottom: 6 },
  roleBtnText: { color: COLORS.text, fontWeight: "900" },
  roleBtnTextActive: { color: "#fff" },

  googleBtn: { backgroundColor: "#fff", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  googleBtnDisabled: { opacity: 0.82 },
  googleBtnText: { fontWeight: "900", color: COLORS.text },
  infoBox: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: "#99f6e4", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },
  infoBoxText: { color: COLORS.primaryDark, fontSize: 12.5, fontWeight: "800", lineHeight: 18 },

  field: { marginBottom: 16 },
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

  cardBox: { backgroundColor: COLORS.field, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 18 },
  skillWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  skillTag: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: "#d1d5db", margin: 5, backgroundColor: "#fff" },
  skillTagActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  skillText: { fontSize: 12.5, fontWeight: "800", color: COLORS.text },
  skillTextActive: { color: "#ffffff" },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  checkboxLabel: { marginLeft: 2, fontSize: 14, color: COLORS.text, flex: 1, fontWeight: "700" },

  passwordToggleBtn: { alignSelf: "flex-start", marginTop: -4, marginBottom: 12 },
  passwordToggleText: { color: COLORS.primary, fontWeight: "900", fontSize: 13 },
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
});