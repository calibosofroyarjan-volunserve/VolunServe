import { useLocalSearchParams } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { db } from "../../lib/firebase";
import {
  hasVolunteerAccess,
  isApprovedProfile,
} from "../../lib/firebaseAuth";

type Row = {
  id: string;
  [key: string]: any;
};

type CompletionDetails = {
  contributionType: string;
  contributionSummary: string;
  peopleHelped: number;
  completionNotes: string;
};

const contributionOptions = [
  "Evacuation Assistance",
  "Transport / Vehicle",
  "Medical Assistance",
  "Search and Rescue",
  "Home Repair",
  "Clearing / Heavy Lifting",
  "Relief / Goods Delivery",
  "Safety / Welfare Check",
  "Other",
];

const activeStates = ["responding", "on_site"];
const terminalStates = ["completed", "declined", "cancelled"];

const nameOf = (profile: any) => {
  const composed = [
    profile?.firstName,
    profile?.middleName,
    profile?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const direct = String(
    profile?.fullName ||
      profile?.displayName ||
      profile?.name ||
      composed ||
      "",
  ).trim();

  if (direct && normalizeName(direct) !== "user") {
    return direct;
  }

  const email = String(profile?.email || "").trim();
  if (email.includes("@")) {
    const local = email.split("@")[0];
    const friendly = local
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .trim();

    if (friendly) return friendly;
  }

  return direct || "Volunteer";
};

const normalizeName = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const millis = (value: any) => value?.toMillis?.() || 0;

export function useResponseFlow(
  user: any,
  profile: any,
  cases: Row[],
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: number;
  } | null,
  tracking: boolean,
  setTracking: (value: boolean) => void,
  focused: boolean,
) {
  const admin = ["admin", "superadmin"].includes(profile?.role);
  const volunteer = hasVolunteerAccess(profile);

  const approved =
    !!user && !!profile && isApprovedProfile(profile);

  const [assignments, setAssignments] = useState<Row[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [locations, setLocations] = useState<Row[]>([]);
  const [shareId, setShareId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sentAt, setSentAt] = useState(0);

  const busyRef = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latestLocation = useRef(location);
  const publishLiveLocationRef = useRef<() => void>(() => {});

  latestLocation.current = location;

  useEffect(() => {
    setAssignments([]);
    setPeople([]);
    setLocations([]);
    setShareId("");

    if (!approved) return;

    const disposers: (() => void)[] = [];

    if (admin || volunteer) {
      disposers.push(
        onSnapshot(
          admin
            ? collection(db, "responseAssignments")
            : query(
                collection(db, "responseAssignments"),
                where("volunteerId", "==", user.uid),
              ),
          (snapshot) =>
            setAssignments(
              snapshot.docs.map((item) => ({
                ...item.data(),
                id: item.id,
              })),
            ),
          () =>
            setError(
              "Assignments unavailable. Check the deployed tracking rules and connection.",
            ),
        ),
      );
    }

    if (admin) {
      disposers.push(
        onSnapshot(
          collection(db, "users"),
          (snapshot) =>
            setPeople(
              snapshot.docs
                .map((item) => ({
                  ...item.data(),
                  id: item.id,
                }))
                .filter(
                  (person: any) =>
                    isApprovedProfile(person) &&
                    hasVolunteerAccess(person),
                ),
            ),
          () => setError("Could not load volunteers."),
        ),
      );

      disposers.push(
        onSnapshot(
          collection(db, "responseLocations"),
          (snapshot) =>
            setLocations(
              snapshot.docs.map((item) => ({
                ...item.data(),
                id: item.id,
              })),
            ),
          () =>
            setError(
              "Responder locations unavailable. Check the tracking rules.",
            ),
        ),
      );
    }

    return () => disposers.forEach((dispose) => dispose());
  }, [user?.uid, admin, volunteer, approved]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      5000,
    );

    return () => window.clearInterval(timer);
  }, []);

  const mission = assignments.find(
    (assignment) => assignment.id === shareId,
  );

  const activeCase = cases.find(
    (item) => item.id === mission?.caseId,
  );

  const canShare =
    approved &&
    volunteer &&
    focused &&
    tracking &&
    !!mission &&
    activeStates.includes(mission.status) &&
    !!activeCase &&
    ["assigned", "in_progress"].includes(activeCase.status);

  useEffect(() => {
    if (
      shareId &&
      (
        !tracking ||
        !focused ||
        !approved ||
        !volunteer ||
        (mission && terminalStates.includes(mission.status)) ||
        (
          activeCase &&
          ["resolved", "closed"].includes(activeCase.status)
        )
      )
    ) {
      setShareId("");
      setTracking(false);
    }
  }, [
    shareId,
    tracking,
    focused,
    approved,
    volunteer,
    mission?.status,
    activeCase?.status,
  ]);

  // Active response GPS publisher.
  //
  // - Publishes immediately when a fresh browser GPS reading arrives.
  // - Sends a 5-second heartbeat even while the volunteer is stationary, so
  //   the assigned resident does not lose the responder pin.
  // - Serializes Firestore writes, then deletes the live pin only after the
  //   active sharing session ends.
  useEffect(() => {
    if (!canShare || !user || !mission) {
      publishLiveLocationRef.current = () => {};
      return;
    }

    let stopped = false;
    let lastQueuedAt = 0;
    let lastPointTimestamp = 0;

    const uid = user.uid;
    const assignmentId = mission.id;
    const caseId = mission.caseId;
    const locationRef = doc(db, "responseLocations", uid);

    setSentAt(0);

    const publish = (heartbeat = false) => {
      const point = latestLocation.current;
      const currentTime = Date.now();

      if (
        stopped ||
        !point ||
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude) ||
        currentTime - point.timestamp > 30000
      ) {
        return;
      }

      const hasNewGpsReading =
        point.timestamp !== lastPointTimestamp;

      if (
        !heartbeat &&
        (
          !hasNewGpsReading ||
          currentTime - lastQueuedAt < 1500
        )
      ) {
        return;
      }

      lastQueuedAt = currentTime;
      lastPointTimestamp = point.timestamp;

      const payload = {
        volunteerId: uid,
        assignmentId,
        caseId,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        updatedAt: serverTimestamp(),
      };

      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (stopped) return;

          await setDoc(locationRef, payload);

          if (!stopped) {
            setSentAt(Date.now());
            setError("");
          }
        })
        .catch(() => {
          if (!stopped) {
            setError(
              "Live GPS sharing failed. Your local pin still works, but the assigned resident or Admin may see an older responder position.",
            );
          }
        });
    };

    publishLiveLocationRef.current = () =>
      publish(false);

    publish(true);

    const timer = window.setInterval(
      () => publish(true),
      5000,
    );

    return () => {
      stopped = true;
      publishLiveLocationRef.current = () => {};
      window.clearInterval(timer);

      queue.current = queue.current
        .catch(() => {})
        .then(() => deleteDoc(locationRef))
        .catch(() => {
          // If cleanup happens while offline, readers still
          // ignore stale responder locations after expiry.
        });
    };
  }, [
    canShare,
    user?.uid,
    mission?.id,
    mission?.caseId,
  ]);

  useEffect(() => {
    if (!canShare || !location) return;

    publishLiveLocationRef.current();
  }, [
    canShare,
    location?.latitude,
    location?.longitude,
    location?.timestamp,
  ]);

  const stopSharing = () => {
    setShareId("");
    setTracking(false);
  };

  const act = async (
    operation: () => Promise<void>,
  ): Promise<boolean> => {
    if (busyRef.current) return false;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await operation();
      return true;
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Operation failed. Please retry.",
      );
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const respond = (
    assignment: Row,
    next: string,
    completion?: CompletionDetails,
  ) =>
    act(async () => {
      if (next === "completed") {
        if (!completion) {
          throw new Error(
            "Add the contribution details before completing this mission.",
          );
        }

        if (!completion.contributionType.trim()) {
          throw new Error(
            "Select the type of contribution you provided.",
          );
        }

        if (
          completion.contributionSummary.trim().length <
          10
        ) {
          throw new Error(
            "Describe your actual contribution in at least 10 characters.",
          );
        }

        if (
          !Number.isInteger(
            completion.peopleHelped,
          ) ||
          completion.peopleHelped < 0 ||
          completion.peopleHelped > 999
        ) {
          throw new Error(
            "Enter a valid number of people assisted (0 to 999).",
          );
        }
      }

      await runTransaction(
        db,
        async (transaction) => {
          const assignmentRef = doc(
            db,
            "responseAssignments",
            assignment.id,
          );

          const snapshot =
            await transaction.get(assignmentRef);
          const current = snapshot.data();

          if (
            !current ||
            current.volunteerId !== user.uid
          ) {
            throw new Error(
              "Assignment unavailable.",
            );
          }

          const previous: Record<
            string,
            string
          > = {
            accepted: "offered",
            declined: "offered",
            responding: "accepted",
            on_site: "responding",
            completed: "on_site",
          };

          if (
            current.status !== previous[next]
          ) {
            throw new Error(
              "Assignment changed. Please check its current status.",
            );
          }

          const caseRef = doc(
            db,
            "disasterCases",
            current.caseId,
          );

          const caseSnapshot =
            await transaction.get(caseRef);

          const incident =
            caseSnapshot.data();

          if (!incident) {
            throw new Error(
              "Incident unavailable.",
            );
          }

          if (
            String(incident.reporterUid || "").trim() ===
            String(user.uid || "").trim()
          ) {
            throw new Error(
              "You cannot respond to your own emergency report.",
            );
          }

          const assignmentPatch: any = {
            status: next,
            updatedAt: serverTimestamp(),
          };

          if (next === "responding") {
            assignmentPatch.responseStartedAt =
              serverTimestamp();
          }

          if (next === "on_site") {
            assignmentPatch.arrivedAt =
              serverTimestamp();
          }

          if (
            next === "completed" &&
            completion
          ) {
            assignmentPatch.contributionType =
              completion.contributionType.trim();

            assignmentPatch.contributionSummary =
              completion.contributionSummary.trim();

            assignmentPatch.peopleHelped =
              completion.peopleHelped;

            assignmentPatch.completionNotes =
              completion.completionNotes.trim();

            assignmentPatch.completedAt =
              serverTimestamp();

            assignmentPatch.residentConfirmationStatus =
              "pending";
          }

          transaction.update(
            assignmentRef,
            assignmentPatch,
          );

          const responderName = String(
            current.volunteerName ||
              nameOf(profile) ||
              "Your assigned responder",
          ).trim();

          const noticeByStatus: Record<
            string,
            {
              title: string;
              message: string;
            }
          > = {
            accepted: {
              title:
                "Responder accepted your request",
              message: `${responderName} accepted the LGU response assignment for your emergency request.`,
            },

            responding: {
              title:
                "Responder is on the way",
              message: `${responderName} is responding to your location and is now sharing a live responder location. Open Map Tracking to follow the response.`,
            },

            on_site: {
              title:
                "Responder arrived",
              message: `${responderName} has arrived at your assistance location.`,
            },

            completed: {
              title:
                "Please confirm the assistance received",
              message: `${responderName} marked the mission complete and submitted a contribution summary. Open My Reports to confirm whether you were fully helped, partially helped, or not helped.`,
            },
          };

          const notice =
            noticeByStatus[next];

          const residentUid = String(
            incident.reporterUid || "",
          ).trim();

          if (notice && residentUid) {
            transaction.set(
              doc(
                db,
                "notifications",
                `resident_response_${current.caseId}_${user.uid}_${next}`,
              ),
              {
                userId: residentUid,
                caseId: current.caseId,
                assignmentId: assignment.id,
                responderId: user.uid,
                responderName,
                title: notice.title,
                message: notice.message,
                type:
                  "resident_response_update",
                status: next,
                read: false,
                createdAt:
                  serverTimestamp(),
              },
            );
          }
        },
      );

      if (next === "responding") {
        setShareId(assignment.id);
        setTracking(true);
      }

      if (next === "completed") {
        stopSharing();
      }
    });

  const responders = useMemo(
    () =>
      admin
        ? locations
            .filter((point) => {
              const assignment =
                assignments.find(
                  (item) =>
                    item.id ===
                    point.assignmentId,
                );

              const incident =
                cases.find(
                  (item) =>
                    item.id ===
                    point.caseId,
                );

              return (
                assignment &&
                assignment.volunteerId ===
                  point.volunteerId &&
                assignment.caseId ===
                  point.caseId &&
                activeStates.includes(
                  assignment.status,
                ) &&
                incident &&
                [
                  "assigned",
                  "in_progress",
                ].includes(
                  incident.status,
                ) &&
                millis(
                  point.updatedAt,
                ) > 0 &&
                now -
                  millis(
                    point.updatedAt,
                  ) <
                  120000 &&
                Number.isFinite(
                  point.latitude,
                ) &&
                Number.isFinite(
                  point.longitude,
                )
              );
            })
            .map((point) => ({
              ...point,
              assignmentId:
                point.assignmentId,
              accuracy:
                point.accuracy,
              stale:
                now -
                  millis(
                    point.updatedAt,
                  ) >
                30000,
              lastShared:
                millis(
                  point.updatedAt,
                ),
              name: (() => {
                const assignment =
                  assignments.find(
                    (item) =>
                      item.id ===
                      point.assignmentId,
                  );

                const person =
                  people.find(
                    (item) =>
                      item.id ===
                      point.volunteerId,
                  );

                const liveName =
                  person
                    ? nameOf(person)
                    : "";

                const savedName =
                  String(
                    assignment
                      ?.volunteerName ||
                      "",
                  ).trim();

                if (
                  liveName &&
                  normalizeName(
                    liveName,
                  ) !==
                    "volunteer" &&
                  normalizeName(
                    liveName,
                  ) !== "user"
                ) {
                  return liveName;
                }

                if (
                  savedName &&
                  normalizeName(
                    savedName,
                  ) !== "user"
                ) {
                  return savedName;
                }

                return (
                  liveName ||
                  savedName ||
                  "Volunteer"
                );
              })(),
            }))
        : [],
    [
      admin,
      locations,
      assignments,
      people,
      cases,
      now,
    ],
  );

  return {
    admin,
    volunteer,
    focused,
    assignments,
    people,
    responders,
    shareId,
    canShare,
    sentAt,
    error,
    busy,
    respond,
    stopSharing,
    resume: (
      assignment: Row,
    ) => {
      setShareId(
        assignment.id,
      );
      setTracking(true);
    },
  };
}

