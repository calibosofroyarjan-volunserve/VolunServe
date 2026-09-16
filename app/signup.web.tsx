import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { db } from "../lib/firebase";
import { connectGoogleAccountWeb, signUpUser } from "../lib/firebaseAuth";

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
  "Logistics",
  "IT / Technology",
  "Other (Specify)",
];

const AVAILABILITY_OPTIONS = [
  "Weekdays",
  "Weekends",
  "Evenings",
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

const PHOTO_SLIDES = [
  {
    image: require("../assets/images/slide1.jpg"),
    title: "Join. Help. Rebuild.",
    body: "Be part of a stronger, safer, and more prepared city through volunteerism and community action.",
  },
  {
    image: require("../assets/images/slide2.jpg"),
    title: "Respond Together.",
    body: "Connect residents, volunteers, and local responders when communities need help most.",
  },
  {
    image: require("../assets/images/slide3.jpg"),
    title: "Stronger Communities.",
    body: "Support verified local programs and help San Jose del Monte recover and rebuild.",
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
    subtitle: "Location details for LGU verification.",
    icon: "🏠",
  },
  3: {
    title: "Profile & Availability",
    subtitle: "Tell us how you can help your community.",
    icon: "🧰",
  },
  4: {
    title: "Security & Consent",
    subtitle: "Protect your account and review your registration.",
    icon: "🔐",
  },
};

function sanitizeName(input: string) {
  return input.replace(/[^A-Za-z\s'-]/g, "");
}

function sanitizePhoneLocal(input: string) {
  return input.replace(/\D/g, "").slice(0, 15);
}

type CountryPhone = { name: string; flag: string; code: string; min: number; max: number; placeholder: string };

const COUNTRY_PHONES: CountryPhone[] = [
  { name: "Philippines", flag: "🇵🇭", code: "+63", min: 10, max: 10, placeholder: "912 345 6789" },
  { name: "United States", flag: "🇺🇸", code: "+1", min: 10, max: 10, placeholder: "202 555 0123" },
  { name: "Canada", flag: "🇨🇦", code: "+1", min: 10, max: 10, placeholder: "416 555 0123" },
  { name: "United Kingdom", flag: "🇬🇧", code: "+44", min: 10, max: 10, placeholder: "7400 123456" },
  { name: "Australia", flag: "🇦🇺", code: "+61", min: 9, max: 9, placeholder: "412 345 678" },
  { name: "Japan", flag: "🇯🇵", code: "+81", min: 10, max: 10, placeholder: "90 1234 5678" },
  { name: "South Korea", flag: "🇰🇷", code: "+82", min: 9, max: 10, placeholder: "10 1234 5678" },
  { name: "Singapore", flag: "🇸🇬", code: "+65", min: 8, max: 8, placeholder: "8123 4567" },
  { name: "United Arab Emirates", flag: "🇦🇪", code: "+971", min: 9, max: 9, placeholder: "50 123 4567" },
  { name: "Saudi Arabia", flag: "🇸🇦", code: "+966", min: 9, max: 9, placeholder: "50 123 4567" },
];

function toE164FromLocal(country: CountryPhone, local: string) {
  return `${country.code}${local.replace(/\D/g, "")}`;
}

function formatDateForInput(date: Date | null) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, focused && styles.inputFocused, !editable && styles.disabledInput, invalid && styles.inputInvalid]}>
        {icon ? <Text style={styles.inputIcon}>{icon}</Text> : null}
        <TextInput
          style={[styles.input, styles.inputControl]}
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
  const [countryOpen, setCountryOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryPhone>(COUNTRY_PHONES[0]);

  // Account type is chosen on its own screen before any registration fields.
  const [selectedRole, setSelectedRole] = useState<FormState["role"] | null>(null);
  const [roleConfirmed, setRoleConfirmed] = useState(false);

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

  const today = new Date();
  const maxDOB = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  const minDOB = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());

  useEffect(() => {
    setRegions(ALLOWED_REGIONS);
    if (ALLOWED_REGIONS.length === 1) updateField("region", ALLOWED_REGIONS[0]);
  }, [updateField]);

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
    const middleNameValid = !formData.middleName.trim() || nameOk(formData.middleName);
    const ageNumber = formData.dateOfBirth ? calculateAge(formData.dateOfBirth) : 0;
    const ageValid = !!formData.dateOfBirth && ageNumber >= 18;
    const phoneDigits = formData.phoneLocal.replace(/\D/g, "");
    const phoneValid = phoneDigits.length >= selectedCountry.min && phoneDigits.length <= selectedCountry.max && (selectedCountry.code !== "+63" || /^9\d{9}$/.test(phoneDigits));
    const emailValid = emailRegex.test(formData.email.trim().toLowerCase());
    const step1Valid = lastNameValid && firstNameValid && middleNameValid && ageValid && phoneValid && emailValid && !!formData.role;
    const step2Valid = !!formData.region && !!formData.province && !!formData.city && !!formData.barangay;
    const needsSpec = specializationOptions.length > 0;
    const isOther = formData.occupationCategory === "Other (Specify)";
    const occupationOtherValid = !isOther || formData.occupationOther.trim().length >= 2;
    const specializationValid = !needsSpec || !!formData.occupationSpecialization;
    const residentProfileValid = !!formData.occupationCategory && occupationOtherValid && specializationValid;
    const volunteerProfileValid =
      residentProfileValid &&
      formData.skills.length > 0 &&
      formData.availability.length > 0 &&
      (!formData.skills.includes("Other (Specify)") || formData.skillOther.trim().length >= 2);
    const step3Valid = formData.role === "volunteer" ? volunteerProfileValid : residentProfileValid;
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
    const step4Valid = (googleBound || passwordValid) && formData.acceptTerms && formData.confirmReview;
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
      residentProfileValid,
      volunteerProfileValid,
      step4Valid,
      passwordChecks,
      passwordStrength,
      needsSpec,
      isOther,
    };
  }, [formData, googleBound, selectedCountry, specializationOptions.length]);

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
        3:
          formData.role === "volunteer"
            ? "Please complete your occupation, skills, and availability information."
            : "Please complete your occupation information.",
        4: googleBound
          ? "Please agree to the terms and confirm your information."
          : "Please create a password and agree to the terms.",
      };
      
      Alert.alert("Incomplete Step", stepMessages[step]);
      return;
    }
    Keyboard.dismiss();
    if (step < 4) {
      setStep((prev) => (prev + 1) as Step);
      scrollTop();
    }
  }, [formData.role, googleBound, isStepValid, scrollTop, step]);

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    if (step > 1) {
      setStep((prev) => (prev - 1) as Step);
      scrollTop();
    }
  }, [scrollTop, step]);

  const handleGooglePress = useCallback(async () => {
    try {
      const user = await connectGoogleAccountWeb();
      const googleEmail = (user.email || "").trim().toLowerCase();

      setFormData((previous) => ({
        ...previous,
        email: googleEmail || previous.email,
        firstName: "",
        lastName: "",
        middleName: "",
      }));

      setGoogleBound(true);
      setGoogleProfileLoaded(true);
      setStep(1);
      scrollTop();

      Alert.alert(
        "Google Account Connected",
        "Your verified Google email was added. Enter your legal name and complete the remaining information."
      );
    } catch (error: any) {
      Alert.alert("Google Error", getFriendlyAuthError(error));
    }
  }, [scrollTop]);

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
        authProvider: googleBound ? "google" : "email",
        phoneNumber: toE164FromLocal(selectedCountry, formData.phoneLocal),
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

      const successTitle =
        formData.role === "volunteer"
          ? "Volunteer Registration Submitted"
          : "Resident Registration Submitted";

      const successMessage =
        formData.role === "volunteer"
          ? "Your volunteer registration has been submitted for administrator review. Volunteer access will remain locked until an administrator approves your application."
          : "Your resident registration has been submitted for administrator review. You will receive access after your account is approved.";

      // React Native Alert button callbacks are not reliable on every web
      // browser. Use the browser alert on web, then redirect explicitly.
      if (Platform.OS === "web") {
        window.alert(`${successTitle}\n\n${successMessage}`);
        router.replace("/login");
      } else {
        Alert.alert(
          successTitle,
          successMessage,
          [{ text: "OK", onPress: () => router.replace("/login") }]
        );
      }
    } catch (e: any) {
      const message = getFriendlyAuthError(e);

      if (Platform.OS === "web") {
        window.alert(`Registration Error\n\n${message}`);
      } else {
        Alert.alert("Registration Error", message);
      }
    } finally {
      setLoadingSubmit(false);
    }
  }, [formData, googleBound, loadingSubmit, router, selectedCountry, validation]);

  const currentMeta =
    step === 3
      ? formData.role === "volunteer"
        ? {
            title: "Volunteer Profile",
            subtitle: "Add the skills and availability used for volunteer matching.",
            icon: "🧰",
          }
        : {
            title: "Resident Profile",
            subtitle: "Complete your basic profile information.",
            icon: "👤",
          }
      : STEP_META[step];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={undefined}
    >
      <View style={styles.desktopShell}>
        {width >= 900 ? (
          <View style={styles.photoPanel}>
            <Image source={PHOTO_SLIDES[slideIndex].image} style={styles.photoImage} resizeMode="cover" />
            <View style={styles.photoOverlay} />
            <View style={styles.photoTop}>
              <View style={styles.brandRow}>
                <Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
                <View>
                  <Text style={styles.brandTitle}>VolunServe</Text>
                  <Text style={styles.brandSub}>City Disaster Response Platform</Text>
                </View>
              </View>
              <View style={styles.secureBadge}>
                <Text style={styles.secureBadgeText}>🔒 Secure community registration</Text>
              </View>
            </View>

            <View style={styles.photoControls}>
              <TouchableOpacity style={styles.photoArrow} onPress={() => setSlideIndex((slideIndex + PHOTO_SLIDES.length - 1) % PHOTO_SLIDES.length)}>
                <Text style={styles.photoArrowText}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoArrow} onPress={() => setSlideIndex((slideIndex + 1) % PHOTO_SLIDES.length)}>
                <Text style={styles.photoArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.photoCopy}>
              <View style={styles.photoAccentLine} />
              <Text style={styles.photoTitle}>{PHOTO_SLIDES[slideIndex].title}</Text>
              <Text style={styles.photoBody}>{PHOTO_SLIDES[slideIndex].body}</Text>
              <View style={styles.photoFooter}>
                <View style={styles.dots}>
                  {PHOTO_SLIDES.map((_, index) => (
                    <TouchableOpacity key={index} onPress={() => setSlideIndex(index)} style={[styles.dot, index === slideIndex ? styles.dotOn : styles.dotOff]} />
                  ))}
                </View>
                <Text style={styles.photoLocation}>📍  Stronger Communities{`\n`}     Brighter Tomorrows</Text>
              </View>
            </View>
          </View>
        ) : null}

      <ScrollView
        ref={(r) => { scrollRef.current = r; }}
        style={styles.formScroll}
        contentContainerStyle={[styles.content, width < 900 && styles.contentMobile]}
        keyboardShouldPersistTaps="handled"
      >
        {width < 900 ? (
          <View style={styles.mobileBrand}>
            <Image source={require("../assets/images/logo.png")} style={styles.mobileLogo} resizeMode="contain" />
            <Text style={styles.mobileBrandText}>VolunServe</Text>
          </View>
        ) : null}

        <View style={styles.mainCard}>
          <View style={styles.signupHeading}>
            <Text style={styles.signupTitle}>
              {!roleConfirmed
                ? "Choose your account type"
                : step === 1
                  ? "Personal Details"
                  : currentMeta.title}
            </Text>
            <Text style={styles.signupSubtitle}>
              {!roleConfirmed
                ? "Select how you want to use VolunServe before filling out the registration form."
                : step === 1
                  ? `Registering as ${formData.role === "volunteer" ? "Volunteer" : "Resident"}. Enter your identity and contact information.`
                  : currentMeta.subtitle}
            </Text>
          </View>

          {!roleConfirmed ? (
            <View style={styles.roleSelectionWrap}>
              <View style={[styles.roleSelectionGrid, width < 600 && styles.roleSelectionGridMobile]}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setSelectedRole("resident")}
                  style={[
                    styles.roleChoiceCard,
                    selectedRole === "resident" && styles.roleChoiceCardActive,
                  ]}
                >
                  <View style={[styles.roleChoiceIconWrap, selectedRole === "resident" && styles.roleChoiceIconWrapActive]}>
                    <Text style={styles.roleChoiceIcon}>⌂</Text>
                  </View>
                  <Text style={styles.roleChoiceTitle}>Resident</Text>
                  <Text style={styles.roleChoiceText}>
                    Request assistance, submit community reports, view response maps, receive updates, and access resident services.
                  </Text>
                  <View style={styles.roleChoiceBadge}>
                    <Text style={styles.roleChoiceBadgeText}>Community member</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setSelectedRole("volunteer")}
                  style={[
                    styles.roleChoiceCard,
                    selectedRole === "volunteer" && styles.roleChoiceCardActive,
                  ]}
                >
                  <View style={[styles.roleChoiceIconWrap, selectedRole === "volunteer" && styles.roleChoiceIconWrapActive]}>
                    <Text style={styles.roleChoiceIcon}>♟</Text>
                  </View>
                  <Text style={styles.roleChoiceTitle}>Volunteer</Text>
                  <Text style={styles.roleChoiceText}>
                    Apply to assist verified community response tasks. Skills and availability will be reviewed by an administrator.
                  </Text>
                  <View style={[styles.roleChoiceBadge, styles.roleChoiceBadgeVolunteer]}>
                    <Text style={styles.roleChoiceBadgeText}>Responder applicant</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.roleSelectionHint}>
                You can apply for Volunteer access later from a Resident account, so you do not need two accounts.
              </Text>

              <View style={styles.roleSelectionFooter}>
                <TouchableOpacity onPress={() => router.push("/login")} style={styles.loginLinkWrap}>
                  <Text style={styles.link}>
                    Already have an account? <Text style={styles.linkStrong}>Sign in</Text>
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={!selectedRole}
                  style={[styles.navBtn, styles.primaryBtn, !selectedRole && styles.disabledBtn]}
                  onPress={() => {
                    if (!selectedRole) return;

                    setFormData((prev) => ({
                      ...prev,
                      role: selectedRole,
                      ...(selectedRole === "resident"
                        ? { skills: [], skillOther: "", availability: [] }
                        : {}),
                    }));
                    setRoleConfirmed(true);
                    setStep(1);
                    Keyboard.dismiss();
                    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 0);
                  }}
                >
                  <Text style={styles.primaryText}>Continue  ›</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.selectedRoleBanner}>
                <View style={styles.selectedRoleCopy}>
                  <Text style={styles.selectedRoleLabel}>ACCOUNT TYPE</Text>
                  <Text style={styles.selectedRoleName}>
                    {formData.role === "volunteer" ? "Volunteer" : "Resident"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeRoleBtn}
                  onPress={() => {
                    setSelectedRole(formData.role);
                    setRoleConfirmed(false);
                    setStep(1);
                    Keyboard.dismiss();
                    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 0);
                  }}
                >
                  <Text style={styles.changeRoleText}>Change</Text>
                </TouchableOpacity>
              </View>

        <View style={styles.stepperCard}>
          <View style={styles.stepRow}>
            {[1, 2, 3, 4].map((n) => {
              const active = step >= n;
              const labels = [
                "Personal",
                "Address",
                formData.role === "volunteer" ? "Volunteer" : "Resident",
                "Security",
              ];
              return (
                <View key={n} style={styles.stepItem}>
                  <View style={styles.stepNode}>
                    <View style={[styles.stepCircle, active && styles.stepCircleActive]}>
                      <Text style={[styles.stepCircleText, active && styles.stepCircleTextActive]}>{step > n && step < 4 ? "✓" : n}</Text>
                    </View>
                    <Text style={[styles.stepLabel, step === n && styles.stepLabelActive]}>{labels[n - 1]}</Text>
                  </View>
                  {n < 4 ? <View style={[styles.stepLine, step > n && styles.stepLineActive]} /> : null}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.formCard}>
          {step === 1 && (
            <View>
              <View
                style={[
                  styles.roleInfoBox,
                  formData.role === "volunteer" && styles.roleInfoBoxVolunteer,
                ]}
              >
                <Text style={styles.roleInfoTitle}>
                  {formData.role === "volunteer"
                    ? "Volunteer registration"
                    : "Resident registration"}
                </Text>
                <Text style={styles.roleInfoText}>
                  {formData.role === "volunteer"
                    ? "Complete your identity details first. Skills and availability will be collected on Step 3 before administrator review."
                    : "Complete your identity details first. Resident services will be available after administrator approval, and Volunteer access can still be applied for later."}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleGooglePress}
                disabled={googleProfileLoaded}
                style={[styles.googleBtn, googleProfileLoaded && styles.googleBtnDisabled]}
              >
                <View style={styles.googleButtonContent}>
                  <Text style={styles.googleButtonMark}>G</Text>
                  <Text style={styles.googleBtnText}>{googleProfileLoaded ? "Google Account Connected" : "Continue with Google"}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or register with email</Text>
                <View style={styles.dividerLine} />
              </View>

              <Field icon="✉" label="Email Address" placeholder="you@example.com" value={formData.email} onChange={(v) => updateField("email", v.trim().toLowerCase())} keyboardType="email-address" invalid={!validation.emailValid && formData.email.length > 0} returnKeyType="next" editable={!googleBound} autoCapitalize="none" />
              {formData.email.length > 0 && !validation.emailValid ? <ValidationText ok={false}>Enter a valid email format.</ValidationText> : null}

              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <Field icon="♙" label="First Name" placeholder="" value={formData.firstName} onChange={(v) => updateField("firstName", sanitizeName(v))} invalid={!validation.firstNameValid && formData.firstName.length > 0} returnKeyType="next" />
                </View>
                <View style={styles.formColumn}>
                  <Field icon="♙" label="Last Name" placeholder="" value={formData.lastName} onChange={(v) => updateField("lastName", sanitizeName(v))} invalid={!validation.lastNameValid && formData.lastName.length > 0} returnKeyType="next" />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <Field icon="♙" label="Middle Name (Optional)" placeholder="" value={formData.middleName} onChange={(v) => updateField("middleName", sanitizeName(v))} invalid={formData.middleName.length > 0 && !validation.middleNameValid} returnKeyType="next" />
                </View>
                <View style={styles.formColumn}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Date of Birth</Text>
                    {Platform.OS === "web" ? (
                      <View style={[styles.webDateShell, !validation.ageValid && formData.dateOfBirth !== null && styles.inputInvalid]}>
                        <Text style={styles.webDateIcon}>▣</Text>
                        {React.createElement("input", {
                          type: "date",
                          value: formatDateForInput(formData.dateOfBirth),
                          min: formatDateForInput(minDOB),
                          max: formatDateForInput(maxDOB),
                          onChange: (event: any) => {
                            const value = event.target.value;
                            if (!value) return updateField("dateOfBirth", null);
                            const [year, month, day] = value.split("-").map(Number);
                            updateField("dateOfBirth", new Date(year, month - 1, day));
                          },
                          style: styles.webDateInput as any,
                        })}
                      </View>
                    ) : (
                      <TouchableOpacity activeOpacity={0.9} onPress={() => setDobOpen(true)} style={[styles.input, !validation.ageValid && formData.dateOfBirth !== null && styles.inputInvalid, { justifyContent: "center" }]}>
                        <Text style={{ fontSize: 15, color: formData.dateOfBirth ? COLORS.text : COLORS.lightText, fontWeight: "700" }}>
                          {formData.dateOfBirth ? formatDOB(formData.dateOfBirth) : "MM/DD/YYYY"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              {Platform.OS !== "web" && dobOpen && (
                <DateTimePicker value={formData.dateOfBirth || maxDOB} mode="date" display="default" maximumDate={maxDOB} minimumDate={minDOB} onChange={(_, selectedDate) => {
                  setDobOpen(false);
                  if (selectedDate) updateField("dateOfBirth", selectedDate);
                }} />
              )}
              {formData.dateOfBirth && !validation.ageValid ? <ValidationText ok={false}>You must be at least 18 years old to proceed.</ValidationText> : null}

              <Text style={styles.label}>Mobile Number</Text>
              <View style={styles.phoneWrap}>
                <TouchableOpacity style={styles.phonePrefix} onPress={() => setCountryOpen(true)} activeOpacity={0.8}>
                  <Text style={styles.flag}>{selectedCountry.flag}</Text>
                  <Text style={styles.phonePrefixText}>{selectedCountry.code}</Text>
                  <Text style={styles.countryChevron}>⌄</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.phoneInput, !validation.phoneValid && formData.phoneLocal.length > 0 && styles.inputInvalid]}
                  value={formData.phoneLocal}
                  onChangeText={(v) => updateField("phoneLocal", sanitizePhoneLocal(v.trim()))}
                  keyboardType="phone-pad"
                  placeholder={selectedCountry.placeholder}
                  placeholderTextColor={COLORS.lightText}
                  maxLength={selectedCountry.max}
                  returnKeyType="next"
                />
              </View>
              {formData.phoneLocal.length > 0 && !validation.phoneValid ? <ValidationText ok={false}>Enter a valid {selectedCountry.name} mobile number.</ValidationText> : null}

              <Modal visible={countryOpen} transparent animationType="fade" onRequestClose={() => setCountryOpen(false)}>
                <Pressable style={styles.countryBackdrop} onPress={() => setCountryOpen(false)}>
                  <Pressable style={styles.countryPanel} onPress={(event) => event.stopPropagation()}>
                    <Text style={styles.countryTitle}>Select country</Text>
                    <ScrollView style={styles.countryList}>
                      {COUNTRY_PHONES.map((country) => (
                        <TouchableOpacity
                          key={`${country.name}-${country.code}`}
                          style={[styles.countryItem, selectedCountry.name === country.name && styles.countryItemActive]}
                          onPress={() => {
                            setSelectedCountry(country);
                            updateField("phoneLocal", "");
                            setCountryOpen(false);
                          }}
                        >
                          <Text style={styles.countryFlag}>{country.flag}</Text>
                          <Text style={styles.countryName}>{country.name}</Text>
                          <Text style={styles.countryCode}>{country.code}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </Pressable>
                </Pressable>
              </Modal>
            </View>
          )}

          {step === 2 && (
            <View>
              {loadingAddress ? <View style={styles.loadingRow}><ActivityIndicator color={COLORS.primary} /><Text style={styles.loadingText}>Loading address options…</Text></View> : null}
              <Dropdown label="Region" value={formData.region} options={regions} enabled={false} onChange={(value) => {
                updateField("region", value); updateField("province", ""); updateField("city", ""); updateField("barangay", "");
              }} />
              <View style={styles.formRow}>
                <View style={styles.formColumn}>
                  <Dropdown label="Province" placeholder="Select province" value={formData.province} options={provinces} enabled={!!formData.region && provinces.length > 0} onChange={(value) => {
                    updateField("province", value); updateField("city", ""); updateField("barangay", "");
                  }} />
                </View>
                <View style={styles.formColumn}>
                  <Dropdown label="City" placeholder="Select city" value={formData.city} options={cities} enabled={!!formData.province && cities.length > 0} onChange={(value) => {
                    updateField("city", value); updateField("barangay", "");
                  }} />
                </View>
              </View>
              <Dropdown label="Barangay" placeholder="Select barangay" value={formData.barangay} options={barangays} enabled={!!formData.city && barangays.length > 0} onChange={(value) => updateField("barangay", value)} />
              <View style={styles.addressNotice}>
                <Text style={styles.addressNoticeIcon}>📍</Text>
                <Text style={styles.addressNoticeText}>Your address helps the LGU verify your account and coordinate local response.</Text>
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <View
                style={[
                  styles.profileModeBanner,
                  formData.role === "volunteer" && styles.profileModeBannerVolunteer,
                ]}
              >
                <Text style={styles.profileModeTitle}>
                  {formData.role === "volunteer" ? "Volunteer Applicant Profile" : "Resident Profile"}
                </Text>
                <Text style={styles.profileModeText}>
                  {formData.role === "volunteer"
                    ? "These details help administrators review your application and later match you with suitable response tasks."
                    : "Residents only need basic profile information here. Volunteer skills and availability are not required for Resident registration."}
                </Text>
              </View>

              <Dropdown
                label="Occupation Category"
                placeholder="Select your occupation category"
                value={formData.occupationCategory}
                options={OCCUPATION_OPTIONS}
                onChange={(value) => {
                  updateField("occupationCategory", value);
                  updateField("occupationSpecialization", "");
                  updateField("occupationOther", "");
                }}
              />

              {validation.needsSpec && (
                <Dropdown
                  icon="📌"
                  label="Specialization *"
                  value={formData.occupationSpecialization}
                  options={specializationOptions}
                  enabled={!!formData.occupationCategory}
                  onChange={(value) => updateField("occupationSpecialization", value)}
                />
              )}

              {validation.isOther && (
                <Field
                  icon="✍️"
                  label="Specify Occupation *"
                  value={formData.occupationOther}
                  onChange={(v) => updateField("occupationOther", v)}
                  invalid={
                    formData.occupationOther.length > 0 &&
                    formData.occupationOther.trim().length < 2
                  }
                />
              )}

              {formData.role === "volunteer" ? (
                <>
                  <Text style={styles.groupLabel}>Volunteer Skills *</Text>
                  <Text style={styles.helperText}>Select at least one skill.</Text>
                  <View style={styles.cardBox}>
                    <View style={styles.skillWrap}>
                      {SKILL_OPTIONS.map((skill) => {
                        const active = formData.skills.includes(skill);
                        return (
                          <Pressable
                            key={skill}
                            onPress={() =>
                              updateField(
                                "skills",
                                toggleSelection(formData.skills, skill)
                              )
                            }
                            style={[styles.skillTag, active && styles.skillTagActive]}
                          >
                            <Text
                              style={[
                                styles.skillText,
                                active && styles.skillTextActive,
                              ]}
                            >
                              {skill}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {formData.skills.includes("Other (Specify)") && (
                      <View style={{ width: "100%" }}>
                        <Field
                          icon="✍️"
                          label="Specify Skill *"
                          value={formData.skillOther}
                          onChange={(v) => updateField("skillOther", v)}
                          invalid={
                            formData.skillOther.length > 0 &&
                            formData.skillOther.trim().length < 2
                          }
                        />
                      </View>
                    )}
                  </View>

                  <Text style={styles.groupLabel}>Volunteer Availability *</Text>
                  <Text style={styles.helperText}>Select at least one availability period.</Text>
                  <View style={styles.cardBox}>
                    {AVAILABILITY_OPTIONS.map((item) => {
                      const active = formData.availability.includes(item);
                      return (
                        <TouchableOpacity
                          key={item}
                          style={styles.checkboxRow}
                          onPress={() =>
                            updateField(
                              "availability",
                              toggleSelection(formData.availability, item)
                            )
                          }
                          activeOpacity={0.85}
                        >
                          <View
                            style={[styles.checkbox, active && styles.checkboxOn]}
                          >
                            {active ? (
                              <Text style={styles.checkboxTick}>✓</Text>
                            ) : null}
                          </View>
                          <Text style={styles.checkboxLabel}>{item}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.profileNotice}>
                    <Text style={styles.profileNoticeIcon}>ⓘ</Text>
                    <Text style={styles.profileNoticeText}>
                      Volunteer access is not automatic. Your account stays pending until an administrator reviews and approves the volunteer registration.
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.residentNotice}>
                  <Text style={styles.residentNoticeIcon}>⌂</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.residentNoticeTitle}>Resident registration</Text>
                    <Text style={styles.residentNoticeText}>
                      Skills and volunteer availability are skipped. After approval, you will enter Resident Mode and may apply for Volunteer access later.
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {step === 4 && (
            <View>
              {googleBound ? (
                <View style={styles.googleConnectedCard}>
                  <View style={styles.googleMark}><Text style={styles.googleMarkText}>G</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.googleConnectedTitle}>Google account connected</Text>
                    <Text style={styles.googleConnectedEmail}>{formData.email}</Text>
                  </View>
                  <View style={styles.verifiedBadge}><Text style={styles.verifiedBadgeText}>✓ Verified</Text></View>
                </View>
              ) : (
                <>
                  <SectionTitle title="Password Security" subtitle="Create a strong password to protect your account." />
                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Field icon="🔒" label="Password *" value={formData.password} onChange={(v) => updateField("password", v)} secureTextEntry={!showPassword} autoCapitalize="none" />
                      <TouchableOpacity style={styles.passwordToggleBtn} onPress={() => setShowPassword((prev) => !prev)}><Text style={styles.passwordToggleText}>{showPassword ? "Hide Password" : "Show Password"}</Text></TouchableOpacity>
                    </View>
                    <View style={styles.formColumn}>
                      <Field icon="🔐" label="Confirm Password *" value={formData.confirmPassword} onChange={(v) => updateField("confirmPassword", v)} secureTextEntry={!showConfirmPassword} autoCapitalize="none" />
                      <TouchableOpacity style={styles.passwordToggleBtn} onPress={() => setShowConfirmPassword((prev) => !prev)}><Text style={styles.passwordToggleText}>{showConfirmPassword ? "Hide Confirm Password" : "Show Confirm Password"}</Text></TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.passwordPanel}>
                    <Text style={styles.passwordStrength}>Password Strength: {validation.passwordStrength}</Text>
                    <View style={styles.requirementsGrid}>
                      <ValidationText ok={validation.passwordChecks.minLength}>Minimum 8 characters.</ValidationText>
                      <ValidationText ok={validation.passwordChecks.upper}>One uppercase letter.</ValidationText>
                      <ValidationText ok={validation.passwordChecks.lower}>One lowercase letter.</ValidationText>
                      <ValidationText ok={validation.passwordChecks.number}>One number.</ValidationText>
                      <ValidationText ok={validation.passwordChecks.special}>One special character.</ValidationText>
                      <ValidationText ok={validation.passwordChecks.matches}>Passwords match.</ValidationText>
                    </View>
                  </View>
                </>
              )}

              <View style={styles.consentBox}><CheckRow label="I agree to the Terms of Service and Privacy Policy." checked={formData.acceptTerms} onPress={() => updateField("acceptTerms", !formData.acceptTerms)} /></View>
              <View style={styles.consentBox}><CheckRow label="I confirm that the information provided is accurate." checked={formData.confirmReview} onPress={() => updateField("confirmReview", !formData.confirmReview)} /></View>
              <View style={styles.reviewNotice}>
                <Text style={styles.reviewNoticeIcon}>ⓘ</Text>
                <Text style={styles.reviewNoticeText}>
                  {formData.role === "volunteer"
                    ? "Your volunteer registration will be submitted for administrator review. Volunteer Mode stays locked until approval."
                    : "Your resident registration will be submitted for administrator review."}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={[styles.footerRow, step === 4 && styles.footerColumn]}>
          {step === 1 ? (
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.loginLinkWrap}>
              <Text style={styles.link}>Already have an account? <Text style={styles.linkStrong}>Sign in</Text></Text>
            </TouchableOpacity>
          ) : null}

          <View style={[styles.actions, step > 1 && styles.actionsWide]}>
          {step > 1 && (
            <TouchableOpacity style={[styles.navBtn, styles.secondaryBtn]} onPress={goBack} disabled={loadingSubmit}>
              <Text style={styles.secondaryText}>‹  Back</Text>
            </TouchableOpacity>
          )}

          {step < 4 ? (
            <TouchableOpacity style={[styles.navBtn, styles.primaryBtn, !isStepValid(step) && styles.disabledBtn]} onPress={goNext} disabled={!isStepValid(step)}>
              <Text style={styles.primaryText}>Continue  ›</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.navBtn, styles.primaryBtn, (!validation.step4Valid || loadingSubmit) && styles.disabledBtn]} onPress={handleSubmit} disabled={!validation.step4Valid || loadingSubmit}>
              {loadingSubmit ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  {formData.role === "volunteer"
                    ? "Submit Volunteer Registration  ›"
                    : "Submit Resident Registration  ›"}
                </Text>
              )}
            </TouchableOpacity>
          )}
          </View>
          {step === 4 ? (
            <TouchableOpacity onPress={() => router.push("/login")} style={styles.loginLinkWrap}>
              <Text style={styles.link}>Already have an account? <Text style={styles.linkStrong}>Sign in</Text></Text>
            </TouchableOpacity>
          ) : null}
        </View>
            </>
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
      </View>

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
  screen: { flex: 1, height: "100vh" as any, backgroundColor: "#eef4f7" },
  desktopShell: { flex: 1, flexDirection: "row", minHeight: 0 },
  photoPanel: { position: "relative", width: "46%", minWidth: 520, height: "100%", justifyContent: "space-between", overflow: "hidden", backgroundColor: COLORS.primaryDark },
  photoImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  photoOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(2, 55, 61, 0.52)" },
  photoTop: { paddingHorizontal: 48, paddingTop: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  secureBadge: { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(4,74,78,0.42)", borderRadius: 14, paddingHorizontal: 17, paddingVertical: 11, maxWidth: 205 },
  secureBadgeText: { color: "#fff", fontSize: 12, lineHeight: 16, fontWeight: "800" },
  photoControls: { position: "absolute", top: "48%", left: 28, right: 28, flexDirection: "row", justifyContent: "space-between" },
  photoArrow: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.7)", backgroundColor: "rgba(3,35,42,0.5)", alignItems: "center", justifyContent: "center" },
  photoArrowText: { color: "#fff", fontSize: 38, lineHeight: 40, fontWeight: "300" },
  photoCopy: { paddingHorizontal: 48, paddingBottom: 46 },
  photoAccentLine: { width: 82, height: 4, borderRadius: 4, backgroundColor: "#2dd4bf", marginBottom: 30 },
  photoAccent: { color: "#5eead4", fontSize: 12, letterSpacing: 1.7, fontWeight: "900", marginBottom: 12 },
  photoTitle: { color: "#fff", fontSize: 50, lineHeight: 57, fontWeight: "900", marginBottom: 17 },
  photoBody: { color: "#f0fdfa", fontSize: 17, lineHeight: 27, maxWidth: 570, fontWeight: "500" },
  photoFooter: { marginTop: 38, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  photoLocation: { color: "#d7f7f3", fontSize: 12, fontWeight: "700" },
  formScroll: { flex: 1, backgroundColor: "#eef7fb" },
  content: { width: "100%", maxWidth: 610, alignSelf: "center", justifyContent: "flex-start", minHeight: "100%", paddingHorizontal: 0, paddingTop: 54, paddingBottom: 54 },
  contentMobile: { maxWidth: 610, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 30 },
  mobileBrand: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  mobileLogo: { width: 38, height: 38, borderRadius: 10, marginRight: 9 },
  mobileBrandText: { color: COLORS.primaryDark, fontSize: 20, fontWeight: "900" },
  mainCard: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#dce6eb", paddingHorizontal: 32, paddingVertical: 34, shadowColor: "#64748b", shadowOpacity: 0.12, shadowRadius: 22, elevation: 5 },
  signupHeading: { alignItems: "center", marginBottom: 22 },
  signupTitle: { color: COLORS.text, fontSize: 31, lineHeight: 37, fontWeight: "900", textAlign: "center" },
  signupSubtitle: { color: COLORS.muted, fontSize: 15, marginTop: 4, fontWeight: "500", textAlign: "center", lineHeight: 21 },

  roleSelectionWrap: { marginTop: 4 },
  roleSelectionGrid: { flexDirection: "row", gap: 14 },
  roleSelectionGridMobile: { flexDirection: "column" },
  roleChoiceCard: {
    flex: 1,
    minHeight: 230,
    borderWidth: 1.5,
    borderColor: "#d7e1e7",
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    padding: 20,
    alignItems: "flex-start",
  },
  roleChoiceCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#effaf8",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },
  roleChoiceIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#e7edf2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  roleChoiceIconWrapActive: { backgroundColor: COLORS.primarySoft },
  roleChoiceIcon: { fontSize: 24, color: COLORS.primaryDark },
  roleChoiceTitle: { color: COLORS.text, fontSize: 19, fontWeight: "900", marginBottom: 8 },
  roleChoiceText: { color: COLORS.muted, fontSize: 12.5, lineHeight: 19, fontWeight: "600", flex: 1 },
  roleChoiceBadge: {
    marginTop: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
  },
  roleChoiceBadgeVolunteer: { backgroundColor: "#dcfce7" },
  roleChoiceBadgeText: { color: "#334155", fontSize: 10.5, fontWeight: "900" },
  roleSelectionHint: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    color: COLORS.muted,
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "650" as any,
    textAlign: "center",
  },
  roleSelectionFooter: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  selectedRoleBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#cde5e1",
    backgroundColor: "#f0fdfa",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  selectedRoleCopy: { minWidth: 0 },
  selectedRoleLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  selectedRoleName: { color: COLORS.primaryDark, fontSize: 14, fontWeight: "900", marginTop: 2 },
  changeRoleBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#b7d8d3" },
  changeRoleText: { color: COLORS.primary, fontSize: 11.5, fontWeight: "900" },

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
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 62, height: 62, marginRight: 12, backgroundColor: "#fff", borderRadius: 18 },
  brandTitle: { color: "#fff", fontSize: 32, fontWeight: "900" },
  brandSub: { color: "#e6fffb", fontSize: 13, fontWeight: "500", marginTop: 2 },
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
  dots: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 99 },
  dotOn: { width: 28, backgroundColor: "#2dd4bf" },
  dotOff: { backgroundColor: "rgba(255,255,255,0.6)" },

  stepperCard: {
    backgroundColor: "transparent",
    paddingHorizontal: 4,
    paddingVertical: 0,
    marginBottom: 28,
  },
  stepperTop: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  stepIconBubble: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primarySoft, justifyContent: "center", alignItems: "center", marginRight: 12 },
  stepIcon: { fontSize: 22 },
  stepperTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  stepperSub: { color: COLORS.muted, fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  stepCounter: { color: COLORS.primary, fontSize: 14, fontWeight: "900" },
  stepRow: { flexDirection: "row", alignItems: "flex-start" },
  stepItem: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  stepNode: { width: 70, alignItems: "center" },
  stepCircle: { width: 38, height: 38, borderRadius: 999, backgroundColor: "#e7edf2", justifyContent: "center", alignItems: "center" },
  stepCircleActive: { backgroundColor: COLORS.primary },
  stepCircleText: { color: COLORS.muted, fontSize: 12, fontWeight: "900" },
  stepCircleTextActive: { color: "#fff" },
  stepLabel: { color: "#334155", fontSize: 11.5, fontWeight: "700", marginTop: 7 },
  stepLabelActive: { color: COLORS.primaryDark, fontWeight: "900" },
  stepLine: { flex: 1, height: 2, backgroundColor: "#dbe5eb", marginHorizontal: -9, marginTop: 18, borderRadius: 999 },
  stepLineActive: { backgroundColor: COLORS.primary },

  progressBarWrap: { marginTop: 12 },
  progressBar: { height: 6, backgroundColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 10 },
  progressText: { fontSize: 11, marginTop: 6, color: COLORS.muted, fontWeight: "700", textAlign: "center" },

  formCard: {
    backgroundColor: "transparent",
    padding: 0,
    marginBottom: 6,
  },
  sectionHeaderWrap: { marginBottom: 14 },
  sectionHeader: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  sectionSubheader: { fontSize: 12.5, color: COLORS.muted, fontWeight: "600", marginTop: 4, lineHeight: 18 },

  roleRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  roleBtn: { flex: 1, minHeight: 56, flexDirection: "row", justifyContent: "center", backgroundColor: "#f5f8fa", borderWidth: 1.5, borderColor: "#d9e2e8", paddingVertical: 12, borderRadius: 9, alignItems: "center" },
  roleBtnActive: { backgroundColor: "#eefafa", borderColor: COLORS.primary },
  roleIcon: { fontSize: 19, marginRight: 9 },
  roleBtnText: { color: COLORS.text, fontWeight: "900" },
  roleBtnTextActive: { color: COLORS.primary },
  roleInfoBox: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 10, padding: 12, marginBottom: 14 },
  roleInfoBoxVolunteer: { backgroundColor: "#f0fdfa", borderColor: "#99f6e4" },
  roleInfoTitle: { color: COLORS.text, fontSize: 13, fontWeight: "900", marginBottom: 4 },
  roleInfoText: { color: COLORS.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

  googleBtn: { backgroundColor: "#fff", paddingVertical: 14, borderRadius: 9, borderWidth: 1, borderColor: "#d7e0e6", alignItems: "center" },
  googleBtnDisabled: { opacity: 0.82 },
  googleBtnText: { fontWeight: "900", color: COLORS.text },
  googleButtonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleButtonMark: { color: "#2563eb", fontSize: 20, fontWeight: "900" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  infoBox: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: "#99f6e4", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },
  infoBoxText: { color: COLORS.primaryDark, fontSize: 12.5, fontWeight: "800", lineHeight: 18 },

  formRow: { flexDirection: "row", gap: 14 },
  formColumn: { flex: 1, minWidth: 0 },
  field: { marginBottom: 14 },
  label: { fontSize: 12.5, fontWeight: "800", color: "#172033", marginBottom: 7 },
  groupLabel: { fontSize: 13, fontWeight: "900", color: "#172033", marginTop: 3, marginBottom: 7 },
  helperText: { color: COLORS.muted, fontSize: 11.5, fontWeight: "600", marginTop: -3, marginBottom: 10 },
  profileModeBanner: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 10, padding: 14, marginBottom: 18 },
  profileModeBannerVolunteer: { backgroundColor: "#f0fdfa", borderColor: "#99f6e4" },
  profileModeTitle: { color: COLORS.text, fontSize: 14, fontWeight: "900", marginBottom: 4 },
  profileModeText: { color: COLORS.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  residentNotice: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 10, padding: 14, marginTop: 4 },
  residentNoticeIcon: { fontSize: 22, marginRight: 12, color: COLORS.accent },
  residentNoticeTitle: { color: COLORS.text, fontSize: 13.5, fontWeight: "900", marginBottom: 4 },
  residentNoticeText: { color: COLORS.muted, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  inputShell: { height: 46, flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfdbe3", borderRadius: 8, paddingLeft: 13 },
  inputIcon: { color: "#64748b", fontSize: 16, width: 25, textAlign: "center" },
  input: { height: 46, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfdbe3", borderRadius: 8, paddingVertical: 0, paddingHorizontal: 13, fontSize: 14, color: COLORS.text, fontWeight: "600" },
  inputControl: { flex: 1, height: 44, borderWidth: 0, backgroundColor: "transparent", paddingLeft: 9 },
  webDateShell: { height: 46, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#cfdbe3", borderRadius: 8, backgroundColor: "#fff", paddingHorizontal: 12 },
  webDateIcon: { color: "#64748b", fontSize: 15, marginRight: 9 },
  webDateInput: { flex: 1, height: 42, borderWidth: 0, backgroundColor: "transparent", color: COLORS.text, fontSize: 14, fontWeight: "600" },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: "#fff" },
  inputInvalid: { borderColor: COLORS.danger },
  disabledInput: { backgroundColor: "#f1f5f9", opacity: 0.85 },

  validation: { fontSize: 11, marginBottom: 8, fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  checkLabel: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: "700", lineHeight: 18 },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderColor: "#cbd5e1", borderRadius: 7, marginRight: 10, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxTick: { color: "#fff", fontWeight: "900", fontSize: 13 },

  phoneWrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#cfdbe3", borderRadius: 8, overflow: "hidden", marginBottom: 12 },
  phonePrefix: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 46, borderRightWidth: 1, borderRightColor: COLORS.border, backgroundColor: "#fff" },
  flag: { fontSize: 18 },
  phonePrefixText: { fontSize: 14, fontWeight: "900", color: COLORS.text },
  countryChevron: { color: COLORS.muted, fontSize: 13, marginLeft: 2 },
  phoneInput: { flex: 1, height: 46, paddingHorizontal: 14, fontSize: 14, backgroundColor: "#fff", color: COLORS.text, fontWeight: "600" },
  countryBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.38)", justifyContent: "center", alignItems: "center", padding: 20 },
  countryPanel: { width: "100%", maxWidth: 430, maxHeight: 560, backgroundColor: "#fff", borderRadius: 16, padding: 18, shadowColor: "#0f172a", shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  countryTitle: { color: COLORS.text, fontSize: 19, fontWeight: "900", marginBottom: 12 },
  countryList: { maxHeight: 470 },
  countryItem: { minHeight: 50, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 10, marginBottom: 5 },
  countryItemActive: { backgroundColor: "#ecfdf5" },
  countryFlag: { fontSize: 23, marginRight: 12 },
  countryName: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "700" },
  countryCode: { color: COLORS.primary, fontSize: 14, fontWeight: "900" },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, backgroundColor: COLORS.field, padding: 12, borderRadius: 14 },
  loadingText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  addressNotice: { flexDirection: "row", alignItems: "center", backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#a5f3fc", borderRadius: 14, padding: 14, marginTop: 4 },
  addressNoticeIcon: { fontSize: 22, marginRight: 10 },
  addressNoticeText: { flex: 1, color: "#155e75", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  profileNotice: { flexDirection: "row", alignItems: "center", backgroundColor: "#f1f6f9", borderRadius: 8, paddingVertical: 14, paddingHorizontal: 15, marginTop: 2 },
  profileNoticeIcon: { color: "#0e7490", fontSize: 22, marginRight: 12, fontWeight: "900" },
  profileNoticeText: { flex: 1, color: "#64748b", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

  cardBox: { backgroundColor: "transparent", borderRadius: 0, padding: 0, borderWidth: 0, marginBottom: 20, flexDirection: "row", flexWrap: "wrap" },
  skillWrap: { width: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 8 },
  skillTag: { width: "32%", minHeight: 42, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1", marginBottom: 9, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center" },
  skillTagActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  skillText: { fontSize: 11.5, lineHeight: 15, fontWeight: "800", color: COLORS.text, textAlign: "center" },
  skillTextActive: { color: "#ffffff" },
  checkboxRow: { width: "33.333%", flexDirection: "row", alignItems: "center", marginBottom: 12 },
  checkboxLabel: { marginLeft: 2, fontSize: 14, color: COLORS.text, flex: 1, fontWeight: "700" },

  passwordToggleBtn: { alignSelf: "flex-start", marginTop: -4, marginBottom: 12 },
  passwordToggleText: { color: COLORS.primary, fontWeight: "900", fontSize: 13 },
  passwordPanel: { backgroundColor: COLORS.field, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 18 },
  passwordStrength: { color: COLORS.text, fontWeight: "900", fontSize: 14, marginBottom: 8 },
  requirementsGrid: { flexDirection: "row", flexWrap: "wrap", columnGap: 18 },
  googleConnectedCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0", borderRadius: 16, padding: 16, marginBottom: 20 },
  googleMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: COLORS.border },
  googleMarkText: { color: "#2563eb", fontSize: 23, fontWeight: "900" },
  googleConnectedTitle: { color: COLORS.text, fontSize: 14, fontWeight: "900" },
  googleConnectedEmail: { color: COLORS.muted, fontSize: 12, marginTop: 3, fontWeight: "600" },
  verifiedBadge: { backgroundColor: "#d1fae5", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  verifiedBadgeText: { color: "#047857", fontSize: 11, fontWeight: "900" },
  consentBox: { borderWidth: 1, borderColor: "#cfdbe3", borderRadius: 8, paddingHorizontal: 14, paddingTop: 13, marginBottom: 12, backgroundColor: "#fff" },
  reviewNotice: { flexDirection: "row", alignItems: "center", backgroundColor: "#e0f2fe", borderRadius: 8, paddingVertical: 16, paddingHorizontal: 16, marginTop: 14 },
  reviewNoticeIcon: { color: "#0284c7", fontSize: 22, marginRight: 12, fontWeight: "900" },
  reviewNoticeText: { color: "#475569", fontSize: 12.5, fontWeight: "600", flex: 1 },

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

  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, gap: 16, flexWrap: "wrap" },
  footerColumn: { flexDirection: "column", alignItems: "stretch" },
  actions: { flexDirection: "row", justifyContent: "space-between", marginLeft: "auto", gap: 82 },
  actionsWide: { width: "100%", marginLeft: 0 },
  navBtn: { minWidth: 160, paddingVertical: 15, paddingHorizontal: 22, borderRadius: 8, alignItems: "center", borderWidth: 1.5, borderColor: COLORS.primary },
  primaryBtn: { backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOpacity: 0.22, shadowRadius: 8, elevation: 4 },
  secondaryBtn: { backgroundColor: "#fff" },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondaryText: { color: COLORS.primary, fontWeight: "900" },
  disabledBtn: { opacity: 0.5 },
  loginLinkWrap: { paddingVertical: 10 },
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