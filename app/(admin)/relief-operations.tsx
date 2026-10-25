import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
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
  Platform,
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

type NeedStatus =
  | "verified"
  | "partially_allocated"
  | "fulfilled"
  | "closed"
  | string;

type InventoryCategory =
  | "food"
  | "water"
  | "hygiene"
  | "clothing"
  | "shelter"
  | "medical"
  | "other";

type InventorySource =
  | "lgu_stock"
  | "government_transfer"
  | "other";

type AllocationStatus =
  | "allocated"
  | "in_distribution"
  | "completed"
  | "cancelled"
  | string;

type TabKey =
  | "action"
  | "needs"
  | "inventory"
  | "allocations";

type BarangayNeedAssessment = {
  id: string;
  assessmentId?: string;
  barangay?: string;
  sourceType?: string;
  sourceCaseId?: string;
  sourceFieldReportId?: string;

  affectedHouseholds?: number;
  affectedPeople?: number;

  peopleNeedingFood?: number;
  peopleNeedingWater?: number;
  peopleNeedingClothing?: number;
  peopleNeedingMedical?: number;

  householdsNeedingShelter?: number;
  householdsNeedingHygiene?: number;

  otherNeedDescription?: string;
  status?: NeedStatus;
  adminNote?: string;

  createdBy?: string;
  createdAt?: any;
  updatedBy?: string;
  updatedAt?: any;
  closedAt?: any;
};

type ReliefInventoryItem = {
  id: string;
  itemId?: string;
  category?: InventoryCategory | string;
  itemName?: string;
  unit?: string;

  quantityReceived?: number;
  quantityAvailable?: number;
  quantityAllocated?: number;
  quantityDistributed?: number;

  sourceType?: string;
  sourceReferenceId?: string;

  status?: string;
  notes?: string;

  createdBy?: string;
  createdAt?: any;
  updatedBy?: string;
  updatedAt?: any;
};

type ReliefAllocation = {
  id: string;
  allocationId?: string;
  barangay?: string;
  needAssessmentIds?: string[];

  inventoryItemId?: string;
  category?: InventoryCategory | string;
  itemName?: string;
  unit?: string;

  quantityAllocated?: number;
  quantityDistributed?: number;

  status?: AllocationStatus;

  volunteerSupportRequested?: boolean;
  assignedVolunteerIds?: string[];

  distributionNote?: string;

  createdBy?: string;
  createdAt?: any;
  updatedBy?: string;
  updatedAt?: any;

  completedAt?: any;
  cancelledAt?: any;
};

type ReliefScope = "household" | "community";

type BarangaySummary = {
  reliefNeedId: string;
  barangay: string;
  reliefScope: ReliefScope;
  sourceType?: string;
  sourceCaseId?: string;
  adminNote?: string;
  assessmentIds: string[];
  assessments: BarangayNeedAssessment[];

  affectedHouseholds: number;
  affectedPeople: number;

  peopleNeedingFood: number;
  peopleNeedingWater: number;
  peopleNeedingClothing: number;
  peopleNeedingMedical: number;

  householdsNeedingShelter: number;
  householdsNeedingHygiene: number;

  otherNeeds: string[];
};

type InventoryForm = {
  category: InventoryCategory;
  itemName: string;
  unit: string;
  quantityReceived: string;
  sourceType: InventorySource;
  sourceReferenceId: string;
  notes: string;
};

type DistributionForm = {
  allocationId: string;
  quantityDistributed: string;
  distributionNote: string;
};

const EMPTY_INVENTORY_FORM: InventoryForm = {
  category: "food",
  itemName: "",
  unit: "pack",
  quantityReceived: "",
  sourceType: "lgu_stock",
  sourceReferenceId: "",
  notes: "",
};

const EMPTY_DISTRIBUTION_FORM: DistributionForm = {
  allocationId: "",
  quantityDistributed: "",
  distributionNote: "",
};

const ACTIVE_NEED_STATUSES = new Set([
  "verified",
  "partially_allocated",
]);

const INVENTORY_CATEGORIES: {
  value: InventoryCategory;
  label: string;
}[] = [
  { value: "food", label: "Food" },
  { value: "water", label: "Water" },
  { value: "hygiene", label: "Hygiene" },
  { value: "clothing", label: "Clothing" },
  { value: "shelter", label: "Shelter" },
  { value: "medical", label: "Medical" },
  { value: "other", label: "Other" },
];

const INVENTORY_SOURCES: {
  value: InventorySource;
  label: string;
}[] = [
  { value: "lgu_stock", label: "LGU Stock" },
  {
    value: "government_transfer",
    label: "Government Transfer",
  },
  { value: "other", label: "Other" },
];

const numberValue = (
  value: unknown,
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const formatNumber = (
  value: unknown,
) =>
  numberValue(value).toLocaleString(
    "en-PH",
    {
      maximumFractionDigits: 2,
    },
  );

const formatDate = (
  value: any,
) => {
  try {
    const date =
      typeof value?.toDate ===
      "function"
        ? value.toDate()
        : value instanceof Date
          ? value
          : null;

    if (!date) {
      return "—";
    }

    return date.toLocaleString(
      "en-PH",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      },
    );
  } catch {
    return "—";
  }
};

const labelStatus = (
  value?: string,
) =>
  String(value || "unknown")
    .replaceAll("_", " ")
    .toUpperCase();

const sourceLabel = (
  value?: string,
) => {
  if (value === "lgu_stock") {
    return "LGU Stock";
  }

  if (
    value ===
    "government_transfer"
  ) {
    return "Government Transfer";
  }

  if (value === "donation") {
    return "Verified Donation";
  }

  return "Other";
};

const reliefScopeForAssessment = (
  assessment: BarangayNeedAssessment,
): ReliefScope =>
  numberValue(
    assessment.affectedHouseholds,
  ) <= 1
    ? "household"
    : "community";

const reliefScopeLabel = (
  scope: ReliefScope,
) =>
  scope === "household"
    ? "Household Relief"
    : "Community Relief";

const assessmentSourceLabel = (
  value?: string,
) => {
  if (value === "volunteer_field_report") {
    return "Verified field report";
  }

  if (value === "lgu_direct_assessment") {
    return "LGU assessment";
  }

  if (value === "incident_review") {
    return "Emergency case review";
  }

  return "LGU verified";
};


type NeedResourceEntry = {
  category: InventoryCategory;
  label: string;
  requiredCount: number;
  basis: "people" | "households" | "verified need";
};

const needResourceEntries = (
  summary: BarangaySummary,
): NeedResourceEntry[] => {
  const entries: NeedResourceEntry[] = [
    {
      category: "food",
      label: "Food",
      requiredCount: numberValue(summary.peopleNeedingFood),
      basis: "people",
    },
    {
      category: "water",
      label: "Water",
      requiredCount: numberValue(summary.peopleNeedingWater),
      basis: "people",
    },
    {
      category: "clothing",
      label: "Clothing",
      requiredCount: numberValue(summary.peopleNeedingClothing),
      basis: "people",
    },
    {
      category: "medical",
      label: "Medical",
      requiredCount: numberValue(summary.peopleNeedingMedical),
      basis: "people",
    },
    {
      category: "shelter",
      label: "Shelter",
      requiredCount: numberValue(summary.householdsNeedingShelter),
      basis: "households",
    },
    {
      category: "hygiene",
      label: "Hygiene",
      requiredCount: numberValue(summary.householdsNeedingHygiene),
      basis: "households",
    },
  ];

  const activeEntries =
    entries.filter(
      (entry) =>
        entry.requiredCount > 0,
    );

  if (summary.otherNeeds.length > 0) {
    activeEntries.push({
      category: "other",
      label: "Other",
      requiredCount: summary.otherNeeds.length,
      basis: "verified need",
    });
  }

  return activeEntries;
};

const stockBreakdownForCategory = (
  items: ReliefInventoryItem[],
  category: InventoryCategory,
) => {
  const totals = new Map<string, number>();

  items
    .filter(
      (item) =>
        String(item.category || "other") === category &&
        String(item.status || "active") === "active" &&
        numberValue(item.quantityAvailable) > 0,
    )
    .forEach((item) => {
      const unit = String(item.unit || "unit").trim() || "unit";
      totals.set(
        unit,
        (totals.get(unit) || 0) + numberValue(item.quantityAvailable),
      );
    });

  if (totals.size === 0) {
    return "No matching LGU stock";
  }

  return Array.from(totals.entries())
    .map(([unit, quantity]) => `${formatNumber(quantity)} ${unit}`)
    .join(" · ");
};

