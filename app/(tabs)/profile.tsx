import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { User } from "firebase/auth";
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
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
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
      "info",
    );

  const [
    editOpen,
    setEditOpen,
  ] =
    useState(false);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    fullName,
    setFullName,
  ] =
    useState("");

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

  const [
    occupation,
    setOccupation,
  ] =
    useState("");

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

          setFullName(
            nextProfile.fullName ||
              "",
          );

          setPhoneNumber(
            nextProfile.phoneNumber ||
              "",
          );

          setAddress(
            nextProfile.address ||
              "",
          );

          setOccupation(
            nextProfile.occupation ||
              "",
          );

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

  const saveProfile =
    async () => {
      if (!user) {
        return;
      }

      const cleanName =
        fullName
          .trim()
          .replace(
            /\s+/g,
            " ",
          );

      if (
        cleanName.length <
        2
      ) {
        Alert.alert(
          "Invalid name",
          "Please enter your full name.",
        );

        return;
      }

      setSaving(true);

      try {
        await updateUserProfile(
          user.uid,
          {
            fullName:
              cleanName,
            phoneNumber:
              phoneNumber.trim(),
            address:
              address.trim(),
            occupation:
              occupation.trim(),
          },
        );

        setEditOpen(
          false,
        );
      } catch (
        error: any
      ) {
        Alert.alert(
          "Unable to save",
          error?.message ||
            "Please try again.",
        );
      } finally {
        setSaving(
          false,
        );
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
      showsVerticalScrollIndicator={
        false
      }
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
          View your profile, identity verification, and account access.
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
                style={
                  styles.modeBadge
                }
              >
                <Ionicons
                  name={
                    currentMode ===
                    "volunteer"
                      ? "people-outline"
                      : "person-outline"
                  }
                  size={15}
                  color="#4338CA"
                />

                <Text
                  style={
                    styles.modeBadgeText
                  }
                >
                  {displayRole}
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
            onPress={() =>
              setEditOpen(
                true,
              )
            }
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

      <Modal
        visible={
          editOpen
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setEditOpen(
            false,
          )
        }
      >
        <View
          style={
            styles.modalBackdrop
          }
        >
          <View
            style={
              styles.modalCard
            }
          >
            <View
              style={
                styles.modalHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  Edit Profile
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  Update your basic account information.
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.modalClose
                }
                onPress={() =>
                  setEditOpen(
                    false,
                  )
                }
              >
                <Ionicons
                  name="close"
                  size={22}
                  color="#475569"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={
                false
              }
            >
              <ProfileInput
                label="Full Name"
                value={
                  fullName
                }
                onChange={
                  setFullName
                }
                placeholder="Full name"
              />

              <ProfileInput
                label="Phone Number"
                value={
                  phoneNumber
                }
                onChange={
                  setPhoneNumber
                }
                placeholder="Phone number"
              />

              <ProfileInput
                label="Address"
                value={
                  address
                }
                onChange={
                  setAddress
                }
                placeholder="Complete address"
              />

              <ProfileInput
                label="Occupation"
                value={
                  occupation
                }
                onChange={
                  setOccupation
                }
                placeholder="Occupation"
              />

              <View
                style={
                  styles.modalActions
                }
              >
                <TouchableOpacity
                  style={
                    styles.cancelButton
                  }
                  disabled={
                    saving
                  }
                  onPress={() =>
                    setEditOpen(
                      false,
                    )
                  }
                >
                  <Text
                    style={
                      styles.cancelButtonText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={
                    styles.saveButton
                  }
                  disabled={
                    saving
                  }
                  onPress={() =>
                    void saveProfile()
                  }
                >
                  {saving ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color="#FFFFFF"
                      />

                      <Text
                        style={
                          styles.saveButtonText
                        }
                      >
                        Save Changes
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  const verified =
    identityStatus ===
    "verified";

  const pending =
    identityStatus ===
    "pending";

  const failed =
    identityStatus ===
    "failed";

  const title = verified
    ? "Identity Verified"
    : pending
      ? "Identity Verification Pending"
      : failed
        ? "Verification Needs Resubmission"
        : "Basic Resident Account";

  const statusText = verified
    ? "Verified"
    : pending
      ? "Pending"
      : failed
        ? "Failed"
        : "Not Verified";

  const description = verified
    ? "Your identity has been verified. You are eligible to apply for Volunteer access."
    : pending
      ? "Your government ID and live identity submission are being reviewed. Resident access remains available while verification is pending."
      : failed
        ? "Your previous identity verification could not be completed. You can submit a new government ID and live identity check."
        : "Your Resident account is active. Verify your identity using a supported government ID and live selfie to become eligible for Volunteer access.";

  const badgeBackground = verified
    ? "#DCFCE7"
    : pending
      ? "#FEF3C7"
      : failed
        ? "#FEE2E2"
        : "#EEF2FF";

  const badgeColor = verified
    ? "#166534"
    : pending
      ? "#92400E"
      : failed
        ? "#B91C1C"
        : "#4338CA";

  const iconName = (
    verified
      ? "shield-checkmark-outline"
      : pending
        ? "time-outline"
        : failed
          ? "alert-circle-outline"
          : "shield-outline"
  ) as React.ComponentProps<
    typeof Ionicons
  >["name"];

  const normalizedVolunteerStatus =
    volunteerStatus ||
    "not_applied";

  const volunteerPending =
    normalizedVolunteerStatus ===
    "pending";

  const canApply =
    verified &&
    !volunteerAccess &&
    normalizedVolunteerStatus ===
      "not_applied";

  return (
    <View
      style={
        styles.identityCard
      }
    >
      <View
        style={
          styles.identityCardTop
        }
      >
        <View
          style={
            styles.identityCardIcon
          }
        >
          <Ionicons
            name={iconName}
            size={24}
            color="#4338CA"
          />
        </View>

        <View
          style={
            styles.identityCardCopy
          }
        >
          <Text
            style={
              styles.identityCardEyebrow
            }
          >
            IDENTITY & ACCESS
          </Text>

          <Text
            style={
              styles.identityCardTitle
            }
          >
            {title}
          </Text>

          <Text
            style={
              styles.identityCardText
            }
          >
            {description}
          </Text>
        </View>

        <View
          style={[
            styles.identityStatusBadge,
            {
              backgroundColor:
                badgeBackground,
            },
          ]}
        >
          <Text
            style={[
              styles.identityStatusBadgeText,
              {
                color:
                  badgeColor,
              },
            ]}
          >
            {statusText}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.identityAccessRow
        }
      >
        <View
          style={
            styles.accessItem
          }
        >
          <Text
            style={
              styles.accessLabel
            }
          >
            Resident Access
          </Text>

          <Text
            style={
              styles.accessValue
            }
          >
            Active
          </Text>
        </View>

        <View
          style={
            styles.accessItem
          }
        >
          <Text
            style={
              styles.accessLabel
            }
          >
            Identity
          </Text>

          <Text
            style={
              styles.accessValue
            }
          >
            {statusText}
          </Text>
        </View>

        <View
          style={
            styles.accessItem
          }
        >
          <Text
            style={
              styles.accessLabel
            }
          >
            Volunteer Access
          </Text>

          <Text
            style={
              styles.accessValue
            }
          >
            {volunteerAccess
              ? "Enabled"
              : volunteerPending
                ? "Pending"
                : "Not Enabled"}
          </Text>
        </View>
      </View>

      {!verified &&
      !pending ? (
        <View
          style={
            styles.identityActions
          }
        >
          <TouchableOpacity
            style={
              styles.identityPrimaryButton
            }
            activeOpacity={0.84}
            onPress={
              onVerify
            }
          >
            <Ionicons
              name="scan-outline"
              size={18}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.identityPrimaryButtonText
              }
            >
              {failed
                ? "Try Verification Again"
                : "Verify Identity"}
            </Text>
          </TouchableOpacity>

          <Text
            style={
              styles.identityActionHint
            }
          >
            Government ID + live selfie/liveness check
          </Text>
        </View>
      ) : null}

      {pending ? (
        <View
          style={
            styles.identityNotice
          }
        >
          <Ionicons
            name="time-outline"
            size={18}
            color="#92400E"
          />

          <Text
            style={[
              styles.identityNoticeText,
              {
                color:
                  "#92400E",
              },
            ]}
          >
            Verification is pending. You can continue using Resident services while waiting for the result.
          </Text>
        </View>
      ) : null}

      {verified &&
      volunteerAccess ? (
        <View
          style={
            styles.identityNotice
          }
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={18}
            color="#166534"
          />

          <Text
            style={[
              styles.identityNoticeText,
              {
                color:
                  "#166534",
              },
            ]}
          >
            Volunteer access is enabled on this account. You can use Volunteer Mode without creating another account.
          </Text>
        </View>
      ) : null}

      {verified &&
      volunteerPending &&
      !volunteerAccess ? (
        <View
          style={
            styles.identityNotice
          }
        >
          <Ionicons
            name="hourglass-outline"
            size={18}
            color="#92400E"
          />

          <Text
            style={[
              styles.identityNoticeText,
              {
                color:
                  "#92400E",
              },
            ]}
          >
            Your Volunteer application is pending Admin review.
          </Text>
        </View>
      ) : null}

      {canApply ? (
        <View
          style={
            styles.identityActions
          }
        >
          <TouchableOpacity
            style={
              styles.identityPrimaryButton
            }
            activeOpacity={0.84}
            onPress={
              onApplyVolunteer
            }
          >
            <Ionicons
              name="people-outline"
              size={18}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.identityPrimaryButtonText
              }
            >
              Become a Volunteer
            </Text>
          </TouchableOpacity>

          <Text
            style={
              styles.identityActionHint
            }
          >
            Submit your skills and availability for Admin review.
          </Text>
        </View>
      ) : null}
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

function ProfileInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string,
  ) => void;
  placeholder: string;
}) {
  return (
    <View
      style={
        styles.inputGroup
      }
    >
      <Text
        style={
          styles.inputLabel
        }
      >
        {label}
      </Text>

      <TextInput
        value={
          value
        }
        onChangeText={
          onChange
        }
        placeholder={
          placeholder
        }
        placeholderTextColor="#94A3B8"
        style={
          styles.input
        }
      />
    </View>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#F4F7FB",
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
      backgroundColor:
        "#F4F7FB",
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
      color: "#0F172A",
      fontSize: 32,
      fontWeight: "900",
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
        "#173A63",
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
        "#E0E7FF",
    },

    avatarInitials: {
      color: "#3730A3",
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
        "#F5F3FF",
      borderWidth: 1,
      borderColor:
        "#DDD6FE",
      marginTop: 18,
    },

    editProfileText: {
      color: "#4338CA",
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
        "#4F46E5",
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
      color: "#0F172A",
      fontSize: 17,
      fontWeight: "900",
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
      flex: 1,
      justifyContent:
        "center",
      padding: 20,
      backgroundColor:
        "rgba(15, 23, 42, 0.50)",
    },

    modalCard: {
      width: "100%",
      maxWidth: 520,
      maxHeight: "88%",
      alignSelf: "center",
      padding: 22,
      borderRadius: 18,
      backgroundColor:
        "#FFFFFF",
    },

    modalHeader: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 15,
      marginBottom: 20,
    },

    modalTitle: {
      color: "#0F172A",
      fontSize: 20,
      fontWeight: "900",
    },

    modalSubtitle: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 12.5,
    },

    modalClose: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F8FAFC",
    },

    inputGroup: {
      marginBottom: 13,
    },

    inputLabel: {
      marginBottom: 6,
      color: "#334155",
      fontSize: 12,
      fontWeight: "800",
    },

    input: {
      minHeight: 46,
      paddingHorizontal: 13,
      borderRadius: 11,
      borderWidth: 1,
      borderColor:
        "#DCE3EB",
      color: "#0F172A",
      backgroundColor:
        "#FFFFFF",
      fontSize: 13,
    },

    modalActions: {
      marginTop: 8,
      flexDirection: "row",
      justifyContent:
        "flex-end",
      gap: 10,
    },

    cancelButton: {
      minHeight: 44,
      justifyContent:
        "center",
      paddingHorizontal: 16,
      borderRadius: 11,
      borderWidth: 1,
      borderColor:
        "#CBD5E1",
    },

    cancelButtonText: {
      color: "#475569",
      fontSize: 13,
      fontWeight: "800",
    },

    saveButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
      paddingHorizontal: 17,
      borderRadius: 11,
      backgroundColor:
        "#4F46E5",
    },

    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },
  });
