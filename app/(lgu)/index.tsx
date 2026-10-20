import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from "react-native";
import { db } from "../../lib/firebase";
import { logoutUser } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";
const BACKEND_URL = "https://volunserve.onrender.com";
type LguPersonnel = {
  uid: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  employeeId: string;
  capabilities: string[];
  isTestAccount: boolean;
};
type LguDuty = {
  dutyStatus: string;
  availabilityStatus: string;
  activeCaseId: string;
  activeAssignmentId: string;
  shiftDate: string;
};
type LguMeResponse = {
  ok: boolean;
  personnel: LguPersonnel;
  duty: LguDuty;
};
type LguAssignment = {
  id: string;
  caseId: string;
  personnelUid: string;
  personnelName: string;
  department: string;
  position: string;
  status: string;
  assignedAt?: any;
  acknowledgedAt?: any;
  responseStartedAt?: any;
  arrivedAt?: any;
  completedAt?: any;
};
type EmergencyCase = {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  location: string;
  details: string;
  reporterName: string;
  reporterBarangay: string;
  affectedPeople: number;
  assistanceTypes: string[];
  requiredSkills: string[];
};
const EMPTY_DUTY: LguDuty = {
  dutyStatus: "off_duty",
  availabilityStatus: "unavailable",
  activeCaseId: "",
  activeAssignmentId: "",
  shiftDate: "",
};
function label(value: string) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
function initials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.length
    ? parts.map((part) => part[0]?.toUpperCase()).join("")
    : "LG";
}
export default function LguDashboard() {
  const { loading: sessionLoading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  const desktop = width >= 980;
  const [personnel, setPersonnel] = useState<LguPersonnel | null>(null);
  const [duty, setDuty] = useState<LguDuty>(EMPTY_DUTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<"time-in" | "time-out" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [assignment, setAssignment] = useState<LguAssignment | null>(null);
  const [emergencyCase, setEmergencyCase] = useState<EmergencyCase | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentAction, setAssignmentAction] =
    useState<"acknowledge" | "start-response" | null>(null);
  const [assignmentError, setAssignmentError] = useState("");
  const [situationSummary, setSituationSummary] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [peopleAssisted, setPeopleAssisted] = useState("");
  const [responseOutcome, setResponseOutcome] = useState("");
  const [remainingNeeds, setRemainingNeeds] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionBusy, setCompletionBusy] = useState(false);
  const api = useCallback(
    async (
      path: string,
      method: "GET" | "POST" = "GET",
      body?: Record<string, unknown>
    ) => {
      if (!user) {
        throw new Error("Please sign in again.");
      }
      const token = await user.getIdToken(true);
      const response = await fetch(`${BACKEND_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const raw = await response.text();
      let data: any = {};
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = {};
        }
      }
      if (!response.ok) {
        throw new Error(
          data?.message || `Request failed with status ${response.status}.`
        );
      }
      return data;
    },
    [user]
  );
  const loadActiveAssignment = useCallback(
    async (nextDuty: LguDuty) => {
      if (!user || !nextDuty.activeAssignmentId) {
        setAssignment(null);
        setEmergencyCase(null);
        setAssignmentError("");
        return;
      }
      setAssignmentLoading(true);
      setAssignmentError("");
      try {
        const assignmentSnapshot = await getDoc(
          doc(db, "lguAssignments", nextDuty.activeAssignmentId)
        );
        if (!assignmentSnapshot.exists()) {
          throw new Error("The linked LGU assignment could not be found.");
        }
        const data: any = assignmentSnapshot.data();
        if (String(data.personnelUid || "") !== user.uid) {
          throw new Error("This emergency assignment does not belong to your LGU account.");
        }
        const nextAssignment: LguAssignment = {
          id: assignmentSnapshot.id,
          caseId: String(data.caseId || nextDuty.activeCaseId || ""),
          personnelUid: String(data.personnelUid || ""),
          personnelName: String(data.personnelName || ""),
          department: String(data.department || ""),
          position: String(data.position || ""),
          status: String(data.status || "assigned"),
          assignedAt: data.assignedAt,
          acknowledgedAt: data.acknowledgedAt,
          responseStartedAt: data.responseStartedAt,
          arrivedAt: data.arrivedAt,
          completedAt: data.completedAt,
        };
        setAssignment(nextAssignment);
        if (!nextAssignment.caseId) {
          setEmergencyCase(null);
          return;
        }
        const caseSnapshot = await getDoc(
          doc(db, "disasterCases", nextAssignment.caseId)
        );
        if (!caseSnapshot.exists()) {
          setEmergencyCase(null);
          throw new Error("The emergency case linked to this assignment no longer exists.");
        }
        const caseData: any = caseSnapshot.data();
        setEmergencyCase({
          id: caseSnapshot.id,
          title: String(caseData.title || "Emergency Case"),
          category: String(caseData.category || "Emergency"),
          severity: String(caseData.severity || "medium"),
          status: String(caseData.status || "assigned"),
          location: String(caseData.location || caseData.reporterAddress || ""),
          details: String(caseData.details || ""),
          reporterName: String(caseData.reporterName || "Resident"),
          reporterBarangay: String(caseData.reporterBarangay || ""),
          affectedPeople: Number(caseData.affectedPeople || 0),
          assistanceTypes: Array.isArray(caseData.assistanceTypes)
            ? caseData.assistanceTypes.map(String).filter(Boolean)
            : [],
          requiredSkills: Array.isArray(caseData.requiredSkills)
            ? caseData.requiredSkills.map(String).filter(Boolean)
            : [],
        });
      } catch (err: any) {
        setAssignmentError(
          err?.message || "Unable to load the current emergency assignment."
        );
      } finally {
        setAssignmentLoading(false);
      }
    },
    [user]
  );
  const loadProfile = useCallback(
    async (silent = false) => {
      if (!user) {
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      setError("");
      try {
        const data = (await api("/api/lgu/me")) as LguMeResponse;
        const nextDuty = data.duty || EMPTY_DUTY;
        setPersonnel(data.personnel);
        setDuty(nextDuty);
        await loadActiveAssignment(nextDuty);
      } catch (err: any) {
        setError(err?.message || "Unable to load LGU Personnel profile.");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [api, loadActiveAssignment, user]
  );
  useEffect(() => {
    if (
      !sessionLoading &&
      user &&
      profile?.role === "lgu_personnel"
    ) {
      void loadProfile();
    }
  }, [loadProfile, profile?.role, sessionLoading, user]);
  const refresh = async () => {
    setRefreshing(true);
    setMessage("");
    try {
      await loadProfile(true);
    } finally {
      setRefreshing(false);
    }
  };
  const timeIn = async () => {
    if (action || duty.dutyStatus === "on_duty") {
      return;
    }
    setAction("time-in");
    setMessage("");
    setError("");
    try {
      await api("/api/lgu/duty/time-in", "POST");
      await loadProfile(true);
      setMessage("Time In recorded. You are now On Duty and Available.");
    } catch (err: any) {
      setError(err?.message || "Unable to record Time In.");
    } finally {
      setAction(null);
    }
  };
  const timeOut = async () => {
    if (
      action ||
      duty.dutyStatus !== "on_duty" ||
      duty.availabilityStatus !== "available"
    ) {
      return;
    }
    setAction("time-out");
    setMessage("");
    setError("");
    try {
      await api("/api/lgu/duty/time-out", "POST");
      await loadProfile(true);
      setMessage("Time Out recorded. You are now Off Duty.");
    } catch (err: any) {
      setError(err?.message || "Unable to record Time Out.");
    } finally {
      setAction(null);
    }
  };
  const acknowledgeAssignment = async () => {
    if (
      !user ||
      !assignment ||
      assignment.status !== "assigned" ||
      assignmentAction
    ) {
      return;
    }
    setAssignmentAction("acknowledge");
    setMessage("");
    setError("");
    setAssignmentError("");
    try {
      await api(
        `/api/lgu/assignments/${encodeURIComponent(assignment.id)}/acknowledge`,
        "POST"
      );
      await loadProfile(true);
      setMessage(
        "Assignment acknowledged. Admin can now see that you received the official dispatch."
      );
    } catch (err: any) {
      setAssignmentError(
        err?.message || "Unable to acknowledge the emergency assignment."
      );
    } finally {
      setAssignmentAction(null);
    }
  };
  const startResponse = async () => {
    if (
      !assignment ||
      assignment.status !== "acknowledged" ||
      assignmentAction
    ) {
      return;
    }
    setAssignmentAction("start-response");
    setMessage("");
    setError("");
    setAssignmentError("");
    try {
      await api(
        `/api/lgu/assignments/${encodeURIComponent(assignment.id)}/start-response`,
        "POST"
      );
      await loadProfile(true);
      setMessage(
        "Official response started. Your status is now Responding. Map & Route is the next operational step."
      );
    } catch (err: any) {
      setAssignmentError(
        err?.message || "Unable to start the official emergency response."
      );
    } finally {
      setAssignmentAction(null);
    }
  };
  const completeResponse = async () => {
    if (
      !assignment ||
      assignment.status !== "on_site" ||
      completionBusy
    ) {
      return;
    }

    const summary = situationSummary.trim();
    const actions = actionsTaken.trim();
    const assisted = Number(peopleAssisted);
    const remaining = remainingNeeds.trim();
    const notes = completionNotes.trim();

    if (summary.length < 10) {
      setAssignmentError(
        "Situation Summary must contain at least 10 characters."
      );
      return;
    }

    if (actions.length < 10) {
      setAssignmentError(
        "Actions Taken must contain at least 10 characters."
      );
      return;
    }

    if (
      !Number.isInteger(assisted) ||
      assisted < 0 ||
      assisted > 999
    ) {
      setAssignmentError(
        "People Assisted must be a whole number from 0 to 999."
      );
      return;
    }

    if (!responseOutcome) {
      setAssignmentError("Select the field response outcome.");
      return;
    }

    if (
      ["referred", "needs_follow_up"].includes(responseOutcome) &&
      remaining.length < 3
    ) {
      setAssignmentError(
        "Describe the remaining need or referral before completing the response."
      );
      return;
    }

    setCompletionBusy(true);
    setMessage("");
    setError("");
    setAssignmentError("");

    try {
      await api(
        `/api/lgu/assignments/${encodeURIComponent(assignment.id)}/complete`,
        "POST",
        {
          situationSummary: summary,
          actionsTaken: actions,
          peopleAssisted: assisted,
          outcome: responseOutcome,
          remainingNeeds: remaining,
          notes,
        }
      );

      setSituationSummary("");
      setActionsTaken("");
      setPeopleAssisted("");
      setResponseOutcome("");
      setRemainingNeeds("");
      setCompletionNotes("");

      await loadProfile(true);

      setMessage(
        "Field response completed and submitted for LGU/Admin review. You are Available for assignment again while still On Duty."
      );
    } catch (err: any) {
      setAssignmentError(
        err?.message || "Unable to complete the official field response."
      );
    } finally {
      setCompletionBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await logoutUser();
    } finally {
      router.replace("/login");
    }
  };
  const onDuty = duty.dutyStatus === "on_duty";
  const available = duty.availabilityStatus === "available";
  const activeAssignment = Boolean(
    duty.activeCaseId || duty.activeAssignmentId
  );
  if (sessionLoading || (loading && !personnel)) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingTitle}>Loading LGU Responder Portal</Text>
        <Text style={styles.loadingText}>
          The first request may take longer if the backend is waking up.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.pageContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.container}>
        <View style={[styles.header, desktop && styles.headerDesktop]}>
          <View style={styles.brand}>
            <View style={styles.brandIcon}>
              <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.brandName}>VolunServe</Text>
              <Text style={styles.brandSub}>LGU Responder Portal</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.refreshButton} onPress={refresh}>
              {refreshing ? (
                <ActivityIndicator size="small" color="#0F766E" />
              ) : (
                <Ionicons name="refresh" size={19} color="#0F766E" />
              )}
            </Pressable>
            <Pressable style={styles.signOutButton} onPress={signOut}>
              <Ionicons name="log-out-outline" size={18} color="#B42318" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.eyebrow}>OFFICIAL LGU RESPONSE</Text>
        <Text style={styles.title}>My Duty</Text>
        <Text style={styles.subtitle}>
          Manage your official duty status and responder availability.
        </Text>
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={20} color="#B42318" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {message ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#067647" />
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}
        <View style={[styles.grid, desktop && styles.gridDesktop]}>
          <View style={[styles.leftColumn, desktop && styles.leftColumnDesktop]}>
            <View style={styles.card}>
              <View style={styles.profileHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {initials(personnel?.fullName || profile?.fullName || "")}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>
                      {personnel?.fullName || profile?.fullName || "LGU Personnel"}
                    </Text>
                    {personnel?.isTestAccount ? (
                      <View style={styles.testBadge}>
                        <Text style={styles.testText}>TEST</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.email}>
                    {personnel?.email || profile?.email || ""}
                  </Text>
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#067647" />
                    <Text style={styles.verifiedText}>Verified LGU Personnel</Text>
                  </View>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={[styles.infoGrid, desktop && styles.infoGridDesktop]}>
                <Info label="Employee ID" value={personnel?.employeeId || "—"} />
                <Info label="Department" value={personnel?.department || "—"} />
                <Info label="Position" value={personnel?.position || "—"} />
                <Info
                  label="Capabilities"
                  value={
                    personnel?.capabilities?.length
                      ? personnel.capabilities.join(", ")
                      : "No capabilities listed"
                  }
                />
              </View>
            </View>
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionEyebrow}>CURRENT DUTY STATUS</Text>
                  <Text style={styles.sectionTitle}>Duty & Availability</Text>
                </View>
                <Ionicons name="time-outline" size={25} color="#0F766E" />
              </View>
              <View style={[styles.statusGrid, desktop && styles.statusGridDesktop]}>
                <StatusBox
                  labelText="Duty"
                  value={label(duty.dutyStatus || "off_duty")}
                  active={onDuty}
                />
                <StatusBox
                  labelText="Availability"
                  value={label(duty.availabilityStatus || "unavailable")}
                  active={available}
                  warning={
                    duty.availabilityStatus === "assigned" ||
                    duty.availabilityStatus === "responding" ||
                    duty.availabilityStatus === "on_site"
                  }
                />
                <View style={styles.statusBox}>
                  <Text style={styles.statusLabel}>SHIFT DATE</Text>
                  <Text style={styles.statusValue}>{duty.shiftDate || "—"}</Text>
                </View>
              </View>
              <View style={styles.noteBox}>
                <Ionicons name="information-circle-outline" size={19} color="#475467" />
                <Text style={styles.noteText}>
                  Time In makes you On Duty and Available for assignment. Time Out is allowed only when no emergency response is active.
                </Text>
              </View>
              <View style={[styles.buttonRow, desktop && styles.buttonRowDesktop]}>
                <Pressable
                  style={[
                    styles.timeInButton,
                    (onDuty || action) && styles.disabledButton,
                  ]}
                  disabled={onDuty || Boolean(action)}
                  onPress={timeIn}
                >
                  {action === "time-in" ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                  )}
                  <Text style={styles.timeInText}>
                    {onDuty ? "Already On Duty" : "Time In"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.timeOutButton,
                    (!onDuty || !available || action) && styles.disabledButton,
                  ]}
                  disabled={!onDuty || !available || Boolean(action)}
                  onPress={timeOut}
                >
                  {action === "time-out" ? (
                    <ActivityIndicator size="small" color="#B42318" />
                  ) : (
                    <Ionicons name="log-out-outline" size={20} color="#B42318" />
                  )}
                  <Text style={styles.timeOutText}>Time Out</Text>
                </Pressable>
              </View>
              {onDuty && !available ? (
                <Text style={styles.lockedText}>
                  Time Out is locked while an emergency assignment is active.
                </Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.rightColumn, desktop && styles.rightColumnDesktop]}>
            <View style={styles.card}>
              <View style={styles.assignmentIcon}>
                <Ionicons name="alert-circle-outline" size={24} color="#0F766E" />
              </View>
              <Text style={styles.assignmentTitle}>Current Assignment</Text>
              {activeAssignment ? (
                assignmentLoading ? (
                  <View style={styles.assignmentLoading}>
                    <ActivityIndicator size="small" color="#0F766E" />
                    <Text style={styles.assignmentLoadingText}>
                      Loading official assignment...
                    </Text>
                  </View>
                ) : assignment ? (
                  <>
                    <View style={styles.assignmentStatusRow}>
                      <View style={styles.assignmentStatusBadge}>
                        <Text style={styles.assignmentStatusText}>
                          {label(assignment.status)}
                        </Text>
                      </View>
                      <Text style={styles.assignmentCaseId}>
                        {assignment.caseId}
                      </Text>
                    </View>
                    {emergencyCase ? (
                      <>
                        <Text style={styles.assignmentCaseTitle}>
                          {emergencyCase.title}
                        </Text>
                        <View style={styles.assignmentMetaRow}>
                          <View style={styles.assignmentSeverityBadge}>
                            <Text style={styles.assignmentSeverityText}>
                              {emergencyCase.severity.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.assignmentCategory}>
                            {emergencyCase.category}
                          </Text>
                        </View>
                        <View style={styles.assignmentDetailBox}>
                          <Info
                            label="Emergency Location"
                            value={emergencyCase.location || "Location not provided"}
                          />
                          <View style={styles.smallGap} />
                          <Info
                            label="Resident"
                            value={emergencyCase.reporterName || "Resident"}
                          />
                          <View style={styles.smallGap} />
                          <Info
                            label="Affected"
                            value={`${emergencyCase.affectedPeople || 0} people`}
                          />
                        </View>
                        {!!emergencyCase.requiredSkills.length && (
                          <View style={styles.skillSection}>
                            <Text style={styles.skillSectionLabel}>
                              REQUIRED RESPONSE SKILLS
                            </Text>
                            <Text style={styles.skillSectionText}>
                              {emergencyCase.requiredSkills.join(" • ")}
                            </Text>
                          </View>
                        )}
                        {!!emergencyCase.details && (
                          <View style={styles.caseNoteBox}>
                            <Text style={styles.caseNoteLabel}>CASE DETAILS</Text>
                            <Text style={styles.caseNoteText}>
                              {emergencyCase.details}
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <>
                        <Info label="Case ID" value={assignment.caseId || "—"} />
                        <View style={styles.smallGap} />
                        <Info label="Assignment ID" value={assignment.id} />
                      </>
                    )}
                    {assignment.status === "assigned" ? (
                      <Pressable
                        style={[
                          styles.acknowledgeButton,
                          assignmentAction && styles.disabledButton,
                        ]}
                        disabled={Boolean(assignmentAction)}
                        onPress={acknowledgeAssignment}
                      >
                        {assignmentAction === "acknowledge" ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons
                            name="checkmark-done-outline"
                            size={19}
                            color="#FFFFFF"
                          />
                        )}
                        <Text style={styles.acknowledgeButtonText}>
                          Acknowledge Assignment
                        </Text>
                      </Pressable>
                    ) : assignment.status === "acknowledged" ? (
                      <>
                        <View style={styles.acknowledgedBox}>
                          <Ionicons
                            name="checkmark-circle"
                            size={19}
                            color="#067647"
                          />
                          <View style={styles.acknowledgedTextBlock}>
                            <Text style={styles.acknowledgedTitle}>
                              Assignment acknowledged
                            </Text>
                            <Text style={styles.acknowledgedText}>
                              The official dispatch is confirmed. Start the response when you are ready to proceed to the emergency location.
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          style={[
                            styles.startResponseButton,
                            assignmentAction && styles.disabledButton,
                          ]}
                          disabled={Boolean(assignmentAction)}
                          onPress={startResponse}
                        >
                          {assignmentAction === "start-response" ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Ionicons
                              name="navigate-outline"
                              size={19}
                              color="#FFFFFF"
                            />
                          )}
                          <Text style={styles.startResponseButtonText}>
                            Start Response
                          </Text>
                        </Pressable>
                      </>
                    ) : assignment.status === "responding" ? (
                      <>
                        <View style={styles.respondingBox}>
                          <Ionicons
                            name="navigate-circle"
                            size={21}
                            color="#175CD3"
                          />
                          <View style={styles.respondingTextBlock}>
                            <Text style={styles.respondingTitle}>
                              Response in progress
                            </Text>
                            <Text style={styles.respondingText}>
                              You are officially Responding. Open Map & Route to share your official LGU GPS and navigate to the Resident.
                            </Text>
                          </View>
                        </View>
                        <Pressable
                          style={styles.openMapButton}
                          onPress={() =>
                            router.push(
                              `/(lgu)/response-map?caseId=${encodeURIComponent(
                                assignment.caseId
                              )}` as any
                            )
                          }
                        >
                          <Ionicons
                            name="map-outline"
                            size={19}
                            color="#FFFFFF"
                          />
                          <Text style={styles.openMapButtonText}>
                            Open Map & Route
                          </Text>
                        </Pressable>
                      </>
                    ) : assignment.status === "on_site" ? (
                      <>
                        <View style={styles.onSiteBox}>
                          <Ionicons
                            name="location"
                            size={21}
                            color="#067647"
                          />
                          <View style={styles.respondingTextBlock}>
                            <Text style={styles.onSiteTitle}>
                              You are On Site
                            </Text>
                            <Text style={styles.onSiteText}>
                              Arrival is recorded. Complete the field response, then submit the official report below.
                            </Text>
                          </View>
                        </View>

                        <Pressable
                          style={styles.openMapButton}
                          onPress={() =>
                            router.push(
                              `/(lgu)/response-map?caseId=${encodeURIComponent(
                                assignment.caseId
                              )}` as any
                            )
                          }
                        >
                          <Ionicons
                            name="map-outline"
                            size={19}
                            color="#FFFFFF"
                          />
                          <Text style={styles.openMapButtonText}>
                            Reopen Map & Route
                          </Text>
                        </Pressable>

                        <View style={styles.reportCard}>
                          <View style={styles.reportHeader}>
                            <View>
                              <Text style={styles.reportEyebrow}>
                                OFFICIAL FIELD REPORT
                              </Text>
                              <Text style={styles.reportTitle}>
                                Complete Response
                              </Text>
                            </View>
                            <Ionicons
                              name="document-text-outline"
                              size={22}
                              color="#0F766E"
                            />
                          </View>

                          <Text style={styles.reportHelp}>
                            Record what your team found and what was actually done. Submitting this report completes your field assignment, but the Admin still reviews the emergency before resolving or closing the case.
                          </Text>

                          <Text style={styles.fieldLabel}>
                            Situation Summary *
                          </Text>
                          <TextInput
                            value={situationSummary}
                            onChangeText={setSituationSummary}
                            editable={!completionBusy}
                            multiline
                            maxLength={1000}
                            placeholder="Example: Structural damage was confirmed on the front wall. Three residents were moved away from the unsafe area."
                            placeholderTextColor="#98A2B3"
                            style={[styles.textArea, styles.textAreaMedium]}
                          />

                          <Text style={styles.fieldLabel}>
                            Actions Taken *
                          </Text>
                          <TextInput
                            value={actionsTaken}
                            onChangeText={setActionsTaken}
                            editable={!completionBusy}
                            multiline
                            maxLength={1500}
                            placeholder="Example: Secured the affected area, assisted residents to a safe location, and coordinated follow-up inspection."
                            placeholderTextColor="#98A2B3"
                            style={[styles.textArea, styles.textAreaLarge]}
                          />

                          <Text style={styles.fieldLabel}>
                            People Assisted *
                          </Text>
                          <TextInput
                            value={peopleAssisted}
                            onChangeText={(value) =>
                              setPeopleAssisted(value.replace(/[^0-9]/g, ""))
                            }
                            editable={!completionBusy}
                            keyboardType="number-pad"
                            maxLength={3}
                            placeholder="0"
                            placeholderTextColor="#98A2B3"
                            style={styles.numberInput}
                          />

                          <Text style={styles.fieldLabel}>
                            Field Outcome *
                          </Text>
                          <View style={styles.outcomeGrid}>
                            {[
                              {
                                value: "resolved_on_site",
                                label: "Resolved On Site",
                              },
                              {
                                value: "stabilized",
                                label: "Stabilized",
                              },
                              {
                                value: "referred",
                                label: "Referred",
                              },
                              {
                                value: "needs_follow_up",
                                label: "Needs Follow-up",
                              },
                            ].map((item) => {
                              const active = responseOutcome === item.value;

                              return (
                                <Pressable
                                  key={item.value}
                                  disabled={completionBusy}
                                  onPress={() =>
                                    setResponseOutcome(item.value)
                                  }
                                  style={[
                                    styles.outcomeButton,
                                    active && styles.outcomeButtonActive,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.outcomeButtonText,
                                      active && styles.outcomeButtonTextActive,
                                    ]}
                                  >
                                    {item.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <Text style={styles.fieldLabel}>
                            Remaining Needs / Referral
                            {["referred", "needs_follow_up"].includes(
                              responseOutcome
                            )
                              ? " *"
                              : ""}
                          </Text>
                          <TextInput
                            value={remainingNeeds}
                            onChangeText={setRemainingNeeds}
                            editable={!completionBusy}
                            multiline
                            maxLength={1000}
                            placeholder="State any follow-up inspection, medical referral, additional unit, supplies, or other remaining need."
                            placeholderTextColor="#98A2B3"
                            style={[styles.textArea, styles.textAreaMedium]}
                          />

                          <Text style={styles.fieldLabel}>
                            Additional Notes
                          </Text>
                          <TextInput
                            value={completionNotes}
                            onChangeText={setCompletionNotes}
                            editable={!completionBusy}
                            multiline
                            maxLength={1000}
                            placeholder="Optional operational notes for the LGU/Admin reviewer."
                            placeholderTextColor="#98A2B3"
                            style={[styles.textArea, styles.textAreaMedium]}
                          />

                          <View style={styles.reportNotice}>
                            <Ionicons
                              name="shield-checkmark-outline"
                              size={18}
                              color="#175CD3"
                            />
                            <Text style={styles.reportNoticeText}>
                              Complete Response ends your active field assignment and stops official LGU GPS. It does not automatically close the Resident's emergency case.
                            </Text>
                          </View>

                          <Pressable
                            disabled={completionBusy}
                            onPress={completeResponse}
                            style={[
                              styles.completeResponseButton,
                              completionBusy && styles.disabledButton,
                            ]}
                          >
                            {completionBusy ? (
                              <ActivityIndicator
                                size="small"
                                color="#FFFFFF"
                              />
                            ) : (
                              <Ionicons
                                name="checkmark-done-outline"
                                size={20}
                                color="#FFFFFF"
                              />
                            )}
                            <Text style={styles.completeResponseButtonText}>
                              {completionBusy
                                ? "Submitting Field Report..."
                                : "Complete Response & Submit Report"}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <View style={styles.assignmentActive}>
                        <Ionicons name="radio-outline" size={18} color="#B54708" />
                        <Text style={styles.assignmentActiveText}>
                          Official response status: {label(assignment.status)}.
                        </Text>
                      </View>
                    )}
                    {!!assignmentError && (
                      <View style={styles.assignmentErrorBox}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={18}
                          color="#B42318"
                        />
                        <Text style={styles.assignmentErrorText}>
                          {assignmentError}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.assignmentErrorBox}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={18}
                      color="#B42318"
                    />
                    <Text style={styles.assignmentErrorText}>
                      {assignmentError || "Unable to load the linked assignment."}
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.emptyAssignment}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={30}
                    color="#667085"
                  />
                  <Text style={styles.emptyTitle}>No active assignment</Text>
                  <Text style={styles.emptyText}>
                    When the Admin assigns an emergency response to you, it will appear here.
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.card}>
              <Text style={styles.guideTitle}>Duty Flow</Text>
              <Guide number="1" title="Time In" text="Start your official duty." />
              <Guide
                number="2"
                title="Available"
                text="Wait for an assignment from the LGU/Admin Coordinator."
              />
              <Guide
                number="3"
                title="Respond"
                text="Assigned → Acknowledged → Responding → On Site → Completed."
              />
              <Guide
                number="4"
                title="Time Out"
                text="End duty after active responses are completed."
                last
              />
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
function Info({ label: labelText, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{labelText}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}
function StatusBox({
  labelText,
  value,
  active,
  warning = false,
}: {
  labelText: string;
  value: string;
  active: boolean;
  warning?: boolean;
}) {
  return (
    <View style={styles.statusBox}>
      <Text style={styles.statusLabel}>{labelText.toUpperCase()}</Text>
      <View
        style={[
          styles.statusPill,
          active
            ? styles.statusPositive
            : warning
            ? styles.statusWarning
            : styles.statusNeutral,
        ]}
      >
        <View
          style={[
            styles.statusDot,
            active
              ? styles.dotPositive
              : warning
              ? styles.dotWarning
              : styles.dotNeutral,
          ]}
        />
        <Text style={styles.statusPillText}>{value}</Text>
      </View>
    </View>
  );
}
function Guide({
  number,
  title,
  text,
  last = false,
}: {
  number: string;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <View style={styles.guideRow}>
      <View style={styles.guideRail}>
        <View style={styles.guideCircle}>
          <Text style={styles.guideNumber}>{number}</Text>
        </View>
        {!last ? <View style={styles.guideLine} /> : null}
      </View>
      <View style={styles.guideContent}>
        <Text style={styles.guideStepTitle}>{title}</Text>
        <Text style={styles.guideText}>{text}</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F4F7FA" },
  pageContent: { flexGrow: 1, padding: 16 },
  container: { width: "100%", maxWidth: 1240, alignSelf: "center" },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F4F7FA",
  },
  loadingTitle: {
    marginTop: 14,
    color: "#101828",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  loadingText: {
    marginTop: 7,
    maxWidth: 420,
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  header: { gap: 14, marginBottom: 28 },
  headerDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#0F766E",
  },
  brandName: { color: "#101828", fontSize: 20, fontWeight: "900" },
  brandSub: { marginTop: 1, color: "#667085", fontSize: 12, fontWeight: "600" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  signOutButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#FDA29B",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  signOutText: { color: "#B42318", fontSize: 13, fontWeight: "800" },
  eyebrow: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: { marginTop: 5, color: "#101828", fontSize: 30, fontWeight: "900" },
  subtitle: {
    marginTop: 6,
    marginBottom: 20,
    color: "#667085",
    fontSize: 14,
    lineHeight: 21,
  },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECDCA",
    borderRadius: 10,
    backgroundColor: "#FEF3F2",
  },
  errorText: { flex: 1, color: "#B42318", fontSize: 13, lineHeight: 19 },
  successBox: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ABEFC6",
    borderRadius: 10,
    backgroundColor: "#ECFDF3",
  },
  successText: { flex: 1, color: "#067647", fontSize: 13, lineHeight: 19 },
  grid: { gap: 16 },
  gridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 18,
  },
  leftColumn: {
    width: "100%",
    gap: 16,
  },
  leftColumnDesktop: {
    width: 360,
    flexGrow: 0,
    flexShrink: 0,
  },
  rightColumn: {
    width: "100%",
    gap: 16,
  },
  rightColumnDesktop: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    width: "100%",
    minWidth: 0,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 13 },
  avatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: "#E6F4F2",
  },
  avatarText: { color: "#0F766E", fontSize: 17, fontWeight: "900" },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  name: { color: "#101828", fontSize: 18, fontWeight: "900" },
  testBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#EEF4FF",
  },
  testText: { color: "#3538CD", fontSize: 10, fontWeight: "900" },
  email: { marginTop: 3, color: "#667085", fontSize: 13 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  verifiedText: { color: "#067647", fontSize: 12, fontWeight: "800" },
  divider: { height: 1, marginVertical: 17, backgroundColor: "#EAECF0" },
  infoGrid: { gap: 14 },
  infoGridDesktop: { flexDirection: "row", flexWrap: "wrap" },
  infoItem: { minWidth: 140, flex: 1 },
  infoLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  infoValue: {
    marginTop: 4,
    color: "#344054",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    flexShrink: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionEyebrow: { color: "#0F766E", fontSize: 10, fontWeight: "900" },
  sectionTitle: { marginTop: 3, color: "#101828", fontSize: 19, fontWeight: "900" },
  statusGrid: { gap: 10, marginTop: 18 },
  statusGridDesktop: { flexDirection: "row" },
  statusBox: {
    minHeight: 82,
    flex: 1,
    justifyContent: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "#EAECF0",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
  },
  statusLabel: { marginBottom: 8, color: "#667085", fontSize: 11, fontWeight: "800" },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPositive: { backgroundColor: "#ECFDF3" },
  statusNeutral: { backgroundColor: "#F2F4F7" },
  statusWarning: { backgroundColor: "#FFFAEB" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotPositive: { backgroundColor: "#12B76A" },
  dotNeutral: { backgroundColor: "#98A2B3" },
  dotWarning: { backgroundColor: "#F79009" },
  statusPillText: { color: "#344054", fontSize: 12, fontWeight: "800" },
  statusValue: { color: "#344054", fontSize: 14, fontWeight: "800" },
  noteBox: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F2F4F7",
  },
  noteText: { flex: 1, color: "#475467", fontSize: 12, lineHeight: 18 },
  buttonRow: { gap: 10, marginTop: 16 },
  buttonRowDesktop: { flexDirection: "row" },
  timeInButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#0F766E",
  },
  timeInText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  timeOutButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#FDA29B",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  timeOutText: { color: "#B42318", fontSize: 14, fontWeight: "900" },
  disabledButton: { opacity: 0.45 },
  lockedText: { marginTop: 9, color: "#B54708", fontSize: 12, fontWeight: "700" },
  assignmentIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#E6F4F2",
  },
  assignmentTitle: { marginTop: 12, marginBottom: 14, color: "#101828", fontSize: 17, fontWeight: "900" },
  assignmentActive: {
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#FFFAEB",
  },
  assignmentActiveText: { flex: 1, color: "#B54708", fontSize: 12, lineHeight: 17 },
  smallGap: { height: 10 },
  emptyAssignment: { alignItems: "center", paddingVertical: 18 },
  emptyTitle: { marginTop: 8, color: "#344054", fontSize: 14, fontWeight: "900" },
  emptyText: {
    marginTop: 5,
    color: "#667085",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  assignmentLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  assignmentLoadingText: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  assignmentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  assignmentStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
  },
  assignmentStatusText: {
    color: "#B54708",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  assignmentCaseId: {
    flexShrink: 1,
    color: "#98A2B3",
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
  },
  assignmentCaseTitle: {
    color: "#101828",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  assignmentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 9,
    marginBottom: 13,
  },
  assignmentSeverityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FEF3F2",
  },
  assignmentSeverityText: {
    color: "#B42318",
    fontSize: 10,
    fontWeight: "900",
  },
  assignmentCategory: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "800",
  },
  assignmentDetailBox: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#EAECF0",
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
  },
  skillSection: {
    marginTop: 11,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#ECFDF3",
  },
  skillSectionLabel: {
    color: "#067647",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  skillSectionText: {
    marginTop: 5,
    color: "#065F46",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  caseNoteBox: {
    marginTop: 11,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#F2F4F7",
  },
  caseNoteLabel: {
    color: "#667085",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  caseNoteText: {
    marginTop: 5,
    color: "#475467",
    fontSize: 12,
    lineHeight: 18,
  },
  acknowledgeButton: {
    minHeight: 46,
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#0F766E",
  },
  acknowledgeButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  acknowledgedBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    borderWidth: 1,
    borderColor: "#ABEFC6",
    borderRadius: 10,
    backgroundColor: "#ECFDF3",
  },
  acknowledgedTextBlock: {
    flex: 1,
  },
  acknowledgedTitle: {
    color: "#067647",
    fontSize: 12,
    fontWeight: "900",
  },
  acknowledgedText: {
    marginTop: 3,
    color: "#067647",
    fontSize: 11,
    lineHeight: 17,
  },
  startResponseButton: {
    minHeight: 46,
    marginTop: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#175CD3",
  },
  startResponseButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  respondingBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    borderWidth: 1,
    borderColor: "#B2DDFF",
    borderRadius: 10,
    backgroundColor: "#EFF8FF",
  },
  respondingTextBlock: {
    flex: 1,
  },
  respondingTitle: {
    color: "#175CD3",
    fontSize: 12,
    fontWeight: "900",
  },
  respondingText: {
    marginTop: 3,
    color: "#1849A9",
    fontSize: 11,
    lineHeight: 17,
  },
  onSiteBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 11,
    borderWidth: 1,
    borderColor: "#ABEFC6",
    borderRadius: 10,
    backgroundColor: "#ECFDF3",
  },
  onSiteTitle: {
    color: "#067647",
    fontSize: 12,
    fontWeight: "900",
  },
  onSiteText: {
    marginTop: 3,
    color: "#24704E",
    fontSize: 11,
    lineHeight: 17,
  },
  reportCard: {
    width: "100%",
    marginTop: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  reportEyebrow: {
    color: "#0F766E",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  reportTitle: {
    marginTop: 3,
    color: "#101828",
    fontSize: 17,
    fontWeight: "900",
  },
  reportHelp: {
    marginTop: 8,
    color: "#667085",
    fontSize: 11,
    lineHeight: 17,
  },
  fieldLabel: {
    marginTop: 13,
    marginBottom: 6,
    color: "#344054",
    fontSize: 11,
    fontWeight: "900",
  },
  textArea: {
    width: "100%",
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 9,
    backgroundColor: "#F9FAFB",
    color: "#101828",
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: "top",
  },
  textAreaMedium: {
    minHeight: 74,
  },
  textAreaLarge: {
    minHeight: 88,
  },
  numberInput: {
    width: 120,
    minHeight: 42,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 9,
    backgroundColor: "#F9FAFB",
    color: "#101828",
    fontSize: 13,
    fontWeight: "800",
  },
  outcomeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  outcomeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  outcomeButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#E6F4F2",
  },
  outcomeButtonText: {
    color: "#475467",
    fontSize: 10.5,
    fontWeight: "800",
  },
  outcomeButtonTextActive: {
    color: "#0F766E",
  },
  reportNotice: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#B2DDFF",
    borderRadius: 9,
    backgroundColor: "#EFF8FF",
  },
  reportNoticeText: {
    flex: 1,
    color: "#1849A9",
    fontSize: 10.5,
    lineHeight: 16,
  },
  completeResponseButton: {
    minHeight: 48,
    marginTop: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#067647",
  },
  completeResponseButtonText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "900",
    textAlign: "center",
  },
  openMapButton: {
    minHeight: 46,
    marginTop: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#0F766E",
  },
  openMapButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  assignmentErrorBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FECDCA",
    borderRadius: 9,
    backgroundColor: "#FEF3F2",
  },
  assignmentErrorText: {
    flex: 1,
    color: "#B42318",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
  },
  guideTitle: { marginBottom: 14, color: "#101828", fontSize: 17, fontWeight: "900" },
  guideRow: { flexDirection: "row", minHeight: 65 },
  guideRail: { width: 30, alignItems: "center" },
  guideCircle: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#E6F4F2",
  },
  guideNumber: { color: "#0F766E", fontSize: 11, fontWeight: "900" },
  guideLine: { width: 2, flex: 1, marginVertical: 4, backgroundColor: "#D0D5DD" },
  guideContent: { flex: 1, paddingLeft: 10, paddingBottom: 13 },
  guideStepTitle: { color: "#344054", fontSize: 13, fontWeight: "900" },
  guideText: { marginTop: 3, color: "#667085", fontSize: 12, lineHeight: 17 },
});
