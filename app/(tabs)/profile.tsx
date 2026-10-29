import { AppAlert } from "../../lib/appDialog";
import VolunteerImpact from "./volunteer-impact";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { updateProfile, User } from "firebase/auth";
import { OCCUPATION_OPTIONS, SPECIALIZATIONS } from "../../constants/occupationOptions";
import { SJDM_BARANGAYS } from "../../constants/sjdmBarangays";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { db } from "../../lib/firebase";
import {
  activeModeForProfile,
  hasResidentAccess,
  hasVolunteerAccess,
  onAuthChange,
  updateUserProfile,
  UserProfile,
} from "../../lib/firebaseAuth";

type ProfileTab =
  | "info"
  | "activity"
  | "progress"
  | "certificates";

type GenericRecord = {
  id: string;
  [key: string]: any;
};

type IdentityStatus =
  | "basic"
  | "pending"
  | "verified"
  | "failed";

const timestampValue = (value: any) => {
  if (!value) return 0;

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  const parsed =
    new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const formatDate = (value: any) => {
  if (!value) return "—";

  try {
    const date =
      typeof value?.toDate ===
      "function"
        ? value.toDate()
        : new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "—";
    }

    return date.toLocaleDateString(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      },
    );
  } catch {
    return "—";
  }
};

const formatMinutes = (
  value: unknown,
) => {
  const total =
    Math.max(
      0,
      Number(value || 0),
    );

  if (!Number.isFinite(total)) {
    return "0 min";
  }

  const rounded =
    Math.round(total);

  const hours =
    Math.floor(
      rounded / 60,
    );

  const minutes =
    rounded % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  if (minutes <= 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
};

const humanize = (
  value: unknown,
) => {
  const text =
    String(value || "")
      .trim();

  if (!text) {
    return "—";
  }

  return text
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
};

const initialsFor = (
  value: string,
) => {
  const parts =
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

  return (
    parts
      .map((item) =>
        item
          .charAt(0)
          .toUpperCase(),
      )
      .join("") || "VS"
  );
};

const statusPalette = (
  value: unknown,
) => {
  const status =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    status.includes(
      "verified",
    ) ||
    status.includes(
      "issued",
    ) ||
    status.includes(
      "completed",
    ) ||
    status.includes(
      "resolved",
    ) ||
    status.includes(
      "closed",
    )
  ) {
    return {
      backgroundColor:
        "#DCFCE7",
      color: "#166534",
    };
  }

  if (
    status.includes(
      "respond",
    ) ||
    status.includes(
      "assigned",
    ) ||
    status.includes(
      "progress",
    ) ||
    status.includes(
      "validated",
    ) ||
    status.includes(
      "accepted",
    ) ||
    status.includes(
      "on_site",
    )
  ) {
    return {
      backgroundColor:
        "#DBEAFE",
      color: "#1D4ED8",
    };
  }

  if (
    status.includes(
      "rejected",
    ) ||
    status.includes(
      "revoked",
    ) ||
    status.includes(
      "cancelled",
    ) ||
    status.includes(
      "disputed",
    )
  ) {
    return {
      backgroundColor:
        "#FEE2E2",
      color: "#B91C1C",
    };
  }

  return {
    backgroundColor:
      "#F1F5F9",
    color: "#475569",
  };
};