function MissionCompletionForm({
  assignment,
  busy,
  defaultPeopleHelped = 1,
  onComplete,
}: {
  assignment: Row;
  busy: boolean;
  defaultPeopleHelped?: number;
  onComplete: (
    assignment: Row,
    next: string,
    details: CompletionDetails,
  ) => Promise<boolean>;
}) {
  const [open, setOpen] =
    useState(false);

  const [
    contributionType,
    setContributionType,
  ] = useState("");

  const [
    contributionSummary,
    setContributionSummary,
  ] = useState("");

  const [
    peopleHelped,
    setPeopleHelped,
  ] = useState(
    String(
      Math.max(
        0,
        Math.min(
          999,
          Math.trunc(
            defaultPeopleHelped ||
              0,
          ),
        ),
      ),
    ),
  );

  const [
    completionNotes,
    setCompletionNotes,
  ] = useState("");

  const [
    localError,
    setLocalError,
  ] = useState("");

  const reset = () => {
    setOpen(false);
    setContributionType("");
    setContributionSummary("");

    setPeopleHelped(
      String(
        Math.max(
          0,
          Math.min(
            999,
            Math.trunc(
              defaultPeopleHelped ||
                0,
            ),
          ),
        ),
      ),
    );

    setCompletionNotes("");
    setLocalError("");
  };

  const submit = async () => {
    const count =
      Number(peopleHelped);

    const summary =
      contributionSummary.trim();

    if (!contributionType) {
      setLocalError(
        "Select the type of contribution you provided.",
      );
      return;
    }

    if (summary.length < 10) {
      setLocalError(
        "Briefly describe what you actually did during the response.",
      );
      return;
    }

    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > 999
    ) {
      setLocalError(
        "Enter a valid number of people assisted (0 to 999).",
      );
      return;
    }

    setLocalError("");

    const completed =
      await onComplete(
        assignment,
        "completed",
        {
          contributionType,
          contributionSummary:
            summary,
          peopleHelped: count,
          completionNotes:
            completionNotes.trim(),
        },
      );

    if (completed) reset();
  };

  if (!open) {
    return (
      <button
        className="primary-button"
        disabled={busy}
        onClick={() =>
          setOpen(true)
        }
      >
        Complete Mission
      </button>
    );
  }

  return (
    <div className="mission-completion-card">
      <div className="mission-completion-heading">
        <div>
          <strong>
            Complete mission &amp;
            record contribution
          </strong>

          <span>
            The resident will
            review this contribution
            before it becomes
            verified help.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={reset}
        >
          Cancel
        </button>
      </div>

      <label>
        Contribution type

        <select
          value={
            contributionType
          }
          disabled={busy}
          onChange={(event) =>
            setContributionType(
              event.target.value,
            )
          }
        >
          <option value="">
            Select contribution
          </option>

          {contributionOptions.map(
            (item) => (
              <option
                key={item}
                value={item}
              >
                {item}
              </option>
            ),
          )}
        </select>
      </label>

      <label>
        What did you actually do?

        <textarea
          value={
            contributionSummary
          }
          disabled={busy}
          rows={3}
          maxLength={1200}
          placeholder="Example: Assisted two residents from the flooded home to the designated evacuation center."
          onChange={(event) =>
            setContributionSummary(
              event.target.value,
            )
          }
        />
      </label>

      <div className="mission-completion-grid">
        <label>
          People assisted

          <input
            type="number"
            min="0"
            max="999"
            step="1"
            value={
              peopleHelped
            }
            disabled={busy}
            onChange={(event) =>
              setPeopleHelped(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          Optional completion notes

          <input
            type="text"
            maxLength={600}
            value={
              completionNotes
            }
            disabled={busy}
            placeholder="Any follow-up or important note"
            onChange={(event) =>
              setCompletionNotes(
                event.target.value,
              )
            }
          />
        </label>
      </div>

      {localError && (
        <p
          className="mission-completion-error"
          role="alert"
        >
          {localError}
        </p>
      )}

      <div className="mission-completion-actions">
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={submit}
        >
          {busy
            ? "Saving…"
            : "Submit Contribution & Complete"}
        </button>
      </div>
    </div>
  );
}

export function ResponsePanel({
  flow,
  cases,
}: {
  flow: ReturnType<
    typeof useResponseFlow
  >;
  cases: Row[];
}) {
  const params =
    useLocalSearchParams<{
      caseId?: string;
    }>();

  const [
    caseId,
    setCaseId,
  ] = useState(
    typeof params.caseId ===
      "string"
      ? params.caseId
      : "",
  );

  const chosen =
    cases.find(
      (item) =>
        item.id === caseId,
    );

  const volunteerMissionAssignment =
    flow.volunteer && caseId
      ? flow.assignments.find(
          (assignment) =>
            assignment.caseId === caseId,
        )
      : undefined;

  // Once a volunteer is actively responding, keep GPS sharing automatic
  // whenever this response map is the focused screen. This removes the
  // confusing Stop/Resume controls from the normal mission flow.
  useEffect(() => {
    if (
      !flow.volunteer ||
      !flow.focused ||
      !caseId ||
      !volunteerMissionAssignment ||
      !activeStates.includes(
        volunteerMissionAssignment.status,
      ) ||
      flow.shareId ===
        volunteerMissionAssignment.id
    ) {
      return;
    }

    flow.resume(
      volunteerMissionAssignment,
    );
  }, [
    flow.volunteer,
    flow.focused,
    caseId,
    volunteerMissionAssignment?.id,
    volunteerMissionAssignment?.status,
    flow.shareId,
  ]);

  if (
    !flow.admin &&
    !flow.volunteer
  ) {
    return null;
  }

  const relevant =
    flow.admin
      ? flow.assignments.filter(
          (assignment) =>
            assignment.caseId ===
            caseId,
        )
      : caseId
        ? flow.assignments.filter(
            (assignment) =>
              assignment.caseId ===
              caseId,
          )
        : flow.assignments;

  const visibleRelevant =
    flow.admin
      ? relevant.filter(
          (assignment) =>
            ![
              "cancelled",
              "declined",
            ].includes(
              assignment.status,
            ),
        )
      : relevant;

  const volunteerNameFor = (
    assignment: Row,
  ) => {
    const liveProfile =
      flow.people.find(
        (person) =>
          person.id ===
          assignment.volunteerId,
      );

    const fromProfile =
      liveProfile
        ? nameOf(
            liveProfile,
          )
        : "";

    const fromAssignment =
      String(
        assignment.volunteerName ||
          "",
      ).trim();

    if (
      fromProfile &&
      normalizeName(
        fromProfile,
      ) !== "volunteer" &&
      normalizeName(
        fromProfile,
      ) !== "user"
    ) {
      return fromProfile;
    }

    if (
      fromAssignment &&
      normalizeName(
        fromAssignment,
      ) !== "user"
    ) {
      return fromAssignment;
    }

    return (
      fromProfile ||
      fromAssignment ||
      "Volunteer"
    );
  };

  if (
    flow.volunteer &&
    caseId
  ) {
    const assignment =
      volunteerMissionAssignment ||
      relevant[0];

    const missionStep =
      !assignment
        ? 0
        : assignment.status ===
            "offered"
          ? 0
          : assignment.status ===
              "accepted"
            ? 1
            : assignment.status ===
                "responding"
              ? 2
              : assignment.status ===
                  "on_site"
                ? 3
                : assignment.status ===
                    "completed"
                  ? 4
                  : 0;

    const statusTitle =
      !assignment
        ? "Mission unavailable"
        : assignment.status ===
            "offered"
          ? "Waiting for your decision"
          : assignment.status ===
              "accepted"
            ? "Ready to respond"
            : assignment.status ===
                "responding"
              ? "You are on the way"
              : assignment.status ===
                  "on_site"
                ? "You have arrived"
                : assignment.status ===
                    "completed"
                  ? "Mission completed"
                  : assignment.status ===
                      "declined"
                    ? "Assignment declined"
                    : assignment.status ===
                        "cancelled"
                      ? "Assignment cancelled"
                      : "Mission update";

    const statusCopy =
      !assignment
        ? "Return to Volunteer Tasks and reopen the assigned mission."
        : assignment.status ===
            "offered"
          ? "Accept or decline this assignment from Volunteer Tasks first."
          : assignment.status ===
              "accepted"
            ? "Start the response when you are ready. GPS sharing and in-app navigation will begin together."
            : assignment.status ===
                "responding"
              ? "Follow the route on the map. Your resident can see your live responder position while you are responding."
              : assignment.status ===
                  "on_site"
                ? "Provide the needed assistance, then record what you actually contributed before completing the mission."
                : assignment.status ===
                    "completed"
                  ? "Live GPS sharing has ended. The resident will confirm whether the assistance was fully received, partially received, or not received."
                  : assignment.status ===
                      "declined"
                    ? "This mission is no longer active for your account."
                    : assignment.status ===
                        "cancelled"
                      ? "This mission was cancelled by the response coordinator."
                      : "Follow the current mission status shown on the map.";

    return (
      <section
        className="clean-mission-flow"
        aria-label="Volunteer mission response"
      >
        <style>{`
          .clean-mission-flow {
            width: min(1380px, 100%);
            margin: 0 auto 14px;
            padding: 16px;
            border: 1px solid #d9e9e6;
            border-radius: 18px;
            background: #ffffff;
            box-shadow: 0 8px 26px rgba(15, 23, 42, .055);
          }

          .clean-mission-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
          }

          .clean-mission-copy {
            min-width: 0;
          }

          .clean-mission-kicker {
            margin: 0 0 4px;
            color: #0f766e;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: .08em;
            text-transform: uppercase;
          }

          .clean-mission-copy h2 {
            margin: 0;
            color: #102a43;
            font-size: 18px;
            line-height: 1.25;
          }

          .clean-mission-title {
            margin: 5px 0 0;
            color: #64748b;
            font-size: 13px;
          }

          .clean-mission-status {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            min-height: 32px;
            padding: 6px 10px;
            border-radius: 999px;
            background: #e8f7f4;
            color: #0f766e;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: .04em;
            text-transform: uppercase;
          }

          .clean-mission-body {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 18px;
            align-items: center;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid #edf2f7;
          }

          .clean-mission-message strong,
          .clean-mission-message span {
            display: block;
          }

          .clean-mission-message strong {
            color: #102a43;
            font-size: 14px;
          }

          .clean-mission-message span {
            max-width: 780px;
            margin-top: 3px;
            color: #64748b;
            font-size: 12px;
            line-height: 1.5;
          }

          .clean-mission-action {
            display: flex;
            justify-content: flex-end;
            align-items: center;
          }

          .clean-mission-flow .primary-button,
          .clean-mission-flow .secondary-button {
            min-height: 42px;
            padding: 9px 15px;
            border-radius: 11px;
            font: inherit;
            font-weight: 850;
            cursor: pointer;
          }

          .clean-mission-flow .primary-button {
            border: 1px solid #0f766e;
            background: #0f766e;
            color: #ffffff;
          }

          .clean-mission-flow .secondary-button {
            border: 1px solid #bfd5d1;
            background: #ffffff;
            color: #0f766e;
          }

          .clean-mission-flow button:disabled {
            opacity: .55;
            cursor: wait;
          }

          .clean-mission-progress {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            margin-top: 14px;
          }

          .clean-mission-step {
            position: relative;
            display: flex;
            align-items: center;
            gap: 7px;
            min-width: 0;
            padding: 8px 9px;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            background: #f8fafc;
            color: #94a3b8;
            font-size: 11px;
            font-weight: 800;
          }

          .clean-mission-step.is-current {
            border-color: #9ed6cc;
            background: #effaf8;
            color: #0f766e;
          }

          .clean-mission-step.is-done {
            border-color: #cde8e2;
            background: #f5fbfa;
            color: #47756e;
          }

          .clean-mission-step-number {
            flex: 0 0 auto;
            display: grid;
            place-items: center;
            width: 22px;
            height: 22px;
            border-radius: 999px;
            background: #ffffff;
            border: 1px solid currentColor;
            font-size: 10px;
            font-weight: 900;
          }

          .clean-mission-live {
            display: flex;
            align-items: center;
            gap: 7px;
            margin-top: 12px;
            padding: 9px 11px;
            border-radius: 10px;
            background: #f2fbf8;
            color: #166b5f;
            font-size: 12px;
            font-weight: 750;
          }

          .clean-mission-live-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: #16a34a;
            box-shadow: 0 0 0 4px rgba(22, 163, 74, .12);
          }

          .clean-mission-error {
            margin: 12px 0 0;
            padding: 9px 11px;
            border-radius: 10px;
            background: #fff5f5;
            color: #b42318;
            font-size: 12px;
            font-weight: 750;
          }

          .clean-mission-flow .mission-completion-card {
            width: min(650px, 100%);
            padding: 14px;
            border: 1px solid #b9ddd7;
            border-radius: 12px;
            background: #f7fcfb;
          }

          .clean-mission-flow .mission-completion-heading {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 10px;
          }

          .clean-mission-flow .mission-completion-heading strong,
          .clean-mission-flow .mission-completion-heading span {
            display: block;
          }

          .clean-mission-flow .mission-completion-heading span {
            margin-top: 3px;
            color: #64748b;
            font-size: 11px;
          }

          .clean-mission-flow .mission-completion-card label {
            display: block;
            margin-top: 9px;
            color: #334155;
            font-size: 11px;
            font-weight: 800;
          }

          .clean-mission-flow .mission-completion-card :is(select, textarea, input) {
            display: block;
            width: 100%;
            margin-top: 5px;
            padding: 9px 10px;
            border: 1px solid #cbd5e1;
            border-radius: 9px;
            background: #ffffff;
            color: #0f172a;
            font: inherit;
          }

          .clean-mission-flow .mission-completion-card textarea {
            resize: vertical;
          }

          .clean-mission-flow .mission-completion-grid {
            display: grid;
            grid-template-columns: 160px minmax(0, 1fr);
            gap: 10px;
          }

          .clean-mission-flow .mission-completion-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: 10px;
          }

          .clean-mission-flow .mission-completion-error {
            margin: 8px 0 0;
            color: #b91c1c;
            font-size: 11px;
            font-weight: 800;
          }

          @media (max-width: 800px) {
            .clean-mission-head {
              flex-direction: column;
            }

            .clean-mission-body {
              grid-template-columns: 1fr;
            }

            .clean-mission-action {
              justify-content: flex-start;
            }

            .clean-mission-progress {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .clean-mission-flow .mission-completion-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>

        <div className="clean-mission-head">
          <div className="clean-mission-copy">
            <p className="clean-mission-kicker">
              Emergency response
            </p>

            <h2>
              {statusTitle}
            </h2>

            <p className="clean-mission-title">
              {chosen?.title ||
                assignment?.caseTitle ||
                "Assigned mission"}
            </p>
          </div>

          {assignment && (
            <span className="clean-mission-status">
              {String(
                assignment.status ||
                  "accepted",
              ).replaceAll(
                "_",
                " ",
              )}
            </span>
          )}
        </div>

        <div className="clean-mission-body">
          <div className="clean-mission-message">
            <strong>
              {assignment?.status ===
              "responding"
                ? "Navigate to the resident"
                : assignment?.status ===
                    "on_site"
                  ? "Assist the resident"
                  : assignment?.status ===
                      "accepted"
                    ? "Start your response"
                    : statusTitle}
            </strong>

            <span>
              {statusCopy}
            </span>
          </div>

          <div className="clean-mission-action">
            {!assignment ? null :
            assignment.status ===
              "accepted" ? (
              <button
                className="primary-button"
                disabled={flow.busy}
                onClick={() =>
                  flow.respond(
                    assignment,
                    "responding",
                  )
                }
              >
                Respond &amp; Share GPS
              </button>
            ) : assignment.status ===
                "responding" ? (
              <button
                className="primary-button"
                disabled={flow.busy}
                onClick={() =>
                  flow.respond(
                    assignment,
                    "on_site",
                  )
                }
              >
                Mark Arrived
              </button>
            ) : assignment.status ===
                "on_site" ? (
              <MissionCompletionForm
                assignment={assignment}
                busy={flow.busy}
                defaultPeopleHelped={
                  Number(
                    chosen
                      ?.affectedPeople ||
                      1,
                  )
                }
                onComplete={flow.respond}
              />
            ) : null}
          </div>
        </div>

        <div
          className="clean-mission-progress"
          aria-label="Mission progress"
        >
          {[
            [1, "Accepted"],
            [2, "Responding"],
            [3, "Arrived"],
            [4, "Complete"],
          ].map(([step, label]) => {
            const numberStep =
              Number(step);

            const stateClass =
              missionStep > numberStep
                ? "is-done"
                : missionStep ===
                    numberStep
                  ? "is-current"
                  : "";

            return (
              <div
                className={`clean-mission-step ${stateClass}`.trim()}
                key={String(label)}
              >
                <span className="clean-mission-step-number">
                  {missionStep >
                  numberStep
                    ? "✓"
                    : numberStep}
                </span>
                <span>{label}</span>
              </div>
            );
          })}
        </div>

        {assignment &&
          activeStates.includes(
            assignment.status,
          ) && (
            <div
              className="clean-mission-live"
              role="status"
            >
              <span
                className="clean-mission-live-dot"
                aria-hidden="true"
              />
              <span>
                {flow.canShare
                  ? flow.sentAt
                    ? "Live GPS active"
                    : "Starting live GPS…"
                  : flow.focused
                    ? "Preparing live GPS…"
                    : "Live GPS resumes automatically when you return to this response map."}
              </span>
            </div>
          )}

        {flow.error && (
          <p
            className="clean-mission-error"
            role="alert"
          >
            {flow.error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="response-flow">
      <style>{`
        .response-flow {
          width: min(1380px, 100%);
          margin: 0 auto 16px;
          padding: 20px;
          background: white;
          border: 1px solid #dce6ec;
          border-radius: 16px;
        }

        .response-flow h2 {
          margin: 0 0 8px;
          font-size: 20px;
        }

        .response-flow p {
          color: #64748b;
          margin: 6px 0 12px;
        }

        .response-flow select {
          max-width: 100%;
          padding: 10px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font: inherit;
        }

        .response-flow .flow-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .response-flow article {
          padding: 12px 0;
          border-top: 1px solid #e2e8f0;
        }

        .response-flow .flow-status {
          color: #0f766e;
          font-weight: 700;
          margin: 0 10px;
        }

        .response-flow .flow-error {
          color: #b91c1c;
        }

        .mission-summary {
          margin: 14px 0;
          padding: 16px;
          border: 1px solid #cfe3e0;
          border-radius: 14px;
          background: #f7fcfb;
        }

        .mission-summary-head {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .mission-summary h3 {
          margin: 3px 0 4px;
          font-size: 18px;
          color: #0f2740;
        }

        .mission-kicker {
          color: #0f766e;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .08em;
        }

        .mission-case-status {
          white-space: nowrap;
          padding: 6px 9px;
          border-radius: 999px;
          background: #e6f7f4;
          color: #0f766e;
          font-size: 11px;
          font-weight: 800;
        }

        .mission-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .mission-grid > div {
          min-width: 0;
          padding: 10px;
          border-radius: 10px;
          background: white;
          border: 1px solid #e2e8f0;
        }

        .mission-grid strong,
        .mission-grid span,
        .mission-grid small {
          display: block;
        }

        .mission-grid strong {
          margin-bottom: 4px;
          color: #475569;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .mission-grid span {
          color: #0f2740;
          font-weight: 700;
        }

        .mission-grid small {
          margin-top: 4px;
          color: #64748b;
        }

        .mission-note {
          margin-top: 12px !important;
          padding: 10px 12px;
          border-radius: 10px;
          background: #fff8e8;
          color: #7c4a03 !important;
        }

        .mission-evidence {
          margin-top: 12px;
        }

        .mission-evidence > div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 7px;
        }

        .mission-evidence a {
          padding: 7px 9px;
          border-radius: 8px;
          background: white;
          border: 1px solid #cbd5e1;
          color: #0f766e;
          text-decoration: none;
          font-weight: 700;
        }

        .task-gate-note {
          margin: 0 !important;
          padding: 9px 11px;
          border-radius: 9px;
          background: #fff7ed;
          color: #9a3412 !important;
          font-weight: 700;
        }

        .response-flow .mission-completion-card {
          width: min(620px, 100%);
          padding: 14px;
          border: 1px solid #b9ddd7;
          border-radius: 12px;
          background: #f7fcfb;
        }

        .response-flow .mission-completion-heading {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .response-flow .mission-completion-heading strong,
        .response-flow .mission-completion-heading span {
          display: block;
        }

        .response-flow .mission-completion-heading span {
          margin-top: 3px;
          color: #64748b;
          font-size: 11px;
        }

        .response-flow .mission-completion-card label {
          display: block;
          margin-top: 9px;
          color: #334155;
          font-size: 11px;
          font-weight: 800;
        }

        .response-flow .mission-completion-card :is(select, textarea, input) {
          display: block;
          width: 100%;
          margin-top: 5px;
          padding: 9px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #fff;
          color: #0f172a;
          font: inherit;
        }

        .response-flow .mission-completion-card textarea {
          resize: vertical;
        }

        .response-flow .mission-completion-grid {
          display: grid;
          grid-template-columns: 160px minmax(0, 1fr);
          gap: 10px;
        }

        .response-flow .mission-completion-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
        }

        .response-flow .mission-completion-error {
          color: #b91c1c;
          font-size: 11px;
          font-weight: 800;
        }

        @media (max-width: 800px) {
          .mission-grid {
            grid-template-columns: 1fr;
          }

          .mission-summary-head {
            flex-direction: column;
          }

          .response-flow .mission-completion-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <h2>
        {flow.admin
          ? "Live response monitoring"
          : "My response assignments"}
      </h2>

      <p>
        {flow.admin
          ? "Monitor assigned responders and their live shared positions here. Validate cases and assign volunteers from Disaster Cases to keep one clear LGU workflow."
          : "Open an accepted assignment from Volunteer Tasks, then choose Respond & Share GPS. During an active response, your assigned resident and authorized administrators can see your shared responder position."}
      </p>

      {flow.error && (
        <p
          className="flow-error"
          role="alert"
        >
          {flow.error}
        </p>
      )}

      {flow.admin && (
        <>
          <div className="flow-controls">
            <select
              aria-label="Select response case to monitor"
              value={caseId}
              onChange={(event) =>
                setCaseId(event.target.value)
              }
            >
              <option value="">
                Select report to monitor
              </option>

              {cases
                .filter(
                  (incident) =>
                    incident.status !== "closed",
                )
                .map((incident) => (
                  <option
                    key={incident.id}
                    value={incident.id}
                  >
                    {incident.title} · {incident.status}
                  </option>
                ))}
            </select>
          </div>

          {chosen && (
            <section className="mission-summary">
              <div className="mission-summary-head">
                <div>
                  <span className="mission-kicker">
                    LGU RESPONSE MONITORING
                  </span>
                  <h3>{chosen.title || "Emergency response"}</h3>
                  <p>
                    {chosen.location ||
                      chosen.reporterAddress ||
                      "Exact response location is shown on the map."}
                  </p>
                </div>

                <span className="mission-case-status">
                  {String(chosen.status || "assigned")
                    .replaceAll("_", " ")
                    .toUpperCase()}
                </span>
              </div>

              <div className="mission-grid">
                <div>
                  <strong>Resident / Reporter</strong>
                  <span>{chosen.reporterName || "Not provided"}</span>
                  <small>{chosen.contactNumber || "No contact number"}</small>
                </div>

                <div>
                  <strong>Incident</strong>
                  <span>{chosen.category || "Emergency assistance"}</span>
                  <small>{chosen.details || "No additional description"}</small>
                </div>

                <div>
                  <strong>Assigned responders</strong>
                  <span>{visibleRelevant.length}</span>
                  <small>Assignment changes are managed in Disaster Cases.</small>
                </div>
              </div>
            </section>
          )}

          <p>
            Live responder pins expire after two minutes without a new reading.
            Active responders publish a fresh location heartbeat while responding
            or on site.
          </p>
        </>
      )}

      {flow.volunteer &&
        caseId &&
        chosen && (
        <section className="mission-summary">
          <div className="mission-summary-head">
            <div>
              <span className="mission-kicker">
                ASSIGNED EMERGENCY
              </span>

              <h3>
                {chosen.title ||
                  "Emergency response"}
              </h3>

              <p>
                {chosen.location ||
                  chosen.reporterAddress ||
                  "Exact location is available on the map."}
              </p>
            </div>

            <span className="mission-case-status">
              {String(
                chosen.status ||
                  "assigned",
              )
                .replaceAll(
                  "_",
                  " ",
                )
                .toUpperCase()}
            </span>
          </div>

          <div className="mission-grid">
            <div>
              <strong>
                Resident /
                Reporter
              </strong>

              <span>
                {chosen.reporterName ||
                  "Not provided"}
              </span>

              <small>
                {chosen.contactNumber ||
                  "No contact number"}
              </small>
            </div>

            <div>
              <strong>
                Incident
              </strong>

              <span>
                {chosen.category ||
                  "Emergency assistance"}
              </span>

              <small>
                {chosen.details ||
                  "No additional description"}
              </small>
            </div>

            <div>
              <strong>
                Assistance needed
              </strong>

              <span>
                {Array.isArray(
                  chosen.assistanceTypes,
                ) &&
                chosen
                  .assistanceTypes
                  .length
                  ? chosen.assistanceTypes.join(
                      ", ",
                    )
                  : chosen.needs ||
                    "Not specified"}
              </span>
            </div>

            <div>
              <strong>
                Responder skills
              </strong>

              <span>
                {Array.isArray(
                  chosen.requiredSkills,
                ) &&
                chosen
                  .requiredSkills
                  .length
                  ? chosen.requiredSkills.join(
                      ", ",
                    )
                  : "Not specified"}
              </span>
            </div>

            <div>
              <strong>
                Goods / supplies
              </strong>

              <span>
                {Array.isArray(
                  chosen.neededGoods,
                ) &&
                chosen
                  .neededGoods
                  .length
                  ? chosen.neededGoods.join(
                      ", ",
                    )
                  : "Not specified"}
              </span>
            </div>

            <div>
              <strong>
                People affected
              </strong>

              <span>
                {chosen.affectedPeople ??
                  "Not specified"}
              </span>
            </div>
          </div>

          {chosen.needsNote && (
            <p className="mission-note">
              <strong>
                Response
                instructions:
              </strong>{" "}
              {chosen.needsNote}
            </p>
          )}

          {Array.isArray(
            chosen.attachments,
          ) &&
            chosen.attachments.some(
              (
                attachment: any,
              ) =>
                typeof attachment?.url ===
                  "string" &&
                attachment.url.startsWith(
                  "https://",
                ),
            ) && (
              <div className="mission-evidence">
                <strong>
                  Resident evidence
                </strong>

                <div>
                  {chosen.attachments.map(
                    (
                      attachment: any,
                      index: number,
                    ) =>
                      typeof attachment?.url ===
                        "string" &&
                      attachment.url.startsWith(
                        "https://",
                      ) ? (
                        <a
                          key={
                            index
                          }
                          href={
                            attachment.url
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View evidence{" "}
                          {index +
                            1}
                        </a>
                      ) : null,
                  )}
                </div>
              </div>
            )}
        </section>
      )}

      {flow.volunteer &&
        caseId &&
        !chosen && (
        <p
          className="flow-error"
          role="alert"
        >
          The assigned incident
          could not be loaded.
          Return to Volunteer
          Tasks and reopen the
          assignment.
        </p>
      )}

      {visibleRelevant.length ===
        0 && (
        <p>
          No active response
          assignments
          {flow.admin
            ? " for the selected report"
            : caseId
              ? " for this mission"
              : " yet"}
          .
        </p>
      )}

      {visibleRelevant.map(
        (assignment) => (
          <article
            key={assignment.id}
          >
            <strong>
              {flow.admin
                ? volunteerNameFor(
                    assignment,
                  )
                : assignment.caseTitle}
            </strong>

            <span className="flow-status">
              {String(
                assignment.status,
              ).replaceAll(
                "_",
                " ",
              )}
            </span>

            {flow.admin &&
              activeStates.includes(
                assignment.status,
              ) && (
                <p>
                  {(() => {
                    const point =
                      flow.responders.find(
                        (
                          item,
                        ) =>
                          item.assignmentId ===
                          assignment.id,
                      );

                    return point
                      ? (
                          point.stale
                            ? "Older reading · "
                            : "Location shared · "
                        ) +
                          new Date(
                            point.lastShared,
                          ).toLocaleTimeString() +
                          (
                            point.accuracy !=
                            null
                              ? " · ±" +
                                Math.round(
                                  point.accuracy,
                                ) +
                                " m"
                              : ""
                          )
                      : "No recent shared location";
                  })()}
                </p>
              )}

            <div className="flow-controls">
              {flow.volunteer &&
                assignment.status ===
                  "offered" && (
                  <p className="task-gate-note">
                    Accept or decline
                    this assignment
                    from Volunteer
                    Tasks before
                    opening the
                    response map.
                  </p>
                )}

              {flow.volunteer &&
                assignment.status ===
                  "accepted" && (
                  <button
                    className="primary-button"
                    disabled={
                      flow.busy
                    }
                    onClick={() =>
                      flow.respond(
                        assignment,
                        "responding",
                      )
                    }
                  >
                    Respond &amp;
                    Share GPS
                  </button>
                )}

              {flow.volunteer &&
                activeStates.includes(
                  assignment.status,
                ) && (
                  <>
                    {flow.shareId ===
                    assignment.id ? (
                      <button
                        className="secondary-button"
                        onClick={
                          flow.stopSharing
                        }
                      >
                        Stop
                        sharing
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        disabled={
                          !!flow.shareId
                        }
                        onClick={() =>
                          flow.resume(
                            assignment,
                          )
                        }
                      >
                        Resume
                        sharing
                      </button>
                    )}

                    {assignment.status ===
                      "responding" && (
                      <button
                        className="secondary-button"
                        disabled={
                          flow.busy
                        }
                        onClick={() =>
                          flow.respond(
                            assignment,
                            "on_site",
                          )
                        }
                      >
                        Mark
                        arrived
                      </button>
                    )}

                    {assignment.status ===
                      "on_site" && (
                      <MissionCompletionForm
                        assignment={
                          assignment
                        }
                        busy={
                          flow.busy
                        }
                        defaultPeopleHelped={
                          1
                        }
                        onComplete={
                          flow.respond
                        }
                      />
                    )}
                  </>
                )}

            </div>
          </article>
        ),
      )}

      {flow.canShare && (
        <p role="status">
          {flow.sentAt
            ? "Last shared: " +
              new Date(
                flow.sentAt,
              ).toLocaleTimeString()
            : "Waiting for a fresh location reading to share…"}
          {
            " · Leave this map or stop tracking to end sharing."
          }
        </p>
      )}
        </section>
    );
  }
