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
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import WorkspaceBarChart from "../../components/ui/WorkspaceBarChart";
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
  const [showCenterManagement, setShowCenterManagement] = useState(false);

  const isAdmin =
    !!profile &&
    profile.role === "admin" &&
    isApprovedProfile(profile);

  const contentWidth = Math.min(1180, Math.max(280, width - (Platform.OS === "web" && width >= 980 ? 320 : 32)));

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

  if (loading) {
    return (
      <View
        style={
          styles.center
        }
      >
        <ActivityIndicator
          size="large"
          color="#078F82"
        />

        <Text
          style={
            styles.loadingText
          }
        >
          Loading Admin Command Center...
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
      style={[
        styles.screen,
        Platform.OS === "web" && styles.webScrollBar,
      ]}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={true}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Admin dashboard content"
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
        <View style={styles.premiumHero}>
          <View pointerEvents="none" style={styles.heroOrbLarge} />
          <View pointerEvents="none" style={styles.heroOrbSmall} />
          <View style={[styles.heroHeader, width < 830 && styles.heroHeaderCompact]}>
            <View style={styles.heroCopy}>
              <View style={styles.heroEyebrow}>
                <View style={styles.heroEyebrowMark} />
                <Text style={styles.heroEyebrowText}>VOLUNSERVE  /  LGU OPERATIONS</Text>
              </View>
              <Text style={styles.heroTitle}>Operations overview</Text>
              <Text style={styles.heroSubtitle}>
                Community response, approvals, and essential services at a glance.
              </Text>
            </View>
            <View style={styles.heroLocality}>
              <Ionicons name="location-outline" size={16} color="#AFDEC5" />
              <Text style={styles.heroLocalityText}>SAN JOSE DEL MONTE · BULACAN</Text>
            </View>
          </View>
          <View style={styles.heroDivider} />
          <View style={[styles.metricStrip, width < 760 && styles.metricStripCompact]}>
            {[
              { label: "Open emergency cases", value: metrics.activeCases, tone: "normal" },
              { label: "Critical reports", value: metrics.criticalOpen, tone: "critical" },
              { label: "Pending reviews", value: metrics.pendingReviews, tone: "normal" },
              { label: "Evacuation centers", value: metrics.activeCenters, tone: "normal" },
            ].map((metric, index) => (
              <View key={metric.label} style={[
                styles.metricItem,
                index > 0 && width >= 760 && styles.metricItemDivider,
                metric.tone === "critical" && styles.metricItemCritical,
              ]}>
                <Text style={styles.metricItemLabel}>{metric.label}</Text>
                <Text style={[
                  styles.metricItemValue,
                  metric.tone === "critical" && metrics.criticalOpen > 0 && styles.metricItemValueCritical,
                ]}>
                  {dataError ? "—" : metric.value.toLocaleString("en-PH")}
                </Text>
              </View>
            ))}
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

        <View style={[styles.overviewColumns, width < 1220 && styles.overviewColumnsStack]}>
          <View style={[styles.overviewPrimary, width < 1220 && styles.overviewFullWidth]}>
            <View style={styles.overviewSectionHeader}>
              <View style={styles.sectionEyebrow}>
                <View style={styles.sectionEyebrowLine} />
                <Text style={styles.sectionEyebrowText}>ACTION CENTER</Text>
              </View>
              <Text style={styles.sectionTitle}>Priority workflows</Text>
              <Text style={styles.overviewSectionSubtitle}>Continue directly to the service that needs review.</Text>
            </View>
            {[
              {
                key: "critical", label: "Emergency response",
                detail: dataError ? "Live status unavailable" :
                  metrics.criticalOpen > 0 ? `${metrics.criticalOpen} critical case${metrics.criticalOpen === 1 ? "" : "s"} requiring attention` : "Review incoming emergency reports",
                icon: "warning-outline" as const, count: metrics.criticalOpen,
                route: "/(admin)/admin-cases",
              },
              {
                key: "accounts", label: "Resident & volunteer approvals",
                detail: dataError ? "Live status unavailable" :
                  `${pendingUserIds.length} account review${pendingUserIds.length === 1 ? "" : "s"} · ${pendingVolunteerIds.length} volunteer application${pendingVolunteerIds.length === 1 ? "" : "s"}`,
                icon: "people-outline" as const, count: metrics.pendingReviews,
                route: "/(admin)/account-approvals",
              },
              {
                key: "identity", label: "Identity verification",
                detail: "Review identity submissions and exceptions",
                icon: "shield-checkmark-outline" as const, count: null,
                route: "/(admin)/identity-reviews",
              },
              {
                key: "relief", label: "Relief operations",
                detail: dataError ? "Live status unavailable" :
                  `${metrics.openBarangayNeeds} open barangay relief need${metrics.openBarangayNeeds === 1 ? "" : "s"}`,
                icon: "cube-outline" as const, count: metrics.openBarangayNeeds,
                route: "/(admin)/relief-operations",
              },
              {
                key: "attendance", label: "Community event attendance",
                detail: "Review attendance and verified service hours",
                icon: "checkmark-done-outline" as const, count: null,
                route: "/(admin)/community-attendance",
              },
            ].map(action => (
              <TouchableOpacity key={action.key} accessibilityRole="button"
                accessibilityLabel={action.label} style={styles.overviewAction}
                activeOpacity={0.78} onPress={() => navigate(action.route)}>
                <View style={styles.overviewActionIcon}>
                  <Ionicons name={action.icon} size={19} color="#2E7560" />
                </View>
                <View style={styles.overviewActionContent}>
                  <Text style={styles.overviewActionTitle}>{action.label}</Text>
                  <Text style={styles.overviewActionDetail}>{action.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#7D998D" />
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.overviewSecondary, width < 1220 && styles.overviewFullWidth]}>
            <View style={styles.chartHeadingAccent} />
            <WorkspaceBarChart
              title="Service workload"
              subtitle="Current records across operational areas"
              orientation="vertical"
              bars={[
                { key: "cases", label: "Open emergency cases", shortLabel: "Emergency", value: dataError ? null : metrics.activeCases, color: "#28765D" },
                { key: "reviews", label: "Pending reviews", shortLabel: "Approvals", value: dataError ? null : metrics.pendingReviews, color: "#426D9B" },
                { key: "needs", label: "Open relief needs", shortLabel: "Relief", value: dataError ? null : metrics.openBarangayNeeds, color: "#C18A43" },
                { key: "centers", label: "Active evacuation centers", shortLabel: "Centers", value: dataError ? null : metrics.activeCenters, color: "#587C86" },
              ]}
              footer="Counts from authorized Firestore records · common scale"
            />
            <View style={[styles.serviceSummary, width < 520 && styles.serviceSummaryCompact]}>
              <View style={styles.capacityIcon}>
                <Ionicons name="business-outline" size={21} color="#206E58" />
              </View>
              <View style={styles.capacityCopy}>
                <Text style={styles.serviceSummaryHeading}>Evacuation capacity</Text>
                <Text style={styles.serviceSummaryCaption}>Available spaces at active centers</Text>
              </View>
              <Text style={styles.serviceSummaryValue}>{dataError ? "—" : metrics.availableEvacuationSpaces.toLocaleString("en-PH")}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: showCenterManagement }}
          onPress={() => setShowCenterManagement(value => !value)}
          style={styles.managementDisclosure}
          activeOpacity={0.82}
        >
          <View style={styles.disclosureIcon}>
            <Ionicons name="business-outline" size={20} color="#25745F" />
          </View>
          <View style={styles.queueContent}>
            <Text style={styles.disclosureTitle}>Evacuation center management</Text>
            <Text style={styles.disclosureCaption}>
              {dataError ? "Center data unavailable" : `${centers.length} registered center${centers.length === 1 ? "" : "s"}`} · View locations, capacity and edit official records
            </Text>
          </View>
          <Text style={styles.disclosureAction}>{showCenterManagement ? "Close" : "Manage"}</Text>
          <Ionicons name={showCenterManagement ? "chevron-up" : "chevron-down"} color="#26745F" size={18} />
        </TouchableOpacity>
        {showCenterManagement ? <View style={styles.centerManagementArea}>
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
        </View> : null}
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

const styles =
  StyleSheet.create({
    // VolunServe identity: one rich evergreen masthead, not a field of cards.
    premiumHero: {
      overflow: "hidden", position: "relative", backgroundColor: "#103E33",
      borderRadius: 16, paddingHorizontal: 30, paddingTop: 28, paddingBottom: 15,
      marginBottom: 29, borderWidth: 1, borderColor: "#235D4E",
    },
    heroOrbLarge: {
      position: "absolute", right: -105, top: -180, width: 375, height: 375,
      borderRadius: 190, borderWidth: 1, borderColor: "rgba(203,243,220,0.14)",
      backgroundColor: "rgba(60,143,113,0.09)",
    },
    heroOrbSmall: {
      position: "absolute", right: 90, top: -130, width: 250, height: 250,
      borderRadius: 125, borderWidth: 1, borderColor: "rgba(203,243,220,0.12)",
    },
    heroHeader: {
      flexDirection: "row", alignItems: "flex-start",
      justifyContent: "space-between", gap: 22, paddingBottom: 26,
    },
    heroHeaderCompact: { flexDirection: "column", gap: 14, paddingBottom: 20 },
    heroCopy: { flex: 1, minWidth: 0, zIndex: 1 },
    heroEyebrow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 12 },
    heroEyebrowMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#AFD7A0" },
    heroEyebrowText: { color: "#A9D9C5", letterSpacing: 1.35, fontSize: 10.5, fontWeight: "700" },
    heroTitle: { color: "#FFFFFF", fontSize: 32, lineHeight: 40, letterSpacing: -0.7, fontWeight: "700" },
    heroSubtitle: { color: "#C0DED0", maxWidth: 570, marginTop: 7, fontSize: 13, lineHeight: 21 },
    heroLocality: {
      flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 8, zIndex: 1,
    },
    heroLocalityText: { color: "#BADDCB", fontSize: 9.5, letterSpacing: 0.6, fontWeight: "700" },
    heroDivider: { height: 1, backgroundColor: "rgba(204,238,217,0.21)" },
    metricItemDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(204,238,217,0.18)" },
    sectionEyebrow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 },
    sectionEyebrowLine: { height: 2, width: 21, backgroundColor: "#3C9072" },
    sectionEyebrowText: { fontSize: 10, fontWeight: "800", color: "#53836D", letterSpacing: 1.0 },
    chartHeadingAccent: { width: 34, height: 3, borderRadius: 2, backgroundColor: "#2F8468", marginBottom: 11 },
    capacityIcon: { height: 42, width: 42, borderRadius: 12, backgroundColor: "#E1F0E7", justifyContent: "center", alignItems: "center" },
    capacityCopy: { flex: 1, minWidth: 0 },
    serviceSummaryCompact: { flexWrap: "wrap" },

    overviewEyebrow: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 13 },
    overviewEyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#23765F" },
    overviewColumns: { flexDirection: "row", gap: 18, alignItems: "stretch", marginBottom: 24 },
    overviewColumnsStack: { flexDirection: "column", gap: 18 },
    overviewPrimary: { flex: 1.18, minWidth: 0, padding: 22, borderRadius: 14, borderWidth: 1, borderColor: "#DFE9E1", backgroundColor: "#FFFFFF" },
    overviewSecondary: { flex: 1, minWidth: 0, padding: 22, borderRadius: 14, borderWidth: 1, borderColor: "#DFE9E1", backgroundColor: "#FFFFFF" },
    overviewFullWidth: { flex: 0, width: "100%" },
    overviewSectionHeader: { marginBottom: 10 },
    overviewSectionSubtitle: { color: "#6C8076", fontSize: 12.5, lineHeight: 19, marginTop: 6 },
    overviewAction: {
      flexDirection: "row", gap: 13, alignItems: "center", paddingVertical: 15, paddingHorizontal: 2,
      borderBottomWidth: 1, borderColor: "#EDF1ED", minHeight: 73,
    },
    overviewActionIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: "#EAF4ED", alignItems: "center", justifyContent: "center" },
    overviewActionContent: { flex: 1, minWidth: 0 },
    overviewActionTitle: { fontSize: 13.5, fontWeight: "700", color: "#173E31" },
    overviewActionDetail: { fontSize: 12, lineHeight: 18, color: "#708579", marginTop: 4 },
    metricItemCritical: {},
    metricItemValueCritical: { color: "#EBC18B" },
    serviceSummary: { marginTop: 12, paddingHorizontal: 13, paddingVertical: 14, backgroundColor: "#F0F6F1", borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 12 },
    serviceSummaryHeading: { color: "#315D4B", fontSize: 12.5, fontWeight: "700" },
    serviceSummaryValue: { color: "#164D3C", fontSize: 27, fontWeight: "700", fontVariant: ["tabular-nums"] },
    serviceSummaryCaption: { color: "#687F70", fontSize: 11.5, lineHeight: 17, marginTop: 3 },
    managementDisclosure: {
      minHeight: 79, flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 17, paddingVertical: 14, borderWidth: 1, borderColor: "#DDE9E0",
      borderRadius: 12, backgroundColor: "#FFFFFF", marginTop: 2, marginBottom: 12,
    },
    disclosureIcon: { width: 39, height: 39, alignItems: "center", justifyContent: "center", backgroundColor: "#E5F0E9", borderRadius: 9 },
    disclosureTitle: { color: "#173D32", fontSize: 14, fontWeight: "700" },
    disclosureCaption: { color: "#6C8073", fontSize: 11.5, lineHeight: 18, marginTop: 3 },
    disclosureAction: { color: "#23765F", fontSize: 12, fontWeight: "700" },
    centerManagementArea: { paddingTop: 15 },

    overline: {
      fontSize: 10, letterSpacing: 1.2, color: "#688076", fontWeight: "700", marginBottom: 9,
    },
    flatSummary: { marginBottom: 26 },
    metricStrip: {
      flexDirection: "row", flexWrap: "wrap",
    },
    metricStripCompact: { flexWrap: "wrap" },
    metricItem: { flexGrow: 1, flexBasis: "24%", minWidth: 138, paddingVertical: 20, paddingHorizontal: 17 },
    metricItemLabel: { fontSize: 11.5, color: "#B6D5C4", fontWeight: "600" },
    metricItemValue: { fontSize: 31, lineHeight: 40, fontWeight: "700", color: "#FFFFFF", marginTop: 5, fontVariant: ["tabular-nums"] },
    queueSection: { marginTop: 31 },
    queueHeader: { marginBottom: 15 },
    queueRow: {
      flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16,
      borderTopWidth: 1, borderTopColor: "#DDE6E1", minHeight: 65,
    },
    queueContent: { flex: 1, minWidth: 0 },
    queueTitle: { fontSize: 13, fontWeight: "700", color: "#173D32" },
    queueSummary: { fontSize: 12, color: "#6C7F77", lineHeight: 18, marginTop: 4 },
    screen: {
      flex: 1,
      minHeight: 0,
      backgroundColor: "#F6F8F7",
    },

    // Separate right-side scrolling from the fixed Admin navigation.
    webScrollBar: {
      overflowY: "scroll",
      scrollbarWidth: "thin",
      scrollbarColor: "#AFC4B7 #F6F8F7",
    } as any,

    page: {
      width: "100%",
      paddingHorizontal: 25,
      paddingTop: 25,
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
      color: "#173D32",
      fontSize: 30,
      fontWeight: "700",
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
      color: "#173D32",
      fontSize: 17,
      fontWeight: "700",
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
        "#DCEAE8",
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
      color: "#078F82",
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
        "#DCEAE8",
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