export default function Profile() {
  const router = useRouter();
  const { edit, tab } = useLocalSearchParams<{ edit?: string; tab?: string }>();

  const {
    width,
  } = useWindowDimensions();

  const compact =
    width < 760;

  const [user, setUser] =
    useState<User | null>(
      null,
    );

  const [
    profile,
    setProfile,
  ] =
    useState<UserProfile | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<ProfileTab>(
      tab === "progress" ? "progress" : "info",
    );

  const [
    editOpen,
    setEditOpen,
  ] =
    useState(edit === "1");

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");

  const [
    phoneNumber,
    setPhoneNumber,
  ] =
    useState("");

  const [
    address,
    setAddress,
  ] =
    useState("");

  const [occupationCategory, setOccupationCategory] = useState("");
  const [occupationSpecialization, setOccupationSpecialization] = useState("");
  const [occupationOther, setOccupationOther] = useState("");
  const [occupationTouched, setOccupationTouched] = useState(false);
  const editProfileRef = useRef(edit === "1");
  const editDraftInitializedRef = useRef(false);
  const [barangay, setBarangay] = useState("");
  const [barangayTouched, setBarangayTouched] = useState(false);
  const [barangayOpen, setBarangayOpen] = useState(false);
  const [occupationOpen, setOccupationOpen] = useState(false);
  const [specializationOpen, setSpecializationOpen] = useState(false);

  const [
    residentCases,
    setResidentCases,
  ] =
    useState<
      GenericRecord[]
    >([]);

  const [
    volunteerActivity,
    setVolunteerActivity,
  ] =
    useState<
      GenericRecord[]
    >([]);

  const [
    certificates,
    setCertificates,
  ] =
    useState<
      GenericRecord[]
    >([]);

  const [
    activityLoading,
    setActivityLoading,
  ] =
    useState(false);

  const [
    certificateLoading,
    setCertificateLoading,
  ] =
    useState(false);

  const [
    activityError,
    setActivityError,
  ] =
    useState("");

  const [
    certificateError,
    setCertificateError,
  ] =
    useState("");

  const hydrateEditableProfile = (nextProfile: UserProfile) => {
    const canonicalName = String(nextProfile.fullName || "");
    const comma = canonicalName.indexOf(",");
    const lastFromName = comma >= 0 ? canonicalName.slice(0, comma).trim() : canonicalName.trim().split(/\s+/).slice(-1)[0] || "";
    const givenFromName = comma >= 0 ? canonicalName.slice(comma + 1).trim().split(/\s+/) : canonicalName.trim().split(/\s+/);
    setLastName(nextProfile.lastName || lastFromName);
    setFirstName(nextProfile.firstName || givenFromName[0] || "");
    setMiddleName(nextProfile.middleName || (comma >= 0 ? givenFromName.slice(1).join(" ") : givenFromName.slice(1, -1).join(" ")));

    setPhoneNumber(
      nextProfile.phoneNumber ||
        "",
    );

    setAddress(
      nextProfile.address ||
        "",
    );
    setBarangay(nextProfile.barangay || "");
    setBarangayTouched(false);
    setBarangayOpen(false);

    const previousOccupation = nextProfile.occupation || "";
    const category = nextProfile.occupationCategory ||
      (previousOccupation
        ? (OCCUPATION_OPTIONS.includes(previousOccupation) ? previousOccupation : "Other (Specify)")
        : "");
    setOccupationCategory(category);
    setOccupationSpecialization(nextProfile.occupationSpecialization || "");
    setOccupationOther(nextProfile.occupationOther ||
      (category === "Other (Specify)" && previousOccupation !== "Other (Specify)" ? previousOccupation : ""));
    setOccupationTouched(false);
    setOccupationOpen(false);
    setSpecializationOpen(false);

    editDraftInitializedRef.current = true;
  };

  const openProfileEditor = () => {
    if (!profile) return;
    hydrateEditableProfile(profile);
    editProfileRef.current = true;
    setEditOpen(true);
  };

  const closeProfileEditor = () => {
    editProfileRef.current = false;
    setEditOpen(false);
  };

  useEffect(() => {
    const unsubscribeAuth =
      onAuthChange(
        (nextUser) => {
          setUser(
            nextUser,
          );

          if (!nextUser) {
            setProfile(
              null,
            );

            setLoading(
              false,
            );
          }
        },
      );

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    setLoading(true);

    const unsubscribeProfile =
      onSnapshot(
        doc(
          db,
          "users",
          user.uid,
        ),
        (snapshot) => {
          if (
            !snapshot.exists()
          ) {
            setProfile(
              null,
            );

            setLoading(
              false,
            );

            return;
          }

          const nextProfile =
            snapshot.data() as UserProfile;

          setProfile(
            nextProfile,
          );

          // Never erase unsaved name edits when the live profile changes.
          if (!editProfileRef.current || !editDraftInitializedRef.current) {
            hydrateEditableProfile(nextProfile);
          }

          setLoading(
            false,
          );
        },
        (error) => {
          console.log(
            "Profile listener error:",
            error,
          );

          setLoading(
            false,
          );
        },
      );

    return unsubscribeProfile;
  }, [user]);

  const currentMode =
    activeModeForProfile(
      profile,
    );

  const residentAccess =
    hasResidentAccess(
      profile,
    );

  const volunteerAccess =
    hasVolunteerAccess(
      profile,
    );
  // Home's View Progress shortcut opens the genuine data-backed Profile tab.
  useEffect(() => {
    if (tab === "progress" && currentMode === "volunteer" && volunteerAccess) {
      setActiveTab("progress");
    }
  }, [tab, currentMode, volunteerAccess]);


  useEffect(() => {
    if (
      !user ||
      !profile
    ) {
      return;
    }

    if (
      currentMode ===
        "resident" &&
      residentAccess
    ) {
      setActivityLoading(
        true,
      );

      setActivityError(
        "",
      );

      const residentQuery =
        query(
          collection(
            db,
            "disasterCases",
          ),
          where(
            "reporterUid",
            "==",
            user.uid,
          ),
        );

      const unsubscribe =
        onSnapshot(
          residentQuery,
          (snapshot) => {
            const rows: GenericRecord[] =
              snapshot.docs
                .map(
                  (item): GenericRecord => ({
                    id: item.id,
                    ...(item.data() as Record<string, any>),
                  }),
                )
                .sort(
                  (
                    left,
                    right,
                  ) =>
                    Math.max(
                      timestampValue(
                        right.updatedAt,
                      ),
                      timestampValue(
                        right.createdAt,
                      ),
                    ) -
                    Math.max(
                      timestampValue(
                        left.updatedAt,
                      ),
                      timestampValue(
                        left.createdAt,
                      ),
                    ),
                );

            setResidentCases(
              rows,
            );

            setActivityLoading(
              false,
            );
          },
          (error) => {
            console.log(
              "Resident activity error:",
              error,
            );

            setResidentCases(
              [],
            );

            setActivityError(
              "Unable to load your recent reports.",
            );

            setActivityLoading(
              false,
            );
          },
        );

      return unsubscribe;
    }

    if (
      currentMode ===
        "volunteer" &&
      volunteerAccess
    ) {
      setActivityLoading(
        true,
      );

      setActivityError(
        "",
      );

      const volunteerQuery =
        query(
          collection(
            db,
            "verifiedContributions",
          ),
          where(
            "volunteerId",
            "==",
            user.uid,
          ),
        );

      const unsubscribe =
        onSnapshot(
          volunteerQuery,
          (snapshot) => {
            const rows: GenericRecord[] =
              snapshot.docs
                .map(
                  (item): GenericRecord => ({
                    id: item.id,
                    ...(item.data() as Record<string, any>),
                  }),
                )
                .sort(
                  (
                    left,
                    right,
                  ) =>
                    Math.max(
                      timestampValue(
                        right.verifiedAt,
                      ),
                      timestampValue(
                        right.completedAt,
                      ),
                      timestampValue(
                        right.createdAt,
                      ),
                    ) -
                    Math.max(
                      timestampValue(
                        left.verifiedAt,
                      ),
                      timestampValue(
                        left.completedAt,
                      ),
                      timestampValue(
                        left.createdAt,
                      ),
                    ),
                );

            setVolunteerActivity(
              rows,
            );

            setActivityLoading(
              false,
            );
          },
          (error) => {
            console.log(
              "Volunteer activity error:",
              error,
            );

            setVolunteerActivity(
              [],
            );

            setActivityError(
              "Unable to load your verified volunteer activity.",
            );

            setActivityLoading(
              false,
            );
          },
        );

      return unsubscribe;
    }

    setActivityLoading(
      false,
    );

    return;
  }, [
    user?.uid,
    profile,
    currentMode,
    residentAccess,
    volunteerAccess,
  ]);

  useEffect(() => {
    if (
      !user ||
      !profile ||
      !volunteerAccess
    ) {
      setCertificates(
        [],
      );

      setCertificateLoading(
        false,
      );

      return;
    }

    setCertificateLoading(
      true,
    );

    setCertificateError(
      "",
    );

    const certificateQuery =
      query(
        collection(
          db,
          "certificates",
        ),
        where(
          "volunteerId",
          "==",
          user.uid,
        ),
      );

    const unsubscribe =
      onSnapshot(
        certificateQuery,
        (snapshot) => {
          const rows: GenericRecord[] =
            snapshot.docs
              .map(
                (item): GenericRecord => ({
                  id: item.id,
                  ...(item.data() as Record<string, any>),
                }),
              )
              .sort(
                (
                  left,
                  right,
                ) =>
                  timestampValue(
                    right.issuedAt,
                  ) -
                  timestampValue(
                    left.issuedAt,
                  ),
              );

          setCertificates(
            rows,
          );

          setCertificateLoading(
            false,
          );
        },
        (error) => {
          console.log(
            "Certificate listener error:",
            error,
          );

          setCertificates(
            [],
          );

          setCertificateError(
            "Unable to load your certificates.",
          );

          setCertificateLoading(
            false,
          );
        },
      );

    return unsubscribe;
  }, [
    user?.uid,
    profile,
    volunteerAccess,
  ]);

  const displayLocation =
    useMemo(() => {
      if (
        profile?.address?.trim()
      ) {
        return profile.address.trim();
      }

      const parts = [
        profile?.barangay,
        profile?.city,
        profile?.province,
      ]
        .map((item) =>
          String(
            item || "",
          ).trim(),
        )
        .filter(Boolean);

      return (
        parts.join(", ") ||
        "Not provided"
      );
    }, [profile]);

  const displayOccupation =
    profile?.occupation ||
    profile?.occupationSpecialization ||
    profile?.occupationCategory ||
    "Not provided";

  const displayRole =
    currentMode ===
    "volunteer"
      ? "Volunteer"
      : "Resident";

  const rawIdentityStatus =
    String(
      (profile as any)
        ?.identityStatus ||
        "",
    )
      .trim()
      .toLowerCase();

  const identityVerified =
    Boolean(
      (profile as any)
        ?.identityVerified,
    ) ||
    rawIdentityStatus ===
      "verified";

  const identityStatus: IdentityStatus =
    identityVerified
      ? "verified"
      : rawIdentityStatus ===
          "pending"
        ? "pending"
        : rawIdentityStatus ===
            "failed"
          ? "failed"
          : "basic";

  const volunteerStatus =
    String(
      (profile as any)
        ?.volunteerStatus ||
        (volunteerAccess
          ? "approved"
          : "not_applied"),
    )
      .trim()
      .toLowerCase();

  const saveProfile = async () => {
    if (!user || !profile) return;

    const first = firstName.trim().replace(/\s+/g, " ");
    const middle = middleName.trim().replace(/\s+/g, " ");
    const last = lastName.trim().replace(/\s+/g, " ");
    if (first.length < 2 || last.length < 2) {
      AppAlert.alert("Invalid name", "First name and last name are required.");
      return;
    }
    // Name and contact changes must be saveable without first providing an
    // unrelated occupation. Legacy Resident profiles may have no occupation.
    const editingOccupation = occupationTouched;
    if (editingOccupation && occupationCategory && !OCCUPATION_OPTIONS.includes(occupationCategory)) {
      AppAlert.alert("Select occupation", "Choose an occupation from the list.");
      return;
    }
    const choices = editingOccupation ? SPECIALIZATIONS[occupationCategory] || [] : [];
    if (editingOccupation && choices.length > 0 && !choices.includes(occupationSpecialization)) {
      AppAlert.alert("Choose specialization", "Select a valid specialization.");
      return;
    }
    if (editingOccupation && occupationCategory === "Other (Specify)" &&
        occupationOther.trim().length < 2) {
      AppAlert.alert("Specify occupation", "Please enter your occupation.");
      return;
    }

    if (barangayTouched && !SJDM_BARANGAYS.includes(barangay)) {
      AppAlert.alert("Select barangay", "Choose an official San Jose del Monte barangay from the dropdown.");
      return;
    }
    const cleanName = last + ", " + first + (middle ? " " + middle : "");
    // Firestore users/{uid}.fullName is the canonical name across Home,
    // My Profile and the account dropdown. Do not overwrite old occupation
    // values when the user is only editing personal information.
    const changes: Partial<UserProfile> = {
      fullName: cleanName,
      firstName: first,
      middleName: middle,
      lastName: last,
      phoneNumber: phoneNumber.trim(),
      address: address.trim(),
    };
    if (barangayTouched) changes.barangay = barangay;
    if (editingOccupation) {
      changes.occupationCategory = occupationCategory;
      changes.occupationSpecialization = choices.length ? occupationSpecialization : "";
      changes.occupationOther = occupationCategory === "Other (Specify)" ? occupationOther.trim() : "";
      changes.occupation = occupationCategory === "Other (Specify)"
        ? occupationOther.trim()
        : occupationSpecialization || occupationCategory;
    }
    setSaving(true);
    try {
      await updateUserProfile(user.uid, changes);
      // Firestore is the authoritative VolunServe profile. Mirror the
      // display name in Firebase Auth without claiming two-system atomicity.
      try {
        if (user.displayName !== cleanName) {
          await updateProfile(user, { displayName: cleanName });
        }
      } catch {
        AppAlert.alert("Profile updated", "Your VolunServe name was saved. Your sign-in display name may take another sign-in to refresh.");
      }
      closeProfileEditor();
    } catch (error: any) {
      AppAlert.alert("Unable to save", error?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <ActivityIndicator
          size="large"
          color="#4F46E5"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading profile...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile
  ) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <Ionicons
          name="person-circle-outline"
          size={52}
          color="#94A3B8"
        />

        <Text
          style={
            styles.emptyTitle
          }
        >
          Profile unavailable
        </Text>

        <Text
          style={
            styles.emptyText
          }
        >
          Sign in again to load your account.
        </Text>
      </View>
    );
  }

  const tabs: {
    key: ProfileTab;
    label: string;
  }[] = [
    {
      key: "info",
      label: "Info",
    },
    {
      key: "activity",
      label: "Activity",
    },
    ...(currentMode === "volunteer" && volunteerAccess
      ? [{key:"progress" as const,label:"My Progress"}]
      : []),
    ...(volunteerAccess
      ? [
          {
            key: "certificates" as const,
            label:
              "Certificates",
          },
        ]
      : []),
  ];

  return (
    <ScrollView
      style={
        styles.screen
      }
      contentContainerStyle={
        styles.page
      }
      showsVerticalScrollIndicator
      persistentScrollbar
    >
      <View
        style={
          styles.pageHeading
        }
      >
        <Text
          style={
            styles.pageTitle
          }
        >
          My Profile
        </Text>

        <Text
          style={
            styles.pageSubtitle
          }
        >
          Manage your account and personal information.
        </Text>
      </View>

      <View
        style={
          styles.profileCard
        }
      >
        <View
          style={
            styles.cover
          }
        />

        <View
          style={[
            styles.profileHeroBody,
            compact &&
              styles.profileHeroBodyCompact,
          ]}
        >
          <View
            style={
              styles.avatarWrap
            }
          >
            {profile.profilePictureUrl ? (
              <Image
                source={{
                  uri: profile.profilePictureUrl,
                }}
                style={
                  styles.avatarImage
                }
              />
            ) : (
              <View
                style={
                  styles.avatarFallback
                }
              >
                <Text
                  style={
                    styles.avatarInitials
                  }
                >
                  {initialsFor(
                    profile.fullName ||
                      profile.email ||
                      "VolunServe",
                  )}
                </Text>
              </View>
            )}

            <View
              style={
                styles.activeDot
              }
            />
          </View>

          <View
            style={
              styles.profileIdentity
            }
          >
            <View
              style={
                styles.nameRow
              }
            >
              <Text
                style={
                  styles.profileName
                }
                numberOfLines={
                  compact
                    ? 2
                    : 1
                }
              >
                {profile.fullName ||
                  "VolunServe Member"}
              </Text>

              <View
                style={[
                  styles.modeBadge,
                  {
                    backgroundColor:
                      currentMode === "volunteer"
                        ? "#EEF2FF"
                        : identityStatus === "verified"
                          ? "#DCFCE7"
                          : identityStatus === "pending"
                            ? "#FEF3C7"
                            : identityStatus === "failed"
                              ? "#FEE2E2"
                              : "#FFF7ED",
                  },
                ]}
              >
                <Ionicons
                  name={
                    currentMode === "volunteer"
                      ? "people-outline"
                      : identityStatus === "verified"
                        ? "shield-checkmark-outline"
                        : identityStatus === "pending"
                          ? "time-outline"
                          : identityStatus === "failed"
                            ? "alert-circle-outline"
                            : "person-outline"
                  }
                  size={15}
                  color={
                    currentMode === "volunteer"
                      ? "#4338CA"
                      : identityStatus === "verified"
                        ? "#166534"
                        : identityStatus === "pending"
                          ? "#92400E"
                          : identityStatus === "failed"
                            ? "#B91C1C"
                            : "#C2410C"
                  }
                />

                <Text
                  style={[
                    styles.modeBadgeText,
                    {
                      color:
                        currentMode === "volunteer"
                          ? "#4338CA"
                          : identityStatus === "verified"
                            ? "#166534"
                            : identityStatus === "pending"
                              ? "#92400E"
                              : identityStatus === "failed"
                                ? "#B91C1C"
                                : "#C2410C",
                    },
                  ]}
                >
                  {currentMode === "volunteer"
                    ? "Volunteer"
                    : identityStatus === "verified"
                      ? "Verified Resident"
                      : identityStatus === "pending"
                        ? "Verification Pending"
                        : identityStatus === "failed"
                          ? "Verification Required"
                          : "Basic Resident"}
                </Text>
              </View>
            </View>

            <Text
              style={
                styles.identityLine
              }
              numberOfLines={
                1
              }
            >
              {profile.email ||
                "No email"}
            </Text>

            {!!profile.phoneNumber && (
              <Text
                style={
                  styles.identityLine
                }
              >
                {profile.phoneNumber}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={
              styles.editProfileButton
            }
            activeOpacity={
              0.82
            }
            onPress={openProfileEditor}
          >
            <Ionicons
              name="create-outline"
              size={17}
              color="#4338CA"
            />

            <Text
              style={
                styles.editProfileText
              }
            >
              Edit Profile
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={
          styles.tabs
        }
      >
        {tabs.map(
          (tab) => {
            const selected =
              activeTab ===
              tab.key;

            return (
              <TouchableOpacity
                key={
                  tab.key
                }
                style={[
                  styles.tab,
                  selected &&
                    styles.tabActive,
                ]}
                activeOpacity={
                  0.8
                }
                onPress={() =>
                  setActiveTab(
                    tab.key,
                  )
                }
              >
                <Text
                  style={[
                    styles.tabText,
                    selected &&
                      styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          },
        )}
      </View>

      {activeTab ===
        "info" && (
        <>
          <IdentityAccessCard
            identityStatus={
              identityStatus
            }
            volunteerAccess={
              volunteerAccess
            }
            volunteerStatus={
              volunteerStatus
            }
            onVerify={() =>
              router.push(
                "/identity-verification" as any,
              )
            }
            onApplyVolunteer={() =>
              router.push(
                "/volunteer-application" as any,
              )
            }
          />

          <View
            style={[
              styles.infoGrid,
              compact &&
                styles.infoGridCompact,
            ]}
          >
          <View
            style={
              styles.sectionCard
            }
          >
            <SectionHeading
              icon="person-outline"
              title="Personal Information"
            />

            <InfoRow
              label="Full Name"
              value={
                profile.fullName
              }
            />

            <InfoRow
              label="Email Address"
              value={
                profile.email
              }
            />

            <InfoRow
              label="Phone Number"
              value={
                profile.phoneNumber
              }
            />

            <InfoRow
              label="Occupation"
              value={
                displayOccupation
              }
            />
          </View>

          <View
            style={
              styles.sectionCard
            }
          >
            <SectionHeading
              icon="location-outline"
              title="Account Information"
            />

            <InfoRow
              label="Current Mode"
              value={
                displayRole
              }
            />

            <InfoRow label="Barangay" value={profile.barangay || "Not provided"} />

            <InfoRow
              label="Address"
              value={
                displayLocation
              }
            />

            <InfoRow
              label="Account Status"
              value={
                humanize(
                  profile.status ||
                    "approved",
                )
              }
            />

            <InfoRow
              label="Date Joined"
              value={
                formatDate(
                  profile.createdAt,
                )
              }
              last
            />
          </View>
          </View>
        </>
      )}

      {activeTab ===
        "activity" && (
        <View
          style={
            styles.sectionCard
          }
        >
          <SectionHeading
            icon={
              currentMode ===
              "volunteer"
                ? "checkmark-done-outline"
                : "document-text-outline"
            }
            title={
              currentMode ===
              "volunteer"
                ? "Verified Volunteer Activity"
                : "Recent Reports"
            }
          />

          {activityLoading ? (
            <InlineLoading />
          ) : activityError ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Activity unavailable"
              message={
                activityError
              }
            />
          ) : currentMode ===
              "volunteer" ? (
            volunteerActivity.length >
            0 ? (
              volunteerActivity.map(
                (
                  item,
                ) => (
                  <ActivityCard
                    key={
                      item.id
                    }
                    title={
                      item.contributionSummary ||
                      humanize(
                        item.contributionType,
                      ) ||
                      "Verified contribution"
                    }
                    subtitle={
                      item.caseTitle ||
                      `Case ${item.caseId || "—"}`
                    }
                    status={
                      item.status ||
                      "verified"
                    }
                    date={
                      item.verifiedAt ||
                      item.completedAt ||
                      item.createdAt
                    }
                    rows={[
                      {
                        label:
                          "Contribution",
                        value:
                          humanize(
                            item.contributionType,
                          ),
                      },
                      {
                        label:
                          "People Helped",
                        value:
                          String(
                            item.peopleHelped ??
                              0,
                          ),
                      },
                      {
                        label:
                          "Outcome",
                        value:
                          humanize(
                            item.outcome,
                          ),
                      },
                    ]}
                  />
                ),
              )
            ) : (
              <EmptyState
                icon="checkmark-done-outline"
                title="No verified activity yet"
                message="Verified volunteer service will appear here after resident confirmation."
              />
            )
          ) : residentCases.length >
            0 ? (
            residentCases.map(
              (item) => (
                <ActivityCard
                  key={
                    item.id
                  }
                  title={
                    item.title ||
                    item.category ||
                    "Emergency Report"
                  }
                  subtitle={
                    item.location ||
                    item.address ||
                    item.barangay ||
                    "Location not specified"
                  }
                  status={
                    item.status ||
                    "reported"
                  }
                  date={
                    item.updatedAt ||
                    item.createdAt
                  }
                  rows={[
                    {
                      label:
                        "Category",
                      value:
                        humanize(
                          item.category,
                        ),
                    },
                    {
                      label:
                        "Severity",
                      value:
                        humanize(
                          item.severity,
                        ),
                    },
                    {
                      label:
                        "Affected",
                      value:
                        String(
                          item.affectedPeople ??
                            0,
                        ),
                    },
                  ]}
                />
              ),
            )
          ) : (
            <EmptyState
              icon="document-text-outline"
              title="No reports yet"
              message="Your emergency reports will appear here."
            />
          )}
        </View>
      )}

      {activeTab === "progress" && currentMode === "volunteer" && volunteerAccess && (
        <VolunteerImpact embedded />
      )}

      {activeTab ===
        "certificates" &&
        volunteerAccess && (
          <View
            style={
              styles.sectionCard
            }
          >
            <SectionHeading
              icon="ribbon-outline"
              title="Certificates"
            />

            {certificateLoading ? (
              <InlineLoading />
            ) : certificateError ? (
              <EmptyState
                icon="alert-circle-outline"
                title="Certificates unavailable"
                message={
                  certificateError
                }
              />
            ) : certificates.length >
              0 ? (
              certificates.map(
                (
                  item,
                ) => (
                  <CertificateCard
                    key={
                      item.id
                    }
                    item={
                      item
                    }
                  />
                ),
              )
            ) : (
              <EmptyState
                icon="ribbon-outline"
                title="No certificates yet"
                message="Certificates issued from verified volunteer service will appear here."
              />
            )}
          </View>
        )}

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeProfileEditor}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIcon}>
                <Ionicons name="person-circle-outline" size={27} color="#087A5D"/>
              </View>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalEyebrow}>ACCOUNT INFORMATION</Text>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <Text style={styles.modalSubtitle}>Keep your personal details accurate and up to date.</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Edit Profile"
                disabled={saving} style={styles.modalClose} onPress={closeProfileEditor}>
                <Ionicons name="close" size={20} color="#42675B"/>
              </TouchableOpacity>
            </View>

            <ScrollView style={[styles.modalScroll,Platform.OS === "web" && styles.webModalScroll]}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled" nestedScrollEnabled
              showsVerticalScrollIndicator persistentScrollbar
              accessibilityLabel="Scroll Edit Profile fields">
              <View style={styles.modalSectionHeader}>
                <View style={styles.sectionMarker}/>
                <Text style={styles.modalSectionTitle}>Personal information</Text>
              </View>
              <View style={styles.nameGrid}>
                <View style={styles.nameField}>
                  <ProfileInput label="First Name" value={firstName} onChange={setFirstName} placeholder="First name" required/>
                </View>
                <View style={styles.nameField}>
                  <ProfileInput label="Middle Name" value={middleName} onChange={setMiddleName} placeholder="Optional"/>
                </View>
                <View style={styles.nameField}>
                  <ProfileInput label="Last Name" value={lastName} onChange={setLastName} placeholder="Last name" required/>
                </View>
              </View>
              <Text style={styles.modalHelper}>Email and identity-verification status are managed separately for account security.</Text>

              <View style={styles.modalDivider}/>
              <View style={styles.modalSectionHeader}>
                <View style={styles.sectionMarker}/>
                <Text style={styles.modalSectionTitle}>Contact & address</Text>
              </View>
              <ProfileInput label="Phone Number" value={phoneNumber}
                onChange={setPhoneNumber} placeholder="+63 9XX XXX XXXX"
                keyboardType="phone-pad" maxLength={24}/>
              <ProfileDropdown label="Barangay" value={barangay} placeholder="Select an SJDM barangay"
                options={SJDM_BARANGAYS} open={barangayOpen} searchable
                onToggle={() => {setBarangayOpen(v=>!v);setOccupationOpen(false);setSpecializationOpen(false);}}
                onSelect={value => {setBarangay(value);setBarangayTouched(true);setBarangayOpen(false);}}/>
              <ProfileInput label="Complete Address" value={address} onChange={setAddress}
                placeholder="House number, street, subdivision, purok" maxLength={240}/>
              <Text style={styles.modalHelper}>City of San Jose del Monte, Bulacan · Region III. Only official city barangays are selectable.</Text>

              <View style={styles.modalDivider}/>
              <View style={styles.modalSectionHeader}>
                <View style={styles.sectionMarker}/>
                <Text style={styles.modalSectionTitle}>Occupation details</Text>
              </View>
              <Text style={styles.modalHelper}>Optional. Your name can be saved without editing your occupation.</Text>
              <ProfileDropdown label="Occupation Category" value={occupationCategory}
                placeholder="Choose occupation (optional)" options={["Not specified",...OCCUPATION_OPTIONS]} open={occupationOpen}
                onToggle={() => {setOccupationOpen(v=>!v);setBarangayOpen(false);setSpecializationOpen(false);}}
                onSelect={value => {setOccupationTouched(true);setOccupationCategory(value==="Not specified"?"":value);setOccupationSpecialization("");setOccupationOther("");setOccupationOpen(false);setSpecializationOpen(false);}}/>
              {(SPECIALIZATIONS[occupationCategory] || []).length > 0 && (
                <ProfileDropdown label="Specialization" value={occupationSpecialization} placeholder="Choose specialization"
                  options={SPECIALIZATIONS[occupationCategory] || []} open={specializationOpen}
                  onToggle={() => {setSpecializationOpen(v=>!v);setBarangayOpen(false);setOccupationOpen(false);}}
                  onSelect={value => {setOccupationTouched(true);setOccupationSpecialization(value);setSpecializationOpen(false);}}/>
              )}
              {occupationCategory === "Other (Specify)" && (
                <ProfileInput label="Specify Occupation" value={occupationOther}
                  onChange={value => {setOccupationTouched(true);setOccupationOther(value);}}
                  placeholder="Your occupation" maxLength={100}/>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Text style={styles.modalFooterHint}>Changes are saved to your VolunServe profile.</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} disabled={saving} onPress={closeProfileEditor}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" style={[styles.saveButton,saving && styles.buttonSaving]}
                  disabled={saving} onPress={() => void saveProfile()}>
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF"/> : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#FFFFFF"/>
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

      </Modal>
    </ScrollView>
  );
}

function IdentityAccessCard({
  identityStatus,
  volunteerAccess,
  volunteerStatus,
  onVerify,
  onApplyVolunteer,
}: {
  identityStatus: IdentityStatus;
  volunteerAccess: boolean;
  volunteerStatus: string;
  onVerify: () => void;
  onApplyVolunteer: () => void;
}) {
  const verified = identityStatus === "verified";
  const pending = identityStatus === "pending";
  const failed = identityStatus === "failed";

  const normalizedVolunteerStatus =
    volunteerStatus || "not_applied";

  const volunteerPending =
    normalizedVolunteerStatus === "pending";

  const canApply =
    verified &&
    !volunteerAccess &&
    normalizedVolunteerStatus === "not_applied";

  if (verified) {
    return (
      <View
        style={[
          styles.verifyStateCard,
          {
            backgroundColor: "#F0FDF4",
            borderColor: "#BBF7D0",
          },
        ]}
      >
        <View style={styles.verifyStateIconSuccess}>
          <Ionicons
            name="checkmark"
            size={28}
            color="#FFFFFF"
          />
        </View>

        <View style={styles.verifyStateCopy}>
          <View style={styles.verifyStateTitleRow}>
            <Text style={styles.verifyStateTitle}>
              Verified Resident
            </Text>

            <View
              style={[
                styles.verifyStateBadge,
                {
                  backgroundColor: "#DCFCE7",
                },
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={13}
                color="#166534"
              />
              <Text
                style={[
                  styles.verifyStateBadgeText,
                  {
                    color: "#166534",
                  },
                ]}
              >
                Verified
              </Text>
            </View>
          </View>

          <Text style={styles.verifyStateText}>
            Your identity has been successfully verified. You now have
            access to verified resident features and can apply as a
            volunteer.
          </Text>

          {volunteerAccess ? (
            <View style={styles.verifyStateNoticeSuccess}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#15803D"
              />
              <Text style={styles.verifyStateNoticeSuccessText}>
                Volunteer access is already enabled on this account.
              </Text>
            </View>
          ) : volunteerPending ? (
            <View style={styles.verifyStateNoticeWarning}>
              <Ionicons
                name="hourglass-outline"
                size={18}
                color="#92400E"
              />
              <Text style={styles.verifyStateNoticeWarningText}>
                Your Volunteer application is pending Admin review.
              </Text>
            </View>
          ) : canApply ? (
            <TouchableOpacity
              style={styles.verifyVolunteerButton}
              activeOpacity={0.84}
              onPress={onApplyVolunteer}
            >
              <Ionicons
                name="people-outline"
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.verifyVolunteerButtonText}>
                Become a Volunteer
              </Text>
              <Ionicons
                name="arrow-forward"
                size={17}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  if (pending) {
    return (
      <View
        style={[
          styles.verifyStateCard,
          {
            backgroundColor: "#FFFBEB",
            borderColor: "#FDE68A",
          },
        ]}
      >
        <View style={styles.verifyStateIconPending}>
          <Ionicons
            name="hourglass-outline"
            size={28}
            color="#B45309"
          />
        </View>

        <View style={styles.verifyStateCopy}>
          <View style={styles.verifyStateTitleRow}>
            <Text style={styles.verifyStateTitle}>
              Verification in Review
            </Text>

            <View
              style={[
                styles.verifyStateBadge,
                {
                  backgroundColor: "#FEF3C7",
                },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={13}
                color="#92400E"
              />
              <Text
                style={[
                  styles.verifyStateBadgeText,
                  {
                    color: "#92400E",
                  },
                ]}
              >
                Pending
              </Text>
            </View>
          </View>

          <Text style={styles.verifyStateText}>
            Your identity verification has been submitted and is
            currently under review. You can continue using normal
            Resident services while waiting for the result.
          </Text>

          <View style={styles.verifyStateNoticeWarning}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color="#92400E"
            />
            <Text style={styles.verifyStateNoticeWarningText}>
              You will be able to continue once the AI result or
              LGU/Admin review is complete.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (failed) {
    return (
      <View
        style={[
          styles.verifyStateCard,
          {
            backgroundColor: "#FEF2F2",
            borderColor: "#FECACA",
          },
        ]}
      >
        <View style={styles.verifyStateIconFailed}>
          <Ionicons
            name="alert"
            size={27}
            color="#FFFFFF"
          />
        </View>

        <View style={styles.verifyStateCopy}>
          <View style={styles.verifyStateTitleRow}>
            <Text style={styles.verifyStateTitle}>
              Verification Failed
            </Text>

            <View
              style={[
                styles.verifyStateBadge,
                {
                  backgroundColor: "#FEE2E2",
                },
              ]}
            >
              <Ionicons
                name="close-circle-outline"
                size={13}
                color="#B91C1C"
              />
              <Text
                style={[
                  styles.verifyStateBadgeText,
                  {
                    color: "#B91C1C",
                  },
                ]}
              >
                Failed
              </Text>
            </View>
          </View>

          <Text style={styles.verifyStateText}>
            We could not confidently verify your identity from the
            submitted ID and face scan. Please try again using clearer
            images and good lighting.
          </Text>

          <TouchableOpacity
            style={styles.verifyRetryButton}
            activeOpacity={0.84}
            onPress={onVerify}
          >
            <Ionicons
              name="refresh-outline"
              size={18}
              color="#B91C1C"
            />
            <Text style={styles.verifyRetryButtonText}>
              Retry Verification
            </Text>
            <Ionicons
              name="arrow-forward"
              size={17}
              color="#B91C1C"
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.verifyResidentCard}>
      <View style={styles.verifyResidentTop}>
        <View style={styles.verifyResidentIcon}>
          <Ionicons
            name="shield-checkmark-outline"
            size={30}
            color="#FFFFFF"
          />
        </View>

        <View style={styles.verifyResidentHeading}>
          <Text style={styles.verifyResidentTitle}>
            Be a Verified Resident
          </Text>
          <Text style={styles.verifyResidentSubtitle}>
            Verify your identity to unlock trusted resident features
            and volunteer application access.
          </Text>
        </View>

        <View style={styles.verifyBasicBadge}>
          <Ionicons
            name="person-outline"
            size={13}
            color="#C2410C"
          />
          <Text style={styles.verifyBasicBadgeText}>
            Basic Resident
          </Text>
        </View>
      </View>

      <View style={styles.verifyResidentGrid}>
        <View style={styles.verifyResidentMiniCard}>
          <Text style={styles.verifyResidentMiniTitle}>
            Why verify?
          </Text>

          <VerificationBenefit
            icon="shield-checkmark-outline"
            text="Access trusted resident features"
          />
          <VerificationBenefit
            icon="people-outline"
            text="Apply as a volunteer"
          />
          <VerificationBenefit
            icon="flash-outline"
            text="Faster assistance validation"
          />
        </View>

        <View style={styles.verifyResidentMiniCard}>
          <Text style={styles.verifyResidentMiniTitle}>
            Verification steps
          </Text>

          <VerificationStepMini
            number="1"
            text="Upload a valid government ID"
          />
          <VerificationStepMini
            number="2"
            text="Complete Face Scan"
          />
          <VerificationStepMini
            number="3"
            text="Wait for verification result"
          />
        </View>
      </View>

      <View style={styles.verifyResidentActions}>
        <TouchableOpacity
          style={styles.verifyStartButton}
          activeOpacity={0.84}
          onPress={onVerify}
        >
          <Ionicons
            name="scan-outline"
            size={18}
            color="#FFFFFF"
          />
          <Text style={styles.verifyStartButtonText}>
            Start Verification
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.verifyLearnButton}
          activeOpacity={0.84}
          onPress={() =>
            AppAlert.alert(
              "Identity Verification",
              "VolunServe compares the face from your government ID with your face scan using AI-assisted 1-to-1 verification. Uncertain results are sent to LGU/Admin manual review.",
            )
          }
        >
          <Ionicons
            name="information-circle-outline"
            size={18}
            color="#2563EB"
          />
          <Text style={styles.verifyLearnButtonText}>
            Learn More
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function VerificationBenefit({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
}) {
  return (
    <View style={styles.verifyBenefitRow}>
      <View style={styles.verifyBenefitIcon}>
        <Ionicons
          name={icon}
          size={17}
          color="#2563EB"
        />
      </View>
      <Text style={styles.verifyBenefitText}>
        {text}
      </Text>
    </View>
  );
}

function VerificationStepMini({
  number,
  text,
}: {
  number: string;
  text: string;
}) {
  return (
    <View style={styles.verifyStepMiniRow}>
      <View style={styles.verifyStepMiniNumber}>
        <Text style={styles.verifyStepMiniNumberText}>
          {number}
        </Text>
      </View>
      <Text style={styles.verifyStepMiniText}>
        {text}
      </Text>
    </View>
  );
}

function SectionHeading({
  icon,
  title,
}: {
  icon:
    React.ComponentProps<
      typeof Ionicons
    >["name"];
  title: string;
}) {
  return (
    <View
      style={
        styles.sectionHeading
      }
    >
      <View
        style={
          styles.sectionIcon
        }
      >
        <Ionicons
          name={icon}
          size={20}
          color="#4338CA"
        />
      </View>

      <Text
        style={
          styles.sectionTitle
        }
      >
        {title}
      </Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value?: unknown;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        last &&
          styles.infoRowLast,
      ]}
    >
      <Text
        style={
          styles.infoLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.infoValue
        }
      >
        {String(
          value || "—",
        )}
      </Text>
    </View>
  );
}

function ActivityCard({
  title,
  subtitle,
  status,
  date,
  rows,
}: {
  title: string;
  subtitle: string;
  status: string;
  date: any;
  rows: {
    label: string;
    value: string;
  }[];
}) {
  const palette =
    statusPalette(
      status,
    );

  return (
    <View
      style={
        styles.activityCard
      }
    >
      <View
        style={
          styles.activityTop
        }
      >
        <View
          style={
            styles.activityCopy
          }
        >
          <Text
            style={
              styles.activityTitle
            }
          >
            {title}
          </Text>

          <Text
            style={
              styles.activitySubtitle
            }
          >
            {subtitle}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                palette.backgroundColor,
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              {
                color:
                  palette.color,
              },
            ]}
          >
            {humanize(
              status,
            )}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.activityMeta
        }
      >
        {rows.map(
          (row) => (
            <View
              key={
                row.label
              }
              style={
                styles.metaItem
              }
            >
              <Text
                style={
                  styles.metaLabel
                }
              >
                {row.label}
              </Text>

              <Text
                style={
                  styles.metaValue
                }
              >
                {row.value ||
                  "—"}
              </Text>
            </View>
          ),
        )}

        <View
          style={
            styles.metaItem
          }
        >
          <Text
            style={
              styles.metaLabel
            }
          >
            Date
          </Text>

          <Text
            style={
              styles.metaValue
            }
          >
            {formatDate(
              date,
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

function CertificateCard({
  item,
}: {
  item: GenericRecord;
}) {
  const status =
    item.verificationStatus ||
    "issued";

  const palette =
    statusPalette(
      status,
    );

  return (
    <View
      style={
        styles.certificateCard
      }
    >
      <View
        style={
          styles.certificateIcon
        }
      >
        <Ionicons
          name="ribbon-outline"
          size={25}
          color="#4338CA"
        />
      </View>

      <View
        style={
          styles.certificateBody
        }
      >
        <View
          style={
            styles.certificateTitleRow
          }
        >
          <View
            style={
              styles.certificateTitleArea
            }
          >
            <Text
              style={
                styles.certificateTitle
              }
            >
              {item.certificateTitle ||
                "Verified Volunteer Service"}
            </Text>

            <Text
              style={
                styles.certificateId
              }
              numberOfLines={
                1
              }
            >
              Certificate ID:{" "}
              {item.certificateId ||
                item.id}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  palette.backgroundColor,
              },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                {
                  color:
                    palette.color,
                },
              ]}
            >
              {humanize(
                status,
              )}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.certificateMetrics
          }
        >
          <Metric
            label="Issued"
            value={
              formatDate(
                item.issuedAt,
              )
            }
          />

          <Metric
            label="Verified Helps"
            value={
              String(
                item.verifiedHelps ??
                  0,
              )
            }
          />

          <Metric
            label="Service Time"
            value={
              formatMinutes(
                item.verifiedServiceMinutes,
              )
            }
          />

          <Metric
            label="People Helped"
            value={
              String(
                item.peopleHelped ??
                  0,
              )
            }
          />
        </View>
      </View>
    </View>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={
        styles.metric
      }
    >
      <Text
        style={
          styles.metricLabel
        }
      >
        {label}
      </Text>

      <Text
        style={
          styles.metricValue
        }
      >
        {value}
      </Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  message,
}: {
  icon:
    React.ComponentProps<
      typeof Ionicons
    >["name"];
  title: string;
  message: string;
}) {
  return (
    <View
      style={
        styles.emptyState
      }
    >
      <View
        style={
          styles.emptyIcon
        }
      >
        <Ionicons
          name={icon}
          size={24}
          color="#64748B"
        />
      </View>

      <Text
        style={
          styles.emptyTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.emptyText
        }
      >
        {message}
      </Text>
    </View>
  );
}

function InlineLoading() {
  return (
    <View
      style={
        styles.inlineLoading
      }
    >
      <ActivityIndicator
        size="small"
        color="#4F46E5"
      />

      <Text
        style={
          styles.inlineLoadingText
        }
      >
        Loading...
      </Text>
    </View>
  );
}

type ProfileDropdownProps = {
  label:string;
  value:string;
  placeholder:string;
  options:string[];
  open:boolean;
  searchable?:boolean;
  onToggle:()=>void;
  onSelect:(value:string)=>void;
};
function ProfileDropdown({label,value,placeholder,options,open,searchable=false,onToggle,onSelect}:ProfileDropdownProps) {
  const [search,setSearch]=useState("");
  useEffect(()=>{if(!open)setSearch("");},[open]);
  const visibleOptions=searchable
    ? options.filter(option=>option.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    : options;
  return <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TouchableOpacity accessibilityRole="button"
      accessibilityLabel={label+": "+(value || placeholder)}
      accessibilityState={{expanded:open}}
      onPress={onToggle}
      style={[styles.dropdownTrigger,open && styles.dropdownTriggerOpen]}>
      <Text style={[styles.dropdownValue,!value && styles.dropdownPlaceholder]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      <Ionicons name={open?"chevron-up":"chevron-down"} size={18} color="#087A5D"/>
    </TouchableOpacity>
    {open && <View style={styles.dropdownPanel}>
      {searchable && <View style={styles.dropdownSearch}>
        <Ionicons name="search-outline" size={17} color="#6C9082"/>
        <TextInput accessibilityLabel={"Search "+label} value={search}
          onChangeText={setSearch} placeholder="Search barangay..."
          placeholderTextColor="#93A8A0" autoCapitalize="none" autoCorrect={false}
          style={styles.dropdownSearchInput}/>
      </View>}
      <ScrollView style={[styles.dropdownOptions,Platform.OS==="web" && styles.webModalScroll]}
        nestedScrollEnabled keyboardShouldPersistTaps="always" showsVerticalScrollIndicator persistentScrollbar>
        {visibleOptions.length === 0
          ? <Text style={styles.dropdownEmpty}>No matching options.</Text>
          : visibleOptions.map(option=><TouchableOpacity key={option}
            accessibilityRole="button" accessibilityLabel={"Select "+option}
            onPress={()=>onSelect(option)}
            style={[styles.dropdownOption,(value===option || (!value && option==="Not specified")) && styles.dropdownOptionSelected]}>
            <Text style={styles.dropdownOptionText} numberOfLines={2}>{option}</Text>
            {(value===option || (!value && option==="Not specified")) &&
              <Ionicons name="checkmark" color="#087A5D" size={17}/>}
          </TouchableOpacity>)}
      </ScrollView>
    </View>}
  </View>;
}

function ProfileInput({label,value,onChange,placeholder,required=false,keyboardType,maxLength}:{
  label:string;
  value:string;
  onChange:(value:string)=>void;
  placeholder:string;
  required?:boolean;
  keyboardType?:React.ComponentProps<typeof TextInput>["keyboardType"];
  maxLength?:number;
}) {
  return <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}{required && <Text style={styles.requiredAsterisk}> *</Text>}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
      placeholder={placeholder} placeholderTextColor="#93A8A0" style={styles.input}
      keyboardType={keyboardType} maxLength={maxLength} autoCorrect={false}/>
  </View>;
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: "#F6F8F7",
    },

    page: {
      width: "100%",
      maxWidth: 1180,
      alignSelf: "center",
      paddingHorizontal: 24,
      paddingTop: 28,
      paddingBottom: 70,
    },

    loadingScreen: {
      flex: 1,
      minHeight: 420,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor: "#F6F8F7",
      padding: 24,
    },

    loadingText: {
      marginTop: 12,
      color: "#64748B",
      fontSize: 13,
      fontWeight: "600",
    },

    pageHeading: {
      marginBottom: 20,
    },

    pageTitle: {
      color: "#173D32",
      fontSize: 28,
      fontWeight: "700",
      letterSpacing: -0.6,
    },

    pageSubtitle: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 14,
    },

    profileCard: {
      overflow: "hidden",
      borderRadius: 18,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    cover: {
      height: 116,
      backgroundColor:
        "#0B4D3C",
    },

    profileHeroBody: {
      minHeight: 150,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 28,
      paddingBottom: 22,
      gap: 20,
    },

    profileHeroBodyCompact: {
      flexDirection:
        "column",
      alignItems:
        "flex-start",
      paddingHorizontal: 20,
      paddingBottom: 22,
      gap: 12,
    },

    avatarWrap: {
      width: 116,
      height: 116,
      borderRadius: 58,
      marginTop: -58,
      backgroundColor:
        "#FFFFFF",
      padding: 5,
      position: "relative",
      shadowColor:
        "#0F172A",
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: {
        width: 0,
        height: 6,
      },
      elevation: 4,
    },

    avatarImage: {
      width: "100%",
      height: "100%",
      borderRadius: 52,
      backgroundColor:
        "#E2E8F0",
    },

    avatarFallback: {
      flex: 1,
      borderRadius: 52,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#D7F2E4",
    },

    avatarInitials: {
      color: "#087A5D",
      fontSize: 34,
      fontWeight: "900",
    },

    activeDot: {
      position: "absolute",
      right: 7,
      bottom: 10,
      width: 17,
      height: 17,
      borderRadius: 9,
      backgroundColor:
        "#22C55E",
      borderWidth: 3,
      borderColor:
        "#FFFFFF",
    },

    profileIdentity: {
      flex: 1,
      minWidth: 0,
      paddingTop: 18,
    },

    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 10,
    },

    profileName: {
      color: "#0F172A",
      fontSize: 24,
      fontWeight: "900",
      flexShrink: 1,
    },

    modeBadge: {
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      borderRadius: 9,
      backgroundColor:
        "#EEF2FF",
    },

    modeBadgeText: {
      color: "#4338CA",
      fontSize: 12,
      fontWeight: "800",
    },

    identityLine: {
      marginTop: 6,
      color: "#64748B",
      fontSize: 13,
    },

    editProfileButton: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      paddingHorizontal: 15,
      borderRadius: 11,
      backgroundColor:
        "#E7F7EE",
      borderWidth: 1,
      borderColor:
        "#BCE2CE",
      marginTop: 18,
    },

    editProfileText: {
      color: "#087A5D",
      fontSize: 13,
      fontWeight: "800",
    },

    tabs: {
      marginTop: 18,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      padding: 5,
      alignSelf:
        "flex-start",
      borderRadius: 12,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    tab: {
      minHeight: 36,
      justifyContent:
        "center",
      paddingHorizontal: 17,
      borderRadius: 9,
    },

    tabActive: {
      backgroundColor:
        "#087A5D",
    },

    tabText: {
      color: "#475569",
      fontSize: 13,
      fontWeight: "700",
    },

    tabTextActive: {
      color: "#FFFFFF",
    },

    infoGrid: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 16,
    },

    infoGridCompact: {
      flexDirection:
        "column",
    },

    identityCard: {
      width: "100%",
      marginBottom: 14,
      padding: 20,
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    identityCardTop: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 13,
      flexWrap: "wrap",
    },

    identityCardIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EEF2FF",
    },

    identityCardCopy: {
      flex: 1,
      minWidth: 220,
    },

    identityCardEyebrow: {
      color: "#6366F1",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    identityCardTitle: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "900",
    },

    identityCardText: {
      marginTop: 6,
      color: "#64748B",
      fontSize: 12.5,
      lineHeight: 19,
      maxWidth: 720,
    },

    identityStatusBadge: {
      minHeight: 30,
      justifyContent:
        "center",
      paddingHorizontal: 11,
      borderRadius: 999,
    },

    identityStatusBadgeText: {
      fontSize: 11,
      fontWeight: "900",
    },

    identityAccessRow: {
      marginTop: 18,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    accessItem: {
      minWidth: 150,
      flexGrow: 1,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderRadius: 11,
      backgroundColor:
        "#F8FAFC",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    accessLabel: {
      color: "#94A3B8",
      fontSize: 10,
      fontWeight: "800",
      textTransform:
        "uppercase",
      letterSpacing: 0.4,
    },

    accessValue: {
      marginTop: 4,
      color: "#0F172A",
      fontSize: 12.5,
      fontWeight: "800",
    },

    identityActions: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 12,
    },

    identityPrimaryButton: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      paddingHorizontal: 16,
      borderRadius: 11,
      backgroundColor:
        "#4F46E5",
    },

    identityPrimaryButtonText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "900",
    },

    identityActionHint: {
      flex: 1,
      minWidth: 220,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 17,
    },

    identityNotice: {
      marginTop: 15,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 9,
      padding: 12,
      borderRadius: 11,
      backgroundColor:
        "#F8FAFC",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    identityNoticeText: {
      flex: 1,
      fontSize: 11.5,
      lineHeight: 17,
      fontWeight: "700",
    },

    sectionCard: {
      flex: 1,
      width: "100%",
      padding: 22,
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    sectionHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },

    sectionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EEF2FF",
    },

    sectionTitle: {
      color: "#173D32",
      fontSize: 17,
      fontWeight: "700",
    },

    infoRow: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",
      gap: 18,
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor:
        "#EEF2F6",
    },

    infoRowLast: {
      borderBottomWidth: 0,
    },

    infoLabel: {
      width: "38%",
      color: "#64748B",
      fontSize: 12.5,
      lineHeight: 18,
    },

    infoValue: {
      flex: 1,
      color: "#0F172A",
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "700",
    },

    activityCard: {
      marginTop: 12,
      padding: 16,
      borderRadius: 13,
      backgroundColor:
        "#FBFDFF",
      borderWidth: 1,
      borderColor:
        "#E5EAF1",
    },

    activityTop: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 12,
    },

    activityCopy: {
      flex: 1,
      minWidth: 0,
    },

    activityTitle: {
      color: "#0F172A",
      fontSize: 15,
      fontWeight: "800",
    },

    activitySubtitle: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 17,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },

    statusBadgeText: {
      fontSize: 10.5,
      fontWeight: "900",
    },

    activityMeta: {
      marginTop: 14,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 18,
    },

    metaItem: {
      minWidth: 110,
    },

    metaLabel: {
      color: "#94A3B8",
      fontSize: 10.5,
      fontWeight: "700",
      textTransform:
        "uppercase",
      letterSpacing: 0.45,
    },

    metaValue: {
      marginTop: 3,
      color: "#334155",
      fontSize: 12,
      fontWeight: "700",
    },

    certificateCard: {
      marginTop: 12,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 14,
      padding: 17,
      borderRadius: 14,
      backgroundColor:
        "#FBFDFF",
      borderWidth: 1,
      borderColor:
        "#E5EAF1",
    },

    certificateIcon: {
      width: 48,
      height: 48,
      borderRadius: 13,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#EEF2FF",
    },

    certificateBody: {
      flex: 1,
      minWidth: 0,
    },

    certificateTitleRow: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 12,
    },

    certificateTitleArea: {
      flex: 1,
      minWidth: 0,
    },

    certificateTitle: {
      color: "#0F172A",
      fontSize: 15,
      fontWeight: "900",
    },

    certificateId: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 11,
    },

    certificateMetrics: {
      marginTop: 14,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 16,
    },

    metric: {
      minWidth: 105,
    },

    metricLabel: {
      color: "#94A3B8",
      fontSize: 10,
      fontWeight: "800",
      textTransform:
        "uppercase",
      letterSpacing: 0.4,
    },

    metricValue: {
      marginTop: 3,
      color: "#334155",
      fontSize: 12,
      fontWeight: "800",
    },

    emptyState: {
      minHeight: 180,
      alignItems: "center",
      justifyContent:
        "center",
      padding: 28,
    },

    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
      marginBottom: 11,
    },

    emptyTitle: {
      color: "#0F172A",
      fontSize: 15,
      fontWeight: "900",
      textAlign: "center",
    },

    emptyText: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: "center",
      maxWidth: 430,
    },

    inlineLoading: {
      minHeight: 150,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 9,
    },

    inlineLoadingText: {
      color: "#64748B",
      fontSize: 12.5,
      fontWeight: "700",
    },

    modalBackdrop: {
      flex:1,justifyContent:"center",padding:14,
      backgroundColor:"rgba(8,34,29,0.63)",
    },
    modalCard: {
      width:"100%",maxWidth:660,maxHeight:"91%",
      alignSelf:"center",borderRadius:18,overflow:"hidden",
      backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#CFE6D9",
      shadowColor:"#082A1C",shadowOffset:{width:0,height:12},
      shadowOpacity:0.22,shadowRadius:28,elevation:8,
    },
    modalHeader: {
      flexDirection:"row",alignItems:"center",gap:12,
      paddingHorizontal:22,paddingVertical:17,
      backgroundColor:"#EDF9F2",borderBottomWidth:1,borderBottomColor:"#D5EBDD",
    },
    modalIcon:{
      height:48,width:48,borderRadius:14,backgroundColor:"#D8F0E3",
      alignItems:"center",justifyContent:"center",
    },
    modalHeaderCopy:{flex:1,minWidth:0},
    modalEyebrow:{fontSize:10,fontWeight:"900",letterSpacing:1.3,color:"#1A7860",marginBottom:3},
    modalTitle:{fontSize:21,fontWeight:"900",color:"#0D3429",letterSpacing:-0.5},
    modalSubtitle:{fontSize:12,color:"#537366",lineHeight:17,marginTop:3},
    modalClose:{
      height:36,width:36,borderRadius:9,backgroundColor:"#FFFFFF",
      alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#D9EAE0",
    },
    modalScroll:{flexShrink:1,minHeight:0},
    webModalScroll:{overflowY:"auto",scrollbarWidth:"auto",scrollbarColor:"#5D9B84 #EDF7F1"} as any,
    modalScrollContent:{paddingHorizontal:23,paddingTop:18,paddingBottom:24},
    modalSectionHeader:{flexDirection:"row",alignItems:"center",gap:9,marginBottom:13},
    sectionMarker:{width:4,height:18,borderRadius:2,backgroundColor:"#0B8868"},
    modalSectionTitle:{fontSize:14,fontWeight:"900",color:"#193D31"},
    modalHelper:{fontSize:11,color:"#668276",lineHeight:16,marginBottom:12},
    modalDivider:{height:1,backgroundColor:"#E6EFE9",marginBottom:20,marginTop:7},
    nameGrid:{flexDirection:"row",flexWrap:"wrap",gap:11},
    nameField:{flexGrow:1,flexBasis:"29%",minWidth:145},
    inputGroup:{marginBottom:13},
    inputLabel:{fontSize:12,fontWeight:"800",color:"#2C5041",marginBottom:7},
    requiredAsterisk:{color:"#D4413A"},
    input:{
      minHeight:45,borderRadius:10,borderColor:"#D7E6DD",borderWidth:1,
      backgroundColor:"#FCFEFD",paddingHorizontal:12,fontSize:13,color:"#173A2B",
    },
    dropdownTrigger:{
      minHeight:46,borderRadius:10,borderColor:"#D7E6DD",borderWidth:1,
      backgroundColor:"#FCFEFD",flexDirection:"row",alignItems:"center",
      paddingHorizontal:13,justifyContent:"space-between",gap:10,
    },
    dropdownTriggerOpen:{borderColor:"#0B896C",backgroundColor:"#F1FBF6"},
    dropdownValue:{fontSize:13,fontWeight:"700",color:"#214F3E",flex:1},
    dropdownPlaceholder:{fontWeight:"500",color:"#799588"},
    dropdownPanel:{
      borderWidth:1,borderColor:"#CDE4D6",borderRadius:10,
      backgroundColor:"#FFFFFF",marginTop:6,overflow:"hidden",
    },
    dropdownSearch:{
      minHeight:42,flexDirection:"row",alignItems:"center",gap:8,
      paddingHorizontal:12,backgroundColor:"#F6FBF8",borderBottomWidth:1,borderBottomColor:"#E3F0E9",
    },
    dropdownSearchInput:{minHeight:40,flex:1,fontSize:12,color:"#214A39",paddingVertical:6},
    dropdownOptions:{maxHeight:188},
    dropdownOption:{
      paddingHorizontal:13,paddingVertical:11,minHeight:40,
      flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8,
      borderBottomWidth:1,borderBottomColor:"#F0F4F1",
    },
    dropdownOptionSelected:{backgroundColor:"#E6F7ED"},
    dropdownOptionText:{flex:1,fontSize:12,color:"#234B3D",fontWeight:"600"},
    dropdownEmpty:{fontSize:12,color:"#718A7B",padding:15},
    modalFooter:{
      backgroundColor:"#F9FCFA",borderTopWidth:1,borderTopColor:"#E0EDE5",
      paddingHorizontal:22,paddingVertical:14,flexDirection:"row",
      justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,
    },
    modalFooterHint:{fontSize:10.5,lineHeight:15,color:"#709181",flex:1,minWidth:110},
    modalActions:{flexDirection:"row",alignItems:"center",gap:9},
    cancelButton:{
      minHeight:43,justifyContent:"center",alignItems:"center",paddingHorizontal:16,
      borderRadius:9,borderWidth:1,borderColor:"#CFE1D7",backgroundColor:"#FFFFFF",
    },
    cancelButtonText:{color:"#355C4B",fontSize:12.5,fontWeight:"800"},
    saveButton:{
      minHeight:43,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,
      paddingHorizontal:18,borderRadius:9,backgroundColor:"#087C61",
    },
    buttonSaving:{opacity:.7},
    saveButtonText:{color:"#FFFFFF",fontSize:12.5,fontWeight:"900"},

    verifyResidentCard: {
      width: "100%",
      marginBottom: 14,
      padding: 20,
      borderRadius: 18,
      backgroundColor: "#F0FDFA",
      borderWidth: 1,
      borderColor: "#99F6E4",
      shadowColor: "#0F766E",
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 7,
      },
      elevation: 2,
    },

    verifyResidentTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      flexWrap: "wrap",
    },

    verifyResidentIcon: {
      width: 58,
      height: 58,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#0F9F8F",
    },

    verifyResidentHeading: {
      flex: 1,
      minWidth: 230,
    },

    verifyResidentTitle: {
      color: "#0F2F5A",
      fontSize: 20,
      fontWeight: "900",
    },

    verifyResidentSubtitle: {
      marginTop: 5,
      color: "#475569",
      fontSize: 12.5,
      lineHeight: 19,
      maxWidth: 640,
    },

    verifyBasicBadge: {
      minHeight: 31,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      borderRadius: 999,
      backgroundColor: "#FFEDD5",
    },

    verifyBasicBadgeText: {
      color: "#C2410C",
      fontSize: 11,
      fontWeight: "900",
    },

    verifyResidentGrid: {
      marginTop: 18,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },

    verifyResidentMiniCard: {
      flex: 1,
      minWidth: 260,
      padding: 15,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.78)",
      borderWidth: 1,
      borderColor: "#D6F4EE",
    },

    verifyResidentMiniTitle: {
      marginBottom: 9,
      color: "#0F2F5A",
      fontSize: 12.5,
      fontWeight: "900",
    },

    verifyBenefitRow: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },

    verifyBenefitIcon: {
      width: 27,
      height: 27,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EFF6FF",
    },

    verifyBenefitText: {
      flex: 1,
      color: "#334155",
      fontSize: 11.5,
      fontWeight: "700",
    },

    verifyStepMiniRow: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },

    verifyStepMiniNumber: {
      width: 27,
      height: 27,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#2563EB",
    },

    verifyStepMiniNumberText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    verifyStepMiniText: {
      flex: 1,
      color: "#334155",
      fontSize: 11.5,
      fontWeight: "700",
    },

    verifyResidentActions: {
      marginTop: 17,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    verifyStartButton: {
      minHeight: 48,
      flex: 1,
      minWidth: 240,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: "#0F9F8F",
    },

    verifyStartButtonText: {
      color: "#FFFFFF",
      fontSize: 12.5,
      fontWeight: "900",
    },

    verifyLearnButton: {
      minHeight: 48,
      flex: 1,
      minWidth: 190,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#93C5FD",
      backgroundColor: "#FFFFFF",
    },

    verifyLearnButtonText: {
      color: "#2563EB",
      fontSize: 12.5,
      fontWeight: "900",
    },

    verifyStateCard: {
      width: "100%",
      marginBottom: 14,
      padding: 20,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },

    verifyStateIconSuccess: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#16A34A",
    },

    verifyStateIconPending: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FEF3C7",
    },

    verifyStateIconFailed: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EF4444",
    },

    verifyStateCopy: {
      flex: 1,
      minWidth: 0,
    },

    verifyStateTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 9,
    },

    verifyStateTitle: {
      flexShrink: 1,
      color: "#0F2F5A",
      fontSize: 18,
      fontWeight: "900",
    },

    verifyStateBadge: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      borderRadius: 999,
    },

    verifyStateBadgeText: {
      fontSize: 10.5,
      fontWeight: "900",
    },

    verifyStateText: {
      marginTop: 6,
      color: "#475569",
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 760,
    },

    verifyStateNoticeSuccess: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 11,
      borderRadius: 11,
      backgroundColor: "#DCFCE7",
    },

    verifyStateNoticeSuccessText: {
      flex: 1,
      color: "#166534",
      fontSize: 11.5,
      fontWeight: "700",
    },

    verifyStateNoticeWarning: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 11,
      borderRadius: 11,
      backgroundColor: "#FEF3C7",
    },

    verifyStateNoticeWarningText: {
      flex: 1,
      color: "#92400E",
      fontSize: 11.5,
      fontWeight: "700",
    },

    verifyVolunteerButton: {
      alignSelf: "flex-start",
      minHeight: 43,
      marginTop: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 15,
      borderRadius: 11,
      backgroundColor: "#16A34A",
    },

    verifyVolunteerButtonText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },

    verifyRetryButton: {
      alignSelf: "flex-start",
      minHeight: 43,
      marginTop: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 15,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: "#FCA5A5",
      backgroundColor: "#FFFFFF",
    },

    verifyRetryButtonText: {
      color: "#B91C1C",
      fontSize: 12,
      fontWeight: "900",
    },

  });
