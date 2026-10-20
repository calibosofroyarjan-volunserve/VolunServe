import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useUserSession } from "../../lib/useUserSession";
const BACKEND_URL = "https://volunserve.onrender.com";
type Personnel = {
  uid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  department: string;
  position: string;
  employeeId: string;
  capabilities: string[];
  verificationStatus: string;
  verificationMethod: string;
  verificationReference: string;
  verificationNotes: string;
  verifiedAt: string;
  verifiedBy: string;
  verifiedByName: string;
  verifiedByEmail: string;
  employmentStatus: string;
  isTestAccount: boolean;
  dutyStatus: string;
  availabilityStatus: string;
  activeCaseId: string;
  activeAssignmentId: string;
  shiftDate: string;
};
type CreateResult = {
  uid: string;
  fullName: string;
  email: string;
  temporaryPassword: string;
  employeeId: string;
  department: string;
  position: string;
};
type ResetResult = {
  uid: string;
  fullName: string;
  email: string;
  temporaryPassword: string;
  employeeId: string;
};
const emptyForm = {
  fullName: "",
  department: "",
  position: "",
  employeeId: "TEST-LGU-001",
  phoneNumber: "",
  capabilities: "",
};
const emptyRealForm = {
  fullName: "",
  email: "",
  department: "",
  position: "",
  employeeId: "",
  phoneNumber: "",
  capabilities: "",
  verificationReference: "",
  verificationNotes: "",
};
const emptyManageForm = {
  fullName: "",
  phoneNumber: "",
  department: "",
  position: "",
  capabilities: "",
};
type AccessAction = "suspended" | "inactive" | "active";
const statusLabel = (value: string) => String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const verificationMethodLabel = (value: string) => {
  if (value === "admin_lgu_staff_verification") return "Admin LGU Staff Verification";
  return statusLabel(value || "verified");
};
const formatVerificationDate = (value: string) => {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return parsed.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
};
export default function LguMembersScreen() {
  const { user } = useUserSession();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState<CreateResult | null>(null);
  const [showRealCreate, setShowRealCreate] = useState(false);
  const [creatingReal, setCreatingReal] = useState(false);
  const [realForm, setRealForm] = useState(emptyRealForm);
  const [realError, setRealError] = useState("");
  const [realCredentials, setRealCredentials] = useState<CreateResult | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetTarget, setResetTarget] = useState<Personnel | null>(null);
  const [resetCredentials, setResetCredentials] = useState<ResetResult | null>(null);
  const [resetError, setResetError] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [manageTarget, setManageTarget] = useState<Personnel | null>(null);
  const [manageForm, setManageForm] = useState(emptyManageForm);
  const [manageEditing, setManageEditing] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState("");
  const [showAccessConfirm, setShowAccessConfirm] = useState(false);
  const [accessAction, setAccessAction] = useState<AccessAction>("suspended");
  const [accessReason, setAccessReason] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const secureRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!user) throw new Error("Admin session is not available.");
    const token = await user.getIdToken(true);
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || `Request failed with HTTP ${response.status}.`);
    return result;
  }, [user]);
  const loadPersonnel = useCallback(async (quiet = false) => {
    if (!user) return;
    quiet ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const result = await secureRequest("/api/admin/lgu/personnel");
      setPersonnel(Array.isArray(result?.personnel) ? result.personnel : []);
    } catch (nextError: any) {
      setError(nextError?.message || "Unable to load LGU Personnel.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [secureRequest, user]);
  useEffect(() => {
    void loadPersonnel();
  }, [loadPersonnel]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return personnel;
    return personnel.filter((item) =>
      [item.fullName, item.employeeId, item.department, item.position, item.email]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [personnel, search]);
  const stats = useMemo(() => ({
    total: personnel.length,
    onDuty: personnel.filter((item) => item.dutyStatus === "on_duty").length,
    available: personnel.filter((item) => item.availabilityStatus === "available").length,
    testAccounts: personnel.filter((item) => item.isTestAccount).length,
  }), [personnel]);
  const openManagePersonnel = (item: Personnel) => {
    setManageTarget(item);
    setManageForm({
      fullName: item.fullName || "",
      phoneNumber: item.phoneNumber || "",
      department: item.department || "",
      position: item.position || "",
      capabilities: Array.isArray(item.capabilities)
        ? item.capabilities.join(", ")
        : "",
    });
    setManageEditing(false);
    setManageSaving(false);
    setManageError("");
    setAccessReason("");
    setShowAccessConfirm(false);
    setShowManage(true);
  };

  const savePersonnelChanges = async () => {
    if (
      !manageTarget ||
      manageTarget.isTestAccount ||
      manageSaving
    ) {
      return;
    }

    setManageError("");
    setManageSaving(true);

    try {
      const capabilities = manageForm.capabilities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await secureRequest(
        `/api/admin/lgu/personnel/${encodeURIComponent(
          manageTarget.uid
        )}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            fullName: manageForm.fullName,
            phoneNumber: manageForm.phoneNumber,
            department: manageForm.department,
            position: manageForm.position,
            capabilities,
          }),
        }
      );

      await loadPersonnel(true);

      setManageTarget((current) =>
        current
          ? {
              ...current,
              fullName: manageForm.fullName.trim(),
              phoneNumber: manageForm.phoneNumber.trim(),
              department: manageForm.department.trim(),
              position: manageForm.position.trim(),
              capabilities,
            }
          : current
      );

      setManageEditing(false);
    } catch (nextError: any) {
      setManageError(
        nextError?.message ||
          "Unable to update LGU Personnel information."
      );
    } finally {
      setManageSaving(false);
    }
  };

  const openAccessAction = (action: AccessAction) => {
    setAccessAction(action);
    setAccessReason("");
    setManageError("");
    setShowAccessConfirm(true);
  };

  const applyAccessAction = async () => {
    if (!manageTarget || manageTarget.isTestAccount || accessBusy) {
      return;
    }

    if (
      accessAction !== "active" &&
      accessReason.trim().length < 3
    ) {
      setManageError(
        "Enter a short reason before suspending or deactivating this account."
      );
      return;
    }

    setAccessBusy(true);
    setManageError("");

    try {
      await secureRequest(
        `/api/admin/lgu/personnel/${encodeURIComponent(
          manageTarget.uid
        )}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            employmentStatus: accessAction,
            reason: accessReason.trim(),
          }),
        }
      );

      await loadPersonnel(true);

      setManageTarget((current) =>
        current
          ? {
              ...current,
              employmentStatus: accessAction,
              dutyStatus: "off_duty",
              availabilityStatus: "unavailable",
              activeCaseId: "",
              activeAssignmentId: "",
            }
          : current
      );

      setShowAccessConfirm(false);
      setAccessReason("");
    } catch (nextError: any) {
      setManageError(
        nextError?.message ||
          "Unable to update LGU Personnel access."
      );
    } finally {
      setAccessBusy(false);
    }
  };

  const createRealPersonnel = async () => {
    if (creatingReal) return;
    setRealError("");
    setCreatingReal(true);
    try {
      const capabilities = realForm.capabilities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const result = await secureRequest("/api/admin/lgu/personnel", {
        method: "POST",
        body: JSON.stringify({
          fullName: realForm.fullName,
          email: realForm.email,
          department: realForm.department,
          position: realForm.position,
          employeeId: realForm.employeeId,
          phoneNumber: realForm.phoneNumber,
          capabilities,
          verificationReference: realForm.verificationReference,
          verificationNotes: realForm.verificationNotes,
        }),
      });
      setRealCredentials({
        uid: String(result.uid || ""),
        fullName: String(result.fullName || ""),
        email: String(result.email || ""),
        temporaryPassword: String(result.temporaryPassword || ""),
        employeeId: String(result.employeeId || ""),
        department: String(result.department || ""),
        position: String(result.position || ""),
      });
      setRealForm(emptyRealForm);
      await loadPersonnel(true);
    } catch (nextError: any) {
      setRealError(
        nextError?.message ||
          "Unable to create verified LGU Personnel."
      );
    } finally {
      setCreatingReal(false);
    }
  };
  const createTestPersonnel = async () => {
    if (creating) return;
    setError("");
    setCreating(true);
    try {
      const capabilities = form.capabilities.split(",").map((item) => item.trim()).filter(Boolean);
      const result = await secureRequest("/api/admin/lgu/test-personnel", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName,
          department: form.department,
          position: form.position,
          employeeId: form.employeeId,
          phoneNumber: form.phoneNumber,
          capabilities,
        }),
      });
      setCredentials({
        uid: String(result.uid || ""),
        fullName: String(result.fullName || ""),
        email: String(result.email || ""),
        temporaryPassword: String(result.temporaryPassword || ""),
        employeeId: String(result.employeeId || ""),
        department: String(result.department || ""),
        position: String(result.position || ""),
      });
      setForm(emptyForm);
      await loadPersonnel(true);
    } catch (nextError: any) {
      setError(nextError?.message || "Unable to create TEST LGU Personnel.");
    } finally {
      setCreating(false);
    }
  };
  const openResetPassword = (item: Personnel) => {
    setResetTarget(item);
    setResetCredentials(null);
    setResetError("");
    setShowReset(true);
  };
  const resetTestPassword = async () => {
    if (!resetTarget || resetting) return;
    setResetError("");
    setResetting(true);
    try {
      const result = await secureRequest(
        `/api/admin/lgu/test-personnel/${encodeURIComponent(resetTarget.uid)}/reset-password`,
        {
          method: "POST",
        },
      );
      setResetCredentials({
        uid: String(result.uid || resetTarget.uid),
        fullName: String(result.fullName || resetTarget.fullName || ""),
        email: String(result.email || resetTarget.email || ""),
        temporaryPassword: String(result.temporaryPassword || ""),
        employeeId: String(result.employeeId || resetTarget.employeeId || ""),
      });
      await loadPersonnel(true);
    } catch (nextError: any) {
      setResetError(nextError?.message || "Unable to reset the TEST LGU Personnel password.");
    } finally {
      setResetting(false);
    }
  };
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LGU PERSONNEL</Text>
          <Text style={styles.title}>LGU Members</Text>
          <Text style={styles.subtitle}>Verified LGU employees available to the VolunServe emergency workflow. Real staff accounts are Admin-created after employee verification; TEST accounts remain separate for development and thesis demonstration.</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.testHeaderButton}
            activeOpacity={0.84}
            onPress={() => {
              setCredentials(null);
              setError("");
              setShowCreate(true);
            }}
          >
            <Ionicons name="flask-outline" size={16} color="#475569" />
            <Text style={styles.testHeaderButtonText}>Add Test Account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.86}
            onPress={() => {
              setRealCredentials(null);
              setRealError("");
              setShowRealCreate(true);
            }}
          >
            <Ionicons name="person-add-outline" size={17} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Add LGU Personnel</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCard}><Text style={styles.statValue}>{stats.total}</Text><Text style={styles.statLabel}>Total Personnel</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{stats.onDuty}</Text><Text style={styles.statLabel}>On Duty</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{stats.available}</Text><Text style={styles.statLabel}>Available</Text></View>
        <View style={styles.statCard}><Text style={styles.statValue}>{stats.testAccounts}</Text><Text style={styles.statLabel}>Test Accounts</Text></View>
      </View>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color="#94A3B8" />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search name, employee ID, department..." placeholderTextColor="#94A3B8" style={styles.searchInput} />
        </View>
        <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.84} onPress={() => void loadPersonnel(true)}>
          <Ionicons name="refresh-outline" size={17} color="#334155" />
          <Text style={styles.secondaryButtonText}>{refreshing ? "Refreshing..." : "Refresh"}</Text>
        </TouchableOpacity>
      </View>
      {!!error && !showCreate && !showRealCreate && !showReset && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color="#B91C1C" /><Text style={styles.errorText}>{error}</Text></View>}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colName]}>PERSONNEL</Text>
          <Text style={[styles.th, styles.colId]}>EMPLOYEE ID</Text>
          <Text style={[styles.th, styles.colDepartment]}>DEPARTMENT / POSITION</Text>
          <Text style={[styles.th, styles.colStatus]}>VERIFICATION</Text>
          <Text style={[styles.th, styles.colDuty]}>DUTY</Text>
          <Text style={[styles.th, styles.colAvailability]}>AVAILABILITY</Text>
          <Text style={[styles.th, styles.colAction]}>ACTION</Text>
        </View>
        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator color="#0F766E" /><Text style={styles.emptyText}>Loading LGU Personnel...</Text></View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}><Ionicons name="people-outline" size={28} color="#94A3B8" /><Text style={styles.emptyTitle}>No LGU Personnel found</Text><Text style={styles.emptyText}>Add a verified LGU staff account or create a clearly marked TEST account for demonstration.</Text></View>
        ) : (
          filtered.map((item) => (
            <View key={item.uid} style={styles.tableRow}>
              <View style={[styles.cell, styles.colName]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.fullName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || "LG"}</Text></View>
                <View style={styles.nameCopy}>
                  <View style={styles.nameLine}><Text style={styles.name} numberOfLines={1}>{item.fullName || "Unnamed Personnel"}</Text>{item.isTestAccount && <View style={styles.testBadge}><Text style={styles.testBadgeText}>TEST</Text></View>}</View>
                  <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                </View>
              </View>
              <View style={[styles.cell, styles.colId]}><Text style={styles.bodyStrong}>{item.employeeId}</Text></View>
              <View style={[styles.cell, styles.colDepartment]}><Text style={styles.bodyStrong}>{item.department}</Text><Text style={styles.bodyMuted}>{item.position}</Text></View>
              <View style={[styles.cell, styles.colStatus]}>
                <View style={styles.successChip}>
                  <Text style={styles.successChipText}>
                    {statusLabel(item.verificationStatus)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.employmentChip,
                    item.employmentStatus === "active"
                      ? styles.employmentActive
                      : item.employmentStatus === "suspended"
                        ? styles.employmentSuspended
                        : styles.employmentInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.employmentChipText,
                      item.employmentStatus === "active"
                        ? styles.employmentActiveText
                        : item.employmentStatus === "suspended"
                          ? styles.employmentSuspendedText
                          : styles.employmentInactiveText,
                    ]}
                  >
                    {statusLabel(item.employmentStatus || "active")}
                  </Text>
                </View>
              </View>
              <View style={[styles.cell, styles.colDuty]}><View style={item.dutyStatus === "on_duty" ? styles.infoChip : styles.neutralChip}><Text style={item.dutyStatus === "on_duty" ? styles.infoChipText : styles.neutralChipText}>{statusLabel(item.dutyStatus)}</Text></View></View>
              <View style={[styles.cell, styles.colAvailability]}><View style={item.availabilityStatus === "available" ? styles.successChip : item.availabilityStatus === "unavailable" ? styles.neutralChip : styles.warningChip}><Text style={item.availabilityStatus === "available" ? styles.successChipText : item.availabilityStatus === "unavailable" ? styles.neutralChipText : styles.warningChipText}>{statusLabel(item.availabilityStatus)}</Text></View></View>
              <View style={[styles.cell, styles.colAction]}>
                <View style={styles.actionStack}>
                  <TouchableOpacity
                    style={styles.manageButton}
                    activeOpacity={0.82}
                    onPress={() => openManagePersonnel(item)}
                  >
                    <Ionicons
                      name={item.isTestAccount ? "eye-outline" : "settings-outline"}
                      size={14}
                      color="#0F766E"
                    />
                    <Text style={styles.manageButtonText}>
                      {item.isTestAccount ? "View" : "Manage"}
                    </Text>
                  </TouchableOpacity>
                  {item.isTestAccount && (
                    <TouchableOpacity
                      style={styles.resetButton}
                      activeOpacity={0.82}
                      onPress={() => openResetPassword(item)}
                    >
                      <Ionicons name="key-outline" size={14} color="#92400E" />
                      <Text style={styles.resetButtonText}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))
        )}
      </View>
      <Modal
        visible={showManage}
        transparent
        animationType="fade"
        onRequestClose={() =>
          !manageSaving && !accessBusy && setShowManage(false)
        }
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() =>
              !manageSaving && !accessBusy && setShowManage(false)
            }
          />
          <View style={styles.manageModalCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.manageModalContent}
            >
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalEyebrow}>
                    {manageTarget?.isTestAccount
                      ? "TEST LGU PERSONNEL"
                      : "LGU PERSONNEL MANAGEMENT"}
                  </Text>
                  <Text style={styles.modalTitle}>
                    {manageTarget?.fullName || "LGU Personnel"}
                  </Text>
                  <Text style={styles.manageIdentityLine}>
                    {manageTarget?.employeeId || "—"} ·{" "}
                    {manageTarget?.email || "—"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  disabled={manageSaving || accessBusy}
                  onPress={() => setShowManage(false)}
                >
                  <Ionicons name="close" size={20} color="#475569" />
                </TouchableOpacity>
              </View>

              {manageTarget && (
                <>
                  <View style={styles.manageStatusRow}>
                    <View style={styles.manageStatusCard}>
                      <Text style={styles.credentialLabel}>
                        EMPLOYMENT
                      </Text>
                      <Text style={styles.manageStatusValue}>
                        {statusLabel(
                          manageTarget.employmentStatus || "active"
                        )}
                      </Text>
                    </View>
                    <View style={styles.manageStatusCard}>
                      <Text style={styles.credentialLabel}>DUTY</Text>
                      <Text style={styles.manageStatusValue}>
                        {statusLabel(manageTarget.dutyStatus)}
                      </Text>
                    </View>
                    <View style={styles.manageStatusCard}>
                      <Text style={styles.credentialLabel}>
                        AVAILABILITY
                      </Text>
                      <Text style={styles.manageStatusValue}>
                        {statusLabel(manageTarget.availabilityStatus)}
                      </Text>
                    </View>
                  </View>

                  {manageTarget.isTestAccount ? (
                    <View style={styles.testViewNotice}>
                      <Ionicons
                        name="flask-outline"
                        size={19}
                        color="#4F46E5"
                      />
                      <Text style={styles.testViewNoticeText}>
                        This is a TEST account. Profile editing and employment
                        access controls are intentionally disabled here.
                        Use Reset Password for TEST credential recovery.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.manageSection}>
                        <View style={styles.manageSectionHeader}>
                          <View>
                            <Text style={styles.manageSectionEyebrow}>
                              STAFF INFORMATION
                            </Text>
                            <Text style={styles.manageSectionTitle}>
                              Personnel Profile
                            </Text>
                          </View>
                          {!manageEditing && (
                            <TouchableOpacity
                              style={styles.editButton}
                              onPress={() => setManageEditing(true)}
                            >
                              <Ionicons
                                name="create-outline"
                                size={15}
                                color="#0F766E"
                              />
                              <Text style={styles.editButtonText}>
                                Edit
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        <View style={styles.identityLockNotice}>
                          <Ionicons
                            name="lock-closed-outline"
                            size={17}
                            color="#475569"
                          />
                          <Text style={styles.identityLockText}>
                            Employee ID and login email are locked identity
                            fields. Edit operational staff information below.
                          </Text>
                        </View>

                        <View style={styles.formGrid}>
                          <View style={styles.fieldHalf}>
                            <Text style={styles.fieldLabel}>
                              Full Name
                            </Text>
                            <TextInput
                              editable={manageEditing && !manageSaving}
                              value={manageForm.fullName}
                              onChangeText={(value) =>
                                setManageForm((current) => ({
                                  ...current,
                                  fullName: value,
                                }))
                              }
                              style={[
                                styles.input,
                                !manageEditing && styles.readOnlyInput,
                              ]}
                            />
                          </View>
                          <View style={styles.fieldHalf}>
                            <Text style={styles.fieldLabel}>
                              Phone Number
                            </Text>
                            <TextInput
                              editable={manageEditing && !manageSaving}
                              value={manageForm.phoneNumber}
                              onChangeText={(value) =>
                                setManageForm((current) => ({
                                  ...current,
                                  phoneNumber: value,
                                }))
                              }
                              keyboardType="phone-pad"
                              style={[
                                styles.input,
                                !manageEditing && styles.readOnlyInput,
                              ]}
                            />
                          </View>
                          <View style={styles.fieldHalf}>
                            <Text style={styles.fieldLabel}>
                              Department / Unit
                            </Text>
                            <TextInput
                              editable={manageEditing && !manageSaving}
                              value={manageForm.department}
                              onChangeText={(value) =>
                                setManageForm((current) => ({
                                  ...current,
                                  department: value,
                                }))
                              }
                              style={[
                                styles.input,
                                !manageEditing && styles.readOnlyInput,
                              ]}
                            />
                          </View>
                          <View style={styles.fieldHalf}>
                            <Text style={styles.fieldLabel}>
                              Position / Role
                            </Text>
                            <TextInput
                              editable={manageEditing && !manageSaving}
                              value={manageForm.position}
                              onChangeText={(value) =>
                                setManageForm((current) => ({
                                  ...current,
                                  position: value,
                                }))
                              }
                              style={[
                                styles.input,
                                !manageEditing && styles.readOnlyInput,
                              ]}
                            />
                          </View>
                          <View style={styles.fieldWide}>
                            <Text style={styles.fieldLabel}>
                              Response Skills / Capabilities
                            </Text>
                            <TextInput
                              editable={manageEditing && !manageSaving}
                              value={manageForm.capabilities}
                              onChangeText={(value) =>
                                setManageForm((current) => ({
                                  ...current,
                                  capabilities: value,
                                }))
                              }
                              placeholder="Search and Rescue, First Aid, Evacuation"
                              placeholderTextColor="#94A3B8"
                              style={[
                                styles.input,
                                !manageEditing && styles.readOnlyInput,
                              ]}
                            />
                          </View>
                        </View>

                        {manageEditing && (
                          <View style={styles.manageEditActions}>
                            <TouchableOpacity
                              style={styles.cancelButton}
                              disabled={manageSaving}
                              onPress={() => {
                                setManageForm({
                                  fullName: manageTarget.fullName || "",
                                  phoneNumber:
                                    manageTarget.phoneNumber || "",
                                  department:
                                    manageTarget.department || "",
                                  position: manageTarget.position || "",
                                  capabilities: Array.isArray(
                                    manageTarget.capabilities
                                  )
                                    ? manageTarget.capabilities.join(", ")
                                    : "",
                                });
                                setManageEditing(false);
                                setManageError("");
                              }}
                            >
                              <Text style={styles.cancelButtonText}>
                                Cancel
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.primaryButton,
                                manageSaving && styles.disabledButton,
                              ]}
                              disabled={manageSaving}
                              onPress={() => void savePersonnelChanges()}
                            >
                              {manageSaving ? (
                                <ActivityIndicator
                                  size="small"
                                  color="#FFFFFF"
                                />
                              ) : (
                                <>
                                  <Ionicons
                                    name="save-outline"
                                    size={16}
                                    color="#FFFFFF"
                                  />
                                  <Text style={styles.primaryButtonText}>
                                    Save Changes
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      <View style={styles.verificationSection}>
                        <View style={styles.verificationSectionHeader}>
                          <View>
                            <Text style={styles.manageSectionEyebrow}>STAFF VERIFICATION</Text>
                            <Text style={styles.manageSectionTitle}>Verification Record</Text>
                          </View>
                          <View style={styles.verificationStatusBadge}>
                            <Ionicons name="shield-checkmark-outline" size={14} color="#047857" />
                            <Text style={styles.verificationStatusBadgeText}>
                              {statusLabel(manageTarget.verificationStatus || "verified")}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.verificationDescription}>
                          Audit metadata showing how this LGU staff account was confirmed before responder access was granted.
                        </Text>
                        <View style={styles.verificationGrid}>
                          <View style={styles.verificationItem}>
                            <Text style={styles.verificationLabel}>METHOD</Text>
                            <Text style={styles.verificationValue}>{verificationMethodLabel(manageTarget.verificationMethod)}</Text>
                          </View>
                          <View style={styles.verificationItem}>
                            <Text style={styles.verificationLabel}>VERIFIED AT</Text>
                            <Text style={styles.verificationValue}>{formatVerificationDate(manageTarget.verifiedAt)}</Text>
                          </View>
                          <View style={styles.verificationItem}>
                            <Text style={styles.verificationLabel}>VERIFIED BY</Text>
                            <Text style={styles.verificationValue}>
                              {manageTarget.verifiedByName || manageTarget.verifiedByEmail || manageTarget.verifiedBy || "Admin / LGU Coordinator"}
                            </Text>
                            {!!manageTarget.verifiedByEmail && <Text style={styles.verificationMeta}>{manageTarget.verifiedByEmail}</Text>}
                          </View>
                          <View style={styles.verificationItem}>
                            <Text style={styles.verificationLabel}>REFERENCE / SOURCE</Text>
                            <Text style={styles.verificationValue}>
                              {manageTarget.verificationReference || "No verification reference recorded"}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.verificationNotesBox}>
                          <Text style={styles.verificationLabel}>VERIFICATION NOTES</Text>
                          <Text style={styles.verificationNotesText}>
                            {manageTarget.verificationNotes ||
                              (manageTarget.verificationReference
                                ? "No additional verification notes."
                                : "This account predates the verification-audit upgrade. Existing access remains unchanged.")}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.accessSection}>
                        <Text style={styles.manageSectionEyebrow}>
                          ACCOUNT ACCESS
                        </Text>
                        <Text style={styles.manageSectionTitle}>
                          Employment Access
                        </Text>
                        <Text style={styles.accessDescription}>
                          Suspend access for a temporary restriction, or
                          deactivate the account when the staff member is no
                          longer active in the LGU. Attendance and emergency
                          history are preserved.
                        </Text>

                        {manageTarget.employmentStatus === "active" ? (
                          <View style={styles.accessActionRow}>
                            <TouchableOpacity
                              style={styles.suspendButton}
                              onPress={() =>
                                openAccessAction("suspended")
                              }
                            >
                              <Ionicons
                                name="pause-circle-outline"
                                size={16}
                                color="#B54708"
                              />
                              <Text style={styles.suspendButtonText}>
                                Suspend Access
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.deactivateButton}
                              onPress={() =>
                                openAccessAction("inactive")
                              }
                            >
                              <Ionicons
                                name="person-remove-outline"
                                size={16}
                                color="#B42318"
                              />
                              <Text style={styles.deactivateButtonText}>
                                Deactivate Staff
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.reactivateButton}
                            onPress={() => openAccessAction("active")}
                          >
                            <Ionicons
                              name="refresh-circle-outline"
                              size={17}
                              color="#FFFFFF"
                            />
                            <Text style={styles.reactivateButtonText}>
                              Reactivate Staff Access
                            </Text>
                          </TouchableOpacity>
                        )}

                        {(manageTarget.dutyStatus === "on_duty" ||
                          ["assigned", "responding", "on_site"].includes(
                            manageTarget.availabilityStatus
                          )) && (
                          <View style={styles.dutyProtectionNotice}>
                            <Ionicons
                              name="shield-outline"
                              size={17}
                              color="#175CD3"
                            />
                            <Text style={styles.dutyProtectionText}>
                              Access cannot be suspended or deactivated while
                              this personnel is On Duty or handling an active
                              emergency. Complete the response and Time Out
                              first.
                            </Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}

                  {!!manageError && (
                    <View style={styles.errorBanner}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={18}
                        color="#B91C1C"
                      />
                      <Text style={styles.errorText}>
                        {manageError}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAccessConfirm}
        transparent
        animationType="fade"
        onRequestClose={() =>
          !accessBusy && setShowAccessConfirm(false)
        }
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() =>
              !accessBusy && setShowAccessConfirm(false)
            }
          />
          <View style={styles.confirmModalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalEyebrow}>
                  ACCOUNT ACCESS CONFIRMATION
                </Text>
                <Text style={styles.modalTitle}>
                  {accessAction === "active"
                    ? "Reactivate Staff"
                    : accessAction === "suspended"
                      ? "Suspend Staff Access"
                      : "Deactivate Staff"}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                disabled={accessBusy}
                onPress={() => setShowAccessConfirm(false)}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              {accessAction === "active"
                ? "This will restore login access and allow the staff member to Time In again."
                : accessAction === "suspended"
                  ? "This temporarily blocks login and LGU duty access. Historical records remain unchanged."
                  : "This marks the staff member inactive and blocks login and LGU duty access. Historical records remain unchanged."}
            </Text>

            {accessAction !== "active" && (
              <View>
                <Text style={styles.fieldLabel}>Reason *</Text>
                <TextInput
                  value={accessReason}
                  onChangeText={setAccessReason}
                  editable={!accessBusy}
                  multiline
                  maxLength={700}
                  placeholder={
                    accessAction === "suspended"
                      ? "Example: Temporary administrative suspension"
                      : "Example: No longer assigned to LGU response operations"
                  }
                  placeholderTextColor="#94A3B8"
                  style={[styles.input, styles.reasonInput]}
                />
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                disabled={accessBusy}
                onPress={() => setShowAccessConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  accessAction === "active"
                    ? styles.reactivateConfirmButton
                    : accessAction === "suspended"
                      ? styles.suspendConfirmButton
                      : styles.deactivateConfirmButton,
                  accessBusy && styles.disabledButton,
                ]}
                disabled={accessBusy}
                onPress={() => void applyAccessAction()}
              >
                {accessBusy ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <Text style={styles.accessConfirmText}>
                    {accessAction === "active"
                      ? "Reactivate Access"
                      : accessAction === "suspended"
                        ? "Suspend Access"
                        : "Deactivate Staff"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showRealCreate} transparent animationType="fade" onRequestClose={() => !creatingReal && setShowRealCreate(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => !creatingReal && setShowRealCreate(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>VERIFIED LGU STAFF</Text>
                <Text style={styles.modalTitle}>{realCredentials ? "LGU Personnel Account Created" : "Add LGU Personnel"}</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} disabled={creatingReal} onPress={() => !creatingReal && setShowRealCreate(false)}><Ionicons name="close" size={20} color="#475569" /></TouchableOpacity>
            </View>
            {realCredentials ? (
              <View>
                <View style={styles.successNotice}><Ionicons name="checkmark-circle" size={20} color="#047857" /><Text style={styles.successNoticeText}>Verified LGU Personnel account created successfully. Save the temporary password now and share it securely with the staff member. For future password changes, the staff member should use Forgot Password with this real email address.</Text></View>
                <View style={styles.credentialsGrid}>
                  <View style={styles.credentialBox}><Text style={styles.credentialLabel}>NAME</Text><Text selectable style={styles.credentialValue}>{realCredentials.fullName}</Text></View>
                  <View style={styles.credentialBox}><Text style={styles.credentialLabel}>EMPLOYEE ID</Text><Text selectable style={styles.credentialValue}>{realCredentials.employeeId}</Text></View>
                  <View style={styles.credentialBoxWide}><Text style={styles.credentialLabel}>LOGIN EMAIL</Text><Text selectable style={styles.credentialValue}>{realCredentials.email}</Text></View>
                  <View style={styles.passwordBox}><Text style={styles.credentialLabel}>TEMPORARY PASSWORD</Text><Text selectable style={styles.passwordValue}>{realCredentials.temporaryPassword}</Text></View>
                </View>
                <View style={styles.realAccountNotice}><Ionicons name="shield-checkmark-outline" size={18} color="#175CD3" /><Text style={styles.realAccountNoticeText}>This is a real LGU Personnel account, not a Resident account and not a TEST account. A server-timestamped staff verification audit record was saved with the account.</Text></View>
                <View style={styles.modalActions}><TouchableOpacity style={styles.primaryButton} onPress={() => setShowRealCreate(false)}><Text style={styles.primaryButtonText}>Done</Text></TouchableOpacity></View>
              </View>
            ) : (
              <View>
                <Text style={styles.modalDescription}>Create this account only after confirming that the person is an authorized employee or field responder of the target LGU. This is staff verification, not a job application.</Text>
                <View style={styles.realVerificationNotice}><Ionicons name="information-circle-outline" size={18} color="#175CD3" /><Text style={styles.realVerificationNoticeText}>Use the employee's real working email because login and Forgot Password will use this address. Record the LGU verification source used to confirm the employee before creating the account. Do not use @volunserve.test for real staff.</Text></View>
                <View style={styles.formGrid}>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Full Name</Text><TextInput value={realForm.fullName} onChangeText={(value) => setRealForm((current) => ({ ...current, fullName: value }))} placeholder="Employee full name" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Employee ID</Text><TextInput value={realForm.employeeId} onChangeText={(value) => setRealForm((current) => ({ ...current, employeeId: value.toUpperCase() }))} placeholder="LGU employee ID" placeholderTextColor="#94A3B8" autoCapitalize="characters" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Working Email</Text><TextInput value={realForm.email} onChangeText={(value) => setRealForm((current) => ({ ...current, email: value.trim().toLowerCase() }))} placeholder="employee\@example.gov.ph" placeholderTextColor="#94A3B8" autoCapitalize="none" keyboardType="email-address" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Phone Number <Text style={styles.optionalText}>optional</Text></Text><TextInput value={realForm.phoneNumber} onChangeText={(value) => setRealForm((current) => ({ ...current, phoneNumber: value }))} placeholder="09XXXXXXXXX" placeholderTextColor="#94A3B8" keyboardType="phone-pad" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Department / Unit</Text><TextInput value={realForm.department} onChangeText={(value) => setRealForm((current) => ({ ...current, department: value }))} placeholder="DRRMO / City Health / Engineering" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Position / Role</Text><TextInput value={realForm.position} onChangeText={(value) => setRealForm((current) => ({ ...current, position: value }))} placeholder="Rescue Officer" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldWide}><Text style={styles.fieldLabel}>Response Skills / Capabilities <Text style={styles.optionalText}>comma separated</Text></Text><TextInput value={realForm.capabilities} onChangeText={(value) => setRealForm((current) => ({ ...current, capabilities: value }))} placeholder="Search and Rescue, First Aid, Evacuation" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldWide}><Text style={styles.fieldLabel}>Verification Reference / Source *</Text><TextInput value={realForm.verificationReference} onChangeText={(value) => setRealForm((current) => ({ ...current, verificationReference: value }))} placeholder="Example: DRRMO personnel roster / office endorsement / employee record" placeholderTextColor="#94A3B8" maxLength={220} style={styles.input} /></View>
                  <View style={styles.fieldWide}><Text style={styles.fieldLabel}>Verification Notes <Text style={styles.optionalText}>optional</Text></Text><TextInput value={realForm.verificationNotes} onChangeText={(value) => setRealForm((current) => ({ ...current, verificationNotes: value }))} placeholder="Record how staff employment or responder authority was confirmed. Avoid unnecessary sensitive ID details." placeholderTextColor="#94A3B8" multiline maxLength={700} style={[styles.input, styles.verificationNotesInput]} /></View>
                </View>
                {!!realError && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color="#B91C1C" /><Text style={styles.errorText}>{realError}</Text></View>}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} disabled={creatingReal} onPress={() => setShowRealCreate(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryButton, creatingReal && styles.disabledButton]} disabled={creatingReal} onPress={() => void createRealPersonnel()}>{creatingReal ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Ionicons name="shield-checkmark-outline" size={16} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Create Verified Staff Account</Text></>}</TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => !creating && setShowCreate(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>TEST ACCOUNT</Text>
                <Text style={styles.modalTitle}>{credentials ? "TEST LGU Account Created" : "Add Test LGU Personnel"}</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => !creating && setShowCreate(false)}><Ionicons name="close" size={20} color="#475569" /></TouchableOpacity>
            </View>
            {credentials ? (
              <View>
                <View style={styles.successNotice}><Ionicons name="checkmark-circle" size={20} color="#047857" /><Text style={styles.successNoticeText}>Account created successfully. Save these credentials now. The temporary password is returned only once.</Text></View>
                <View style={styles.credentialsGrid}>
                  <View style={styles.credentialBox}><Text style={styles.credentialLabel}>NAME</Text><Text selectable style={styles.credentialValue}>{credentials.fullName}</Text></View>
                  <View style={styles.credentialBox}><Text style={styles.credentialLabel}>EMPLOYEE ID</Text><Text selectable style={styles.credentialValue}>{credentials.employeeId}</Text></View>
                  <View style={styles.credentialBoxWide}><Text style={styles.credentialLabel}>LOGIN EMAIL</Text><Text selectable style={styles.credentialValue}>{credentials.email}</Text></View>
                  <View style={styles.passwordBox}><Text style={styles.credentialLabel}>TEMPORARY PASSWORD</Text><Text selectable style={styles.passwordValue}>{credentials.temporaryPassword}</Text></View>
                </View>
                <View style={styles.modalActions}><TouchableOpacity style={styles.primaryButton} onPress={() => setShowCreate(false)}><Text style={styles.primaryButtonText}>Done</Text></TouchableOpacity></View>
              </View>
            ) : (
              <View>
                <Text style={styles.modalDescription}>Use clearly marked TEST data only. This creates a verified test LGU account for development and thesis demonstration.</Text>
                <View style={styles.formGrid}>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Full Name</Text><TextInput value={form.fullName} onChangeText={(value) => setForm((current) => ({ ...current, fullName: value }))} placeholder="Juan Test Responder" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Employee ID</Text><TextInput value={form.employeeId} onChangeText={(value) => setForm((current) => ({ ...current, employeeId: value.toUpperCase() }))} placeholder="TEST-LGU-001" placeholderTextColor="#94A3B8" autoCapitalize="characters" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Department</Text><TextInput value={form.department} onChangeText={(value) => setForm((current) => ({ ...current, department: value }))} placeholder="DRRMO" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Position</Text><TextInput value={form.position} onChangeText={(value) => setForm((current) => ({ ...current, position: value }))} placeholder="Rescue Officer" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Phone Number <Text style={styles.optionalText}>optional</Text></Text><TextInput value={form.phoneNumber} onChangeText={(value) => setForm((current) => ({ ...current, phoneNumber: value }))} placeholder="09XXXXXXXXX" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                  <View style={styles.fieldHalf}><Text style={styles.fieldLabel}>Capabilities <Text style={styles.optionalText}>comma separated</Text></Text><TextInput value={form.capabilities} onChangeText={(value) => setForm((current) => ({ ...current, capabilities: value }))} placeholder="Search and Rescue, First Aid" placeholderTextColor="#94A3B8" style={styles.input} /></View>
                </View>
                {!!error && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color="#B91C1C" /><Text style={styles.errorText}>{error}</Text></View>}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} disabled={creating} onPress={() => setShowCreate(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryButton, creating && styles.disabledButton]} disabled={creating} onPress={() => void createTestPersonnel()}>{creating ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Ionicons name="person-add-outline" size={16} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Create Test Account</Text></>}</TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
      <Modal visible={showReset} transparent animationType="fade" onRequestClose={() => !resetting && setShowReset(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => !resetting && setShowReset(false)} />
          <View style={styles.resetModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>TEST ACCOUNT SECURITY</Text>
                <Text style={styles.modalTitle}>{resetCredentials ? "New Temporary Password" : "Reset TEST LGU Password"}</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} disabled={resetting} onPress={() => !resetting && setShowReset(false)}><Ionicons name="close" size={20} color="#475569" /></TouchableOpacity>
            </View>
            {resetCredentials ? (
              <View>
                <View style={styles.successNotice}><Ionicons name="checkmark-circle" size={20} color="#047857" /><Text style={styles.successNoticeText}>Password reset successfully. Save the new temporary password now. It is shown only in this response.</Text></View>
                <View style={styles.credentialsGrid}>
                  <View style={styles.credentialBoxWide}><Text style={styles.credentialLabel}>PERSONNEL</Text><Text selectable style={styles.credentialValue}>{resetCredentials.fullName}</Text></View>
                  <View style={styles.credentialBox}><Text style={styles.credentialLabel}>EMPLOYEE ID</Text><Text selectable style={styles.credentialValue}>{resetCredentials.employeeId}</Text></View>
                  <View style={styles.credentialBox}><Text style={styles.credentialLabel}>LOGIN EMAIL</Text><Text selectable style={styles.credentialValue}>{resetCredentials.email}</Text></View>
                  <View style={styles.passwordBox}><Text style={styles.credentialLabel}>NEW TEMPORARY PASSWORD</Text><Text selectable style={styles.passwordValue}>{resetCredentials.temporaryPassword}</Text></View>
                </View>
                <View style={styles.modalActions}><TouchableOpacity style={styles.primaryButton} onPress={() => setShowReset(false)}><Text style={styles.primaryButtonText}>Done</Text></TouchableOpacity></View>
              </View>
            ) : (
              <View>
                <Text style={styles.modalDescription}>This action is limited to clearly marked TEST LGU Personnel accounts. It will replace the current Firebase Authentication password and invalidate older refresh sessions.</Text>
                <View style={styles.resetTargetBox}>
                  <Text style={styles.credentialLabel}>TEST LGU PERSONNEL</Text>
                  <Text style={styles.resetTargetName}>{resetTarget?.fullName || "TEST LGU Personnel"}</Text>
                  <Text style={styles.resetTargetMeta}>{resetTarget?.employeeId || ""} • {resetTarget?.email || ""}</Text>
                </View>
                {!!resetError && <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color="#B91C1C" /><Text style={styles.errorText}>{resetError}</Text></View>}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} disabled={resetting} onPress={() => setShowReset(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.resetConfirmButton, resetting && styles.disabledButton]} disabled={resetting} onPress={() => void resetTestPassword()}>{resetting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <><Ionicons name="key-outline" size={16} color="#FFFFFF" /><Text style={styles.resetConfirmButtonText}>Reset Password</Text></>}</TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F7FB" },
  content: { padding: 24, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 18 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#0F766E", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { marginTop: 4, color: "#0F172A", fontSize: 29, fontWeight: "900" },
  subtitle: { marginTop: 6, color: "#64748B", fontSize: 13.5, lineHeight: 20, maxWidth: 760 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  testHeaderButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  testHeaderButtonText: { color: "#475569", fontSize: 11.5, fontWeight: "900" },
  primaryButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 9, backgroundColor: "#0F766E", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" },
  disabledButton: { opacity: 0.65 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: { flex: 1, minHeight: 78, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" },
  statValue: { color: "#0F172A", fontSize: 22, fontWeight: "900" },
  statLabel: { marginTop: 4, color: "#64748B", fontSize: 11.5, fontWeight: "700" },
  toolbar: { minHeight: 58, padding: 10, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 10 },
  searchBox: { flex: 1, minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC", flexDirection: "row", alignItems: "center", paddingHorizontal: 11, gap: 8 },
  searchInput: { flex: 1, color: "#0F172A", fontSize: 12.5, outlineStyle: "none" } as any,
  secondaryButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 6 },
  secondaryButtonText: { color: "#334155", fontSize: 12, fontWeight: "800" },
  errorBanner: { marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2", flexDirection: "row", alignItems: "center", gap: 8 },
  errorText: { flex: 1, color: "#991B1B", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  tableCard: { borderRadius: 13, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", overflow: "hidden" },
  tableHeader: { minHeight: 42, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  tableRow: { minHeight: 66, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EEF2F7" },
  th: { color: "#7C8AA0", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.6 },
  cell: { paddingRight: 10, justifyContent: "center" },
  colName: { width: "22%", flexDirection: "row", alignItems: "center" },
  colId: { width: "13%" },
  colDepartment: { width: "21%" },
  colStatus: { width: "12%" },
  colDuty: { width: "11%" },
  colAvailability: { width: "11%" },
  colAction: { width: "10%", alignItems: "flex-start" },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#E0E7FF", alignItems: "center", justifyContent: "center", marginRight: 9 },
  avatarText: { color: "#4338CA", fontSize: 10.5, fontWeight: "900" },
  nameCopy: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, color: "#0F172A", fontSize: 12.5, fontWeight: "900" },
  email: { marginTop: 3, color: "#94A3B8", fontSize: 10.5 },
  testBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: "#EEF2FF" },
  testBadgeText: { color: "#4F46E5", fontSize: 8.5, fontWeight: "900" },
  bodyStrong: { color: "#334155", fontSize: 11.5, fontWeight: "800" },
  bodyMuted: { marginTop: 3, color: "#64748B", fontSize: 10.5 },
  successChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#ECFDF5" },
  successChipText: { color: "#047857", fontSize: 9.5, fontWeight: "900" },
  infoChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#EFF6FF" },
  infoChipText: { color: "#1D4ED8", fontSize: 9.5, fontWeight: "900" },
  neutralChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#F1F5F9" },
  neutralChipText: { color: "#64748B", fontSize: 9.5, fontWeight: "900" },
  warningChip: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FFF7ED" },
  warningChipText: { color: "#C2410C", fontSize: 9.5, fontWeight: "900" },
  employmentChip: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  employmentChipText: { fontSize: 8.5, fontWeight: "900" },
  employmentActive: { backgroundColor: "#ECFDF5" },
  employmentActiveText: { color: "#047857" },
  employmentSuspended: { backgroundColor: "#FFFAEB" },
  employmentSuspendedText: { color: "#B54708" },
  employmentInactive: { backgroundColor: "#FEF2F2" },
  employmentInactiveText: { color: "#B42318" },
  actionStack: { alignItems: "flex-start", gap: 5 },
  manageButton: { minHeight: 30, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: "#99D5CA", backgroundColor: "#F0FDFA", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  manageButtonText: { color: "#0F766E", fontSize: 9.5, fontWeight: "900" },
  resetButton: { minHeight: 30, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: "#FDE68A", backgroundColor: "#FFFBEB", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  resetButtonText: { color: "#92400E", fontSize: 9.5, fontWeight: "900" },
  notAvailableText: { color: "#94A3B8", fontSize: 11, fontWeight: "700" },
  emptyState: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { marginTop: 8, color: "#334155", fontSize: 14, fontWeight: "900" },
  emptyText: { marginTop: 6, color: "#94A3B8", fontSize: 12, textAlign: "center" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(15,23,42,0.46)" },
  modalCard: { width: "100%", maxWidth: 760, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 20, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 30, elevation: 12 },
  manageModalCard: { width: "100%", maxWidth: 820, maxHeight: "90%", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 30, elevation: 12, overflow: "hidden" },
  manageModalContent: { padding: 20, paddingBottom: 24 },
  confirmModalCard: { width: "100%", maxWidth: 560, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 20, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 30, elevation: 12 },
  manageIdentityLine: { marginTop: 5, color: "#64748B", fontSize: 11.5, lineHeight: 17 },
  manageStatusRow: { marginTop: 16, flexDirection: "row", gap: 9 },
  manageStatusCard: { flex: 1, minHeight: 64, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  manageStatusValue: { marginTop: 5, color: "#0F172A", fontSize: 12.5, fontWeight: "900" },
  manageSection: { marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF" },
  manageSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  manageSectionEyebrow: { color: "#0F766E", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.8 },
  manageSectionTitle: { marginTop: 3, color: "#0F172A", fontSize: 16, fontWeight: "900" },
  editButton: { minHeight: 34, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: "#99D5CA", backgroundColor: "#F0FDFA", flexDirection: "row", alignItems: "center", gap: 5 },
  editButtonText: { color: "#0F766E", fontSize: 10.5, fontWeight: "900" },
  identityLockNotice: { marginTop: 12, marginBottom: 12, padding: 10, borderRadius: 9, backgroundColor: "#F8FAFC", flexDirection: "row", alignItems: "flex-start", gap: 7 },
  identityLockText: { flex: 1, color: "#64748B", fontSize: 10.5, lineHeight: 16 },
  readOnlyInput: { backgroundColor: "#F8FAFC", color: "#64748B" },
  manageEditActions: { marginTop: 12, flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  verificationSection: { marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "#F7FEFA" },
  verificationSectionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  verificationStatusBadge: { minHeight: 28, paddingHorizontal: 9, borderRadius: 999, backgroundColor: "#ECFDF5", flexDirection: "row", alignItems: "center", gap: 5 },
  verificationStatusBadgeText: { color: "#047857", fontSize: 9.5, fontWeight: "900" },
  verificationDescription: { marginTop: 7, color: "#64748B", fontSize: 10.5, lineHeight: 16 },
  verificationGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 9 },
  verificationItem: { width: "48.9%", minHeight: 64, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: "#D1FAE5", backgroundColor: "#FFFFFF" },
  verificationLabel: { color: "#7C8AA0", fontSize: 8.5, fontWeight: "900", letterSpacing: 0.6 },
  verificationValue: { marginTop: 5, color: "#0F172A", fontSize: 11.5, lineHeight: 17, fontWeight: "800" },
  verificationMeta: { marginTop: 3, color: "#64748B", fontSize: 9.5, lineHeight: 14 },
  verificationNotesBox: { marginTop: 9, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: "#D1FAE5", backgroundColor: "#FFFFFF" },
  verificationNotesText: { marginTop: 5, color: "#475569", fontSize: 10.5, lineHeight: 16 },
  accessSection: { marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FAFAFA" },
  accessDescription: { marginTop: 6, color: "#64748B", fontSize: 10.5, lineHeight: 16 },
  accessActionRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suspendButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: "#FEDF89", backgroundColor: "#FFFAEB", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  suspendButtonText: { color: "#B54708", fontSize: 11, fontWeight: "900" },
  deactivateButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: "#FECDCA", backgroundColor: "#FEF3F2", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  deactivateButtonText: { color: "#B42318", fontSize: 11, fontWeight: "900" },
  reactivateButton: { alignSelf: "flex-start", minHeight: 40, marginTop: 12, paddingHorizontal: 14, borderRadius: 9, backgroundColor: "#047857", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  reactivateButtonText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "900" },
  dutyProtectionNotice: { marginTop: 10, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", flexDirection: "row", alignItems: "flex-start", gap: 7 },
  dutyProtectionText: { flex: 1, color: "#1E40AF", fontSize: 10.5, lineHeight: 16 },
  testViewNotice: { marginTop: 16, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#C7D2FE", backgroundColor: "#EEF2FF", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  testViewNoticeText: { flex: 1, color: "#4338CA", fontSize: 11, lineHeight: 17, fontWeight: "600" },
  reasonInput: { minHeight: 86, paddingTop: 10, textAlignVertical: "top" },
  reactivateConfirmButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 9, backgroundColor: "#047857", alignItems: "center", justifyContent: "center" },
  suspendConfirmButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 9, backgroundColor: "#B54708", alignItems: "center", justifyContent: "center" },
  deactivateConfirmButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 9, backgroundColor: "#B42318", alignItems: "center", justifyContent: "center" },
  accessConfirmText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16 },
  modalEyebrow: { color: "#0F766E", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.1 },
  modalTitle: { marginTop: 3, color: "#0F172A", fontSize: 20, fontWeight: "900" },
  closeButton: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  modalDescription: { marginTop: 12, marginBottom: 14, color: "#64748B", fontSize: 12.5, lineHeight: 18 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fieldHalf: { width: "48.9%" },
  fieldWide: { width: "100%" },
  fieldLabel: { marginBottom: 6, color: "#334155", fontSize: 10.5, fontWeight: "900" },
  optionalText: { color: "#94A3B8", fontWeight: "600" },
  input: { minHeight: 40, borderRadius: 9, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", paddingHorizontal: 11, color: "#0F172A", fontSize: 12.5, outlineStyle: "none" } as any,
  verificationNotesInput: { minHeight: 76, paddingTop: 10, textAlignVertical: "top" },
  modalActions: { marginTop: 18, flexDirection: "row", justifyContent: "flex-end", gap: 9 },
  cancelButton: { minHeight: 40, paddingHorizontal: 15, borderRadius: 9, borderWidth: 1, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  cancelButtonText: { color: "#475569", fontSize: 12.5, fontWeight: "800" },
  successNotice: { marginTop: 14, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  successNoticeText: { flex: 1, color: "#065F46", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  realVerificationNotice: { marginBottom: 14, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  realVerificationNoticeText: { flex: 1, color: "#1E40AF", fontSize: 11, lineHeight: 17, fontWeight: "600" },
  realAccountNotice: { marginTop: 12, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  realAccountNoticeText: { flex: 1, color: "#1E40AF", fontSize: 11, lineHeight: 17, fontWeight: "600" },
  credentialsGrid: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  credentialBox: { width: "48.9%", padding: 12, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  credentialBoxWide: { width: "100%", padding: 12, borderRadius: 10, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0" },
  passwordBox: { width: "100%", padding: 12, borderRadius: 10, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" },
  credentialLabel: { color: "#94A3B8", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  credentialValue: { marginTop: 5, color: "#0F172A", fontSize: 12.5, fontWeight: "800" },
  passwordValue: { marginTop: 5, color: "#92400E", fontSize: 14, fontWeight: "900" },
  resetModalCard: { width: "100%", maxWidth: 620, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 20, shadowColor: "#000000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 30, elevation: 12 },
  resetTargetBox: { marginTop: 2, marginBottom: 14, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  resetTargetName: { marginTop: 5, color: "#0F172A", fontSize: 14, fontWeight: "900" },
  resetTargetMeta: { marginTop: 4, color: "#64748B", fontSize: 11.5, lineHeight: 17 },
  resetConfirmButton: { minHeight: 40, paddingHorizontal: 15, borderRadius: 9, backgroundColor: "#B45309", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  resetConfirmButtonText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" },
});
