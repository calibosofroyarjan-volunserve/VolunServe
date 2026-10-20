import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
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
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

type Severity =
  | "low"
  | "medium"
  | "high"
  | "critical";

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type DisasterCase = {
  id: string;
  severity?: Severity;
  status?: CaseStatus;
};

type EvacuationCenter = {
  id: string;
  name?: string;
  address?: string;
  barangay?: string;
  latitude?: number;
  longitude?: number;
  capacity?: number;
  occupied?: number;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
};

type BarangayNeedAssessment = {
  id: string;
  barangay?: string;
  status?: string;
};

type CenterForm = {
  name: string;
  barangay: string;
  address: string;
  latitude: string;
  longitude: string;
  capacity: string;
  occupied: string;
};

const EMPTY_CENTER_FORM: CenterForm = {
  name: "",
  barangay: "",
  address: "",
  latitude: "",
  longitude: "",
  capacity: "",
  occupied: "0",
};

type ModuleCardProps = {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  iconColor: string;
  iconBackground: string;
  title: string;
  description: string;
  onPress: () => void;
  count?: number;
};

type OverviewCardProps = {
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
  iconColor: string;
  iconBackground: string;
  label: string;
  value: number;
  description: string;
  onPress: () => void;
};

export default function CommandCenter() {
  const router =
    useRouter();

  const {
    width,
  } = useWindowDimensions();

  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const [
    cases,
    setCases,
  ] = useState<
    DisasterCase[]
  >([]);

  const [
    centers,
    setCenters,
  ] = useState<
    EvacuationCenter[]
  >([]);

  const [
    needAssessments,
    setNeedAssessments,
  ] = useState<
    BarangayNeedAssessment[]
  >([]);

  const [
    centerModalVisible,
    setCenterModalVisible,
  ] = useState(false);

  const [
    editingCenterId,
    setEditingCenterId,
  ] = useState<string | null>(
    null,
  );

  const [
    centerForm,
    setCenterForm,
  ] = useState<CenterForm>(
    EMPTY_CENTER_FORM,
  );

  const [
    savingCenter,
    setSavingCenter,
  ] = useState(false);

  const [
    pendingUserIds,
    setPendingUserIds,
  ] = useState<
    string[]
  >([]);

  const [
    pendingVolunteerIds,
    setPendingVolunteerIds,
  ] = useState<
    string[]
  >([]);

  const [
    dataError,
    setDataError,
  ] = useState(false);

  const isAdmin =
    !!profile &&
    profile.role === "admin" &&
    isApprovedProfile(profile);

  const contentWidth =
    Math.min(
      Math.max(
        width - 340,
        280,
      ),
      1180,
    );

  const moduleColumns =
    contentWidth >= 980
      ? 4
      : contentWidth >= 650
        ? 2
        : 1;

  const overviewColumns =
    contentWidth >= 850
      ? 3
      : contentWidth >= 560
        ? 2
        : 1;

  const moduleGap = 14;
  const overviewGap = 14;

  const moduleCardWidth =
    moduleColumns === 1
      ? "100%"
      : (contentWidth -
          moduleGap *
            (moduleColumns -
              1)) /
        moduleColumns;

  const overviewCardWidth =
    overviewColumns === 1
      ? "100%"
      : (contentWidth -
          overviewGap *
            (overviewColumns -
              1)) /
        overviewColumns;

  const navigate = (
    route: string,
  ) => {
    router.push(
      route as any,
    );
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "disasterCases",
        ),
        (snapshot) => {
          const rows: DisasterCase[] =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...(item.data() as Omit<
                  DisasterCase,
                  "id"
                >),
              }),
            );

          setCases(
            rows,
          );
        },
        (error) => {
          console.log(
            "Admin dashboard cases error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "evacuation_centers",
        ),
        (snapshot) => {
          const rows =
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...(item.data() as Omit<
                  EvacuationCenter,
                  "id"
                >),
              }))
              .sort((a, b) =>
                String(
                  a.name || "",
                ).localeCompare(
                  String(
                    b.name || "",
                  ),
                ),
              );

          setCenters(rows);
        },
        (error) => {
          console.log(
            "Command center evacuation centers error:",
            error,
          );

          setDataError(true);
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const unsubscribe =
      onSnapshot(
        collection(
          db,
          "barangayNeedAssessments",
        ),
        (snapshot) => {
          const rows =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...(item.data() as Omit<
                  BarangayNeedAssessment,
                  "id"
                >),
              }),
            );

          setNeedAssessments(rows);
        },
        (error) => {
          console.log(
            "Command center barangay needs error:",
            error,
          );

          setDataError(true);
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const pendingUsersQuery =
      query(
        collection(
          db,
          "users",
        ),
        where(
          "status",
          "==",
          "pending_review",
        ),
      );

    const unsubscribe =
      onSnapshot(
        pendingUsersQuery,
        (snapshot) => {
          setPendingUserIds(
            snapshot.docs.map(
              (item) =>
                item.id,
            ),
          );
        },
        (error) => {
          console.log(
            "Admin dashboard pending users error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const pendingApplicationsQuery =
      query(
        collection(
          db,
          "volunteerApplications",
        ),
        where(
          "status",
          "==",
          "pending",
        ),
      );

    const unsubscribe =
      onSnapshot(
        pendingApplicationsQuery,
        (snapshot) => {
          setPendingVolunteerIds(
            snapshot.docs.map(
              (item) =>
                item.id,
            ),
          );
        },
        (error) => {
          console.log(
            "Admin dashboard pending volunteer applications error:",
            error,
          );

          setDataError(
            true,
          );
        },
      );

    return unsubscribe;
  }, [isAdmin]);

  const updateCenterField = (
    field: keyof CenterForm,
    value: string,
  ) => {
    setCenterForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  };

  const openNewCenter = () => {
    setEditingCenterId(null);
    setCenterForm(
      EMPTY_CENTER_FORM,
    );
    setCenterModalVisible(true);
  };

  const openEditCenter = (
    center: EvacuationCenter,
  ) => {
    setEditingCenterId(center.id);

    setCenterForm({
      name:
        center.name || "",
      barangay:
        center.barangay || "",
      address:
        center.address || "",
      latitude:
        Number.isFinite(
          Number(center.latitude),
        )
          ? String(center.latitude)
          : "",
      longitude:
        Number.isFinite(
          Number(center.longitude),
        )
          ? String(center.longitude)
          : "",
      capacity:
        Number.isFinite(
          Number(center.capacity),
        )
          ? String(
              Math.max(
                0,
                Number(center.capacity),
              ),
            )
          : "",
      occupied:
        Number.isFinite(
          Number(center.occupied),
        )
          ? String(
              Math.max(
                0,
                Number(center.occupied),
              ),
            )
          : "0",
    });

    setCenterModalVisible(true);
  };

  const closeCenterModal = () => {
    if (savingCenter) {
      return;
    }

    setCenterModalVisible(false);
    setEditingCenterId(null);
    setCenterForm(
      EMPTY_CENTER_FORM,
    );
  };

  const saveEvacuationCenter =
    async () => {
      if (!user || !isAdmin) {
        Alert.alert(
          "Admin access required",
          "Only the LGU Admin can manage evacuation centers.",
        );
        return;
      }

      const name =
        centerForm.name.trim();
      const barangay =
        centerForm.barangay.trim();
      const address =
        centerForm.address.trim();

      const latitude =
        Number(
          centerForm.latitude,
        );
      const longitude =
        Number(
          centerForm.longitude,
        );

      const capacity =
        Math.floor(
          Number(
            centerForm.capacity,
          ),
        );

      const occupied =
        Math.floor(
          Number(
            centerForm.occupied,
          ),
        );

      if (name.length < 3) {
        Alert.alert(
          "Center name required",
          "Enter the official evacuation center name.",
        );
        return;
      }

      if (barangay.length < 2) {
        Alert.alert(
          "Barangay required",
          "Enter the barangay served by this evacuation center.",
        );
        return;
      }

      if (address.length < 3) {
        Alert.alert(
          "Address required",
          "Enter the evacuation center address or landmark.",
        );
        return;
      }

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        Alert.alert(
          "Invalid coordinates",
          "Enter valid latitude and longitude values.",
        );
        return;
      }

      if (
        !Number.isFinite(capacity) ||
        capacity < 1
      ) {
        Alert.alert(
          "Invalid capacity",
          "Capacity must be at least 1 person.",
        );
        return;
      }

      if (
        !Number.isFinite(occupied) ||
        occupied < 0 ||
        occupied > capacity
      ) {
        Alert.alert(
          "Invalid occupancy",
          "Current occupancy must be from 0 up to the center capacity.",
        );
        return;
      }

      try {
        setSavingCenter(true);

        if (editingCenterId) {
          await setDoc(
            doc(
              db,
              "evacuation_centers",
              editingCenterId,
            ),
            {
              name,
              barangay,
              address,
              latitude,
              longitude,
              capacity,
              occupied,
              status: "active",
              updatedBy: user.uid,
              updatedAt:
                serverTimestamp(),
            },
            {
              merge: true,
            },
          );
        } else {
          const centerRef =
            doc(
              collection(
                db,
                "evacuation_centers",
              ),
            );

          await setDoc(
            centerRef,
            {
              centerId:
                centerRef.id,
              name,
              barangay,
              address,
              latitude,
              longitude,
              capacity,
              occupied,
              status: "active",
              createdBy:
                user.uid,
              updatedBy:
                user.uid,
              createdAt:
                serverTimestamp(),
              updatedAt:
                serverTimestamp(),
            },
          );
        }

        setCenterModalVisible(false);
        setEditingCenterId(null);
        setCenterForm(
          EMPTY_CENTER_FORM,
        );

        Alert.alert(
          "Evacuation Center Saved",
          "The official LGU evacuation center is now available to the VolunServe map.",
        );
      } catch (error) {
        console.log(
          "Save evacuation center error:",
          error,
        );

        Alert.alert(
          "Save Failed",
          "The evacuation center could not be saved. Check Firestore permissions and try again.",
        );
      } finally {
        setSavingCenter(false);
      }
    };

  const removeEvacuationCenter =
    async (
      center: EvacuationCenter,
    ) => {
      if (!user || !isAdmin) {
        return;
      }

      try {
        await deleteDoc(
          doc(
            db,
            "evacuation_centers",
            center.id,
          ),
        );

        Alert.alert(
          "Center Removed",
          "The evacuation center was removed from the official LGU list.",
        );
      } catch (error) {
        console.log(
          "Remove evacuation center error:",
          error,
        );

        Alert.alert(
          "Remove Failed",
          "The evacuation center could not be removed.",
        );
      }
    };

  const confirmRemoveCenter = (
    center: EvacuationCenter,
  ) => {
    Alert.alert(
      "Remove Evacuation Center?",
      `${
        center.name ||
        "This evacuation center"
      } will no longer appear on the official VolunServe evacuation-center list.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void removeEvacuationCenter(
              center,
            ),
        },
      ],
    );
  };

  const metrics =
    useMemo(() => {
      const activeCases =
        cases.filter(
          (item) => {
            const status =
              item.status ||
              "reported";

            return (
              status !==
                "resolved" &&
              status !==
                "closed"
            );
          },
        ).length;

      const criticalOpen =
        cases.filter(
          (item) => {
            const status =
              item.status ||
              "reported";

            return (
              item.severity ===
                "critical" &&
              status !==
                "resolved" &&
              status !==
                "closed"
            );
          },
        ).length;

      const pendingReviews =
        new Set([
          ...pendingUserIds,
          ...pendingVolunteerIds,
        ]).size;

      const openBarangayNeeds =
        needAssessments.filter(
          (item) =>
            ![
              "fulfilled",
              "closed",
            ].includes(
              String(
                item.status ||
                  "verified",
              ).toLowerCase(),
            ),
        ).length;

      const activeCenters =
        centers.filter(
          (item) =>
            String(
              item.status ||
              "active",
            ).toLowerCase() !==
              "inactive" &&
            String(
              item.status ||
              "active",
            ).toLowerCase() !==
              "closed",
        );

      const evacuationCapacity =
        activeCenters.reduce(
          (total, item) =>
            total +
            Math.max(
              0,
              Number(
                item.capacity || 0,
              ),
            ),
          0,
        );

      const evacuationOccupied =
        activeCenters.reduce(
          (total, item) =>
            total +
            Math.max(
              0,
              Number(
                item.occupied || 0,
              ),
            ),
          0,
        );

      return {
        activeCases,
        criticalOpen,
        pendingReviews,
        openBarangayNeeds,
        activeCenters:
          activeCenters.length,
        availableEvacuationSpaces:
          Math.max(
            0,
            evacuationCapacity -
              evacuationOccupied,
          ),
      };
    }, [
      cases,
      centers,
      pendingUserIds,
      pendingVolunteerIds,
      needAssessments,
    ]);

  const modules:
    ModuleCardProps[] =
    [
      {
        icon:
          "warning-outline",
        iconColor:
          "#DC2626",
        iconBackground:
          "#FEF2F2",
        title:
          "Emergency LGU Operations",
        description:
          "Validate reports and coordinate the LGU response. Volunteer assignment is optional support.",
        count:
          metrics.activeCases,
        onPress: () =>
          navigate(
            "/(admin)/admin-cases",
          ),
      },
      {
        icon:
          "business-outline",
        iconColor:
          "#0891B2",
        iconBackground:
          "#ECFEFF",
        title:
          "Evacuation Centers",
        description:
          "Create and update official LGU evacuation centers shown on the map.",
        count:
          metrics.activeCenters,
        onPress:
          openNewCenter,
      },
      {
        icon:
          "cube-outline",
        iconColor:
          "#059669",
        iconBackground:
          "#ECFDF5",
        title:
          "Relief Operations",
        description:
          "Review verified barangay needs, LGU inventory, allocations, and distribution records in one place.",
        count:
          metrics.openBarangayNeeds,
        onPress: () =>
          navigate(
            "/(admin)/relief-operations",
          ),
      },
      {
        icon:
          "people-outline",
        iconColor:
          "#2563EB",
        iconBackground:
          "#EFF6FF",
        title:
          "Volunteer Reviews",
        description:
          "Review volunteer applications and legacy account records. Volunteers support LGU operations.",
        count:
          metrics.pendingReviews,
        onPress: () =>
          navigate(
            "/(admin)/account-approvals",
          ),
      },
      {
        icon:
          "calendar-outline",
        iconColor:
          "#7C3AED",
        iconBackground:
          "#F5F3FF",
        title:
          "Events",
        description:
          "Manage organized community and volunteer activities.",
        onPress: () =>
          navigate(
            "/(admin)/admin-events",
          ),
      },
      {
        icon:
          "megaphone-outline",
        iconColor:
          "#D97706",
        iconBackground:
          "#FFFBEB",
        title:
          "Announcements",
        description:
          "Publish official LGU community updates and emergency information.",
        onPress: () =>
          navigate(
            "/(admin)/create-announcement",
          ),
      },
      {
        icon:
          "analytics-outline",
        iconColor:
          "#0284C7",
        iconBackground:
          "#F0F9FF",
        title:
          "Analytics",
        description:
          "Review operational trends, response activity, and documented outcomes.",
        onPress: () =>
          navigate(
            "/(admin)/admin-analytics",
          ),
      },
      {
        icon:
          "ribbon-outline",
        iconColor:
          "#4F46E5",
        iconBackground:
          "#EEF2FF",
        title:
          "Certificates",
        description:
          "Issue certificates from verified volunteer service records.",
        onPress: () =>
          navigate(
            "/(admin)/admin-certificates",
          ),
      },
      {
        icon:
          "shield-checkmark-outline",
        iconColor:
          "#B45309",
        iconBackground:
          "#FFF7ED",
        title:
          "Disputes",
        description:
          "Review contested volunteer-response outcomes and service records.",
        onPress: () =>
          navigate(
            "/(admin)/admin-disputes",
          ),
      },
    ];

  const overview:
    OverviewCardProps[] =
    [
      {
        icon:
          "folder-open-outline",
        iconColor:
          "#2563EB",
        iconBackground:
          "#EFF6FF",
        label:
          "Active Cases",
        value:
          metrics.activeCases,
        description:
          "Emergency cases still under LGU responsibility.",
        onPress: () =>
          navigate(
            "/(admin)/admin-cases",
          ),
      },
      {
        icon:
          "alert-circle-outline",
        iconColor:
          "#DC2626",
        iconBackground:
          "#FEF2F2",
        label:
          "Critical Open",
        value:
          metrics.criticalOpen,
        description:
          "Critical cases requiring immediate LGU attention.",
        onPress: () =>
          navigate(
            "/(admin)/admin-cases",
          ),
      },
      {
        icon:
          "list-outline",
        iconColor:
          "#059669",
        iconBackground:
          "#ECFDF5",
        label:
          "Barangay Needs",
        value:
          metrics.openBarangayNeeds,
        description:
          "Verified assessments still included in LGU relief planning.",
        onPress: () =>
          navigate(
            "/(admin)/relief-operations",
          ),
      },
      {
        icon:
          "business-outline",
        iconColor:
          "#0891B2",
        iconBackground:
          "#ECFEFF",
        label:
          "Active Centers",
        value:
          metrics.activeCenters,
        description:
          "Official evacuation centers currently listed by LGU.",
        onPress:
          openNewCenter,
      },
      {
        icon:
          "bed-outline",
        iconColor:
          "#7C3AED",
        iconBackground:
          "#F5F3FF",
        label:
          "Available Spaces",
        value:
          metrics.availableEvacuationSpaces,
        description:
          "Remaining listed capacity across active evacuation centers.",
        onPress:
          openNewCenter,
      },
    ];

  if (loading) {
    return (
      <View
        style={
          styles.center
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
          Loading LGU Command Center...
        </Text>
      </View>
    );
  }

  if (
    !user ||
    !profile ||
    !isApprovedProfile(
      profile,
    )
  ) {
    return (
      <Redirect href="/login" />
    );
  }

  if (
    profile.role ===
    "superadmin"
  ) {
    return (
      <Redirect href="/(superadmin)" />
    );
  }

  if (!isAdmin) {
    return (
      <Redirect href="/(tabs)" />
    );
  }

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
        style={[
          styles.content,
          {
            maxWidth:
              contentWidth,
          },
        ]}
      >
        <View
          style={
            styles.header
          }
        >
          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              style={
                styles.title
              }
            >
              LGU Command Center
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Central control for LGU emergency response, evacuation centers, relief resources, and optional volunteer support.
            </Text>
          </View>

          <View
            style={
              styles.adminBadge
            }
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color="#0F766E"
            />

            <Text
              style={
                styles.adminBadgeText
              }
            >
              ADMIN
            </Text>
          </View>
        </View>

        {dataError && (
          <View
            style={
              styles.warningBox
            }
          >
            <Ionicons
              name="warning-outline"
              size={18}
              color="#B45309"
            />

            <Text
              style={
                styles.warningText
              }
            >
              Some live dashboard counts could not be loaded. The modules are still available.
            </Text>
          </View>
        )}

        <View
          style={
            styles.lguDoctrineCard
          }
        >
          <View
            style={
              styles.lguDoctrineIcon
            }
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={22}
              color="#0F766E"
            />
          </View>

          <View
            style={
              styles.lguDoctrineCopy
            }
          >
            <Text
              style={
                styles.lguDoctrineTitle
              }
            >
              LGU-led response
            </Text>

            <Text
              style={
                styles.lguDoctrineText
              }
            >
              The LGU remains responsible for emergency response, evacuation centers, relief resources, and barangay allocation. Volunteers are optional support: they may accept or decline an assignment, but a declined or unavailable volunteer never stops the LGU response.
            </Text>
          </View>
        </View>

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            Operations
          </Text>

          <Text
            style={
              styles.sectionSubtitle
            }
          >
            LGU/Admin remains the primary authority and responder for every case.
          </Text>
        </View>

        <View
          style={[
            styles.moduleGrid,
            {
              gap:
                moduleGap,
            },
          ]}
        >
          {modules.map(
            (item) => (
              <View
                key={
                  item.title
                }
                style={{
                  width:
                    moduleCardWidth,
                }}
              >
                <ModuleCard
                  {...item}
                />
              </View>
            ),
          )}
        </View>

        <View
          style={[
            styles.sectionHeader,
            styles.overviewHeader,
          ]}
        >
          <Text
            style={
              styles.sectionTitle
            }
          >
            LGU Live Overview
          </Text>

          <Text
            style={
              styles.sectionSubtitle
            }
          >
            Operational indicators for cases and official evacuation capacity.
          </Text>
        </View>

        <View
          style={[
            styles.overviewGrid,
            {
              gap:
                overviewGap,
            },
          ]}
        >
          {overview.map(
            (item) => (
              <View
                key={
                  item.label
                }
                style={{
                  width:
                    overviewCardWidth,
                }}
              >
                <OverviewCard
                  {...item}
                />
              </View>
            ),
          )}
        </View>

        <View
          style={
            styles.centersHeader
          }
        >
          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              Official Evacuation Centers
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              These LGU-managed centers are read by the VolunServe map. Keep coordinates and capacity updated.
            </Text>
          </View>

          <View
            style={
              styles.centerHeaderActions
            }
          >
            <TouchableOpacity
              style={
                styles.primaryActionButton
              }
              onPress={
                openNewCenter
              }
            >
              <Ionicons
                name="add"
                size={18}
                color="#FFFFFF"
              />
              <Text
                style={
                  styles.primaryActionText
                }
              >
                Add Center
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {centers.length === 0 ? (
          <View
            style={
              styles.emptyCenterCard
            }
          >
            <Ionicons
              name="business-outline"
              size={32}
              color="#94A3B8"
            />
            <Text
              style={
                styles.emptyCenterTitle
              }
            >
              No evacuation centers listed
            </Text>
            <Text
              style={
                styles.emptyCenterText
              }
            >
              Add the official LGU evacuation centers so residents can see them on the map.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.centerList
            }
          >
            {centers.map(
              (center) => {
                const capacity =
                  Math.max(
                    0,
                    Number(
                      center.capacity || 0,
                    ),
                  );

                const occupied =
                  Math.max(
                    0,
                    Number(
                      center.occupied || 0,
                    ),
                  );

                const available =
                  Math.max(
                    0,
                    capacity -
                      occupied,
                  );

                return (
                  <View
                    key={
                      center.id
                    }
                    style={
                      styles.centerCard
                    }
                  >
                    <View
                      style={
                        styles.centerCardTop
                      }
                    >
                      <View
                        style={
                          styles.centerCardIcon
                        }
                      >
                        <Ionicons
                          name="business"
                          size={20}
                          color="#0891B2"
                        />
                      </View>

                      <View
                        style={
                          styles.centerCardCopy
                        }
                      >
                        <Text
                          style={
                            styles.centerName
                          }
                        >
                          {center.name ||
                            "Evacuation Center"}
                        </Text>

                        <Text
                          style={
                            styles.centerMeta
                          }
                        >
                          {center.barangay ||
                            "Barangay not set"}
                        </Text>

                        <Text
                          style={
                            styles.centerMeta
                          }
                        >
                          {center.address ||
                            "Address not set"}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.centerStatusBadge
                        }
                      >
                        <Text
                          style={
                            styles.centerStatusText
                          }
                        >
                          {String(
                            center.status ||
                              "active",
                          ).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.centerStatsRow
                      }
                    >
                      <CenterStat
                        label="Capacity"
                        value={capacity}
                      />
                      <CenterStat
                        label="Occupied"
                        value={occupied}
                      />
                      <CenterStat
                        label="Available"
                        value={available}
                      />
                    </View>

                    <Text
                      style={
                        styles.centerCoordinates
                      }
                    >
                      GPS:{" "}
                      {Number(
                        center.latitude,
                      ).toFixed(6)}
                      {", "}
                      {Number(
                        center.longitude,
                      ).toFixed(6)}
                    </Text>

                    <View
                      style={
                        styles.centerActionRow
                      }
                    >
                      <TouchableOpacity
                        style={
                          styles.editCenterButton
                        }
                        onPress={() =>
                          openEditCenter(
                            center,
                          )
                        }
                      >
                        <Ionicons
                          name="create-outline"
                          size={17}
                          color="#2563EB"
                        />
                        <Text
                          style={
                            styles.editCenterText
                          }
                        >
                          Edit
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={
                          styles.removeCenterButton
                        }
                        onPress={() =>
                          confirmRemoveCenter(
                            center,
                          )
                        }
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color="#DC2626"
                        />
                        <Text
                          style={
                            styles.removeCenterText
                          }
                        >
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              },
            )}
          </View>
        )}
      </View>

      <Modal
        visible={
          centerModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeCenterModal
        }
      >
        <View
          style={
            styles.modalBackdrop
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.modalScrollContent
            }
            keyboardShouldPersistTaps="handled"
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
                <View
                  style={{
                    flex: 1,
                  }}
                >
                  <Text
                    style={
                      styles.modalTitle
                    }
                  >
                    {editingCenterId
                      ? "Edit Evacuation Center"
                      : "Add Evacuation Center"}
                  </Text>

                  <Text
                    style={
                      styles.modalSubtitle
                    }
                  >
                    Official LGU evacuation-center information shown in VolunServe.
                  </Text>
                </View>

                <TouchableOpacity
                  style={
                    styles.modalCloseButton
                  }
                  disabled={
                    savingCenter
                  }
                  onPress={
                    closeCenterModal
                  }
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color="#475569"
                  />
                </TouchableOpacity>
              </View>

              <CenterInput
                label="Center name"
                value={
                  centerForm.name
                }
                onChangeText={(
                  value,
                ) =>
                  updateCenterField(
                    "name",
                    value,
                  )
                }
                placeholder="Official evacuation center name"
              />

              <CenterInput
                label="Barangay"
                value={
                  centerForm.barangay
                }
                onChangeText={(
                  value,
                ) =>
                  updateCenterField(
                    "barangay",
                    value,
                  )
                }
                placeholder="Barangay"
              />

              <CenterInput
                label="Address / landmark"
                value={
                  centerForm.address
                }
                onChangeText={(
                  value,
                ) =>
                  updateCenterField(
                    "address",
                    value,
                  )
                }
                placeholder="Complete address or nearby landmark"
              />

              <View
                style={
                  styles.formRow
                }
              >
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <CenterInput
                    label="Latitude"
                    value={
                      centerForm.latitude
                    }
                    onChangeText={(
                      value,
                    ) =>
                      updateCenterField(
                        "latitude",
                        value,
                      )
                    }
                    placeholder="14.000000"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                <View
                  style={
                    styles.formColumn
                  }
                >
                  <CenterInput
                    label="Longitude"
                    value={
                      centerForm.longitude
                    }
                    onChangeText={(
                      value,
                    ) =>
                      updateCenterField(
                        "longitude",
                        value,
                      )
                    }
                    placeholder="121.000000"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              <View
                style={
                  styles.formRow
                }
              >
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <CenterInput
                    label="Capacity"
                    value={
                      centerForm.capacity
                    }
                    onChangeText={(
                      value,
                    ) =>
                      updateCenterField(
                        "capacity",
                        value.replace(
                          /[^0-9]/g,
                          "",
                        ),
                      )
                    }
                    placeholder="500"
                    keyboardType="number-pad"
                  />
                </View>

                <View
                  style={
                    styles.formColumn
                  }
                >
                  <CenterInput
                    label="Current occupancy"
                    value={
                      centerForm.occupied
                    }
                    onChangeText={(
                      value,
                    ) =>
                      updateCenterField(
                        "occupied",
                        value.replace(
                          /[^0-9]/g,
                          "",
                        ),
                      )
                    }
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <View
                style={
                  styles.modalNotice
                }
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#0F766E"
                />
                <Text
                  style={
                    styles.modalNoticeText
                  }
                >
                  LGU/Admin owns this record. Volunteers do not create or manage evacuation centers.
                </Text>
              </View>

              <View
                style={
                  styles.modalActions
                }
              >
                <TouchableOpacity
                  style={
                    styles.cancelModalButton
                  }
                  disabled={
                    savingCenter
                  }
                  onPress={
                    closeCenterModal
                  }
                >
                  <Text
                    style={
                      styles.cancelModalText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveModalButton,
                    savingCenter &&
                      styles.saveModalButtonDisabled,
                  ]}
                  disabled={
                    savingCenter
                  }
                  onPress={() =>
                    void saveEvacuationCenter()
                  }
                >
                  {savingCenter ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <>
                      <Ionicons
                        name="save-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text
                        style={
                          styles.saveModalText
                        }
                      >
                        Save Center
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function CenterStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View
      style={
        styles.centerStat
      }
    >
      <Text
        style={
          styles.centerStatValue
        }
      >
        {value}
      </Text>
      <Text
        style={
          styles.centerStatLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function CenterInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (
    value: string,
  ) => void;
  placeholder: string;
  keyboardType?:
    | "default"
    | "number-pad"
    | "numbers-and-punctuation";
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
        value={value}
        onChangeText={
          onChangeText
        }
        placeholder={
          placeholder
        }
        placeholderTextColor="#94A3B8"
        keyboardType={
          keyboardType
        }
        style={
          styles.input
        }
      />
    </View>
  );
}

function ModuleCard({
  icon,
  iconColor,
  iconBackground,
  title,
  description,
  onPress,
  count,
}: ModuleCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={
        0.78
      }
      style={
        styles.moduleCard
      }
      onPress={
        onPress
      }
    >
      <View
        style={
          styles.moduleTop
        }
      >
        <View
          style={[
            styles.moduleIcon,
            {
              backgroundColor:
                iconBackground,
            },
          ]}
        >
          <Ionicons
            name={icon}
            size={22}
            color={
              iconColor
            }
          />
        </View>

        {typeof count ===
          "number" &&
          count > 0 && (
            <View
              style={
                styles.countBadge
              }
            >
              <Text
                style={
                  styles.countBadgeText
                }
              >
                {count}
              </Text>
            </View>
          )}
      </View>

      <Text
        style={
          styles.moduleTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.moduleDescription
        }
      >
        {description}
      </Text>

      <View
        style={
          styles.moduleFooter
        }
      >
        <Text
          style={
            styles.openText
          }
        >
          Open
        </Text>

        <Ionicons
          name="arrow-forward"
          size={16}
          color="#4F46E5"
        />
      </View>
    </TouchableOpacity>
  );
}

function OverviewCard({
  icon,
  iconColor,
  iconBackground,
  label,
  value,
  description,
  onPress,
}: OverviewCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={
        0.8
      }
      style={
        styles.overviewCard
      }
      onPress={
        onPress
      }
    >
      <View
        style={[
          styles.overviewIcon,
          {
            backgroundColor:
              iconBackground,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={23}
          color={
            iconColor
          }
        />
      </View>

      <View
        style={
          styles.overviewBody
        }
      >
        <Text
          style={
            styles.overviewLabel
          }
        >
          {label}
        </Text>

        <Text
          style={
            styles.overviewValue
          }
        >
          {value}
        </Text>

        <Text
          style={
            styles.overviewDescription
          }
        >
          {description}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color="#94A3B8"
      />
    </TouchableOpacity>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#F5F7FB",
    },

    page: {
      width: "100%",
      paddingHorizontal: 28,
      paddingTop: 42,
      paddingBottom: 64,
    },

    content: {
      width: "100%",
      alignSelf: "center",
    },

    center: {
      flex: 1,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F5F7FB",
      padding: 24,
    },

    loadingText: {
      marginTop: 12,
      color: "#64748B",
      fontSize: 13,
      fontWeight: "600",
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 16,
      marginBottom: 30,
    },

    headerCopy: {
      flex: 1,
      minWidth: 0,
    },

    title: {
      color: "#0F172A",
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -0.5,
    },

    subtitle: {
      marginTop: 5,
      color: "#64748B",
      fontSize: 13,
      lineHeight: 19,
    },

    adminBadge: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor:
        "#ECFDF5",
      borderWidth: 1,
      borderColor:
        "#A7F3D0",
    },

    adminBadgeText: {
      color: "#0F766E",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    warningBox: {
      marginBottom: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      padding: 12,
      borderRadius: 11,
      backgroundColor:
        "#FFFBEB",
      borderWidth: 1,
      borderColor:
        "#FDE68A",
    },

    warningText: {
      flex: 1,
      color: "#92400E",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
    },

    lguDoctrineCard: {
      marginBottom: 24,
      padding: 16,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      borderRadius: 15,
      backgroundColor: "#ECFDF5",
      borderWidth: 1,
      borderColor: "#A7F3D0",
    },

    lguDoctrineIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#D1FAE5",
    },

    lguDoctrineCopy: {
      flex: 1,
    },

    lguDoctrineTitle: {
      color: "#065F46",
      fontSize: 14,
      fontWeight: "900",
    },

    lguDoctrineText: {
      marginTop: 4,
      color: "#3F6F62",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
    },

    sectionHeader: {
      marginBottom: 13,
    },

    overviewHeader: {
      marginTop: 30,
    },

    sectionTitle: {
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "900",
    },

    sectionSubtitle: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 12.5,
    },

    moduleGrid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
    },

    moduleCard: {
      minHeight: 196,
      padding: 18,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    moduleTop: {
      minHeight: 44,
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 10,
    },

    moduleIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
    },

    countBadge: {
      minWidth: 27,
      height: 27,
      paddingHorizontal: 7,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F1F5F9",
    },

    countBadgeText: {
      color: "#334155",
      fontSize: 11,
      fontWeight: "900",
    },

    moduleTitle: {
      marginTop: 17,
      color: "#0F172A",
      fontSize: 15,
      fontWeight: "900",
    },

    moduleDescription: {
      marginTop: 6,
      minHeight: 38,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 18,
    },

    moduleFooter: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    openText: {
      color: "#4F46E5",
      fontSize: 12,
      fontWeight: "800",
    },

    overviewGrid: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "stretch",
    },

    overviewCard: {
      minHeight: 132,
      padding: 17,
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      borderRadius: 15,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    overviewIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent:
        "center",
    },

    overviewBody: {
      flex: 1,
      minWidth: 0,
    },

    overviewLabel: {
      color: "#334155",
      fontSize: 12,
      fontWeight: "800",
    },

    overviewValue: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 27,
      fontWeight: "900",
    },

    overviewDescription: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 16,
    },

    centersHeader: {
      marginTop: 34,
      marginBottom: 14,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 14,
    },

    centerHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    primaryActionButton: {
      minHeight: 42,
      paddingHorizontal: 14,
      borderRadius: 11,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "#0F766E",
    },

    primaryActionText: {
      color: "#FFFFFF",
      fontSize: 11.5,
      fontWeight: "900",
    },

    secondaryActionButton: {
      minHeight: 42,
      paddingHorizontal: 13,
      borderRadius: 11,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#CBD5E1",
    },

    secondaryActionText: {
      color: "#334155",
      fontSize: 11.5,
      fontWeight: "800",
    },

    emptyCenterCard: {
      minHeight: 160,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      borderRadius: 15,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
    },

    emptyCenterTitle: {
      marginTop: 9,
      color: "#334155",
      fontSize: 14,
      fontWeight: "900",
    },

    emptyCenterText: {
      maxWidth: 520,
      marginTop: 4,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },

    centerList: {
      width: "100%",
      gap: 12,
    },

    centerCard: {
      padding: 16,
      borderRadius: 15,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
    },

    centerCardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 11,
    },

    centerCardIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ECFEFF",
    },

    centerCardCopy: {
      flex: 1,
      minWidth: 0,
    },

    centerName: {
      color: "#0F172A",
      fontSize: 14,
      fontWeight: "900",
    },

    centerMeta: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 16,
    },

    centerStatusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: "#ECFDF5",
      borderWidth: 1,
      borderColor: "#A7F3D0",
    },

    centerStatusText: {
      color: "#047857",
      fontSize: 9.5,
      fontWeight: "900",
    },

    centerStatsRow: {
      marginTop: 14,
      flexDirection: "row",
      gap: 8,
    },

    centerStat: {
      flex: 1,
      minHeight: 64,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      backgroundColor: "#F8FAFC",
      borderWidth: 1,
      borderColor: "#E2E8F0",
    },

    centerStatValue: {
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "900",
    },

    centerStatLabel: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 10,
      fontWeight: "700",
    },

    centerCoordinates: {
      marginTop: 10,
      color: "#64748B",
      fontSize: 10.5,
      fontWeight: "600",
    },

    centerActionRow: {
      marginTop: 12,
      flexDirection: "row",
      gap: 8,
    },

    editCenterButton: {
      flex: 1,
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 10,
      backgroundColor: "#EFF6FF",
      borderWidth: 1,
      borderColor: "#BFDBFE",
    },

    editCenterText: {
      color: "#2563EB",
      fontSize: 11.5,
      fontWeight: "900",
    },

    removeCenterButton: {
      flex: 1,
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 10,
      backgroundColor: "#FEF2F2",
      borderWidth: 1,
      borderColor: "#FECACA",
    },

    removeCenterText: {
      color: "#DC2626",
      fontSize: 11.5,
      fontWeight: "900",
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(15,23,42,0.55)",
    },

    modalScrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 20,
    },

    modalCard: {
      width: "100%",
      maxWidth: 680,
      alignSelf: "center",
      padding: 20,
      borderRadius: 18,
      backgroundColor: "#FFFFFF",
    },

    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 16,
    },

    modalTitle: {
      color: "#0F172A",
      fontSize: 20,
      fontWeight: "900",
    },

    modalSubtitle: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 18,
    },

    modalCloseButton: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      backgroundColor: "#F1F5F9",
    },

    formRow: {
      flexDirection: "row",
      gap: 10,
    },

    formColumn: {
      flex: 1,
    },

    inputGroup: {
      marginBottom: 13,
    },

    inputLabel: {
      marginBottom: 6,
      color: "#334155",
      fontSize: 11.5,
      fontWeight: "800",
    },

    input: {
      minHeight: 46,
      paddingHorizontal: 12,
      borderRadius: 11,
      backgroundColor: "#F8FAFC",
      borderWidth: 1,
      borderColor: "#CBD5E1",
      color: "#0F172A",
      fontSize: 13,
    },

    modalNotice: {
      marginTop: 2,
      padding: 12,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderRadius: 11,
      backgroundColor: "#ECFDF5",
      borderWidth: 1,
      borderColor: "#A7F3D0",
    },

    modalNoticeText: {
      flex: 1,
      color: "#3F6F62",
      fontSize: 11.5,
      lineHeight: 17,
      fontWeight: "600",
    },

    modalActions: {
      marginTop: 18,
      flexDirection: "row",
      gap: 10,
    },

    cancelModalButton: {
      flex: 1,
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
      backgroundColor: "#F1F5F9",
    },

    cancelModalText: {
      color: "#475569",
      fontSize: 12,
      fontWeight: "900",
    },

    saveModalButton: {
      flex: 1,
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderRadius: 11,
      backgroundColor: "#0F766E",
    },

    saveModalButtonDisabled: {
      opacity: 0.65,
    },

    saveModalText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "900",
    },
  });
