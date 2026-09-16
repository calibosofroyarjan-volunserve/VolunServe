import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    doc,
    onSnapshot,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";

import { db } from "../../lib/firebase";
import {
    hasVolunteerAccess,
    setActiveUserMode,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type ApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | null;

type VolunteerApplication = {
  uid?: string;
  status?: "pending" | "approved" | "rejected";
  skills?: string[];
  availability?: string[];
  experienceTraining?: string;
  preferredActivity?: string;
  emergencyContact?: string;
  motivation?: string;
  rejectedReason?: string;
  createdAt?: any;
  reviewedAt?: any;
};

const SKILLS = [
  "First Aid",
  "Medical Assistance",
  "Search and Rescue",
  "Driving",
  "Logistics",
  "IT / Technology",
  "Relief Distribution",
  "Community Coordination",
];

const AVAILABILITY = [
  "Weekdays",
  "Weekends",
  "Evenings",
  "Emergency / On-call",
];

const PREFERRED_ACTIVITIES = [
  "General Disaster Response",
  "Relief Distribution",
  "Evacuation Assistance",
  "Medical / First Aid Support",
  "Search and Rescue Support",
  "Logistics and Transport",
  "IT / Communications",
];

function toggle(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export default function VolunteerApplicationWeb() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, profile } = useUserSession();

  const [loadingApplication, setLoadingApplication] = useState(true);
  const [application, setApplication] =
    useState<VolunteerApplication | null>(null);

  const [skills, setSkills] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  const [experienceTraining, setExperienceTraining] = useState("");
  const [preferredActivity, setPreferredActivity] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [motivation, setMotivation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(false);

  const compact = width < 900;

  const approvedVolunteer = hasVolunteerAccess(profile);

  const applicationStatus: ApplicationStatus =
    approvedVolunteer
      ? "approved"
      : application?.status || null;

  const fullName =
    profile?.fullName?.trim() ||
    [
      profile?.firstName,
      profile?.middleName,
      profile?.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    user?.displayName ||
    "VolunServe Resident";

  useEffect(() => {
    if (!user) {
      setApplication(null);
      setLoadingApplication(false);
      return;
    }

    setLoadingApplication(true);

    return onSnapshot(
      doc(db, "volunteerApplications", user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          const data =
            snapshot.data() as VolunteerApplication;

          setApplication({
            uid: snapshot.id,
            ...data,
          });

          setSkills(data.skills || []);
          setAvailability(data.availability || []);
          setExperienceTraining(
            data.experienceTraining || ""
          );
          setPreferredActivity(
            data.preferredActivity || ""
          );
          setEmergencyContact(
            data.emergencyContact || ""
          );
          setMotivation(data.motivation || "");
        } else {
          setApplication(null);
        }

        setLoadingApplication(false);
      },
      (error) => {
        console.log(
          "volunteer application listener error",
          error
        );
        setLoadingApplication(false);
      }
    );
  }, [user]);

  const formValid = useMemo(() => {
    return (
      skills.length > 0 &&
      availability.length > 0 &&
      preferredActivity.length > 0 &&
      experienceTraining.trim().length >= 5 &&
      motivation.trim().length >= 15
    );
  }, [
    availability,
    experienceTraining,
    motivation,
    preferredActivity,
    skills,
  ]);

  const submitApplication = async () => {
    if (!user || !profile) {
      Alert.alert(
        "Sign in required",
        "Please sign in again before submitting your volunteer application."
      );
      return;
    }

    if (approvedVolunteer) {
      Alert.alert(
        "Already approved",
        "Your account already has volunteer access."
      );
      return;
    }

    if (application) {
      Alert.alert(
        "Application already submitted",
        "You already have a volunteer application on record."
      );
      return;
    }

    if (!formValid) {
      Alert.alert(
        "Complete the form",
        "Select at least one skill and availability, choose a preferred activity, and complete your experience and motivation."
      );
      return;
    }

    try {
      setSubmitting(true);

      await setDoc(
        doc(
          db,
          "volunteerApplications",
          user.uid
        ),
        {
          uid: user.uid,
          source: "resident_application",
          applicantType: "existing_resident",
          requestedRole: "volunteer",

          fullName,
          email:
            profile.email ||
            user.email ||
            "",
          barangay:
            profile.barangay || "",
          phone:
            profile.phoneNumber || "",
          phoneNumber:
            profile.phoneNumber || "",

          occupationCategory:
            profile.occupationCategory || "",
          occupationSpecialization:
            profile.occupationSpecialization || "",
          occupationOther:
            profile.occupationOther || "",

          skills,
          availability,
          experienceTraining:
            experienceTraining.trim(),
          preferredActivity,
          emergencyContact:
            emergencyContact.trim(),
          motivation:
            motivation.trim(),

          status: "pending",
          createdAt:
            serverTimestamp(),
          updatedAt:
            serverTimestamp(),
        }
      );

      Alert.alert(
        "Application submitted",
        "Your volunteer application is now pending administrator review. You will remain in Resident Mode until it is approved."
      );
    } catch (error: any) {
      console.log(
        "volunteer application submit error",
        error
      );

      Alert.alert(
        "Unable to submit",
        error?.code === "permission-denied"
          ? "Permission denied. Make sure the latest Firestore rules are deployed."
          : error?.message ||
              "Your application could not be submitted."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const switchToVolunteer = async () => {
    if (!user || !approvedVolunteer) {
      return;
    }

    try {
      setSwitching(true);
      await setActiveUserMode("volunteer");
      router.replace("/(tabs)");
    } catch (error: any) {
      Alert.alert(
        "Mode switch failed",
        error?.message ||
          "Unable to switch to Volunteer Mode."
      );
    } finally {
      setSwitching(false);
    }
  };

  if (!user || !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#0F766E"
        />
        <Text style={styles.centerText}>
          Checking your account...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.page}>
          <View style={styles.header}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons
                name="chevron-back"
                size={23}
                color="#0F172A"
              />
            </Pressable>

            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>
                VOLUNSERVE • RESIDENT ACCESS
              </Text>
              <Text style={styles.title}>
                Apply as a Volunteer
              </Text>
              <Text style={styles.subtitle}>
                Add volunteer access to your existing resident account. Your resident access will remain active.
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.layout,
              compact && styles.layoutCompact,
            ]}
          >
            <View style={styles.mainCard}>
              {loadingApplication ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator
                    color="#0F766E"
                  />
                  <Text style={styles.loadingText}>
                    Checking volunteer status...
                  </Text>
                </View>
              ) : applicationStatus === "approved" ? (
                <StatusPanel
                  icon="checkmark-circle"
                  title="Volunteer Access Approved"
                  text="Your volunteer access is active. You can keep using Resident Mode or switch to Volunteer Mode when you are ready to respond."
                  tone="approved"
                >
                  <Pressable
                    style={[
                      styles.primaryButton,
                      switching &&
                        styles.disabledButton,
                    ]}
                    disabled={switching}
                    onPress={switchToVolunteer}
                  >
                    {switching ? (
                      <ActivityIndicator
                        color="#FFFFFF"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="swap-horizontal"
                          size={19}
                          color="#FFFFFF"
                        />
                        <Text
                          style={
                            styles.primaryButtonText
                          }
                        >
                          Switch to Volunteer Mode
                        </Text>
                      </>
                    )}
                  </Pressable>
                </StatusPanel>
              ) : applicationStatus === "pending" ? (
                <StatusPanel
                  icon="time"
                  title="Pending Administrator Review"
                  text="Your volunteer application has been submitted. You will stay in Resident Mode while the administrator verifies your application."
                  tone="pending"
                />
              ) : applicationStatus === "rejected" ? (
                <StatusPanel
                  icon="close-circle"
                  title="Volunteer Application Rejected"
                  text={
                    application?.rejectedReason
                      ? `Reason: ${application.rejectedReason}`
                      : "Your application was not approved. Please contact the administrator if you need clarification or want to submit updated requirements."
                  }
                  tone="rejected"
                />
              ) : (
                <>
                  <SectionHeading
                    number="1"
                    title="Skills"
                    text="Select the skills that can help during community or disaster-response operations."
                  />

                  <View style={styles.chipGrid}>
                    {SKILLS.map((skill) => {
                      const selected =
                        skills.includes(skill);

                      return (
                        <Pressable
                          key={skill}
                          style={[
                            styles.chip,
                            selected &&
                              styles.chipSelected,
                          ]}
                          onPress={() =>
                            setSkills((current) =>
                              toggle(
                                current,
                                skill
                              )
                            )
                          }
                        >
                          <Ionicons
                            name={
                              selected
                                ? "checkmark-circle"
                                : "ellipse-outline"
                            }
                            size={17}
                            color={
                              selected
                                ? "#FFFFFF"
                                : "#475569"
                            }
                          />
                          <Text
                            style={[
                              styles.chipText,
                              selected &&
                                styles.chipTextSelected,
                            ]}
                          >
                            {skill}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <SectionHeading
                    number="2"
                    title="Availability"
                    text="Tell the response team when you are generally available."
                  />

                  <View style={styles.chipGrid}>
                    {AVAILABILITY.map((item) => {
                      const selected =
                        availability.includes(
                          item
                        );

                      return (
                        <Pressable
                          key={item}
                          style={[
                            styles.chip,
                            selected &&
                              styles.chipSelected,
                          ]}
                          onPress={() =>
                            setAvailability(
                              (current) =>
                                toggle(
                                  current,
                                  item
                                )
                            )
                          }
                        >
                          <Ionicons
                            name={
                              selected
                                ? "checkmark-circle"
                                : "ellipse-outline"
                            }
                            size={17}
                            color={
                              selected
                                ? "#FFFFFF"
                                : "#475569"
                            }
                          />
                          <Text
                            style={[
                              styles.chipText,
                              selected &&
                                styles.chipTextSelected,
                            ]}
                          >
                            {item}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <SectionHeading
                    number="3"
                    title="Preferred Activity"
                    text="Choose the type of response work you prefer."
                  />

                  <View style={styles.activityGrid}>
                    {PREFERRED_ACTIVITIES.map(
                      (item) => {
                        const selected =
                          preferredActivity ===
                          item;

                        return (
                          <Pressable
                            key={item}
                            style={[
                              styles.activityOption,
                              selected &&
                                styles.activityOptionSelected,
                            ]}
                            onPress={() =>
                              setPreferredActivity(
                                item
                              )
                            }
                          >
                            <Ionicons
                              name={
                                selected
                                  ? "radio-button-on"
                                  : "radio-button-off"
                              }
                              size={19}
                              color={
                                selected
                                  ? "#0F766E"
                                  : "#64748B"
                              }
                            />
                            <Text
                              style={[
                                styles.activityOptionText,
                                selected &&
                                  styles.activityOptionTextSelected,
                              ]}
                            >
                              {item}
                            </Text>
                          </Pressable>
                        );
                      }
                    )}
                  </View>

                  <SectionHeading
                    number="4"
                    title="Experience & Training"
                    text="Briefly describe relevant experience, training, certifications, or practical skills."
                  />

                  <TextInput
                    value={experienceTraining}
                    onChangeText={
                      setExperienceTraining
                    }
                    multiline
                    placeholder="Example: Basic first aid training, barangay clean-up volunteer, licensed driver..."
                    placeholderTextColor="#94A3B8"
                    style={styles.textArea}
                  />

                  <SectionHeading
                    number="5"
                    title="Why do you want to volunteer?"
                    text="A short statement helps the administrator understand how you want to contribute."
                  />

                  <TextInput
                    value={motivation}
                    onChangeText={setMotivation}
                    multiline
                    placeholder="Tell us why you want to help the community..."
                    placeholderTextColor="#94A3B8"
                    style={styles.textArea}
                  />

                  <Text style={styles.label}>
                    Emergency Contact (Optional)
                  </Text>
                  <TextInput
                    value={emergencyContact}
                    onChangeText={
                      setEmergencyContact
                    }
                    placeholder="Name and contact number"
                    placeholderTextColor="#94A3B8"
                    style={styles.input}
                  />

                  <View style={styles.notice}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={22}
                      color="#0F766E"
                    />
                    <Text style={styles.noticeText}>
                      Submitting this form does not automatically unlock volunteer features. An administrator must approve the application first.
                    </Text>
                  </View>

                  <Pressable
                    disabled={
                      !formValid ||
                      submitting
                    }
                    style={[
                      styles.primaryButton,
                      (!formValid ||
                        submitting) &&
                        styles.disabledButton,
                    ]}
                    onPress={
                      submitApplication
                    }
                  >
                    {submitting ? (
                      <ActivityIndicator
                        color="#FFFFFF"
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="paper-plane"
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text
                          style={
                            styles.primaryButtonText
                          }
                        >
                          Submit Volunteer Application
                        </Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            <View style={styles.sideCard}>
              <View style={styles.sideIcon}>
                <Ionicons
                  name="people"
                  size={28}
                  color="#0F766E"
                />
              </View>
              <Text style={styles.sideTitle}>
                One account, two modes
              </Text>
              <Text style={styles.sideText}>
                Your Resident account will not be replaced. Once approved, Volunteer Mode will be added to the same account.
              </Text>

              <View style={styles.flowItem}>
                <View style={styles.flowDot}>
                  <Text style={styles.flowDotText}>
                    1
                  </Text>
                </View>
                <Text style={styles.flowText}>
                  Submit volunteer details
                </Text>
              </View>

              <View style={styles.flowItem}>
                <View style={styles.flowDot}>
                  <Text style={styles.flowDotText}>
                    2
                  </Text>
                </View>
                <Text style={styles.flowText}>
                  Administrator reviews application
                </Text>
              </View>

              <View style={styles.flowItem}>
                <View style={styles.flowDot}>
                  <Text style={styles.flowDotText}>
                    3
                  </Text>
                </View>
                <Text style={styles.flowText}>
                  Volunteer access is unlocked
                </Text>
              </View>

              <View style={styles.flowItem}>
                <View style={styles.flowDot}>
                  <Text style={styles.flowDotText}>
                    4
                  </Text>
                </View>
                <Text style={styles.flowText}>
                  Switch Resident ↔ Volunteer anytime
                </Text>
              </View>

              <View style={styles.profileSummary}>
                <Text
                  style={
                    styles.profileSummaryLabel
                  }
                >
                  Applicant
                </Text>
                <Text
                  style={
                    styles.profileSummaryValue
                  }
                >
                  {fullName}
                </Text>
                <Text
                  style={
                    styles.profileSummaryMeta
                  }
                >
                  {profile.barangay ||
                    "San Jose del Monte"}{" "}
                  • Resident account
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHeading({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionNumber}>
        <Text style={styles.sectionNumberText}>
          {number}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>
          {title}
        </Text>
        <Text style={styles.sectionText}>
          {text}
        </Text>
      </View>
    </View>
  );
}

function StatusPanel({
  icon,
  title,
  text,
  tone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  tone: "approved" | "pending" | "rejected";
  children?: React.ReactNode;
}) {
  const palette =
    tone === "approved"
      ? {
          bg: "#ECFDF5",
          border: "#A7F3D0",
          icon: "#059669",
        }
      : tone === "pending"
        ? {
            bg: "#FFFBEB",
            border: "#FDE68A",
            icon: "#D97706",
          }
        : {
            bg: "#FEF2F2",
            border: "#FECACA",
            icon: "#DC2626",
          };

  return (
    <View
      style={[
        styles.statusPanel,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={48}
        color={palette.icon}
      />
      <Text style={styles.statusTitle}>
        {title}
      </Text>
      <Text style={styles.statusDescription}>
        {text}
      </Text>
      {children ? (
        <View style={styles.statusAction}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F1F7FA",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  page: {
    width: "100%",
    maxWidth: 1320,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F7FA",
  },
  centerText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 22,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE7EC",
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: "#0F766E",
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: "900",
  },
  title: {
    marginTop: 5,
    color: "#0F172A",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 6,
    maxWidth: 760,
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  layout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  layoutCompact: {
    flexDirection: "column",
  },
  mainCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE8ED",
    borderRadius: 18,
    padding: 24,
  },
  sideCard: {
    width: 340,
    maxWidth: "100%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE8ED",
    borderRadius: 18,
    padding: 22,
  },
  sideIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F7F4",
  },
  sideTitle: {
    marginTop: 15,
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "900",
  },
  sideText: {
    marginTop: 7,
    marginBottom: 18,
    color: "#64748B",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  flowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 13,
  },
  flowDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },
  flowDotText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  flowText: {
    flex: 1,
    color: "#334155",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
  },
  profileSummary: {
    marginTop: 16,
    padding: 15,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  profileSummaryLabel: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  profileSummaryValue: {
    marginTop: 5,
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  profileSummaryMeta: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11.5,
    fontWeight: "600",
  },
  loadingBox: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "700",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  sectionNumber: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F7F4",
  },
  sectionNumberText: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "900",
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  sectionText: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 24,
  },
  chip: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  chipSelected: {
    backgroundColor: "#0F766E",
    borderColor: "#0F766E",
  },
  chipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  activityGrid: {
    marginBottom: 24,
  },
  activityOption: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    marginBottom: 8,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activityOptionSelected: {
    backgroundColor: "#ECFDF5",
    borderColor: "#5EEAD4",
  },
  activityOptionText: {
    color: "#475569",
    fontSize: 12.5,
    fontWeight: "700",
  },
  activityOptionTextSelected: {
    color: "#115E59",
    fontWeight: "900",
  },
  textArea: {
    minHeight: 110,
    marginBottom: 22,
    padding: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: "top",
  },
  label: {
    marginBottom: 7,
    color: "#334155",
    fontSize: 12.5,
    fontWeight: "900",
  },
  input: {
    height: 46,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  noticeText: {
    flex: 1,
    color: "#166534",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 48,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
    borderRadius: 11,
    backgroundColor: "#0F766E",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.45,
  },
  statusPanel: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusTitle: {
    marginTop: 13,
    color: "#0F172A",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  statusDescription: {
    marginTop: 8,
    maxWidth: 620,
    color: "#475569",
    fontSize: 13.5,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  statusAction: {
    width: "100%",
    maxWidth: 360,
  },
});