export default function ReliefOperations() {
  const router = useRouter();
  const { width } =
    useWindowDimensions();

  const {
    loading,
    user,
    profile,
  } = useUserSession();

  const isAdmin =
    !!profile &&
    profile.role === "admin" &&
    isApprovedProfile(profile);

  const compact = width < 860;

  const [
    activeTab,
    setActiveTab,
  ] = useState<TabKey>(
    "action",
  );

  const [
    guideOpen,
    setGuideOpen,
  ] = useState(false);

  const [
    assessments,
    setAssessments,
  ] = useState<
    BarangayNeedAssessment[]
  >([]);

  const [
    inventory,
    setInventory,
  ] = useState<
    ReliefInventoryItem[]
  >([]);

  const [
    allocations,
    setAllocations,
  ] = useState<
    ReliefAllocation[]
  >([]);

  const [
    dataReady,
    setDataReady,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    busyKey,
    setBusyKey,
  ] = useState("");

  const [
    inventoryModalVisible,
    setInventoryModalVisible,
  ] = useState(false);

  const [
    inventoryForm,
    setInventoryForm,
  ] = useState<InventoryForm>(
    EMPTY_INVENTORY_FORM,
  );

  const [
    allocationModalVisible,
    setAllocationModalVisible,
  ] = useState(false);

  const [
    selectedBarangay,
    setSelectedBarangay,
  ] = useState("");

  const [
    selectedAssessmentId,
    setSelectedAssessmentId,
  ] = useState("");

  const [
    selectedInventoryId,
    setSelectedInventoryId,
  ] = useState("");

  const [
    allocationQuantity,
    setAllocationQuantity,
  ] = useState("");

  const [
    distributionModalVisible,
    setDistributionModalVisible,
  ] = useState(false);

  const [
    distributionForm,
    setDistributionForm,
  ] = useState<DistributionForm>(
    EMPTY_DISTRIBUTION_FORM,
  );

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let readyCount = 0;

    const markReady = () => {
      readyCount += 1;

      if (readyCount >= 3) {
        setDataReady(true);
      }
    };

    const unsubscribeNeeds =
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

          setAssessments(rows);
          setError("");
          markReady();
        },
        (problem) => {
          console.log(
            "Relief needs listener error:",
            problem,
          );
          setError(
            "Unable to load verified Relief Needs. Check the deployed Firestore rules.",
          );
          markReady();
        },
      );

    const unsubscribeInventory =
      onSnapshot(
        collection(
          db,
          "lguReliefInventory",
        ),
        (snapshot) => {
          const rows =
            snapshot.docs
              .map(
                (item) => ({
                  id: item.id,
                  ...(item.data() as Omit<
                    ReliefInventoryItem,
                    "id"
                  >),
                }),
              )
              .sort((a, b) =>
                String(
                  a.itemName || "",
                ).localeCompare(
                  String(
                    b.itemName || "",
                  ),
                ),
              );

          setInventory(rows);
          setError("");
          markReady();
        },
        (problem) => {
          console.log(
            "Relief inventory listener error:",
            problem,
          );
          setError(
            "Unable to load LGU Inventory. Check the deployed Firestore rules.",
          );
          markReady();
        },
      );

    const unsubscribeAllocations =
      onSnapshot(
        collection(
          db,
          "barangayReliefAllocations",
        ),
        (snapshot) => {
          const rows =
            snapshot.docs
              .map(
                (item) => ({
                  id: item.id,
                  ...(item.data() as Omit<
                    ReliefAllocation,
                    "id"
                  >),
                }),
              )
              .sort((a, b) => {
                const aTime =
                  a.createdAt?.toMillis?.() ||
                  0;

                const bTime =
                  b.createdAt?.toMillis?.() ||
                  0;

                return bTime - aTime;
              });

          setAllocations(rows);
          setError("");
          markReady();
        },
        (problem) => {
          console.log(
            "Relief allocations listener error:",
            problem,
          );
          setError(
            "Unable to load relief allocations. Check the deployed Firestore rules.",
          );
          markReady();
        },
      );

    return () => {
      unsubscribeNeeds();
      unsubscribeInventory();
      unsubscribeAllocations();
    };
  }, [isAdmin]);

  const openAssessments =
    useMemo(
      () =>
        assessments.filter(
          (item) =>
            ACTIVE_NEED_STATUSES.has(
              String(
                item.status ||
                  "verified",
              ),
            ),
        ),
      [assessments],
    );

  const barangaySummaries =
    useMemo(
      () =>
        openAssessments
          .map((item) => {
            const barangay =
              String(
                item.barangay ||
                  "Unspecified",
              ).trim() ||
              "Unspecified";

            const other =
              String(
                item.otherNeedDescription ||
                  "",
              ).trim();

            return {
              reliefNeedId: item.id,
              barangay,
              reliefScope:
                reliefScopeForAssessment(
                  item,
                ),
              sourceType:
                item.sourceType,
              sourceCaseId:
                item.sourceCaseId,
              adminNote:
                item.adminNote,
              assessmentIds: [
                item.id,
              ],
              assessments: [
                item,
              ],
              affectedHouseholds:
                numberValue(
                  item.affectedHouseholds,
                ),
              affectedPeople:
                numberValue(
                  item.affectedPeople,
                ),
              peopleNeedingFood:
                numberValue(
                  item.peopleNeedingFood,
                ),
              peopleNeedingWater:
                numberValue(
                  item.peopleNeedingWater,
                ),
              peopleNeedingClothing:
                numberValue(
                  item.peopleNeedingClothing,
                ),
              peopleNeedingMedical:
                numberValue(
                  item.peopleNeedingMedical,
                ),
              householdsNeedingShelter:
                numberValue(
                  item.householdsNeedingShelter,
                ),
              householdsNeedingHygiene:
                numberValue(
                  item.householdsNeedingHygiene,
                ),
              otherNeeds: other
                ? [other]
                : [],
            } as BarangaySummary;
          })
          .sort((a, b) => {
            const peopleDifference =
              b.affectedPeople -
              a.affectedPeople;

            if (peopleDifference !== 0) {
              return peopleDifference;
            }

            return a.barangay.localeCompare(
              b.barangay,
            );
          }),
      [openAssessments],
    );

  const activeInventory =
    useMemo(
      () =>
        inventory.filter(
          (item) =>
            String(
              item.status ||
                "active",
            ) === "active" &&
            numberValue(
              item.quantityAvailable,
            ) > 0,
        ),
      [inventory],
    );

  const activeAllocations =
    useMemo(
      () =>
        allocations.filter(
          (item) =>
            [
              "allocated",
              "in_distribution",
            ].includes(
              String(
                item.status ||
                  "",
              ),
            ),
        ),
      [allocations],
    );

  const completedAllocations =
    useMemo(
      () =>
        allocations.filter(
          (item) =>
            item.status ===
            "completed",
        ),
      [allocations],
    );

  const selectedSummary =
    useMemo(
      () =>
        barangaySummaries.find(
          (item) =>
            item.reliefNeedId ===
            selectedAssessmentId,
        ),
      [
        barangaySummaries,
        selectedAssessmentId,
      ],
    );

  const allocationMatchesSummary = (
    allocation: ReliefAllocation,
    summary: BarangaySummary,
  ) => {
    const linkedIds = Array.isArray(
      allocation.needAssessmentIds,
    )
      ? allocation.needAssessmentIds.map(
          String,
        )
      : [];

    if (linkedIds.length > 0) {
      return summary.assessmentIds.some(
        (assessmentId) =>
          linkedIds.includes(
            assessmentId,
          ),
      );
    }

    return (
      allocation.barangay ===
      summary.barangay
    );
  };

  const selectedInventory =
    useMemo(
      () =>
        inventory.find(
          (item) =>
            item.id ===
            selectedInventoryId,
        ),
      [
        inventory,
        selectedInventoryId,
      ],
    );

  const relevantInventoryForSelectedSummary =
    useMemo(() => {
      if (!selectedSummary) {
        return [] as ReliefInventoryItem[];
      }

      const neededCategories = new Set(
        needResourceEntries(selectedSummary).map(
          (entry) => entry.category,
        ),
      );

      return activeInventory.filter((item) =>
        neededCategories.has(
          String(item.category || "other") as InventoryCategory,
        ),
      );
    }, [
      activeInventory,
      selectedSummary,
    ]);

  const matchingStockForSummary = (
    summary: BarangaySummary,
  ) => {
    const neededCategories = new Set(
      needResourceEntries(summary).map(
        (entry) => entry.category,
      ),
    );

    return activeInventory.filter((item) =>
      neededCategories.has(
        String(item.category || "other") as InventoryCategory,
      ),
    );
  };

  const closeInventoryModal =
    () => {
      if (busyKey) {
        return;
      }

      setInventoryModalVisible(
        false,
      );
      setInventoryForm(
        EMPTY_INVENTORY_FORM,
      );
    };

  const openAllocationForNeed =
    (
      summary: BarangaySummary,
    ) => {
      setSelectedBarangay(
        summary.barangay,
      );
      setSelectedAssessmentId(
        summary.reliefNeedId,
      );
      setSelectedInventoryId(
        "",
      );
      setAllocationQuantity(
        "",
      );
      setAllocationModalVisible(
        true,
      );
    };

  const closeAllocationModal =
    () => {
      if (busyKey) {
        return;
      }

      setAllocationModalVisible(
        false,
      );
      setSelectedBarangay("");
      setSelectedAssessmentId("");
      setSelectedInventoryId("");
      setAllocationQuantity("");
    };

  const openAssistanceReview = () => {
    if (allocationModalVisible) closeAllocationModal();
    router.push("/assistance-requests" as any);
  };

  const openDonationSupportForSummary = (
    summary: BarangaySummary,
  ) => {
    const assessmentId =
      String(
        summary.reliefNeedId ||
          summary.assessmentIds[0] ||
          "",
      ).trim();

    if (!assessmentId) {
      Alert.alert(
        "Verified Need Missing",
        "This relief need is missing its assessment reference.",
      );
      return;
    }

    openAssistanceReview();
  };

  const confirmShortageAndOpenDonation = (
    summary: BarangaySummary,
  ) => {
    const message =
      `If LGU stock is insufficient for this verified ${summary.reliefScope === "household" ? "household" : "community"} relief need in ${summary.barangay}, open Request Assistance for separate strict eligibility and financial need review. This action does not create a donation campaign.`;

    // React Native Web does not reliably support multi-button Alert callbacks.
    // On web, use the browser confirmation dialog so the route action always fires.
    if (Platform.OS === "web") {
      const confirmed =
        typeof globalThis.confirm === "function"
          ? globalThis.confirm(`Confirm Resource Shortage\n\n${message}`)
          : true;

      if (confirmed) {
        openDonationSupportForSummary(summary);
      }
      return;
    }

    Alert.alert(
      "Confirm Resource Shortage",
      message,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Shortage Confirmed",
          onPress: () =>
            openDonationSupportForSummary(
              summary,
            ),
        },
      ],
    );
  };

  const openDistributionModal =
    (
      allocation: ReliefAllocation,
    ) => {
      setDistributionForm({
        allocationId:
          allocation.id,
        quantityDistributed:
          String(
            allocation.quantityAllocated ||
              0,
          ),
        distributionNote:
          allocation.distributionNote ||
          "",
      });

      setDistributionModalVisible(
        true,
      );
    };

  const closeDistributionModal =
    () => {
      if (busyKey) {
        return;
      }

      setDistributionModalVisible(
        false,
      );
      setDistributionForm(
        EMPTY_DISTRIBUTION_FORM,
      );
    };

  const saveInventoryItem =
    async () => {
      if (!user || !isAdmin) {
        return;
      }

      const itemName =
        inventoryForm.itemName.trim();

      const unit =
        inventoryForm.unit.trim();

      const quantity =
        Number(
          inventoryForm.quantityReceived,
        );

      const sourceReferenceId =
        inventoryForm.sourceReferenceId
          .trim()
          .slice(0, 200);

      const notes =
        inventoryForm.notes
          .trim()
          .slice(0, 1000);

      if (
        itemName.length < 2 ||
        itemName.length > 160
      ) {
        Alert.alert(
          "Item Name Required",
          "Enter a clear item name from 2 to 160 characters.",
        );
        return;
      }

      if (
        unit.length < 1 ||
        unit.length > 40
      ) {
        Alert.alert(
          "Unit Required",
          "Enter a unit such as pack, box, bottle, kit, or piece.",
        );
        return;
      }

      if (
        !Number.isFinite(
          quantity,
        ) ||
        quantity <= 0
      ) {
        Alert.alert(
          "Invalid Quantity",
          "Received quantity must be greater than 0.",
        );
        return;
      }

      const busy =
        "create_inventory";
      setBusyKey(busy);

      try {
        const itemRef =
          doc(
            collection(
              db,
              "lguReliefInventory",
            ),
          );

        await runTransaction(
          db,
          async (transaction) => {
            transaction.set(
              itemRef,
              {
                itemId:
                  itemRef.id,
                category:
                  inventoryForm.category,
                itemName,
                unit,

                quantityReceived:
                  quantity,
                quantityAvailable:
                  quantity,
                quantityAllocated:
                  0,
                quantityDistributed:
                  0,

                sourceType:
                  inventoryForm.sourceType,
                sourceReferenceId,

                status:
                  "active",
                notes,

                createdBy:
                  user.uid,
                createdAt:
                  serverTimestamp(),
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),
              },
            );
          },
        );

        setInventoryModalVisible(
          false,
        );
        setInventoryForm(
          EMPTY_INVENTORY_FORM,
        );

        Alert.alert(
          "Stock Recorded",
          "The goods were added to the central LGU relief inventory.",
        );
      } catch (problem) {
        console.log(
          "Create relief inventory error:",
          problem,
        );

        Alert.alert(
          "Unable to Add Stock",
          problem instanceof Error
            ? problem.message
            : "The inventory record could not be saved.",
        );
      } finally {
        setBusyKey("");
      }
    };

  const createAllocation =
    async () => {
      if (
        !user ||
        !isAdmin ||
        !selectedSummary ||
        !selectedInventory
      ) {
        return;
      }

      if (
        selectedSummary.assessmentIds
          .length > 50
      ) {
        Alert.alert(
          "Too Many Open Assessments",
          "Resolve or fulfill older assessments first. One allocation can link to at most 50 assessments.",
        );
        return;
      }

      const quantity =
        Number(
          allocationQuantity,
        );

      const available =
        numberValue(
          selectedInventory
            .quantityAvailable,
        );

      const neededCategories = new Set(
        needResourceEntries(selectedSummary).map(
          (entry) => entry.category,
        ),
      );

      const selectedCategory =
        String(
          selectedInventory.category ||
            "other",
        ) as InventoryCategory;

      if (!neededCategories.has(selectedCategory)) {
        Alert.alert(
          "Stock Does Not Match Verified Need",
          "Choose an inventory item that matches one of the barangay's verified relief needs.",
        );
        return;
      }

      if (
        !Number.isFinite(
          quantity,
        ) ||
        quantity <= 0
      ) {
        Alert.alert(
          "Invalid Quantity",
          "Enter a quantity greater than 0.",
        );
        return;
      }

      if (quantity > available) {
        Alert.alert(
          "Not Enough Available Stock",
          `Only ${formatNumber(
            available,
          )} ${
            selectedInventory.unit ||
            "unit(s)"
          } are available.`,
        );
        return;
      }

      const busy =
        "create_allocation";
      setBusyKey(busy);

      try {
        const inventoryRef =
          doc(
            db,
            "lguReliefInventory",
            selectedInventory.id,
          );

        const allocationRef =
          doc(
            collection(
              db,
              "barangayReliefAllocations",
            ),
          );

        const assessmentRefs =
          selectedSummary.assessmentIds.map(
            (assessmentId) =>
              doc(
                db,
                "barangayNeedAssessments",
                assessmentId,
              ),
          );

        await runTransaction(
          db,
          async (transaction) => {
            const [
              inventorySnapshot,
              ...assessmentSnapshots
            ] =
              await Promise.all([
                transaction.get(
                  inventoryRef,
                ),
                ...assessmentRefs.map(
                  (assessmentRef) =>
                    transaction.get(
                      assessmentRef,
                    ),
                ),
              ]);

            if (
              !inventorySnapshot.exists()
            ) {
              throw new Error(
                "The selected inventory item no longer exists.",
              );
            }

            const currentInventory =
              inventorySnapshot.data() as ReliefInventoryItem;

            if (
              String(
                currentInventory.status ||
                  "",
              ) !== "active"
            ) {
              throw new Error(
                "The selected inventory item is not active.",
              );
            }

            const currentAvailable =
              numberValue(
                currentInventory
                  .quantityAvailable,
              );

            if (
              currentAvailable <
              quantity
            ) {
              throw new Error(
                "Available stock changed. Review the latest quantity before allocating.",
              );
            }

            assessmentSnapshots.forEach(
              (snapshot) => {
                if (!snapshot.exists()) {
                  throw new Error(
                    "One of the linked relief need assessments no longer exists.",
                  );
                }

                const status =
                  String(
                    snapshot.data()
                      ?.status ||
                      "",
                  );

                if (
                  !ACTIVE_NEED_STATUSES.has(
                    status,
                  )
                ) {
                  throw new Error(
                    "One of the linked relief need assessments is no longer open.",
                  );
                }
              },
            );

            const currentAllocated =
              numberValue(
                currentInventory
                  .quantityAllocated,
              );

            transaction.update(
              inventoryRef,
              {
                quantityAvailable:
                  currentAvailable -
                  quantity,
                quantityAllocated:
                  currentAllocated +
                  quantity,
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),
              },
            );

            transaction.set(
              allocationRef,
              {
                allocationId:
                  allocationRef.id,
                barangay:
                  selectedSummary.barangay,
                needAssessmentIds:
                  selectedSummary
                    .assessmentIds,

                inventoryItemId:
                  selectedInventory.id,
                category:
                  String(
                    selectedInventory.category ||
                      "other",
                  ),
                itemName:
                  String(
                    selectedInventory.itemName ||
                      "Relief item",
                  ),
                unit:
                  String(
                    selectedInventory.unit ||
                      "unit",
                  ),

                quantityAllocated:
                  quantity,
                quantityDistributed:
                  0,

                status:
                  "allocated",

                volunteerSupportRequested:
                  false,
                assignedVolunteerIds:
                  [],

                distributionNote:
                  "",

                createdBy:
                  user.uid,
                createdAt:
                  serverTimestamp(),
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),

                completedAt:
                  null,
                cancelledAt:
                  null,
              },
            );

            assessmentRefs.forEach(
              (assessmentRef) => {
                transaction.update(
                  assessmentRef,
                  {
                    status:
                      "partially_allocated",
                    updatedBy:
                      user.uid,
                    updatedAt:
                      serverTimestamp(),
                  },
                );
              },
            );
          },
        );

        setAllocationModalVisible(
          false,
        );
        setSelectedBarangay("");
        setSelectedAssessmentId("");
        setSelectedInventoryId("");
        setAllocationQuantity("");
        setActiveTab(
          "allocations",
        );

        Alert.alert(
          "Goods Allocated",
          `${formatNumber(
            quantity,
          )} ${
            selectedInventory.unit ||
            "unit(s)"
          } of ${
            selectedInventory.itemName ||
            "relief goods"
          } were reserved for ${selectedSummary.barangay}.`,
        );
      } catch (problem) {
        console.log(
          "Create relief allocation error:",
          problem,
        );

        Alert.alert(
          "Allocation Failed",
          problem instanceof Error
            ? problem.message
            : "Unable to create the barangay allocation.",
        );
      } finally {
        setBusyKey("");
      }
    };

  const startDistribution =
    async (
      allocation: ReliefAllocation,
    ) => {
      if (!user || !isAdmin) {
        return;
      }

      const busy =
        `start_${allocation.id}`;
      setBusyKey(busy);

      try {
        const allocationRef =
          doc(
            db,
            "barangayReliefAllocations",
            allocation.id,
          );

        await runTransaction(
          db,
          async (transaction) => {
            const snapshot =
              await transaction.get(
                allocationRef,
              );

            if (!snapshot.exists()) {
              throw new Error(
                "This allocation no longer exists.",
              );
            }

            const current =
              snapshot.data() as ReliefAllocation;

            if (
              current.status !==
              "allocated"
            ) {
              throw new Error(
                "Only an allocated record can start distribution.",
              );
            }

            transaction.update(
              allocationRef,
              {
                status:
                  "in_distribution",
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),
              },
            );
          },
        );
      } catch (problem) {
        Alert.alert(
          "Unable to Start Distribution",
          problem instanceof Error
            ? problem.message
            : "The allocation could not be updated.",
        );
      } finally {
        setBusyKey("");
      }
    };

  const completeDistribution =
    async () => {
      if (!user || !isAdmin) {
        return;
      }

      const allocation =
        allocations.find(
          (item) =>
            item.id ===
            distributionForm
              .allocationId,
        );

      if (!allocation) {
        Alert.alert(
          "Allocation Missing",
          "The allocation could not be found.",
        );
        return;
      }

      const distributed =
        Number(
          distributionForm
            .quantityDistributed,
        );

      const allocated =
        numberValue(
          allocation.quantityAllocated,
        );

      if (
        !Number.isFinite(
          distributed,
        ) ||
        distributed < 0 ||
        distributed > allocated
      ) {
        Alert.alert(
          "Invalid Distributed Quantity",
          `Enter a value from 0 to ${formatNumber(
            allocated,
          )}.`,
        );
        return;
      }

      const note =
        distributionForm
          .distributionNote
          .trim()
          .slice(0, 1500);

      const busy =
        `complete_${allocation.id}`;
      setBusyKey(busy);

      try {
        const allocationRef =
          doc(
            db,
            "barangayReliefAllocations",
            allocation.id,
          );

        const inventoryRef =
          doc(
            db,
            "lguReliefInventory",
            String(
              allocation.inventoryItemId ||
                "",
            ),
          );

        await runTransaction(
          db,
          async (transaction) => {
            const [
              allocationSnapshot,
              inventorySnapshot,
            ] =
              await Promise.all([
                transaction.get(
                  allocationRef,
                ),
                transaction.get(
                  inventoryRef,
                ),
              ]);

            if (
              !allocationSnapshot.exists()
            ) {
              throw new Error(
                "This allocation no longer exists.",
              );
            }

            if (
              !inventorySnapshot.exists()
            ) {
              throw new Error(
                "The linked inventory item no longer exists.",
              );
            }

            const currentAllocation =
              allocationSnapshot.data() as ReliefAllocation;

            const currentInventory =
              inventorySnapshot.data() as ReliefInventoryItem;

            if (
              ![
                "allocated",
                "in_distribution",
              ].includes(
                String(
                  currentAllocation.status ||
                    "",
                ),
              )
            ) {
              throw new Error(
                "This allocation is no longer active.",
              );
            }

            const reserved =
              numberValue(
                currentAllocation
                  .quantityAllocated,
              );

            if (
              distributed >
              reserved
            ) {
              throw new Error(
                "Distributed quantity cannot exceed the reserved quantity.",
              );
            }

            const currentAvailable =
              numberValue(
                currentInventory
                  .quantityAvailable,
              );

            const currentAllocated =
              numberValue(
                currentInventory
                  .quantityAllocated,
              );

            const currentDistributed =
              numberValue(
                currentInventory
                  .quantityDistributed,
              );

            if (
              currentAllocated <
              reserved
            ) {
              throw new Error(
                "Inventory reservation is inconsistent. Review the stock record before completing distribution.",
              );
            }

            const returned =
              reserved -
              distributed;

            const nextAvailable =
              currentAvailable +
              returned;

            const nextAllocated =
              currentAllocated -
              reserved;

            const nextDistributed =
              currentDistributed +
              distributed;

            transaction.update(
              inventoryRef,
              {
                quantityAvailable:
                  nextAvailable,
                quantityAllocated:
                  nextAllocated,
                quantityDistributed:
                  nextDistributed,
                status:
                  nextAvailable <= 0 &&
                  nextAllocated <= 0
                    ? "depleted"
                    : "active",
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),
              },
            );

            transaction.update(
              allocationRef,
              {
                status:
                  "completed",
                quantityDistributed:
                  distributed,
                distributionNote:
                  note,
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),
                completedAt:
                  serverTimestamp(),
                cancelledAt:
                  null,
              },
            );
          },
        );

        setDistributionModalVisible(
          false,
        );
        setDistributionForm(
          EMPTY_DISTRIBUTION_FORM,
        );

        Alert.alert(
          "Distribution Recorded",
          "The LGU allocation and central inventory were reconciled successfully.",
        );
      } catch (problem) {
        console.log(
          "Complete distribution error:",
          problem,
        );

        Alert.alert(
          "Completion Failed",
          problem instanceof Error
            ? problem.message
            : "Unable to record the distribution.",
        );
      } finally {
        setBusyKey("");
      }
    };

  const cancelAllocation =
    async (
      allocation: ReliefAllocation,
    ) => {
      if (!user || !isAdmin) {
        return;
      }

      if (
        numberValue(
          allocation.quantityDistributed,
        ) > 0
      ) {
        Alert.alert(
          "Cannot Cancel",
          "An allocation with recorded distribution cannot be cancelled.",
        );
        return;
      }

      const busy =
        `cancel_${allocation.id}`;
      setBusyKey(busy);

      try {
        const allocationRef =
          doc(
            db,
            "barangayReliefAllocations",
            allocation.id,
          );

        const inventoryRef =
          doc(
            db,
            "lguReliefInventory",
            String(
              allocation.inventoryItemId ||
                "",
            ),
          );

        await runTransaction(
          db,
          async (transaction) => {
            const [
              allocationSnapshot,
              inventorySnapshot,
            ] =
              await Promise.all([
                transaction.get(
                  allocationRef,
                ),
                transaction.get(
                  inventoryRef,
                ),
              ]);

            if (
              !allocationSnapshot.exists()
            ) {
              throw new Error(
                "This allocation no longer exists.",
              );
            }

            if (
              !inventorySnapshot.exists()
            ) {
              throw new Error(
                "The linked inventory item no longer exists.",
              );
            }

            const currentAllocation =
              allocationSnapshot.data() as ReliefAllocation;

            const currentInventory =
              inventorySnapshot.data() as ReliefInventoryItem;

            if (
              ![
                "allocated",
                "in_distribution",
              ].includes(
                String(
                  currentAllocation.status ||
                    "",
                ),
              )
            ) {
              throw new Error(
                "This allocation is no longer active.",
              );
            }

            if (
              numberValue(
                currentAllocation
                  .quantityDistributed,
              ) > 0
            ) {
              throw new Error(
                "A distribution has already been recorded for this allocation.",
              );
            }

            const reserved =
              numberValue(
                currentAllocation
                  .quantityAllocated,
              );

            const currentAvailable =
              numberValue(
                currentInventory
                  .quantityAvailable,
              );

            const currentAllocated =
              numberValue(
                currentInventory
                  .quantityAllocated,
              );

            if (
              currentAllocated <
              reserved
            ) {
              throw new Error(
                "Inventory reservation is inconsistent.",
              );
            }

            transaction.update(
              inventoryRef,
              {
                quantityAvailable:
                  currentAvailable +
                  reserved,
                quantityAllocated:
                  currentAllocated -
                  reserved,
                status:
                  "active",
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),
              },
            );

            transaction.update(
              allocationRef,
              {
                status:
                  "cancelled",
                quantityDistributed:
                  0,
                updatedBy:
                  user.uid,
                updatedAt:
                  serverTimestamp(),
                completedAt:
                  null,
                cancelledAt:
                  serverTimestamp(),
              },
            );
          },
        );

        Alert.alert(
          "Allocation Cancelled",
          "Reserved goods were returned to available LGU inventory.",
        );
      } catch (problem) {
        Alert.alert(
          "Cancellation Failed",
          problem instanceof Error
            ? problem.message
            : "Unable to cancel the allocation.",
        );
      } finally {
        setBusyKey("");
      }
    };

  const markBarangayFulfilled =
    async (
      summary: BarangaySummary,
    ) => {
      if (!user || !isAdmin) {
        return;
      }

      const stillActive =
        activeAllocations.some(
          (allocation) =>
            allocationMatchesSummary(
              allocation,
              summary,
            ),
        );

      if (stillActive) {
        Alert.alert(
          "Active Allocation Exists",
          "Finish or cancel this relief need's active allocations before marking it fulfilled.",
        );
        return;
      }

      const hasCompleted =
        completedAllocations.some(
          (allocation) =>
            allocationMatchesSummary(
              allocation,
              summary,
            ),
        );

      if (!hasCompleted) {
        Alert.alert(
          "No Distribution Record Yet",
          "Record at least one completed allocation before marking this relief need fulfilled.",
        );
        return;
      }

      const busy =
        `fulfill_${summary.reliefNeedId}`;
      setBusyKey(busy);

      try {
        const refs =
          summary.assessmentIds.map(
            (assessmentId) =>
              doc(
                db,
                "barangayNeedAssessments",
                assessmentId,
              ),
          );

        await runTransaction(
          db,
          async (transaction) => {
            const snapshots =
              await Promise.all(
                refs.map(
                  (assessmentRef) =>
                    transaction.get(
                      assessmentRef,
                    ),
                ),
              );

            snapshots.forEach(
              (snapshot) => {
                if (!snapshot.exists()) {
                  throw new Error(
                    "The linked relief need assessment no longer exists.",
                  );
                }

                if (
                  !ACTIVE_NEED_STATUSES.has(
                    String(
                      snapshot.data()
                        ?.status ||
                        "",
                    ),
                  )
                ) {
                  throw new Error(
                    "This relief need assessment is already finalized.",
                  );
                }
              },
            );

            refs.forEach(
              (assessmentRef) => {
                transaction.update(
                  assessmentRef,
                  {
                    status:
                      "fulfilled",
                    updatedBy:
                      user.uid,
                    updatedAt:
                      serverTimestamp(),
                    closedAt:
                      null,
                  },
                );
              },
            );
          },
        );

        Alert.alert(
          "Relief Need Fulfilled",
          `${reliefScopeLabel(summary.reliefScope)} in ${summary.barangay} was removed from the active relief-planning list.`,
        );
      } catch (problem) {
        Alert.alert(
          "Unable to Finalize Needs",
          problem instanceof Error
            ? problem.message
            : "The relief need status could not be updated.",
        );
      } finally {
        setBusyKey("");
      }
    };

  if (loading) {
    return (
      <View
        style={
          styles.centerScreen
        }
      >
        <ActivityIndicator
          size="large"
          color="#0F766E"
        />
        <Text
          style={
            styles.loadingText
          }
        >
          Loading relief operations...
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
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={
          styles.page
        }
        showsVerticalScrollIndicator
      >
        <View
          style={
            styles.header
          }
        >
          <TouchableOpacity
            style={
              styles.backButton
            }
            onPress={() =>
              router.back()
            }
          >
            <Ionicons
              name="arrow-back"
              size={19}
              color="#334155"
            />
          </TouchableOpacity>

          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={
                styles.eyebrow
              }
            >
              ADMIN · LGU RELIEF OPERATIONS
            </Text>

            <Text
              style={
                styles.title
              }
            >
              Relief Operations
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Manage verified household and community relief needs, LGU stock, and distribution.
            </Text>
          </View>


        </View>

        <TouchableOpacity
          style={
            styles.startHereBox
          }
          activeOpacity={0.82}
          onPress={() =>
            setGuideOpen(
              (current) => !current,
            )
          }
        >
          <View
            style={
              styles.startHereIcon
            }
          >
            <Ionicons
              name="navigate-circle-outline"
              size={22}
              color="#0F766E"
            />
          </View>

          <View
            style={{
              flex: 1,
            }}
          >
            <Text
              style={
                styles.startHereTitle
              }
            >
              How it works
            </Text>
            {guideOpen && (
              <Text
                style={
                  styles.startHereText
                }
              >
                Verify relief need → check LGU stock → allocate → distribute and document receipt.
              </Text>
            )}
          </View>

          <Ionicons
            name={
              guideOpen
                ? "chevron-up"
                : "chevron-down"
            }
            size={18}
            color="#64748B"
          />
        </TouchableOpacity>

        {!!error && (
          <View
            style={
              styles.errorBox
            }
          >
            <Ionicons
              name="warning-outline"
              size={18}
              color="#B42318"
            />
            <Text
              style={
                styles.errorText
              }
            >
              {error}
            </Text>
          </View>
        )}

        <View
          style={[
            styles.metricsGrid,
            compact &&
              styles.metricsGridCompact,
          ]}
        >
          <MetricCard
            label="Open Needs"
            value={
              barangaySummaries.length
            }
            icon="location-outline"
          />
          <MetricCard
            label="Available Stock"
            value={
              activeInventory.length
            }
            icon="cube-outline"
          />
          <MetricCard
            label="Active Allocations"
            value={
              activeAllocations.length
            }
            icon="swap-horizontal-outline"
          />
          <MetricCard
            label="Completed Distributions"
            value={
              completedAllocations.length
            }
            icon="checkmark-done-outline"
          />
        </View>

        <View
          style={
            styles.tabs
          }
        >
          {(
            [
              [
                "action",
                "Overview",
              ],
              [
                "needs",
                "Relief Needs",
              ],
              [
                "inventory",
                "Inventory",
              ],
              [
                "allocations",
                "Distribution",
              ],
            ] as [
              TabKey,
              string,
            ][]
          ).map(
            ([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.tabButton,
                  activeTab ===
                    key &&
                    styles.tabButtonActive,
                ]}
                onPress={() =>
                  setActiveTab(
                    key,
                  )
                }
              >
                <Text
                  style={[
                    styles.tabText,
                    activeTab ===
                      key &&
                      styles.tabTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ),
          )}
        </View>

        {!dataReady ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <ActivityIndicator
              color="#0F766E"
            />
            <Text
              style={
                styles.emptyTitle
              }
            >
              Loading live LGU records...
            </Text>
          </View>
        ) : activeTab ===
          "action" ? (
          <>
            <View
              style={
                styles.sectionHeader
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
                  Next LGU Actions
                </Text>
                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  One next action is shown for each verified household or community relief need.
                </Text>
              </View>
            </View>

            {barangaySummaries.length ===
            0 ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={34}
                  color="#0F766E"
                />
                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No relief actions pending
                </Text>
                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Verified household or community relief needs will appear here when LGU action is required.
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.cardList
                }
              >
                {barangaySummaries.map(
                  (summary) => {
                    const relatedActive =
                      activeAllocations.filter(
                        (item) =>
                          allocationMatchesSummary(
                            item,
                            summary,
                          ),
                      );

                    const distributingAllocation =
                      relatedActive.find(
                        (item) =>
                          item.status ===
                          "in_distribution",
                      );

                    const readyAllocation =
                      relatedActive.find(
                        (item) =>
                          item.status ===
                          "allocated",
                      );

                    const matchingStock =
                      matchingStockForSummary(
                        summary,
                      );

                    const hasMatchingStock =
                      matchingStock.length > 0;

                    const hasCompletedDistribution =
                      completedAllocations.some(
                        (item) =>
                          allocationMatchesSummary(
                            item,
                            summary,
                          ),
                      );

                    let nextLabel = "Review Assistance Need";
                    let nextTitle =
                      "LGU stock does not currently match this need";
                    let nextText = "Record any verified shortage and process monetary fundraising through a separate approved Assistance Request.";
                    let nextIcon:
                      React.ComponentProps<
                        typeof Ionicons
                      >["name"] =
                      "heart-outline";
                    let nextAction = () =>
                      confirmShortageAndOpenDonation(
                        summary,
                      );

                    if (
                      distributingAllocation
                    ) {
                      nextLabel =
                        "Complete Distribution";
                      nextTitle =
                        "Distribution is in progress";
                      nextText =
                        "Record the quantity actually distributed and complete the distribution.";
                      nextIcon =
                        "checkmark-done-outline";
                      nextAction = () =>
                        openDistributionModal(
                          distributingAllocation,
                        );
                    } else if (
                      readyAllocation
                    ) {
                      nextLabel =
                        "Start Distribution";
                      nextTitle =
                        "Goods are allocated and ready";
                      nextText =
                        "Start distribution when the allocated goods are ready for release.";
                      nextIcon =
                        "car-outline";
                      nextAction = () =>
                        void startDistribution(
                          readyAllocation,
                        );
                    } else if (
                      hasCompletedDistribution
                    ) {
                      nextLabel =
                        "Review Remaining Need";
                      nextTitle =
                        "A distribution was completed";
                      nextText =
                        "Check whether any verified need remains. If none remains, mark the relief need fulfilled.";
                      nextIcon =
                        "clipboard-outline";
                      nextAction = () =>
                        setActiveTab(
                          "needs",
                        );
                    } else if (
                      hasMatchingStock
                    ) {
                      nextLabel =
                        "Allocate Stock";
                      nextTitle =
                        "Matching LGU stock is available";
                      nextText =
                        "Reserve available LGU stock for this verified relief need.";
                      nextIcon =
                        "cube-outline";
                      nextAction = () =>
                        openAllocationForNeed(
                          summary,
                        );
                    }

                    return (
                      <View
                        key={
                          summary.reliefNeedId
                        }
                        style={
                          styles.actionCenterCard
                        }
                      >
                        <View
                          style={[
                            styles.cardHeader,
                            compact &&
                              styles.cardHeaderCompact,
                          ]}
                        >
                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={
                                styles.cardEyebrow
                              }
                            >
                              {reliefScopeLabel(
                                summary.reliefScope,
                              ).toUpperCase()}
                            </Text>
                            <Text
                              style={
                                styles.cardTitle
                              }
                            >
                              {summary.barangay}
                            </Text>
                            <Text
                              style={
                                styles.cardMeta
                              }
                            >
                              {formatNumber(
                                summary.affectedHouseholds,
                              )}{" "}
                              affected households ·{" "}
                              {formatNumber(
                                summary.affectedPeople,
                              )}{" "}
                              affected people
                            </Text>
                            <Text
                              style={
                                styles.cardSourceMeta
                              }
                            >
                              {assessmentSourceLabel(
                                summary.sourceType,
                              )} · Verified relief need
                            </Text>
                          </View>

                          <View
                            style={
                              styles.actionStatusBadge
                            }
                          >
                            <Text
                              style={
                                styles.actionStatusText
                              }
                            >
                              NEXT ACTION
                            </Text>
                          </View>
                        </View>

                        <View
                          style={
                            styles.actionSnapshot
                          }
                        >
                          <View
                            style={
                              styles.actionSnapshotItem
                            }
                          >
                            <Text
                              style={
                                styles.actionSnapshotLabel
                              }
                            >
                              Relief scope
                            </Text>
                            <Text
                              style={
                                styles.actionSnapshotValue
                              }
                            >
                              {summary.reliefScope ===
                              "household"
                                ? "Household"
                                : "Community"}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.actionSnapshotItem
                            }
                          >
                            <Text
                              style={
                                styles.actionSnapshotLabel
                              }
                            >
                              Verified households
                            </Text>
                            <Text
                              style={
                                styles.actionSnapshotValue
                              }
                            >
                              {formatNumber(
                                summary.affectedHouseholds,
                              )}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.actionSnapshotItem
                            }
                          >
                            <Text
                              style={
                                styles.actionSnapshotLabel
                              }
                            >
                              Need categories
                            </Text>
                            <Text
                              style={
                                styles.actionSnapshotValue
                              }
                            >
                              {
                                needResourceEntries(
                                  summary,
                                ).length
                              }
                            </Text>
                          </View>

                          <View
                            style={
                              styles.actionSnapshotItem
                            }
                          >
                            <Text
                              style={
                                styles.actionSnapshotLabel
                              }
                            >
                              Matching stock
                            </Text>
                            <Text
                              style={
                                styles.actionSnapshotValue
                              }
                            >
                              {
                                matchingStock.length
                              }{" "}
                              item{
                                matchingStock.length ===
                                1
                                  ? ""
                                  : "s"
                              }
                            </Text>
                          </View>
                        </View>

                        <View
                          style={
                            styles.actionDecisionBox
                          }
                        >
                          <View
                            style={{
                              flex: 1,
                              minWidth: 230,
                            }}
                          >
                            <Text
                              style={
                                styles.actionDecisionLabel
                              }
                            >
                              WHAT TO DO NOW
                            </Text>
                            <Text
                              style={
                                styles.actionDecisionTitle
                              }
                            >
                              {nextTitle}
                            </Text>
                            <Text
                              style={
                                styles.actionDecisionText
                              }
                            >
                              {nextText}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.primaryButton,
                              !!busyKey &&
                                styles.disabled,
                            ]}
                            disabled={
                              !!busyKey
                            }
                            onPress={
                              nextAction
                            }
                          >
                            <Ionicons
                              name={
                                nextIcon
                              }
                              size={17}
                              color="#FFFFFF"
                            />
                            <Text
                              style={
                                styles.primaryButtonText
                              }
                            >
                              {nextLabel}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <View
                          style={
                            styles.actionCardFooter
                          }
                        >
                          <TouchableOpacity
                            onPress={() =>
                              setActiveTab(
                                "needs",
                              )
                            }
                          >
                            <Text
                              style={
                                styles.quietLinkText
                              }
                            >
                              View need details
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() =>
                              setActiveTab(
                                "inventory",
                              )
                            }
                          >
                            <Text
                              style={
                                styles.quietLinkText
                              }
                            >
                              View inventory
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() =>
                              setActiveTab(
                                "allocations",
                              )
                            }
                          >
                            <Text
                              style={
                                styles.quietLinkText
                              }
                            >
                              View distribution records
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  },
                )}
              </View>
            )}
          </>
        ) : activeTab ===
          "needs" ? (
          <>
            <View
              style={
                styles.sectionHeader
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
                  Verified Relief Needs
                </Text>
                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Household or community relief needs confirmed by LGU appear here. Immediate emergencies stay in Emergency Cases.
                </Text>
              </View>
            </View>

            {barangaySummaries.length ===
            0 ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={32}
                  color="#0F766E"
                />
                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No open Relief Needs
                </Text>
                <Text
                  style={
                    styles.emptyText
                  }
                >
                  LGU-verified household and community relief needs will appear here.
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.cardList
                }
              >
                {barangaySummaries.map(
                  (summary) => {
                    const relatedActive =
                      activeAllocations.filter(
                        (item) =>
                          allocationMatchesSummary(
                            item,
                            summary,
                          ),
                      );

                    const resourceEntries =
                      needResourceEntries(
                        summary,
                      );

                    const matchingStock =
                      matchingStockForSummary(
                        summary,
                      );

                    const hasMatchingStock =
                      matchingStock.length > 0;

                    const hasCompletedDistribution =
                      completedAllocations.some(
                        (item) =>
                          allocationMatchesSummary(
                            item,
                            summary,
                          ),
                      );

                    const canMarkFulfilled =
                      relatedActive.length === 0 &&
                      hasCompletedDistribution;

                    return (
                      <View
                        key={
                          summary.reliefNeedId
                        }
                        style={
                          styles.needCard
                        }
                      >
                        <View
                          style={[
                            styles.cardHeader,
                            compact &&
                              styles.cardHeaderCompact,
                          ]}
                        >
                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={
                                styles.cardEyebrow
                              }
                            >
                              {reliefScopeLabel(
                                summary.reliefScope,
                              ).toUpperCase()}
                            </Text>

                            <Text
                              style={
                                styles.cardTitle
                              }
                            >
                              {summary.barangay}
                            </Text>

                            <Text
                              style={
                                styles.cardMeta
                              }
                            >
                              {assessmentSourceLabel(
                                summary.sourceType,
                              )}
                              {" · "}
                              {formatNumber(
                                summary.affectedHouseholds,
                              )}{" "}
                              verified household
                              {summary.affectedHouseholds ===
                              1
                                ? ""
                                : "s"}
                              {" · "}
                              {
                                relatedActive.length
                              }{" "}
                              active allocation
                              {relatedActive.length ===
                              1
                                ? ""
                                : "s"}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.verifiedBadge
                            }
                          >
                            <Ionicons
                              name="shield-checkmark-outline"
                              size={14}
                              color="#0F766E"
                            />
                            <Text
                              style={
                                styles.verifiedBadgeText
                              }
                            >
                              LGU VERIFIED
                            </Text>
                          </View>
                        </View>

                        <View
                          style={
                            styles.beneficiaryCheck
                          }
                        >
                          <View
                            style={
                              styles.resourceCheckHeader
                            }
                          >
                            <View
                              style={
                                styles.stepPill
                              }
                            >
                              <Text
                                style={
                                  styles.stepPillText
                                }
                              >
                                STEP 1
                              </Text>
                            </View>

                            <View
                              style={{
                                flex: 1,
                              }}
                            >
                              <Text
                                style={
                                  styles.resourceCheckTitle
                                }
                              >
                                Confirm Relief Scope
                              </Text>
                              <Text
                                style={
                                  styles.resourceCheckSubtitle
                                }
                              >
                                {summary.reliefScope ===
                                "household"
                                  ? "This is one LGU-verified household relief need."
                                  : "This is a verified multi-household or community relief need."}
                              </Text>
                            </View>
                          </View>

                          <View
                            style={
                              styles.beneficiaryNotice
                            }
                          >
                            <Ionicons
                              name="people-outline"
                              size={17}
                              color="#0F766E"
                            />
                            <Text
                              style={
                                styles.beneficiaryNoticeText
                              }
                            >
                              {formatNumber(
                                summary.affectedHouseholds,
                              )}{" "}
                              verified household
                              {summary.affectedHouseholds ===
                              1
                                ? ""
                                : "s"}
                              {" · "}
                              {formatNumber(
                                summary.affectedPeople,
                              )}{" "}
                              affected people. Donation campaigns show only privacy-safe totals; beneficiary identities remain under LGU/barangay verification and distribution records.
                            </Text>
                          </View>

                          <Text
                            style={
                              styles.beneficiaryBasisText
                            }
                          >
                            Verification basis:{" "}
                            {String(
                              summary.adminNote ||
                                assessmentSourceLabel(
                                  summary.sourceType,
                                ),
                            )}
                          </Text>
                        </View>

                        <View
                          style={
                            styles.needOverview
                          }
                        >
                          <View
                            style={
                              styles.needOverviewItem
                            }
                          >
                            <Text
                              style={
                                styles.needOverviewLabel
                              }
                            >
                              Verified households
                            </Text>
                            <Text
                              style={
                                styles.needOverviewValue
                              }
                            >
                              {formatNumber(
                                summary.affectedHouseholds,
                              )}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.needOverviewItem
                            }
                          >
                            <Text
                              style={
                                styles.needOverviewLabel
                              }
                            >
                              Affected people
                            </Text>
                            <Text
                              style={
                                styles.needOverviewValue
                              }
                            >
                              {formatNumber(
                                summary.affectedPeople,
                              )}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={
                            styles.resourceCheck
                          }
                        >
                          <View
                            style={
                              styles.resourceCheckHeader
                            }
                          >
                            <View
                              style={
                                styles.stepPill
                              }
                            >
                              <Text
                                style={
                                  styles.stepPillText
                                }
                              >
                                STEP 2
                              </Text>
                            </View>

                            <View
                              style={{
                                flex: 1,
                              }}
                            >
                              <Text
                                style={
                                  styles.resourceCheckTitle
                                }
                              >
                                Check LGU Resources
                              </Text>
                              <Text
                                style={
                                  styles.resourceCheckSubtitle
                                }
                              >
                                Compare the verified relief need with available LGU stock.
                              </Text>
                            </View>
                          </View>

                          {resourceEntries.length ===
                          0 ? (
                            <View
                              style={
                                styles.resourceEmpty
                              }
                            >
                              <Text
                                style={
                                  styles.resourceEmptyText
                                }
                              >
                                No categorized relief need was recorded for this assessment.
                              </Text>
                            </View>
                          ) : (
                            <View
                              style={
                                styles.resourceList
                              }
                            >
                              {resourceEntries.map(
                                (entry) => {
                                  const stockText =
                                    stockBreakdownForCategory(
                                      activeInventory,
                                      entry.category,
                                    );

                                  const hasStock =
                                    stockText !==
                                    "No matching LGU stock";

                                  return (
                                    <View
                                      key={
                                        entry.category
                                      }
                                      style={
                                        styles.resourceRow
                                      }
                                    >
                                      <View
                                        style={
                                          styles.resourceNeed
                                        }
                                      >
                                        <Text
                                          style={
                                            styles.resourceCategory
                                          }
                                        >
                                          {entry.label}
                                        </Text>
                                        <Text
                                          style={
                                            styles.resourceNeedText
                                          }
                                        >
                                          Verified need:{" "}
                                          {entry.category ===
                                          "other"
                                            ? "custom LGU need"
                                            : `${formatNumber(
                                                entry.requiredCount,
                                              )} ${entry.basis}`}
                                        </Text>
                                      </View>

                                      <View
                                        style={
                                          styles.resourceStock
                                        }
                                      >
                                        <Text
                                          style={
                                            hasStock
                                              ? styles.stockAvailable
                                              : styles.stockMissing
                                          }
                                        >
                                          {hasStock
                                            ? "Stock available"
                                            : "No matching stock"}
                                        </Text>

                                        <Text
                                          style={
                                            styles.resourceStockText
                                          }
                                        >
                                          {stockText}
                                        </Text>
                                      </View>
                                    </View>
                                  );
                                },
                              )}
                            </View>
                          )}

                          <Text
                            style={
                              styles.coverageHint
                            }
                          >
                            LGU confirms the actual quantity to allocate based on available stock and the verified need.
                          </Text>
                        </View>

                        {summary.otherNeeds.length >
                          0 && (
                          <View
                            style={
                              styles.otherNeedsBox
                            }
                          >
                            <Text
                              style={
                                styles.otherNeedsLabel
                              }
                            >
                              OTHER VERIFIED NEEDS
                            </Text>
                            <Text
                              style={
                                styles.otherNeedsText
                              }
                            >
                              {summary.otherNeeds.join(
                                " · ",
                              )}
                            </Text>
                          </View>
                        )}

                        <View
                          style={
                            styles.nextActionBox
                          }
                        >
                          <View
                            style={{
                              flex: 1,
                              minWidth: 240,
                            }}
                          >
                            <Text
                              style={
                                styles.nextActionEyebrow
                              }
                            >
                              STEP 3 · CHOOSE ACTION
                            </Text>

                            <Text
                              style={
                                styles.nextActionTitle
                              }
                            >
                              {hasMatchingStock
                                ? "Matching LGU stock is available"
                                : "No matching LGU stock is available"}
                            </Text>

                            <Text
                              style={
                                styles.nextActionText
                              }
                            >
                              {hasMatchingStock
                                ? "Allocate LGU stock first. Request Donation Support only if a verified shortage remains."
                                : "If LGU confirms this need cannot be covered by available resources, request Donation Support."}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.needActionButtons
                            }
                          >
                            <TouchableOpacity
                              style={[
                                styles.primaryButton,
                                !hasMatchingStock &&
                                  styles.disabled,
                              ]}
                              disabled={
                                !hasMatchingStock ||
                                !!busyKey
                              }
                              onPress={() =>
                                openAllocationForNeed(
                                  summary,
                                )
                              }
                            >
                              <Ionicons
                                name="cube-outline"
                                size={17}
                                color="#FFFFFF"
                              />
                              <Text
                                style={
                                  styles.primaryButtonText
                                }
                              >
                                Allocate Available Stock
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={
                                styles.donationButton
                              }
                              disabled={
                                !!busyKey
                              }
                              onPress={() =>
                                confirmShortageAndOpenDonation(
                                  summary,
                                )
                              }
                            >
                              <Ionicons
                                name="heart-outline"
                                size={17}
                                color="#0F766E"
                              />
                              <Text
                                style={
                                  styles.donationButtonText
                                }
                              >
                                {hasMatchingStock
                                  ? "Request Donation for Shortage"
                                  : "Open Assistance Requests"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {canMarkFulfilled && (
                          <View
                            style={
                              styles.cardFooter
                            }
                          >
                            <Text
                              style={
                                styles.footerHint
                              }
                            >
                              Distribution is complete and no allocation is active. Mark fulfilled only when LGU confirms no relief need remains.
                            </Text>

                            <TouchableOpacity
                              style={[
                                styles.secondaryButton,
                                busyKey ===
                                  `fulfill_${summary.reliefNeedId}` &&
                                  styles.disabled,
                              ]}
                              disabled={
                                !!busyKey
                              }
                              onPress={() =>
                                void markBarangayFulfilled(
                                  summary,
                                )
                              }
                            >
                              <Text
                                style={
                                  styles.secondaryButtonText
                                }
                              >
                                Mark Need Fulfilled
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  },
                )}
              </View>
            )}
          </>
        ) : activeTab ===
          "inventory" ? (
          <>
            <View
              style={[
                styles.sectionHeader,
                compact &&
                  styles.sectionHeaderCompact,
              ]}
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
                  LGU Relief Inventory
                </Text>
                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Record LGU stock and government transfers here. Verified in-kind donations enter inventory through Donation Verification.
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.primaryButton
                }
                onPress={() =>
                  setInventoryModalVisible(
                    true,
                  )
                }
              >
                <Ionicons
                  name="add"
                  size={18}
                  color="#FFFFFF"
                />
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Add Stock
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={
                styles.inventoryNotice
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color="#2563EB"
              />
              <Text
                style={
                  styles.inventoryNoticeText
                }
              >
                Add official LGU-controlled stock here. Donated goods enter inventory only after LGU confirms their physical receipt and documented inventory intake.
              </Text>
            </View>

            {inventory.length ===
            0 ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <Ionicons
                  name="cube-outline"
                  size={32}
                  color="#94A3B8"
                />
                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No relief stock recorded
                </Text>
                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Add LGU stock or government-transferred goods when they are physically available.
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.cardList
                }
              >
                {inventory.map(
                  (item) => (
                    <View
                      key={item.id}
                      style={
                        styles.inventoryCard
                      }
                    >
                      <View
                        style={
                          styles.cardHeader
                        }
                      >
                        <View
                          style={{
                            flex: 1,
                          }}
                        >
                          <Text
                            style={
                              styles.cardEyebrow
                            }
                          >
                            {String(
                              item.category ||
                                "other",
                            ).toUpperCase()}
                          </Text>
                          <Text
                            style={
                              styles.cardTitle
                            }
                          >
                            {item.itemName ||
                              "Relief Item"}
                          </Text>
                          <Text
                            style={
                              styles.cardMeta
                            }
                          >
                            {sourceLabel(
                              item.sourceType,
                            )}
                            {item.sourceReferenceId
                              ? ` · ${item.sourceReferenceId}`
                              : ""}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.statusBadge,
                            item.status ===
                            "depleted"
                              ? styles.statusMuted
                              : item.status ===
                                  "held"
                                ? styles.statusWarning
                                : styles.statusGood,
                          ]}
                        >
                          <Text
                            style={
                              styles.statusText
                            }
                          >
                            {labelStatus(
                              item.status ||
                                "active",
                            )}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={
                          styles.stockGrid
                        }
                      >
                        <StockStat
                          label="Received"
                          value={
                            item.quantityReceived
                          }
                          unit={
                            item.unit
                          }
                        />
                        <StockStat
                          label="Available"
                          value={
                            item.quantityAvailable
                          }
                          unit={
                            item.unit
                          }
                        />
                        <StockStat
                          label="Reserved"
                          value={
                            item.quantityAllocated
                          }
                          unit={
                            item.unit
                          }
                        />
                        <StockStat
                          label="Distributed"
                          value={
                            item.quantityDistributed
                          }
                          unit={
                            item.unit
                          }
                        />
                      </View>

                      {!!item.notes && (
                        <Text
                          style={
                            styles.itemNote
                          }
                        >
                          {item.notes}
                        </Text>
                      )}
                    </View>
                  ),
                )}
              </View>
            )}

            <View
              style={
                styles.infoBox
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color="#2563EB"
              />
              <Text
                style={
                  styles.infoText
                }
              >
                Donation verification is the next module. Verified donations will feed LGU-controlled resources; unverified pledges must not increase available stock.
              </Text>
            </View>
          </>
        ) : (
          <>
            <View
              style={
                styles.sectionHeader
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
                  Distribution Records
                </Text>
                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Track allocated goods from reservation through distribution completion.
                </Text>
              </View>
            </View>

            {allocations.length ===
            0 ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={32}
                  color="#94A3B8"
                />
                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No allocations yet
                </Text>
                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Open Relief Needs and allocate available LGU stock before starting distribution.
                </Text>
              </View>
            ) : (
              <View
                style={
                  styles.cardList
                }
              >
                {allocations.map(
                  (allocation) => {
                    const busy =
                      !!busyKey &&
                      busyKey.includes(
                        allocation.id,
                      );

                    return (
                      <View
                        key={
                          allocation.id
                        }
                        style={
                          styles.allocationCard
                        }
                      >
                        <View
                          style={[
                            styles.cardHeader,
                            compact &&
                              styles.cardHeaderCompact,
                          ]}
                        >
                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={
                                styles.cardEyebrow
                              }
                            >
                              {allocation.barangay ||
                                "BARANGAY"}
                            </Text>

                            <Text
                              style={
                                styles.cardTitle
                              }
                            >
                              {allocation.itemName ||
                                "Relief Goods"}
                            </Text>

                            <Text
                              style={
                                styles.cardMeta
                              }
                            >
                              Created{" "}
                              {formatDate(
                                allocation.createdAt,
                              )}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.statusBadge,
                              allocation.status ===
                              "completed"
                                ? styles.statusGood
                                : allocation.status ===
                                    "cancelled"
                                  ? styles.statusMuted
                                  : allocation.status ===
                                      "in_distribution"
                                    ? styles.statusInfo
                                    : styles.statusWarning,
                            ]}
                          >
                            <Text
                              style={
                                styles.statusText
                              }
                            >
                              {labelStatus(
                                allocation.status,
                              )}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={
                            styles.allocationStats
                          }
                        >
                          <StockStat
                            label="Allocated"
                            value={
                              allocation.quantityAllocated
                            }
                            unit={
                              allocation.unit
                            }
                          />
                          <StockStat
                            label="Distributed"
                            value={
                              allocation.quantityDistributed
                            }
                            unit={
                              allocation.unit
                            }
                          />
                        </View>

                        {!!allocation.distributionNote && (
                          <Text
                            style={
                              styles.itemNote
                            }
                          >
                            {allocation.distributionNote}
                          </Text>
                        )}

                        {[
                          "allocated",
                          "in_distribution",
                        ].includes(
                          String(
                            allocation.status ||
                              "",
                          ),
                        ) && (
                          <View
                            style={
                              styles.actionRow
                            }
                          >
                            {allocation.status ===
                              "allocated" && (
                              <TouchableOpacity
                                style={[
                                  styles.actionBlue,
                                  busy &&
                                    styles.disabled,
                                ]}
                                disabled={
                                  !!busyKey
                                }
                                onPress={() =>
                                  void startDistribution(
                                    allocation,
                                  )
                                }
                              >
                                <Text
                                  style={
                                    styles.actionBlueText
                                  }
                                >
                                  Start Distribution
                                </Text>
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity
                              style={[
                                styles.primaryButton,
                                busy &&
                                  styles.disabled,
                              ]}
                              disabled={
                                !!busyKey
                              }
                              onPress={() =>
                                openDistributionModal(
                                  allocation,
                                )
                              }
                            >
                              <Text
                                style={
                                  styles.primaryButtonText
                                }
                              >
                                Record Completion
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[
                                styles.dangerButton,
                                busy &&
                                  styles.disabled,
                              ]}
                              disabled={
                                !!busyKey
                              }
                              onPress={() =>
                                void cancelAllocation(
                                  allocation,
                                )
                              }
                            >
                              <Text
                                style={
                                  styles.dangerButtonText
                                }
                              >
                                Cancel
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  },
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={
          inventoryModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeInventoryModal
        }
      >
        <View
          style={
            styles.modalBackdrop
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.modalScroll
            }
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={
                styles.modalCard
              }
            >
              <ModalHeader
                title="Add LGU Relief Stock"
                subtitle="Record goods only after they are physically available to LGU."
                onClose={
                  closeInventoryModal
                }
                disabled={
                  !!busyKey
                }
              />

              <Text
                style={
                  styles.inputLabel
                }
              >
                Category
              </Text>

              <View
                style={
                  styles.choiceRow
                }
              >
                {INVENTORY_CATEGORIES.map(
                  (item) => (
                    <ChoiceChip
                      key={
                        item.value
                      }
                      label={
                        item.label
                      }
                      active={
                        inventoryForm.category ===
                        item.value
                      }
                      onPress={() =>
                        setInventoryForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            category:
                              item.value,
                          }),
                        )
                      }
                    />
                  ),
                )}
              </View>

              <FormInput
                label="Item name"
                value={
                  inventoryForm.itemName
                }
                onChangeText={(
                  value,
                ) =>
                  setInventoryForm(
                    (current) => ({
                      ...current,
                      itemName:
                        value,
                    }),
                  )
                }
                placeholder="Food pack, bottled water, hygiene kit..."
              />

              <View
                style={[
                  styles.formRow,
                  compact &&
                    styles.formRowCompact,
                ]}
              >
                <View
                  style={
                    styles.formColumn
                  }
                >
                  <FormInput
                    label="Quantity received"
                    value={
                      inventoryForm.quantityReceived
                    }
                    onChangeText={(
                      value,
                    ) =>
                      setInventoryForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          quantityReceived:
                            value.replace(
                              /[^0-9.]/g,
                              "",
                            ),
                        }),
                      )
                    }
                    placeholder="100"
                    keyboardType="decimal-pad"
                  />
                </View>

                <View
                  style={
                    styles.formColumn
                  }
                >
                  <FormInput
                    label="Unit"
                    value={
                      inventoryForm.unit
                    }
                    onChangeText={(
                      value,
                    ) =>
                      setInventoryForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          unit: value,
                        }),
                      )
                    }
                    placeholder="pack"
                  />
                </View>
              </View>

              <Text
                style={
                  styles.inputLabel
                }
              >
                Source
              </Text>

              <View
                style={
                  styles.choiceRow
                }
              >
                {INVENTORY_SOURCES.map(
                  (item) => (
                    <ChoiceChip
                      key={
                        item.value
                      }
                      label={
                        item.label
                      }
                      active={
                        inventoryForm.sourceType ===
                        item.value
                      }
                      onPress={() =>
                        setInventoryForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            sourceType:
                              item.value,
                          }),
                        )
                      }
                    />
                  ),
                )}
              </View>

              <FormInput
                label="Official reference (optional)"
                value={
                  inventoryForm.sourceReferenceId
                }
                onChangeText={(
                  value,
                ) =>
                  setInventoryForm(
                    (current) => ({
                      ...current,
                      sourceReferenceId:
                        value,
                    }),
                  )
                }
                placeholder="Receiving slip / transfer reference"
              />

              <FormInput
                label="Notes (optional)"
                value={
                  inventoryForm.notes
                }
                onChangeText={(
                  value,
                ) =>
                  setInventoryForm(
                    (current) => ({
                      ...current,
                      notes: value,
                    }),
                  )
                }
                placeholder="Short inventory note"
                multiline
              />

              <View
                style={
                  styles.modalActions
                }
              >
                <TouchableOpacity
                  style={
                    styles.modalSecondary
                  }
                  disabled={
                    !!busyKey
                  }
                  onPress={
                    closeInventoryModal
                  }
                >
                  <Text
                    style={
                      styles.modalSecondaryText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalPrimary,
                    !!busyKey &&
                      styles.disabled,
                  ]}
                  disabled={
                    !!busyKey
                  }
                  onPress={() =>
                    void saveInventoryItem()
                  }
                >
                  {busyKey ===
                  "create_inventory" ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <Ionicons
                      name="save-outline"
                      size={17}
                      color="#FFFFFF"
                    />
                  )}

                  <Text
                    style={
                      styles.modalPrimaryText
                    }
                  >
                    Add to Inventory
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={
          allocationModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeAllocationModal
        }
      >
        <View
          style={
            styles.modalBackdrop
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.modalScroll
            }
          >
            <View
              style={
                styles.modalCard
              }
            >
              <ModalHeader
                title="Allocate Verified Relief Stock"
                subtitle={`${
                  selectedSummary
                    ? reliefScopeLabel(
                        selectedSummary.reliefScope,
                      )
                    : "Relief Need"
                } · ${
                  selectedBarangay ||
                  "—"
                } · Only stock matching verified need categories is shown.`}
                onClose={
                  closeAllocationModal
                }
                disabled={
                  !!busyKey
                }
              />

              <Text
                style={
                  styles.inputLabel
                }
              >
                Select available stock
              </Text>

              {relevantInventoryForSelectedSummary.length ===
              0 ? (
                <View
                  style={
                    styles.inlineEmpty
                  }
                >
                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    No matching LGU stock is available. Review official stock or use verified Request Assistance for a separate monetary need.
                  </Text>

                  <TouchableOpacity
                    style={
                      styles.inlineDonationButton
                    }
                    onPress={() => {
                      if (selectedSummary) {
                        confirmShortageAndOpenDonation(
                          selectedSummary,
                        );
                      } else {
                        openAssistanceReview();
                      }
                    }}
                  >
                    <Ionicons
                      name="heart-outline"
                      size={16}
                      color="#0F766E"
                    />
                    <Text
                      style={
                        styles.inlineDonationButtonText
                      }
                    >
                      Confirm Shortage & Request Donation
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View
                  style={
                    styles.inventoryChoiceList
                  }
                >
                  {relevantInventoryForSelectedSummary.map(
                    (item) => {
                      const active =
                        selectedInventoryId ===
                        item.id;

                      return (
                        <TouchableOpacity
                          key={
                            item.id
                          }
                          style={[
                            styles.inventoryChoice,
                            active &&
                              styles.inventoryChoiceActive,
                          ]}
                          onPress={() =>
                            setSelectedInventoryId(
                              item.id,
                            )
                          }
                        >
                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={[
                                styles.inventoryChoiceTitle,
                                active &&
                                  styles.inventoryChoiceTitleActive,
                              ]}
                            >
                              {item.itemName}
                            </Text>
                            <Text
                              style={
                                styles.inventoryChoiceMeta
                              }
                            >
                              {String(
                                item.category ||
                                  "other",
                              ).toUpperCase()}
                              {" · "}
                              {formatNumber(
                                item.quantityAvailable,
                              )}{" "}
                              {item.unit ||
                                "unit(s)"}{" "}
                              available
                            </Text>
                          </View>

                          {active && (
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color="#0F766E"
                            />
                          )}
                        </TouchableOpacity>
                      );
                    },
                  )}
                </View>
              )}

              <FormInput
                label="Quantity to allocate"
                value={
                  allocationQuantity
                }
                onChangeText={(
                  value,
                ) =>
                  setAllocationQuantity(
                    value.replace(
                      /[^0-9.]/g,
                      "",
                    ),
                  )
                }
                placeholder={
                  selectedInventory
                    ? `Available: ${formatNumber(
                        selectedInventory.quantityAvailable,
                      )} ${
                        selectedInventory.unit ||
                        "unit(s)"
                      }`
                    : "Select stock first"
                }
                keyboardType="decimal-pad"
              />

              <View
                style={
                  styles.infoBox
                }
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text
                  style={
                    styles.infoText
                  }
                >
                  Creating an allocation reserves the stock from central LGU inventory immediately. It does not mean the goods were already distributed.
                </Text>
              </View>

              <View
                style={
                  styles.modalActions
                }
              >
                <TouchableOpacity
                  style={
                    styles.modalSecondary
                  }
                  disabled={
                    !!busyKey
                  }
                  onPress={
                    closeAllocationModal
                  }
                >
                  <Text
                    style={
                      styles.modalSecondaryText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalPrimary,
                    (
                      !selectedInventory ||
                      !allocationQuantity ||
                      !!busyKey
                    ) &&
                      styles.disabled,
                  ]}
                  disabled={
                    !selectedInventory ||
                    !allocationQuantity ||
                    !!busyKey
                  }
                  onPress={() =>
                    void createAllocation()
                  }
                >
                  {busyKey ===
                  "create_allocation" ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <Ionicons
                      name="cube-outline"
                      size={17}
                      color="#FFFFFF"
                    />
                  )}

                  <Text
                    style={
                      styles.modalPrimaryText
                    }
                  >
                    Reserve for Barangay
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={
          distributionModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={
          closeDistributionModal
        }
      >
        <View
          style={
            styles.modalBackdrop
          }
        >
          <ScrollView
            contentContainerStyle={
              styles.modalScroll
            }
          >
            <View
              style={
                styles.modalCard
              }
            >
              <ModalHeader
                title="Record Distribution"
                subtitle="LGU final distribution record"
                onClose={
                  closeDistributionModal
                }
                disabled={
                  !!busyKey
                }
              />

              <FormInput
                label="Quantity actually distributed"
                value={
                  distributionForm.quantityDistributed
                }
                onChangeText={(
                  value,
                ) =>
                  setDistributionForm(
                    (current) => ({
                      ...current,
                      quantityDistributed:
                        value.replace(
                          /[^0-9.]/g,
                          "",
                        ),
                    }),
                  )
                }
                placeholder="0"
                keyboardType="decimal-pad"
              />

              <FormInput
                label="Distribution note (optional)"
                value={
                  distributionForm.distributionNote
                }
                onChangeText={(
                  value,
                ) =>
                  setDistributionForm(
                    (current) => ({
                      ...current,
                      distributionNote:
                        value,
                    }),
                  )
                }
                placeholder="Where and how the goods were distributed"
                multiline
              />

              <View
                style={
                  styles.infoBox
                }
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text
                  style={
                    styles.infoText
                  }
                >
                  Any reserved quantity not distributed will be returned automatically to available LGU inventory.
                </Text>
              </View>

              <View
                style={
                  styles.modalActions
                }
              >
                <TouchableOpacity
                  style={
                    styles.modalSecondary
                  }
                  disabled={
                    !!busyKey
                  }
                  onPress={
                    closeDistributionModal
                  }
                >
                  <Text
                    style={
                      styles.modalSecondaryText
                    }
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalPrimary,
                    !!busyKey &&
                      styles.disabled,
                  ]}
                  disabled={
                    !!busyKey
                  }
                  onPress={() =>
                    void completeDistribution()
                  }
                >
                  <Ionicons
                    name="checkmark-done-outline"
                    size={17}
                    color="#FFFFFF"
                  />
                  <Text
                    style={
                      styles.modalPrimaryText
                    }
                  >
                    Complete Distribution
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<
    typeof Ionicons
  >["name"];
}) {
  return (
    <View
      style={
        styles.metricCard
      }
    >
      <View
        style={
          styles.metricIcon
        }
      >
        <Ionicons
          name={icon}
          size={20}
          color="#0F766E"
        />
      </View>

      <View
        style={{
          flex: 1,
        }}
      >
        <Text
          style={
            styles.metricValue
          }
        >
          {value}
        </Text>
        <Text
          style={
            styles.metricLabel
          }
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

function NeedStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <View
      style={
        styles.needStat
      }
    >
      <Text
        style={
          styles.needStatLabel
        }
      >
        {label}
      </Text>
      <Text
        style={
          styles.needStatValue
        }
      >
        {formatNumber(
          value,
        )}
      </Text>
      {!!suffix && (
        <Text
          style={
            styles.needStatSuffix
          }
        >
          {suffix}
        </Text>
      )}
    </View>
  );
}

