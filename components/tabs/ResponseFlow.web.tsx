import { useLocalSearchParams } from "expo-router";
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { db } from "../../lib/firebase";
import {
  activeModeForProfile,
  hasVolunteerAccess,
  isApprovedProfile,
} from "../../lib/firebaseAuth";

type Row = {
  id: string;
  [key: string]: any;
};

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
  const volunteer =
    activeModeForProfile(profile) === "volunteer" &&
    hasVolunteerAccess(profile);

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
      10000,
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

  // Queue deletion after pending writes to avoid restoring a stopped pin.
  useEffect(() => {
    if (!canShare || !user || !mission) return;

    let stopped = false;
    let pending = false;

    const uid = user.uid;
    const assignmentId = mission.id;
    const caseId = mission.caseId;
    const locationRef = doc(db, "responseLocations", uid);

    setSentAt(0);

    const publish = () => {
      const point = latestLocation.current;

      if (
        stopped ||
        pending ||
        !point ||
        Date.now() - point.timestamp > 30000
      ) {
        return;
      }

      pending = true;

      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (stopped) return;

          await setDoc(locationRef, {
            volunteerId: uid,
            assignmentId,
            caseId,
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
            updatedAt: serverTimestamp(),
          });

          if (!stopped) {
            setSentAt(Date.now());
            setError("");
          }
        })
        .catch(() => {
          if (!stopped) {
            setError(
              "Location sharing failed. Your local pin still works; admin may see an older position.",
            );
          }
        })
        .finally(() => {
          pending = false;
        });
    };

    publish();

    const timer = window.setInterval(publish, 10000);

    return () => {
      stopped = true;
      window.clearInterval(timer);

      queue.current = queue.current
        .catch(() => {})
        .then(() => deleteDoc(locationRef))
        .catch(() => {
          // Offline deletion may fail. Admin hides expired readings.
        });
    };
  }, [canShare, user?.uid, mission?.id]);

  const stopSharing = () => {
    setShareId("");
    setTracking(false);
  };

  const act = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      await operation();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Operation failed. Please retry.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const respond = (assignment: Row, next: string) =>
    act(async () => {
      await runTransaction(db, async (transaction) => {
        const assignmentRef = doc(
          db,
          "responseAssignments",
          assignment.id,
        );

        const snapshot = await transaction.get(assignmentRef);
        const current = snapshot.data();

        if (!current || current.volunteerId !== user.uid) {
          throw new Error("Assignment unavailable.");
        }

        const previous: Record<string, string> = {
          accepted: "offered",
          declined: "offered",
          responding: "accepted",
          on_site: "responding",
          completed: "on_site",
        };

        if (current.status !== previous[next]) {
          throw new Error(
            "Assignment changed. Please check its current status.",
          );
        }

        const caseRef = doc(db, "disasterCases", current.caseId);
        const caseSnapshot = await transaction.get(caseRef);
        const incident = caseSnapshot.data();

        if (!incident) {
          throw new Error("Incident unavailable.");
        }

        // Assignment status is the source of truth for responder lifecycle.
        // Resident chat/tracking access is derived from this assignment state.
        transaction.update(assignmentRef, {
          status: next,
          updatedAt: serverTimestamp(),
        });

        const noticeByStatus: Record<
          string,
          { title: string; message: string }
        > = {
          accepted: {
            title: "Responder accepted your request",
            message:
              "An assigned responder accepted your request. Confirm the situation and needed assistance before dispatch.",
          },
          responding: {
            title: "Responder is on the way",
            message:
              "Your assigned responder started the response and is sharing a live response location while the mission is active.",
          },
          on_site: {
            title: "Responder arrived",
            message:
              "Your assigned responder marked arrival at the assistance location.",
          },
          completed: {
            title: "Response mission completed",
            message:
              "The responder marked the mission complete. Admin will review the case before it is resolved or closed.",
          },
        };

        const notice = noticeByStatus[next];
        const residentUid = String(incident.reporterUid || "").trim();

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
              responderName:
                current.volunteerName || nameOf(profile),
              title: notice.title,
              message: notice.message,
              type: "resident_response_update",
              status: next,
              read: false,
              createdAt: serverTimestamp(),
            },
          );
        }
      });

      if (next === "responding") {
        setShareId(assignment.id);
        setTracking(true);
      }

      if (next === "completed") {
        stopSharing();
      }
    });

  const assign = (caseId: string, volunteerId: string) =>
    act(async () => {
      if (!caseId || !volunteerId) {
        throw new Error("Select a case and volunteer.");
      }

      const person = people.find(
        (item) => item.id === volunteerId,
      );

      if (!person) {
        throw new Error("Volunteer not available.");
      }

      await runTransaction(db, async (transaction) => {
        const caseRef = doc(db, "disasterCases", caseId);

        const assignmentRef = doc(
          db,
          "responseAssignments",
          caseId + "_" + volunteerId,
        );

        const [caseSnapshot, existing] = await Promise.all([
          transaction.get(caseRef),
          transaction.get(assignmentRef),
        ]);

        const incident = caseSnapshot.data();

        if (
          !incident ||
          !["validated", "assigned", "in_progress"].includes(
            incident.status,
          )
        ) {
          throw new Error(
            "Validate this report before assigning.",
          );
        }

        if (existing.exists()) {
          throw new Error(
            "This volunteer already has an assignment record for this case.",
          );
        }

        transaction.set(assignmentRef, {
          caseId,
          volunteerId,
          volunteerName: nameOf(person),
          caseTitle: incident.title || "Incident",
          status: "offered",
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const patch: any = {
          assignedVolunteerIds: arrayUnion(volunteerId),
          updatedAt: serverTimestamp(),
        };

        if (
          !(incident.assignedVolunteerIds || []).includes(
            volunteerId,
          )
        ) {
          patch.assignedVolunteersCount = increment(1);
        }

        if (incident.status === "validated") {
          patch.status = "assigned";
          patch.assignedAt = serverTimestamp();
        }

        transaction.update(caseRef, patch);

        transaction.set(
          doc(
            db,
            "notifications",
            "response_" + caseId + "_" + volunteerId,
          ),
          {
            userId: volunteerId,
            title: "New response assignment",
            message:
              "You have been assigned to " +
              (incident.title || "an incident") +
              ". Open Volunteer Tasks to accept or decline.",
            type: "response_assignment",
            read: false,
            createdAt: serverTimestamp(),
          },
        );
      });
    });

  const changeCase = (incident: Row, next: string) =>
    act(async () => {
      const previous: Record<string, string> = {
        validated: "reported",
        in_progress: "assigned",
        resolved: "in_progress",
        closed: "resolved",
      };

      await runTransaction(db, async (transaction) => {
        const caseRef = doc(
          db,
          "disasterCases",
          incident.id,
        );

        const snapshot = await transaction.get(caseRef);

        if (snapshot.data()?.status !== previous[next]) {
          throw new Error(
            "Case status changed. Refresh the selection.",
          );
        }

        const patch: any = {
          status: next,
          updatedAt: serverTimestamp(),
        };

        if (next === "validated") {
          patch.validatedAt = serverTimestamp();
        }

        if (next === "resolved") {
          patch.resolvedAt = serverTimestamp();
        }

        if (next === "closed") {
          patch.closedAt = serverTimestamp();
        }

        transaction.update(caseRef, patch);
      });
    });

  const cancel = (assignment: Row) =>
    act(async () => {
      await updateDoc(
        doc(db, "responseAssignments", assignment.id),
        {
          status: "cancelled",
          updatedAt: serverTimestamp(),
        },
      );
    });

  const responders = useMemo(
    () =>
      admin
        ? locations
            .filter((point) => {
              const assignment = assignments.find(
                (item) => item.id === point.assignmentId,
              );

              const incident = cases.find(
                (item) => item.id === point.caseId,
              );

              return (
                assignment &&
                assignment.volunteerId === point.volunteerId &&
                assignment.caseId === point.caseId &&
                activeStates.includes(assignment.status) &&
                incident &&
                ["assigned", "in_progress"].includes(
                  incident.status,
                ) &&
                millis(point.updatedAt) > 0 &&
                now - millis(point.updatedAt) < 120000 &&
                Number.isFinite(point.latitude) &&
                Number.isFinite(point.longitude)
              );
            })
            .map((point) => ({
              ...point,
              assignmentId: point.assignmentId,
              accuracy: point.accuracy,
              stale: now - millis(point.updatedAt) > 30000,
              lastShared: millis(point.updatedAt),
              name: (() => {
                const assignment = assignments.find(
                  (item) => item.id === point.assignmentId,
                );
                const person = people.find(
                  (item) => item.id === point.volunteerId,
                );

                const liveName = person ? nameOf(person) : "";
                const savedName = String(
                  assignment?.volunteerName || "",
                ).trim();

                if (
                  liveName &&
                  normalizeName(liveName) !== "volunteer" &&
                  normalizeName(liveName) !== "user"
                ) {
                  return liveName;
                }

                if (
                  savedName &&
                  normalizeName(savedName) !== "user"
                ) {
                  return savedName;
                }

                return liveName || savedName || "Volunteer";
              })(),
            }))
        : [],
    [admin, locations, assignments, people, cases, now],
  );

  return {
    admin,
    volunteer,
    assignments,
    people,
    responders,
    shareId,
    canShare,
    sentAt,
    error,
    busy,
    respond,
    assign,
    cancel,
    changeCase,
    stopSharing,
    resume: (assignment: Row) => {
      setShareId(assignment.id);
      setTracking(true);
    },
  };
}

export function ResponsePanel({
  flow,
  cases,
}: {
  flow: ReturnType<typeof useResponseFlow>;
  cases: Row[];
}) {
  const params = useLocalSearchParams<{
    caseId?: string;
    volunteerId?: string;
  }>();

  const [caseId, setCaseId] = useState(
    typeof params.caseId === "string" ? params.caseId : "",
  );

  const [personId, setPersonId] = useState(
    typeof params.volunteerId === "string"
      ? params.volunteerId
      : "",
  );

  useEffect(() => {
    setCaseId(
      typeof params.caseId === "string" ? params.caseId : "",
    );
  }, [params.caseId]);

  useEffect(() => {
    setPersonId(
      typeof params.volunteerId === "string"
        ? params.volunteerId
        : "",
    );
  }, [params.volunteerId]);

  const chosen = cases.find((item) => item.id === caseId);

  if (!flow.admin && !flow.volunteer) return null;

  const relevant = flow.admin
    ? flow.assignments.filter(
        (assignment) => assignment.caseId === caseId,
      )
    : caseId
      ? flow.assignments.filter(
          (assignment) => assignment.caseId === caseId,
        )
      : flow.assignments;

  const nextStatus: Record<string, string> = {
    reported: "validated",
    assigned: "in_progress",
    in_progress: "resolved",
    resolved: "closed",
  };

  const actions: Record<string, string> = {
    reported: "Validate report",
    assigned: "Mark case in progress",
    in_progress: "Resolve case",
    resolved: "Close case",
  };

  const mayResolve =
    relevant.some(
      (assignment) => assignment.status === "completed",
    ) &&
    relevant.every((assignment) =>
      terminalStates.includes(assignment.status),
    );


  // Keep legacy cancelled/declined records in Firestore for audit/history,
  // but do not clutter the active Admin response workspace with them.
  const visibleRelevant = flow.admin
    ? relevant.filter(
        (assignment) =>
          !["cancelled", "declined"].includes(assignment.status),
      )
    : relevant;

  const volunteerNameFor = (assignment: Row) => {
    const liveProfile = flow.people.find(
      (person) => person.id === assignment.volunteerId,
    );

    const fromProfile = liveProfile ? nameOf(liveProfile) : "";
    const fromAssignment = String(
      assignment.volunteerName || "",
    ).trim();

    if (
      fromProfile &&
      normalizeName(fromProfile) !== "volunteer" &&
      normalizeName(fromProfile) !== "user"
    ) {
      return fromProfile;
    }

    if (
      fromAssignment &&
      normalizeName(fromAssignment) !== "user"
    ) {
      return fromAssignment;
    }

    return fromProfile || fromAssignment || "Volunteer";
  };

  // Volunteer mission view: keep only the field-response controls here.
  // Assignment details belong in Volunteer Tasks and incident/resident details
  // already live beside the map, so repeating the large summary is redundant.
  if (flow.volunteer && caseId) {
    const assignment = relevant[0];

    return (
      <section className="mission-action-bar" aria-label="Mission response controls">
        <style>{`
          .mission-action-bar {
            width: min(1380px, 100%);
            margin: 0 auto 14px;
            padding: 12px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            border: 1px solid #cfe3e0;
            border-radius: 14px;
            background: #ffffff;
            box-shadow: 0 6px 20px rgba(15, 23, 42, .05);
          }

          .mission-action-copy {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
          }

          .mission-action-copy strong {
            color: #0f2740;
            font-size: 14px;
          }

          .mission-action-status {
            display: inline-flex;
            align-items: center;
            min-height: 28px;
            padding: 5px 9px;
            border-radius: 999px;
            background: #e6f7f4;
            color: #0f766e;
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: .04em;
          }

          .mission-action-controls {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            flex-wrap: wrap;
          }

          .mission-action-note {
            width: 100%;
            margin: 0;
            color: #64748b;
            font-size: 12px;
          }

          .mission-action-error {
            width: 100%;
            margin: 0;
            color: #b91c1c;
            font-size: 12px;
            font-weight: 700;
          }

          .mission-action-bar .primary-button,
          .mission-action-bar .secondary-button {
            min-height: 38px;
            padding: 8px 11px;
            border-radius: 10px;
            font: inherit;
            font-weight: 800;
            cursor: pointer;
          }

          .mission-action-bar .primary-button {
            border: 1px solid #0f766e;
            background: #0f766e;
            color: #fff;
          }

          .mission-action-bar .secondary-button {
            border: 1px solid #cbd5e1;
            background: #fff;
            color: #0f766e;
          }

          .mission-action-bar button:disabled {
            opacity: .55;
            cursor: wait;
          }

          @media (max-width: 760px) {
            .mission-action-bar {
              align-items: stretch;
              flex-direction: column;
            }

            .mission-action-controls {
              justify-content: flex-start;
            }
          }
        `}</style>

        <div className="mission-action-copy">
          <strong>{chosen?.title || assignment?.caseTitle || "Assigned mission"}</strong>

          {assignment && (
            <span className="mission-action-status">
              {String(assignment.status || "accepted").replaceAll("_", " ")}
            </span>
          )}

          {!assignment && (
            <p className="mission-action-error">
              No response assignment was found for this mission. Return to Volunteer Tasks and reopen it.
            </p>
          )}

          {flow.error && (
            <p className="mission-action-error" role="alert">
              {flow.error}
            </p>
          )}
        </div>

        {assignment && (
          <div className="mission-action-controls">
            {assignment.status === "offered" && (
              <span className="mission-action-note">
                Accept or decline this assignment from Volunteer Tasks first.
              </span>
            )}

            {assignment.status === "accepted" && (
              <button
                className="primary-button"
                disabled={flow.busy}
                onClick={() => flow.respond(assignment, "responding")}
              >
                Respond &amp; Share GPS
              </button>
            )}

            {activeStates.includes(assignment.status) && (
              <>
                {flow.shareId === assignment.id ? (
                  <button
                    className="secondary-button"
                    onClick={flow.stopSharing}
                  >
                    Stop sharing
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    disabled={!!flow.shareId}
                    onClick={() => flow.resume(assignment)}
                  >
                    Resume sharing
                  </button>
                )}

                {assignment.status === "responding" && (
                  <button
                    className="secondary-button"
                    disabled={flow.busy}
                    onClick={() => flow.respond(assignment, "on_site")}
                  >
                    Mark Arrived
                  </button>
                )}

                {assignment.status === "on_site" && (
                  <button
                    className="primary-button"
                    disabled={flow.busy}
                    onClick={() => flow.respond(assignment, "completed")}
                  >
                    Complete Mission
                  </button>
                )}
              </>
            )}

            {terminalStates.includes(assignment.status) && (
              <span className="mission-action-note">
                {assignment.status === "completed"
                  ? "Mission completed · live GPS sharing ended."
                  : assignment.status === "declined"
                    ? "This assignment was declined."
                    : "This assignment was cancelled."}
              </span>
            )}
          </div>
        )}

        {flow.canShare && (
          <p className="mission-action-note" role="status">
            {flow.sentAt
              ? "Live GPS shared · last update " +
                new Date(flow.sentAt).toLocaleTimeString()
              : "GPS sharing started · waiting for a fresh location reading…"}
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

        @media (max-width: 800px) {
          .mission-grid {
            grid-template-columns: 1fr;
          }

          .mission-summary-head {
            flex-direction: column;
          }
        }
      `}</style>

      <h2>
        {flow.admin
          ? "Response coordination"
          : "My response assignments"}
      </h2>

      <p>
        {flow.admin
          ? "Validate reports, assign volunteers, and monitor shared positions on this map."
          : "Open an accepted assignment from Volunteer Tasks, then choose Respond & Share GPS. Only authorized administrators can see your shared position."}
      </p>

      {flow.error && (
        <p className="flow-error" role="alert">
          {flow.error}
        </p>
      )}

      {flow.admin && (
        <>
          <div className="flow-controls">
            <select
              aria-label="Select response case"
              value={caseId}
              onChange={(event) =>
                setCaseId(event.target.value)
              }
            >
              <option value="">Select report</option>

              {cases
                .filter((incident) => incident.status !== "closed")
                .map((incident) => (
                  <option
                    key={incident.id}
                    value={incident.id}
                  >
                    {incident.title} · {incident.status}
                  </option>
                ))}
            </select>

            {chosen && nextStatus[chosen.status] && (
              <button
                className="secondary-button"
                disabled={
                  flow.busy ||
                  (
                    chosen.status === "in_progress" &&
                    !mayResolve
                  )
                }
                onClick={() =>
                  flow.changeCase(
                    chosen,
                    nextStatus[chosen.status],
                  )
                }
              >
                {actions[chosen.status]}
              </button>
            )}

            {chosen &&
              ["validated", "assigned", "in_progress"].includes(
                chosen.status,
              ) && (
                <>
                  <select
                    aria-label="Select volunteer"
                    value={personId}
                    onChange={(event) =>
                      setPersonId(event.target.value)
                    }
                  >
                    <option value="">
                      Select approved volunteer
                    </option>

                    {flow.people.map((person) => (
                      <option
                        key={person.id}
                        value={person.id}
                      >
                        {nameOf(person)}
                      </option>
                    ))}
                  </select>

                  <button
                    className="primary-button"
                    disabled={flow.busy || !personId}
                    onClick={() =>
                      flow.assign(caseId, personId)
                    }
                  >
                    Assign volunteer
                  </button>
                </>
              )}
          </div>

          {chosen && (
            <details style={{ marginTop: 12 }}>
              <summary>
                Review incident details before proceeding
              </summary>

              <p>
                <strong>{chosen.title}</strong>
                {" · "}
                {chosen.location || "No address provided"}
              </p>

              <p>
                {chosen.details || "No description provided"}
              </p>

              <p>
                Needs: {chosen.needs || "Not specified"}
              </p>

              <p>
                Reporter: {chosen.reporterName || "Not provided"}
                {" · "}
                Contact: {chosen.contactNumber || "Not provided"}
              </p>

              {Array.isArray(chosen.attachments) &&
                chosen.attachments.map(
                  (attachment: any, index: number) =>
                    typeof attachment.url === "string" &&
                    attachment.url.startsWith("https://") ? (
                      <a
                        key={index}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginRight: 12 }}
                      >
                        View evidence {index + 1}
                      </a>
                    ) : null,
                )}
            </details>
          )}

          {chosen?.status === "in_progress" && !mayResolve && (
            <p>
              Resolve after at least one volunteer completes and
              all other assignments are completed, declined, or
              cancelled.
            </p>
          )}

          <p>
            Live responder pins expire after two minutes without
            a new reading. Stopping sharing normally removes the
            pin immediately.
          </p>
        </>
      )}

      {flow.volunteer && caseId && chosen && (
        <section className="mission-summary">
          <div className="mission-summary-head">
            <div>
              <span className="mission-kicker">
                ASSIGNED EMERGENCY
              </span>
              <h3>{chosen.title || "Emergency response"}</h3>
              <p>
                {chosen.location ||
                  chosen.reporterAddress ||
                  "Exact location is available on the map."}
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
              <span>
                {chosen.reporterName || "Not provided"}
              </span>
              <small>
                {chosen.contactNumber || "No contact number"}
              </small>
            </div>

            <div>
              <strong>Incident</strong>
              <span>
                {chosen.category || "Emergency assistance"}
              </span>
              <small>
                {chosen.details || "No additional description"}
              </small>
            </div>

            <div>
              <strong>Assistance needed</strong>
              <span>
                {Array.isArray(chosen.assistanceTypes) &&
                chosen.assistanceTypes.length
                  ? chosen.assistanceTypes.join(", ")
                  : chosen.needs || "Not specified"}
              </span>
            </div>

            <div>
              <strong>Responder skills</strong>
              <span>
                {Array.isArray(chosen.requiredSkills) &&
                chosen.requiredSkills.length
                  ? chosen.requiredSkills.join(", ")
                  : "Not specified"}
              </span>
            </div>

            <div>
              <strong>Goods / supplies</strong>
              <span>
                {Array.isArray(chosen.neededGoods) &&
                chosen.neededGoods.length
                  ? chosen.neededGoods.join(", ")
                  : "Not specified"}
              </span>
            </div>

            <div>
              <strong>People affected</strong>
              <span>
                {chosen.affectedPeople ?? "Not specified"}
              </span>
            </div>
          </div>

          {chosen.needsNote && (
            <p className="mission-note">
              <strong>Response instructions:</strong>{" "}
              {chosen.needsNote}
            </p>
          )}

          {Array.isArray(chosen.attachments) &&
            chosen.attachments.some(
              (attachment: any) =>
                typeof attachment?.url === "string" &&
                attachment.url.startsWith("https://"),
            ) && (
              <div className="mission-evidence">
                <strong>Resident evidence</strong>
                <div>
                  {chosen.attachments.map(
                    (attachment: any, index: number) =>
                      typeof attachment?.url === "string" &&
                      attachment.url.startsWith("https://") ? (
                        <a
                          key={index}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View evidence {index + 1}
                        </a>
                      ) : null,
                  )}
                </div>
              </div>
            )}
        </section>
      )}

      {flow.volunteer && caseId && !chosen && (
        <p className="flow-error" role="alert">
          The assigned incident could not be loaded. Return to
          Volunteer Tasks and reopen the assignment.
        </p>
      )}

      {visibleRelevant.length === 0 && (
        <p>
          No active response assignments
          {flow.admin
            ? " for the selected report"
            : caseId
              ? " for this mission"
              : " yet"}.
        </p>
      )}

      {visibleRelevant.map((assignment) => (
        <article key={assignment.id}>
          <strong>
            {flow.admin
              ? volunteerNameFor(assignment)
              : assignment.caseTitle}
          </strong>

          <span className="flow-status">
            {String(assignment.status).replaceAll("_", " ")}
          </span>

          {flow.admin &&
            activeStates.includes(assignment.status) && (
              <p>
                {(() => {
                  const point = flow.responders.find(
                    (item) =>
                      item.assignmentId === assignment.id,
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
                          point.accuracy != null
                            ? " · ±" +
                              Math.round(point.accuracy) +
                              " m"
                            : ""
                        )
                    : "No recent shared location";
                })()}
              </p>
            )}

          <div className="flow-controls">
            {flow.volunteer &&
              assignment.status === "offered" && (
                <p className="task-gate-note">
                  Accept or decline this assignment from
                  Volunteer Tasks before opening the response map.
                </p>
              )}

            {flow.volunteer &&
              assignment.status === "accepted" && (
                <button
                  className="primary-button"
                  disabled={flow.busy}
                  onClick={() =>
                    flow.respond(assignment, "responding")
                  }
                >
                  Respond &amp; Share GPS
                </button>
              )}

            {flow.volunteer &&
              activeStates.includes(assignment.status) && (
                <>
                  {flow.shareId === assignment.id ? (
                    <button
                      className="secondary-button"
                      onClick={flow.stopSharing}
                    >
                      Stop sharing
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={!!flow.shareId}
                      onClick={() =>
                        flow.resume(assignment)
                      }
                    >
                      Resume sharing
                    </button>
                  )}

                  {assignment.status === "responding" && (
                    <button
                      className="secondary-button"
                      disabled={flow.busy}
                      onClick={() =>
                        flow.respond(assignment, "on_site")
                      }
                    >
                      Mark arrived
                    </button>
                  )}

                  {assignment.status === "on_site" && (
                    <button
                      className="primary-button"
                      disabled={flow.busy}
                      onClick={() =>
                        flow.respond(assignment, "completed")
                      }
                    >
                      Complete my task
                    </button>
                  )}
                </>
              )}

            {flow.admin &&
              !terminalStates.includes(assignment.status) && (
                <button
                  className="secondary-button"
                  disabled={flow.busy}
                  onClick={() =>
                    flow.cancel(assignment)
                  }
                >
                  Cancel assignment
                </button>
              )}
          </div>
        </article>
      ))}

      {flow.canShare && (
        <p role="status">
          {flow.sentAt
            ? "Last shared: " +
              new Date(flow.sentAt).toLocaleTimeString()
            : "Waiting for a fresh location reading to share…"}
          {" · Leave this map or stop tracking to end sharing."}
        </p>
      )}
    </section>
  );
}