function StockStat({
  label,
  value,
  unit,
}: {
  label: string;
  value?: number;
  unit?: string;
}) {
  return (
    <View
      style={
        styles.stockStat
      }
    >
      <Text
        style={
          styles.stockStatLabel
        }
      >
        {label}
      </Text>
      <Text
        style={
          styles.stockStatValue
        }
      >
        {formatNumber(
          value,
        )}
      </Text>
      <Text
        style={
          styles.stockStatUnit
        }
      >
        {unit ||
          "unit(s)"}
      </Text>
    </View>
  );
}

function ChoiceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.choiceChip,
        active &&
          styles.choiceChipActive,
      ]}
      onPress={
        onPress
      }
    >
      <Text
        style={[
          styles.choiceChipText,
          active &&
            styles.choiceChipTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
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
    | "decimal-pad";
  multiline?: boolean;
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
        multiline={
          multiline
        }
        maxLength={
          multiline
            ? 1500
            : 200
        }
        style={[
          styles.input,
          multiline &&
            styles.inputMultiline,
        ]}
      />
    </View>
  );
}

function ModalHeader({
  title,
  subtitle,
  onClose,
  disabled,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  disabled: boolean;
}) {
  return (
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
          {title}
        </Text>
        <Text
          style={
            styles.modalSubtitle
          }
        >
          {subtitle}
        </Text>
      </View>

      <TouchableOpacity
        style={
          styles.modalClose
        }
        disabled={
          disabled
        }
        onPress={
          onClose
        }
      >
        <Ionicons
          name="close"
          size={20}
          color="#475569"
        />
      </TouchableOpacity>
    </View>
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
      maxWidth: 1220,
      alignSelf: "center",
      paddingHorizontal: 22,
      paddingTop: 24,
      paddingBottom: 60,
    },

    centerScreen: {
      flex: 1,
      minHeight: 520,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F5F7FB",
    },

    loadingText: {
      marginTop: 10,
      color: "#64748B",
      fontSize: 12,
      fontWeight: "700",
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 12,
      marginBottom: 14,
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 11,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
    },

    eyebrow: {
      color: "#0F766E",
      fontSize: 9.5,
      fontWeight: "900",
      letterSpacing: 1,
    },

    title: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 28,
      fontWeight: "900",
    },

    subtitle: {
      marginTop: 4,
      color: "#64748B",
      fontSize: 12.5,
      lineHeight: 18,
    },

    startHereBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 13,
      marginBottom: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#CFE4DF",
      backgroundColor: "#F4FBF8",
    },

    startHereIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#E7F7F1",
    },

    startHereTitle: {
      color: "#0F172A",
      fontSize: 12,
      fontWeight: "900",
    },

    startHereText: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 10.5,
      lineHeight: 16,
    },

    actionCenterCard: {
      padding: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "#DDE6ED",
      backgroundColor: "#FFFFFF",
    },

    actionStatusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "#E0F2FE",
    },

    actionStatusText: {
      color: "#0369A1",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.4,
    },

    actionSnapshot: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },

    actionSnapshotItem: {
      minWidth: 150,
      flexGrow: 1,
      flexBasis: 150,
      padding: 10,
      borderRadius: 10,
      backgroundColor: "#F8FAFC",
    },

    actionSnapshotLabel: {
      color: "#64748B",
      fontSize: 8.5,
      fontWeight: "800",
    },

    actionSnapshotValue: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 14,
      fontWeight: "900",
    },

    actionDecisionBox: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      padding: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: "#BFDCD6",
      backgroundColor: "#F5FBF9",
    },

    actionDecisionLabel: {
      color: "#0F766E",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    actionDecisionTitle: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 11.5,
      fontWeight: "900",
    },

    actionDecisionText: {
      marginTop: 3,
      maxWidth: 690,
      color: "#64748B",
      fontSize: 9.5,
      lineHeight: 14,
    },

    actionCardFooter: {
      marginTop: 11,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: "#EEF2F6",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
    },

    quietLinkText: {
      color: "#64748B",
      fontSize: 9.5,
      fontWeight: "800",
      textDecorationLine: "underline",
    },

    authorityNotice: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 9,
      padding: 12,
      marginBottom: 14,
      borderRadius: 11,
      borderWidth: 1,
      borderColor:
        "#A7F3D0",
      backgroundColor:
        "#ECFDF5",
    },

    authorityNoticeText: {
      flex: 1,
      color: "#3F6F62",
      fontSize: 11.5,
      lineHeight: 17,
      fontWeight: "700",
    },


    headerAction: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#BFDCD6",
      backgroundColor: "#F1FAF7",
    },

    headerActionText: {
      color: "#0F766E",
      fontSize: 10,
      fontWeight: "900",
    },

    workflowStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14,
    },

    workflowStep: {
      flexGrow: 1,
      flexBasis: 230,
      minWidth: 210,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      padding: 11,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: "#E2E8F0",
      backgroundColor: "#FFFFFF",
    },

    workflowNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ECFDF5",
    },

    workflowNumberText: {
      color: "#0F766E",
      fontSize: 10,
      fontWeight: "900",
    },

    workflowTitle: {
      color: "#0F172A",
      fontSize: 10.5,
      fontWeight: "900",
    },

    workflowDetail: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 9,
      lineHeight: 13,
    },

    verifiedBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "#BFDCD6",
      backgroundColor: "#F1FAF7",
    },

    verifiedBadgeText: {
      color: "#0F766E",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.4,
    },

    beneficiaryCheck: {
      marginTop: 13,
      padding: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#CFE4DF",
      backgroundColor: "#F5FBF9",
    },

    beneficiaryNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 10,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: "#DDEBE7",
      backgroundColor: "#FFFFFF",
    },

    beneficiaryNoticeText: {
      flex: 1,
      color: "#3F5F58",
      fontSize: 9.5,
      lineHeight: 15,
      fontWeight: "700",
    },

    beneficiaryBasisText: {
      marginTop: 9,
      color: "#64748B",
      fontSize: 9,
      lineHeight: 14,
      fontStyle: "italic",
    },

    needOverview: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },

    needOverviewItem: {
      minWidth: 170,
      flexGrow: 1,
      flexBasis: 170,
      padding: 11,
      borderRadius: 10,
      backgroundColor: "#F8FAFC",
    },

    needOverviewLabel: {
      color: "#64748B",
      fontSize: 8.5,
      fontWeight: "800",
    },

    needOverviewValue: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "900",
    },

    resourceCheck: {
      marginTop: 12,
      padding: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#DDE6ED",
      backgroundColor: "#FBFCFE",
    },

    resourceCheckHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      marginBottom: 10,
    },

    stepPill: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: "#E0F2FE",
    },

    stepPillText: {
      color: "#0369A1",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    resourceCheckTitle: {
      color: "#0F172A",
      fontSize: 12,
      fontWeight: "900",
    },

    resourceCheckSubtitle: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 9.5,
      lineHeight: 14,
    },

    resourceList: {
      gap: 7,
    },

    resourceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: 10,
      borderRadius: 9,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E8EDF2",
    },

    resourceNeed: {
      flex: 1,
      minWidth: 160,
    },

    resourceCategory: {
      color: "#0F172A",
      fontSize: 10.5,
      fontWeight: "900",
    },

    resourceNeedText: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 9,
    },

    resourceStock: {
      minWidth: 165,
      alignItems: "flex-end",
    },

    stockAvailable: {
      color: "#15803D",
      fontSize: 8.5,
      fontWeight: "900",
    },

    stockMissing: {
      color: "#B45309",
      fontSize: 8.5,
      fontWeight: "900",
    },

    resourceStockText: {
      marginTop: 2,
      color: "#475569",
      fontSize: 9,
      textAlign: "right",
    },

    resourceEmpty: {
      padding: 10,
      borderRadius: 9,
      backgroundColor: "#FFFFFF",
    },

    resourceEmptyText: {
      color: "#64748B",
      fontSize: 9.5,
      lineHeight: 14,
    },

    coverageHint: {
      marginTop: 9,
      color: "#64748B",
      fontSize: 8.8,
      lineHeight: 13,
      fontStyle: "italic",
    },

    nextActionBox: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
      padding: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: "#CFE4DF",
      backgroundColor: "#F5FBF9",
    },

    nextActionEyebrow: {
      color: "#0F766E",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    nextActionTitle: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 11.5,
      fontWeight: "900",
    },

    nextActionText: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 9.5,
      lineHeight: 14,
      maxWidth: 690,
    },

    needActionButtons: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    donationButton: {
      minHeight: 39,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 13,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: "#BFDCD6",
      backgroundColor: "#FFFFFF",
    },

    donationButtonText: {
      color: "#0F766E",
      fontSize: 10.5,
      fontWeight: "900",
    },

    inlineDonationButton: {
      alignSelf: "center",
      marginTop: 10,
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: "#BFDCD6",
      backgroundColor: "#FFFFFF",
    },

    inlineDonationButtonText: {
      color: "#0F766E",
      fontSize: 9.5,
      fontWeight: "900",
    },

    inventoryNotice: {
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#BFDBFE",
      backgroundColor: "#EFF6FF",
    },

    inventoryNoticeText: {
      flex: 1,
      color: "#315A8A",
      fontSize: 9.5,
      lineHeight: 14,
      fontWeight: "700",
    },

    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 11,
      marginBottom: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#F2C6C1",
      backgroundColor:
        "#FFF3F2",
    },

    errorText: {
      flex: 1,
      color: "#B42318",
      fontSize: 11,
      fontWeight: "700",
    },

    metricsGrid: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },

    metricsGridCompact: {
      flexWrap: "wrap",
    },

    metricCard: {
      flex: 1,
      minWidth: 180,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 76,
      padding: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    metricIcon: {
      width: 40,
      height: 40,
      borderRadius: 11,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#ECFDF5",
    },

    metricValue: {
      color: "#0F172A",
      fontSize: 21,
      fontWeight: "900",
    },

    metricLabel: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 10,
      fontWeight: "800",
    },

    tabs: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      padding: 6,
      marginBottom: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor:
        "#E2E8F0",
      backgroundColor:
        "#FFFFFF",
    },

    tabButton: {
      minHeight: 38,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent:
        "center",
      borderRadius: 9,
    },

    tabButtonActive: {
      backgroundColor:
        "#0F766E",
    },

    tabText: {
      color: "#64748B",
      fontSize: 11,
      fontWeight: "900",
    },

    tabTextActive: {
      color: "#FFFFFF",
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 12,
      marginBottom: 12,
    },

    sectionHeaderCompact: {
      alignItems:
        "flex-start",
      flexWrap: "wrap",
    },

    sectionTitle: {
      color: "#0F172A",
      fontSize: 17,
      fontWeight: "900",
    },

    sectionSubtitle: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 11.5,
      lineHeight: 17,
    },

    cardList: {
      gap: 11,
    },

    needCard: {
      padding: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#DDE6ED",
      backgroundColor:
        "#FFFFFF",
    },

    inventoryCard: {
      padding: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#DDE6ED",
      backgroundColor:
        "#FFFFFF",
    },

    allocationCard: {
      padding: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#DDE6ED",
      backgroundColor:
        "#FFFFFF",
    },

    cardHeader: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      gap: 12,
    },

    cardHeaderCompact: {
      flexWrap: "wrap",
    },

    cardEyebrow: {
      color: "#0F766E",
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    cardTitle: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 16,
      fontWeight: "900",
    },

    cardMeta: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 10,
      lineHeight: 15,
    },

    cardSourceMeta: {
      marginTop: 4,
      color: "#0F766E",
      fontSize: 9,
      lineHeight: 14,
      fontWeight: "800",
    },

    primaryButton: {
      minHeight: 39,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 6,
      paddingHorizontal: 13,
      borderRadius: 9,
      backgroundColor:
        "#0F766E",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    secondaryButton: {
      minHeight: 36,
      alignItems: "center",
      justifyContent:
        "center",
      paddingHorizontal: 12,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#BFDCD6",
      backgroundColor:
        "#F1FAF7",
    },

    secondaryButtonText: {
      color: "#0F766E",
      fontSize: 10,
      fontWeight: "900",
    },

    dangerButton: {
      minHeight: 39,
      alignItems: "center",
      justifyContent:
        "center",
      paddingHorizontal: 13,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#F2C6C1",
      backgroundColor:
        "#FFF3F2",
    },

    dangerButtonText: {
      color: "#B42318",
      fontSize: 10.5,
      fontWeight: "900",
    },

    actionBlue: {
      minHeight: 39,
      alignItems: "center",
      justifyContent:
        "center",
      paddingHorizontal: 13,
      borderRadius: 9,
      backgroundColor:
        "#2563EB",
    },

    actionBlueText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },

    disabled: {
      opacity: 0.5,
    },

    needStatsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 13,
    },

    needStat: {
      minWidth: 125,
      flexGrow: 1,
      flexBasis: 125,
      padding: 10,
      borderRadius: 10,
      backgroundColor:
        "#F8FAFC",
    },

    needStatLabel: {
      color: "#64748B",
      fontSize: 8.5,
      fontWeight: "800",
    },

    needStatValue: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 17,
      fontWeight: "900",
    },

    needStatSuffix: {
      marginTop: 1,
      color: "#94A3B8",
      fontSize: 8.5,
      fontWeight: "700",
    },

    otherNeedsBox: {
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor:
        "#FFFBEF",
      borderWidth: 1,
      borderColor:
        "#F5E2A8",
    },

    otherNeedsLabel: {
      color: "#9A6700",
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    otherNeedsText: {
      marginTop: 4,
      color: "#6B5A23",
      fontSize: 10.5,
      lineHeight: 16,
      fontWeight: "700",
    },

    cardFooter: {
      marginTop: 12,
      paddingTop: 11,
      borderTopWidth: 1,
      borderTopColor:
        "#EDF1F5",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 12,
      flexWrap: "wrap",
    },

    footerHint: {
      flex: 1,
      minWidth: 220,
      color: "#64748B",
      fontSize: 9.5,
      lineHeight: 14,
    },

    stockGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 13,
    },

    stockStat: {
      minWidth: 130,
      flexGrow: 1,
      flexBasis: 130,
      padding: 10,
      borderRadius: 10,
      backgroundColor:
        "#F8FAFC",
    },

    stockStatLabel: {
      color: "#64748B",
      fontSize: 8.5,
      fontWeight: "800",
    },

    stockStatValue: {
      marginTop: 3,
      color: "#0F172A",
      fontSize: 17,
      fontWeight: "900",
    },

    stockStatUnit: {
      marginTop: 1,
      color: "#94A3B8",
      fontSize: 8.5,
      fontWeight: "700",
    },

    itemNote: {
      marginTop: 10,
      color: "#64748B",
      fontSize: 10,
      lineHeight: 15,
    },

    statusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },

    statusGood: {
      backgroundColor:
        "#15803D",
    },

    statusWarning: {
      backgroundColor:
        "#D97706",
    },

    statusInfo: {
      backgroundColor:
        "#2563EB",
    },

    statusMuted: {
      backgroundColor:
        "#64748B",
    },

    statusText: {
      color: "#FFFFFF",
      fontSize: 8.5,
      fontWeight: "900",
    },

    allocationStats: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },

    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },

    infoBox: {
      marginTop: 14,
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 8,
      padding: 11,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#BFDBFE",
      backgroundColor:
        "#EFF6FF",
    },

    infoText: {
      flex: 1,
      color: "#315A8A",
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "700",
    },

    emptyCard: {
      minHeight: 190,
      alignItems: "center",
      justifyContent:
        "center",
      padding: 26,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#DDE6ED",
      backgroundColor:
        "#FFFFFF",
    },

    emptyTitle: {
      marginTop: 9,
      color: "#0F172A",
      fontSize: 14,
      fontWeight: "900",
      textAlign: "center",
    },

    emptyText: {
      marginTop: 4,
      maxWidth: 520,
      color: "#64748B",
      fontSize: 10.5,
      lineHeight: 16,
      textAlign: "center",
    },

    inlineEmpty: {
      padding: 14,
      marginBottom: 12,
      borderRadius: 10,
      backgroundColor:
        "#F8FAFC",
    },

    modalBackdrop: {
      flex: 1,
      justifyContent:
        "center",
      padding: 18,
      backgroundColor:
        "rgba(15, 23, 42, 0.48)",
    },

    modalScroll: {
      flexGrow: 1,
      justifyContent:
        "center",
      paddingVertical: 20,
    },

    modalCard: {
      width: "100%",
      maxWidth: 680,
      alignSelf: "center",
      padding: 18,
      borderRadius: 16,
      backgroundColor:
        "#FFFFFF",
    },

    modalHeader: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      gap: 12,
      marginBottom: 14,
    },

    modalTitle: {
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "900",
    },

    modalSubtitle: {
      marginTop: 3,
      color: "#64748B",
      fontSize: 10.5,
      lineHeight: 15,
    },

    modalClose: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent:
        "center",
      borderRadius: 9,
      backgroundColor:
        "#F1F5F9",
    },

    inputGroup: {
      marginTop: 11,
    },

    inputLabel: {
      marginBottom: 6,
      color: "#475569",
      fontSize: 10,
      fontWeight: "900",
    },

    input: {
      minHeight: 42,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#D6E0E8",
      backgroundColor:
        "#FFFFFF",
      color: "#0F172A",
      fontSize: 11,
    },

    inputMultiline: {
      minHeight: 88,
      textAlignVertical:
        "top",
    },

    formRow: {
      flexDirection: "row",
      gap: 10,
    },

    formRowCompact: {
      flexDirection:
        "column",
    },

    formColumn: {
      flex: 1,
    },

    choiceRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginBottom: 5,
    },

    choiceChip: {
      minHeight: 34,
      justifyContent:
        "center",
      paddingHorizontal: 11,
      borderRadius: 999,
      borderWidth: 1,
      borderColor:
        "#CBD5E1",
      backgroundColor:
        "#FFFFFF",
    },

    choiceChipActive: {
      borderColor:
        "#0F766E",
      backgroundColor:
        "#ECFDF5",
    },

    choiceChipText: {
      color: "#64748B",
      fontSize: 9.5,
      fontWeight: "800",
    },

    choiceChipTextActive: {
      color: "#0F766E",
    },

    inventoryChoiceList: {
      gap: 7,
      marginBottom: 4,
    },

    inventoryChoice: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 11,
      borderRadius: 10,
      borderWidth: 1,
      borderColor:
        "#DDE6ED",
      backgroundColor:
        "#FFFFFF",
    },

    inventoryChoiceActive: {
      borderColor:
        "#0F766E",
      backgroundColor:
        "#F0FDF9",
    },

    inventoryChoiceTitle: {
      color: "#0F172A",
      fontSize: 11.5,
      fontWeight: "900",
    },

    inventoryChoiceTitleActive: {
      color: "#0F766E",
    },

    inventoryChoiceMeta: {
      marginTop: 2,
      color: "#64748B",
      fontSize: 9.5,
    },

    modalActions: {
      marginTop: 16,
      flexDirection: "row",
      justifyContent:
        "flex-end",
      gap: 8,
      flexWrap: "wrap",
    },

    modalSecondary: {
      minHeight: 42,
      minWidth: 100,
      alignItems: "center",
      justifyContent:
        "center",
      paddingHorizontal: 13,
      borderRadius: 9,
      borderWidth: 1,
      borderColor:
        "#CBD5E1",
      backgroundColor:
        "#FFFFFF",
    },

    modalSecondaryText: {
      color: "#475569",
      fontSize: 10.5,
      fontWeight: "900",
    },

    modalPrimary: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: 9,
      backgroundColor:
        "#0F766E",
    },

    modalPrimaryText: {
      color: "#FFFFFF",
      fontSize: 10.5,
      fontWeight: "900",
    },
  });
