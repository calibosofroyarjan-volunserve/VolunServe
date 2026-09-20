const crypto = require("crypto");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions");
const {onCall, HttpsError} = require("firebase-functions/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

initializeApp();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 5,
});

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3.5-flash";

const ALLOWED_ROLES = new Set([
  "resident",
  "volunteer",
  "admin",
  "superadmin",
]);

const ACTIVE_STATUSES = new Set([
  "reported",
  "validated",
  "assigned",
  "in_progress",
]);

const SEVERITY_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function clampNumber(value, minimum, maximum, fallback = 0) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, numberValue));
}

function cleanText(value, maximumLength = 240) {
  return String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maximumLength);
}

function roundedCoordinate(value) {
  return Number(Number(value).toFixed(3));
}

function distanceKm(startLat, startLng, endLat, endLng) {
  const earthRadiusKm = 6371;

  const latitudeDifference =
    ((endLat - startLat) * Math.PI) / 180;

  const longitudeDifference =
    ((endLng - startLng) * Math.PI) / 180;

  const startLatitude =
    (startLat * Math.PI) / 180;

  const endLatitude =
    (endLat * Math.PI) / 180;

  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
        Math.sqrt(haversine),
        Math.sqrt(1 - haversine),
    )
  );
}

function normalizeRiskLevel(value, fallback) {
  const allowed = new Set([
    "Low",
    "Moderate",
    "High",
    "Critical",
  ]);

  return allowed.has(value) ? value : fallback;
}

function normalizeStringList(
    value,
    maximumItems,
    maximumLength,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
      .map((item) => cleanText(item, maximumLength))
      .filter(Boolean)
      .slice(0, maximumItems);
}

function severityWeight(severity) {
  return (
    SEVERITY_WEIGHT[
        String(severity || "medium").toLowerCase()
    ] || 2
  );
}

function buildRuleBasedBriefing(snapshot) {
  const unresolved = snapshot.incidents.filter(
      (incident) =>
        ACTIVE_STATUSES.has(incident.status),
  );

  const severityLoad = unresolved.reduce(
      (total, incident) =>
        total + severityWeight(incident.severity),
      0,
  );

  const criticalCount = unresolved.filter(
      (incident) =>
        incident.severity === "critical",
  ).length;

  const highCount = unresolved.filter(
      (incident) =>
        incident.severity === "high",
  ).length;

  const fullCenters =
    snapshot.evacuationCenters.filter(
        (center) =>
          center.capacity > 0 &&
          center.occupied >= center.capacity,
    ).length;

  const responderCapacityVisible =
    snapshot.responseCapacity.visible;

  const availableResponders =
    snapshot.responseCapacity.availableVolunteers;

  const responderPenalty =
    !responderCapacityVisible ?
      0 :
      availableResponders === 0 ?
        8 :
        Math.max(
            0,
            severityLoad - availableResponders * 2,
        );

  const score =
    severityLoad * 1.8 +
    criticalCount * 4 +
    highCount * 2 +
    fullCenters * 4 +
    responderPenalty;

  let riskLevel = "Low";

  if (score >= 25) {
    riskLevel = "Critical";
  } else if (score >= 16) {
    riskLevel = "High";
  } else if (score >= 8) {
    riskLevel = "Moderate";
  }

  const priorityIncidentIds = [...unresolved]
      .sort((left, right) => {
        const severityDifference =
          severityWeight(right.severity) -
          severityWeight(left.severity);

        if (severityDifference !== 0) {
          return severityDifference;
        }

        return (
          left.distanceFromUserKm -
          right.distanceFromUserKm
        );
      })
      .slice(0, 3)
      .map((incident) => incident.id);

  const recommendedActions = [];

  if (criticalCount > 0) {
    recommendedActions.push(
        "Verify and prioritize critical incidents before dispatching responders.",
    );
  }

  if (
    responderCapacityVisible &&
    availableResponders === 0
  ) {
    recommendedActions.push(
        "Escalate responder availability; no available volunteer is currently visible.",
    );
  }

  if (fullCenters > 0) {
    recommendedActions.push(
        "Avoid full evacuation centers and confirm overflow capacity with authorized staff.",
    );
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push(
        "Continue monitoring verified incidents, responder availability, and evacuation capacity.",
    );
  }

  return {
    source: "rule_based_fallback",
    model: "",
    riskLevel,

    summary: responderCapacityVisible ?
      `Rule-based operational check found ${unresolved.length} unresolved incident(s), ${criticalCount} critical incident(s), and ${availableResponders} available responder(s).` :
      `Rule-based operational check found ${unresolved.length} unresolved incident(s) and ${criticalCount} critical incident(s). Responder counts are hidden for this role.`,

    recommendedActions:
      recommendedActions.slice(0, 4),

    priorityIncidentIds,

    confidence: 0,

    limitations: [
      "This result is a transparent rule-based fallback, not an AI prediction.",
      "Field decisions require confirmation by authorized disaster-response personnel.",
    ],

    generatedAt: new Date().toISOString(),
  };
}

async function loadOperationalSnapshot(
    database,
    uid,
    role,
    userLocation,
    selectedIncidentId,
) {
  const incidentCollection =
    role === "resident" ?
      "publicIncidentSummaries" :
      "disasterCases";

  const promises = [
    database
        .collection(incidentCollection)
        .limit(60)
        .get(),

    database
        .collection("evacuation_centers")
        .limit(40)
        .get(),
  ];

  if (
    role === "volunteer" ||
    role === "admin" ||
    role === "superadmin"
  ) {
    promises.push(
        database
            .collection("volunteers_live_locations")
            .limit(100)
            .get(),
    );
  }

  const results = await Promise.all(promises);

  const incidentSnapshot = results[0];
  const centerSnapshot = results[1];
  const volunteerSnapshot = results[2] || null;

  const incidents = incidentSnapshot.docs
      .map((documentSnapshot) => {
        const data = documentSnapshot.data();

        const latitude = Number(data.latitude);
        const longitude = Number(data.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return null;
        }

        const assignedIds =
          Array.isArray(data.assignedVolunteerIds) ?
            data.assignedVolunteerIds :
            [];

        const visibleToVolunteer =
          role !== "volunteer" ||
          data.status === "validated" ||
          data.assignedVolunteerId === uid ||
          assignedIds.includes(uid);

        if (
          !visibleToVolunteer ||
          data.status === "closed"
        ) {
          return null;
        }

        return {
          id: documentSnapshot.id,

          type: cleanText(
              data.category ||
              data.type ||
              "emergency",
              60,
          ),

          severity: cleanText(
              data.severity || "medium",
              16,
          ).toLowerCase(),

          status: cleanText(
              data.status || "reported",
              24,
          ).toLowerCase(),

          locationLabel: cleanText(
              data.location ||
              "GPS-tagged location",
              100,
          ),

          details:
            role === "resident" ?
              "" :
              cleanText(data.details, 220),

          needs:
            role === "resident" ?
              "" :
              cleanText(data.needs, 160),

          requiredVolunteers: clampNumber(
              data.requiredVolunteers,
              0,
              100,
          ),

          assignedVolunteersCount: clampNumber(
              data.assignedVolunteersCount,
              0,
              100,
          ),

          distanceFromUserKm: Number(
              distanceKm(
                  userLocation.latitude,
                  userLocation.longitude,
                  latitude,
                  longitude,
              ).toFixed(2),
          ),

          latitude: roundedCoordinate(latitude),
          longitude: roundedCoordinate(longitude),

          isSelected:
            documentSnapshot.id ===
            selectedIncidentId,
        };
      })
      .filter(Boolean);

  const evacuationCenters = centerSnapshot.docs
      .map((documentSnapshot) => {
        const data = documentSnapshot.data();

        const latitude = Number(data.latitude);
        const longitude = Number(data.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return null;
        }

        return {
          id: documentSnapshot.id,

          name: cleanText(
              data.name || "Evacuation Center",
              100,
          ),

          capacity: clampNumber(
              data.capacity,
              0,
              100000,
          ),

          occupied: clampNumber(
              data.occupied,
              0,
              100000,
          ),

          distanceFromUserKm: Number(
              distanceKm(
                  userLocation.latitude,
                  userLocation.longitude,
                  latitude,
                  longitude,
              ).toFixed(2),
          ),
        };
      })
      .filter(Boolean)
      .sort(
          (left, right) =>
            left.distanceFromUserKm -
            right.distanceFromUserKm,
      );

  const volunteers = volunteerSnapshot ?
    volunteerSnapshot.docs.map(
        (documentSnapshot) => {
          const data = documentSnapshot.data();

          const latitude = Number(data.latitude);
          const longitude = Number(data.longitude);

          return {
            status: cleanText(
                data.status || "available",
                20,
            ).toLowerCase(),

            distanceFromUserKm:
              Number.isFinite(latitude) &&
              Number.isFinite(longitude) ?
                Number(
                    distanceKm(
                        userLocation.latitude,
                        userLocation.longitude,
                        latitude,
                        longitude,
                    ).toFixed(2),
                ) :
                null,

            hasAssignment: Boolean(
                data.assignedIncidentId,
            ),
          };
        },
    ) :
    [];

  return {
    role:
      role === "superadmin" ?
        "admin" :
        role,

    userLocation: {
      latitude: roundedCoordinate(
          userLocation.latitude,
      ),

      longitude: roundedCoordinate(
          userLocation.longitude,
      ),
    },

    selectedIncidentId:
      selectedIncidentId || "",

    incidents,

    evacuationCenters,

    responseCapacity: {
      visible: Boolean(volunteerSnapshot),

      availableVolunteers:
        volunteers.filter(
            (volunteer) =>
              volunteer.status === "available",
        ).length,

      respondingVolunteers:
        volunteers.filter(
            (volunteer) =>
              volunteer.status === "responding",
        ).length,

      totalVisibleVolunteers:
        volunteers.length,
    },
  };
}

async function requestGeminiBriefing(snapshot) {
  const apiKey = GEMINI_API_KEY.value();

  if (!apiKey) {
    throw new Error(
        "GEMINI_API_KEY is not configured",
    );
  }

  const responseSchema = {
    type: "object",
    additionalProperties: false,

    required: [
      "riskLevel",
      "summary",
      "recommendedActions",
      "priorityIncidentIds",
      "confidence",
      "limitations",
    ],

    properties: {
      riskLevel: {
        type: "string",

        enum: [
          "Low",
          "Moderate",
          "High",
          "Critical",
        ],
      },

      summary: {
        type: "string",
        maxLength: 500,
      },

      recommendedActions: {
        type: "array",
        minItems: 1,
        maxItems: 4,

        items: {
          type: "string",
          maxLength: 180,
        },
      },

      priorityIncidentIds: {
        type: "array",
        maxItems: 3,

        items: {
          type: "string",
          maxLength: 128,
        },
      },

      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },

      limitations: {
        type: "array",
        minItems: 1,
        maxItems: 3,

        items: {
          type: "string",
          maxLength: 180,
        },
      },
    },
  };

  const systemInstruction = [
    "You are VolunServe's cautious disaster-response decision-support assistant.",

    "Analyze only the supplied verified operational snapshot. Never invent an incident, capacity, responder, route, or official instruction.",

    "Treat reported or unverified records as unconfirmed and say verification is required.",

    "Prioritize life safety, verified critical incidents, responder constraints, evacuation capacity, and distance.",

    "Return recommendations for human review. Never claim that a dispatch, rescue, evacuation, or emergency call has been completed.",

    "Do not expose personal data. Do not provide medical diagnosis. Keep the summary concise and operational.",
  ].join(" ");

  const endpoint =
    "https://generativelanguage.googleapis.com/" +
    "v1beta/models/" +
    encodeURIComponent(GEMINI_MODEL) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  const response = await fetch(endpoint, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: systemInstruction,
          },
        ],
      },

      contents: [
        {
          role: "user",

          parts: [
            {
              text:
                "Create a role-aware operational briefing " +
                "from this snapshot:\n" +
                JSON.stringify(snapshot),
            },
          ],
        },
      ],

      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 900,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
      },
    }),
  });

  if (!response.ok) {
    logger.error(
        "Gemini briefing request failed",
        {
          status: response.status,
        },
    );

    throw new Error(
        `Gemini request failed with status ${response.status}`,
    );
  }

  const payload = await response.json();

  const responseText =
    payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

  if (!responseText) {
    throw new Error(
        "Gemini returned an empty response",
    );
  }

  return JSON.parse(responseText);
}

function validateGeminiBriefing(
    candidate,
    fallback,
    validIncidentIds,
) {
  const priorityIncidentIds =
    normalizeStringList(
        candidate?.priorityIncidentIds,
        3,
        128,
    ).filter(
        (id) => validIncidentIds.has(id),
    );

  const recommendedActions =
    normalizeStringList(
        candidate?.recommendedActions,
        4,
        180,
    );

  const limitations =
    normalizeStringList(
        candidate?.limitations,
        3,
        180,
    );

  return {
    source: "gemini",
    model: GEMINI_MODEL,

    riskLevel: normalizeRiskLevel(
        candidate?.riskLevel,
        fallback.riskLevel,
    ),

    summary:
      cleanText(candidate?.summary, 500) ||
      fallback.summary,

    recommendedActions:
      recommendedActions.length > 0 ?
        recommendedActions :
        fallback.recommendedActions,

    priorityIncidentIds,

    confidence: clampNumber(
        candidate?.confidence,
        0,
        1,
        0.5,
    ),

    limitations:
      limitations.length > 0 ?
        limitations :
        [
          "AI output requires confirmation by authorized personnel.",
        ],

    generatedAt: new Date().toISOString(),
  };
}

exports.generateMapBriefing = onCall(
    {
      secrets: [GEMINI_API_KEY],
      timeoutSeconds: 60,
      memory: "256MiB",
    },

    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError(
            "unauthenticated",
            "Sign in before requesting an AI map briefing.",
        );
      }

      const latitude = clampNumber(
          request.data?.latitude,
          -90,
          90,
          Number.NaN,
      );

      const longitude = clampNumber(
          request.data?.longitude,
          -180,
          180,
          Number.NaN,
      );

      const selectedIncidentId = cleanText(
          request.data?.selectedIncidentId,
          128,
      );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        throw new HttpsError(
            "invalid-argument",
            "A valid current location is required.",
        );
      }

      const database = getFirestore();
      const uid = request.auth.uid;

      const userSnapshot = await database
          .collection("users")
          .doc(uid)
          .get();

      const profile =
        userSnapshot.data() || {};

      const role = cleanText(
          profile.role,
          20,
      ).toLowerCase();

      const approved =
        profile.status === "approved" ||
        (
          !profile.status &&
          role !== "applicant"
        );

      if (
        !userSnapshot.exists ||
        !approved ||
        !ALLOWED_ROLES.has(role)
      ) {
        throw new HttpsError(
            "permission-denied",
            "This account is not approved for map intelligence.",
        );
      }

      const rateLimitReference = database
          .collection("aiMapRateLimits")
          .doc(uid);

      const rateLimitSnapshot =
        await rateLimitReference.get();

      const previousRequestMillis =
        rateLimitSnapshot
            .data()
            ?.lastRequestAt
            ?.toMillis?.() || 0;

      if (
        Date.now() -
        previousRequestMillis <
        15000
      ) {
        throw new HttpsError(
            "resource-exhausted",
            "Wait a few seconds before refreshing the AI briefing.",
        );
      }

      await rateLimitReference.set(
          {
            lastRequestAt:
              FieldValue.serverTimestamp(),
          },
          {
            merge: true,
          },
      );

      const snapshot =
        await loadOperationalSnapshot(
            database,
            uid,
            role,
            {
              latitude,
              longitude,
            },
            selectedIncidentId,
        );

      const fallback =
        buildRuleBasedBriefing(snapshot);

      let briefing = fallback;

      try {
        const candidate =
          await requestGeminiBriefing(snapshot);

        briefing =
          validateGeminiBriefing(
              candidate,
              fallback,
              new Set(
                  snapshot.incidents.map(
                      (incident) => incident.id,
                  ),
              ),
          );
      } catch (error) {
        logger.error(
            "Using rule-based AI map fallback",
            {
              uidHash: crypto
                  .createHash("sha256")
                  .update(uid)
                  .digest("hex")
                  .slice(0, 12),

              message:
                error instanceof Error ?
                  error.message :
                  "Unknown AI error",
            },
        );
      }

      const inputHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(snapshot))
          .digest("hex");

      await database
          .collection("aiMapBriefings")
          .add({
            uid,
            role: snapshot.role,

            source: briefing.source,
            model: briefing.model || "",

            inputHash,

            incidentCount:
              snapshot.incidents.length,

            evacuationCenterCount:
              snapshot.evacuationCenters.length,

            riskLevel:
              briefing.riskLevel,

            confidence:
              briefing.confidence,

            createdAt:
              FieldValue.serverTimestamp(),
          });

      return briefing;
    },
);

// =========================================================
// VERIFIED VOLUNTEER CONTRIBUTIONS
// =========================================================
exports.processAssistanceConfirmation = onDocumentCreated(
    "assistanceConfirmations/{assignmentId}",
    async (event) => {
      const confirmationSnapshot = event.data;

      if (!confirmationSnapshot) {
        return;
      }

      const confirmation =
        confirmationSnapshot.data() || {};

      const assignmentId = cleanText(
          event.params.assignmentId,
          160,
      );

      const caseId = cleanText(
          confirmation.caseId,
          160,
      );

      const volunteerId = cleanText(
          confirmation.volunteerId,
          160,
      );

      const residentId = cleanText(
          confirmation.residentId,
          160,
      );

      const outcome = cleanText(
          confirmation.outcome,
          40,
      ).toLowerCase();

      if (
        !assignmentId ||
        !caseId ||
        !volunteerId ||
        !residentId ||
        ![
          "fully_helped",
          "partially_helped",
          "not_helped",
        ].includes(outcome)
      ) {
        logger.error(
            "Invalid assistance confirmation payload",
            {assignmentId},
        );

        return;
      }

      const database = getFirestore();

      const confirmationRef = database
          .collection("assistanceConfirmations")
          .doc(assignmentId);

      const assignmentRef = database
          .collection("responseAssignments")
          .doc(assignmentId);

      const caseRef = database
          .collection("disasterCases")
          .doc(caseId);

      const contributionRef = database
          .collection("verifiedContributions")
          .doc(assignmentId);

      const statsRef = database
          .collection("volunteerStats")
          .doc(volunteerId);

      const disputeRef = database
          .collection("responseDisputes")
          .doc(assignmentId);

      await database.runTransaction(
          async (transaction) => {
            const [
              currentConfirmationSnapshot,
              assignmentSnapshot,
              caseSnapshot,
              existingContributionSnapshot,
            ] = await Promise.all([
              transaction.get(
                  confirmationRef,
              ),

              transaction.get(
                  assignmentRef,
              ),

              transaction.get(
                  caseRef,
              ),

              transaction.get(
                  contributionRef,
              ),
            ]);

            if (
              !currentConfirmationSnapshot.exists ||
              !assignmentSnapshot.exists ||
              !caseSnapshot.exists
            ) {
              logger.error(
                  "Confirmation references missing response data",
                  {
                    assignmentId,
                    caseId,
                  },
              );

              return;
            }

            const currentConfirmation =
              currentConfirmationSnapshot.data() ||
              {};

            const assignment =
              assignmentSnapshot.data() ||
              {};

            const incident =
              caseSnapshot.data() ||
              {};

            if (
              assignment.caseId !== caseId ||
              assignment.volunteerId !== volunteerId ||
              assignment.status !== "completed" ||
              incident.reporterUid !== residentId
            ) {
              transaction.set(
                  confirmationRef,
                  {
                    creditStatus:
                      "rejected",

                    creditError:
                      "Linked case or assignment did not pass verification.",

                    processedAt:
                      FieldValue.serverTimestamp(),

                    updatedAt:
                      FieldValue.serverTimestamp(),
                  },
                  {
                    merge: true,
                  },
              );

              return;
            }

            // -----------------------------------------------
            // NOT HELPED = ADMIN REVIEW
            // -----------------------------------------------
            if (
              outcome === "not_helped"
            ) {
              transaction.set(
                  confirmationRef,
                  {
                    creditStatus:
                      "disputed",

                    processedAt:
                      FieldValue.serverTimestamp(),

                    updatedAt:
                      FieldValue.serverTimestamp(),
                  },
                  {
                    merge: true,
                  },
              );

              transaction.set(
                  assignmentRef,
                  {
                    residentConfirmationStatus:
                      "disputed",

                    residentConfirmedAt:
                      FieldValue.serverTimestamp(),

                    updatedAt:
                      FieldValue.serverTimestamp(),
                  },
                  {
                    merge: true,
                  },
              );

              transaction.set(
                  disputeRef,
                  {
                    assignmentId,
                    caseId,
                    volunteerId,
                    residentId,

                    residentNote:
                      cleanText(
                          currentConfirmation.residentNote,
                          1000,
                      ),

                    contributionType:
                      cleanText(
                          assignment.contributionType,
                          100,
                      ),

                    contributionSummary:
                      cleanText(
                          assignment.contributionSummary,
                          1200,
                      ),

                    status: "open",

                    createdAt:
                      FieldValue.serverTimestamp(),

                    updatedAt:
                      FieldValue.serverTimestamp(),
                  },
                  {
                    merge: false,
                  },
              );

              transaction.set(
                  database
                      .collection("notifications")
                      .doc(
                          `volunteer_dispute_${assignmentId}`,
                      ),

                  {
                    userId:
                      volunteerId,

                    caseId,
                    assignmentId,

                    title:
                      "Assistance confirmation needs review",

                    message:
                      "The resident marked this completed response as not helped. Admin review is required before any service credit is issued.",

                    type:
                      "volunteer_contribution_review",

                    read: false,

                    createdAt:
                      FieldValue.serverTimestamp(),
                  },
                  {
                    merge: true,
                  },
              );

              return;
            }

            // Prevent double credit
            if (
              existingContributionSnapshot.exists
            ) {
              transaction.set(
                  confirmationRef,
                  {
                    creditStatus:
                      "credited",

                    verifiedContributionId:
                      assignmentId,

                    processedAt:
                      FieldValue.serverTimestamp(),

                    updatedAt:
                      FieldValue.serverTimestamp(),
                  },
                  {
                    merge: true,
                  },
              );

              return;
            }

            const responseStartedAt =
              assignment.responseStartedAt ||
              null;

            const arrivedAt =
              assignment.arrivedAt ||
              null;

            const completedAt =
              assignment.completedAt ||
              null;

            const responseStartedMillis =
              responseStartedAt
                  ?.toMillis?.() ||
              0;

            const completedMillis =
              completedAt
                  ?.toMillis?.() ||
              0;

            let serviceMinutes = 0;

            if (
              responseStartedMillis > 0 &&
              completedMillis >=
                responseStartedMillis
            ) {
              serviceMinutes =
                Math.round(
                    (
                      completedMillis -
                      responseStartedMillis
                    ) /
                    (1000 * 60),
                );
            }

            serviceMinutes =
              Math.min(
                  24 * 60,
                  Math.max(
                      0,
                      serviceMinutes,
                  ),
              );

            const peopleHelped =
              Math.min(
                  999,
                  Math.max(
                      0,

                      Number.isInteger(
                          assignment.peopleHelped,
                      ) ?
                        assignment.peopleHelped :
                        0,
                  ),
              );

            const contributionType =
              cleanText(
                  assignment.contributionType ||
                  "General Volunteer Assistance",
                  100,
              );

            const contributionSummary =
              cleanText(
                  assignment.contributionSummary,
                  1200,
              );

            const volunteerName =
              cleanText(
                  assignment.volunteerName ||
                  "Volunteer",
                  120,
              );

            // -----------------------------------------------
            // CREATE VERIFIED CONTRIBUTION
            // -----------------------------------------------
            transaction.create(
                contributionRef,
                {
                  assignmentId,
                  caseId,
                  volunteerId,
                  volunteerName,
                  residentId,

                  outcome,

                  contributionType,
                  contributionSummary,

                  peopleHelped,
                  serviceMinutes,

                  completionNotes:
                    cleanText(
                        assignment.completionNotes,
                        600,
                    ),

                  responseStartedAt,
                  arrivedAt,
                  completedAt,

                  residentConfirmedAt:
                    currentConfirmation.createdAt ||
                    FieldValue.serverTimestamp(),

                  verificationSource:
                    "resident_confirmation",

                  status:
                    "verified",

                  createdAt:
                    FieldValue.serverTimestamp(),

                  verifiedAt:
                    FieldValue.serverTimestamp(),
                },
            );

            // -----------------------------------------------
            // UPDATE VOLUNTEER STATS
            // -----------------------------------------------
            const statsPatch = {
              uid:
                volunteerId,

              volunteerName,

              verifiedHelps:
                FieldValue.increment(1),

              verifiedEmergencyResponses:
                FieldValue.increment(1),

              verifiedServiceMinutes:
                FieldValue.increment(
                    serviceMinutes,
                ),

              peopleHelped:
                FieldValue.increment(
                    peopleHelped,
                ),

              updatedAt:
                FieldValue.serverTimestamp(),

              lastVerifiedAt:
                FieldValue.serverTimestamp(),
            };

            if (
              outcome ===
              "fully_helped"
            ) {
              statsPatch.fullVerifiedHelps =
                FieldValue.increment(1);
            } else {
              statsPatch.partialVerifiedHelps =
                FieldValue.increment(1);
            }

            transaction.set(
                statsRef,
                statsPatch,
                {
                  merge: true,
                },
            );

            transaction.set(
                confirmationRef,
                {
                  creditStatus:
                    "credited",

                  verifiedContributionId:
                    assignmentId,

                  creditedAt:
                    FieldValue.serverTimestamp(),

                  processedAt:
                    FieldValue.serverTimestamp(),

                  updatedAt:
                    FieldValue.serverTimestamp(),
                },
                {
                  merge: true,
                },
            );

            transaction.set(
                assignmentRef,
                {
                  residentConfirmationStatus:
                    "resident_confirmed",

                  residentConfirmationOutcome:
                    outcome,

                  verifiedContributionId:
                    assignmentId,

                  residentConfirmedAt:
                    FieldValue.serverTimestamp(),

                  verifiedAt:
                    FieldValue.serverTimestamp(),

                  updatedAt:
                    FieldValue.serverTimestamp(),
                },
                {
                  merge: true,
                },
            );

            // -----------------------------------------------
            // NOTIFY VOLUNTEER
            // -----------------------------------------------
            transaction.set(
                database
                    .collection("notifications")
                    .doc(
                        `volunteer_verified_${assignmentId}`,
                    ),

                {
                  userId:
                    volunteerId,

                  caseId,
                  assignmentId,

                  title:
                    "Verified contribution recorded",

                  message:
                    outcome ===
                    "fully_helped" ?
                      "The resident confirmed the assistance you provided. This mission is now part of your verified volunteer record." :
                      "The resident confirmed that you provided partial assistance. This mission is now recorded as a verified partial contribution.",

                  type:
                    "volunteer_contribution_verified",

                  read: false,

                  createdAt:
                    FieldValue.serverTimestamp(),
                },

                {
                  merge: true,
                },
            );

            // -----------------------------------------------
            // AUDIT LOG
            // -----------------------------------------------
            transaction.set(
                database
                    .collection("responseAuditLogs")
                    .doc(
                        `verified_${assignmentId}`,
                    ),

                {
                  event:
                    "verified_contribution_created",

                  assignmentId,
                  caseId,
                  volunteerId,
                  residentId,

                  outcome,
                  contributionType,
                  serviceMinutes,
                  peopleHelped,

                  createdAt:
                    FieldValue.serverTimestamp(),
                },

                {
                  merge: false,
                },
            );
          },
      );
    },
);

// =========================================================
// VOLUNTEER CERTIFICATE ISSUANCE
// Admin/Super Admin reviews verified contribution records.
// =========================================================
exports.issueVolunteerCertificate = onCall(
    {
      timeoutSeconds: 60,
      memory: "256MiB",
    },

    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError(
            "unauthenticated",
            "Sign in before issuing a volunteer certificate.",
        );
      }

      const database =
        getFirestore();

      const issuerUid =
        request.auth.uid;

      const volunteerId =
        cleanText(
            request.data?.volunteerId,
            160,
        );

      if (!volunteerId) {
        throw new HttpsError(
            "invalid-argument",
            "A volunteer ID is required.",
        );
      }

      // -----------------------------------------------
      // LOAD ISSUER + VOLUNTEER
      // -----------------------------------------------
      const [
        issuerSnapshot,
        volunteerSnapshot,
      ] = await Promise.all([
        database
            .collection("users")
            .doc(issuerUid)
            .get(),

        database
            .collection("users")
            .doc(volunteerId)
            .get(),
      ]);

      if (
        !issuerSnapshot.exists
      ) {
        throw new HttpsError(
            "permission-denied",
            "Issuer account was not found.",
        );
      }

      const issuerProfile =
        issuerSnapshot.data() ||
        {};

      const issuerRole =
        cleanText(
            issuerProfile.role,
            30,
        ).toLowerCase();

      const issuerApproved =
        issuerProfile.status ===
          "approved" ||
        (
          !issuerProfile.status &&
          issuerRole !==
            "applicant"
        );

      if (
        !issuerApproved ||
        ![
          "admin",
          "superadmin",
        ].includes(
            issuerRole,
        )
      ) {
        throw new HttpsError(
            "permission-denied",
            "Only an approved Admin or Super Admin can issue certificates.",
        );
      }

      if (
        !volunteerSnapshot.exists
      ) {
        throw new HttpsError(
            "not-found",
            "Volunteer account was not found.",
        );
      }

      const volunteerProfile =
        volunteerSnapshot.data() ||
        {};

      const volunteerRole =
        cleanText(
            volunteerProfile.role,
            30,
        ).toLowerCase();

      const volunteerApproved =
        volunteerProfile.status ===
          "approved" ||
        (
          !volunteerProfile.status &&
          volunteerRole !==
            "applicant"
        );

      const hasVolunteerAccess =
        volunteerRole ===
          "volunteer" ||
        volunteerProfile
            .volunteerAccess ===
          true;

      if (
        !volunteerApproved ||
        !hasVolunteerAccess
      ) {
        throw new HttpsError(
            "failed-precondition",
            "The selected account is not an approved volunteer.",
        );
      }

      // -----------------------------------------------
      // LOAD VERIFIED CONTRIBUTIONS
      // -----------------------------------------------
      const contributionsSnapshot =
        await database
            .collection(
                "verifiedContributions",
            )
            .where(
                "volunteerId",
                "==",
                volunteerId,
            )
            .get();

      const verifiedContributions =
        contributionsSnapshot.docs
            .map(
                (
                  documentSnapshot,
                ) => ({
                  id:
                    documentSnapshot.id,

                  ...(
                    documentSnapshot.data() ||
                    {}
                  ),
                }),
            )

            .filter(
                (item) =>
                  item.status ===
                  "verified",
            )

            .sort(
                (
                  left,
                  right,
                ) => {
                  const rightMillis =
                    right
                        .verifiedAt
                        ?.toMillis?.() ||
                    0;

                  const leftMillis =
                    left
                        .verifiedAt
                        ?.toMillis?.() ||
                    0;

                  return (
                    rightMillis -
                    leftMillis
                  );
                },
            );

      if (
        verifiedContributions.length ===
        0
      ) {
        throw new HttpsError(
            "failed-precondition",
            "This volunteer has no verified contribution record yet.",
        );
      }

      // -----------------------------------------------
      // RECALCULATE ACTUAL VERIFIED TOTALS
      // -----------------------------------------------
      let fullVerifiedHelps =
        0;

      let partialVerifiedHelps =
        0;

      let verifiedServiceMinutes =
        0;

      let peopleHelped =
        0;

      const contributionCounts =
        new Map();

      for (
        const contribution
        of verifiedContributions
      ) {
        if (
          contribution.outcome ===
          "fully_helped"
        ) {
          fullVerifiedHelps +=
            1;
        } else if (
          contribution.outcome ===
          "partially_helped"
        ) {
          partialVerifiedHelps +=
            1;
        }

        verifiedServiceMinutes +=
          Math.max(
              0,

              Math.round(
                  Number(
                      contribution.serviceMinutes ||
                      0,
                  ),
              ),
          );

        peopleHelped +=
          Math.max(
              0,

              Math.round(
                  Number(
                      contribution.peopleHelped ||
                      0,
                  ),
              ),
          );

        const contributionType =
          cleanText(
              contribution.contributionType ||
              "General Volunteer Assistance",
              100,
          );

        contributionCounts.set(
            contributionType,

            (
              contributionCounts.get(
                  contributionType,
              ) ||
              0
            ) + 1,
        );
      }

      const contributionBreakdown =
        [
          ...contributionCounts.entries(),
        ]
            .map(
                (
                  [
                    type,
                    count,
                  ],
                ) => ({
                  type,
                  count,
                }),
            )

            .sort(
                (
                  left,
                  right,
                ) => {
                  if (
                    right.count !==
                    left.count
                  ) {
                    return (
                      right.count -
                      left.count
                    );
                  }

                  return (
                    left.type.localeCompare(
                        right.type,
                    )
                  );
                },
            );

      const contributionIds =
        verifiedContributions
            .map(
                (item) =>
                  item.id,
            )
            .sort();

      const verifiedHelps =
        fullVerifiedHelps +
        partialVerifiedHelps;

      // -----------------------------------------------
      // CREATE SNAPSHOT HASH
      // -----------------------------------------------
      const snapshotHash =
        crypto
            .createHash(
                "sha256",
            )

            .update(
                JSON.stringify({
                  volunteerId,
                  contributionIds,
                  fullVerifiedHelps,
                  partialVerifiedHelps,
                  verifiedServiceMinutes,
                  peopleHelped,
                  contributionBreakdown,
                }),
            )

            .digest(
                "hex",
            );

      const year =
        new Date()
            .getUTCFullYear();

      const certificateId =
        `VS-${year}-${snapshotHash
            .slice(
                0,
                12,
            )
            .toUpperCase()}`;

      // -----------------------------------------------
      // REFERENCES
      // -----------------------------------------------
      const certificateRef =
        database
            .collection(
                "certificates",
            )
            .doc(
                certificateId,
            );

      const publicVerificationRef =
        database
            .collection(
                "publicCertificateVerifications",
            )
            .doc(
                certificateId,
            );

      const notificationRef =
        database
            .collection(
                "notifications",
            )
            .doc(
                `certificate_issued_${certificateId}`,
            );

      // -----------------------------------------------
      // NAMES
      // -----------------------------------------------
      const volunteerName =
        cleanText(
            volunteerProfile.fullName ||
            [
              volunteerProfile.firstName,
              volunteerProfile.middleName,
              volunteerProfile.lastName,
            ]
                .filter(
                    Boolean,
                )
                .join(" ") ||
            "Volunteer",

            140,
        );

      const issuerName =
        cleanText(
            issuerProfile.fullName ||
            [
              issuerProfile.firstName,
              issuerProfile.middleName,
              issuerProfile.lastName,
            ]
                .filter(
                    Boolean,
                )
                .join(" ") ||
            "Authorized Administrator",

            140,
        );

      // -----------------------------------------------
      // ATOMIC CERTIFICATE CREATION
      // -----------------------------------------------
      const result =
        await database.runTransaction(
            async (
              transaction,
            ) => {
              const existingCertificateSnapshot =
                await transaction.get(
                    certificateRef,
                );

              // Avoid duplicate issuance for same snapshot
              if (
                existingCertificateSnapshot.exists
              ) {
                const existing =
                  existingCertificateSnapshot.data() ||
                  {};

                if (
                  existing.userId ===
                    volunteerId &&
                  existing.snapshotHash ===
                    snapshotHash &&
                  existing.verificationStatus !==
                    "revoked"
                ) {
                  return {
                    certificateId,
                    alreadyIssued:
                      true,
                  };
                }

                throw new HttpsError(
                    "already-exists",
                    "A certificate with this verification ID already exists.",
                );
              }

              // =======================================
              // PRIVATE CERTIFICATE
              // =======================================
              transaction.create(
                  certificateRef,

                  {
                    certificateId,

                    certificateType:
                      "verified_volunteer_service",

                    certificateTitle:
                      "Certificate of Volunteer Service",

                    // Compatibility with existing certificate rules
                    userId:
                      volunteerId,

                    volunteerId,
                    volunteerName,

                    verifiedHelps,

                    fullVerifiedHelps,

                    partialVerifiedHelps,

                    verifiedEmergencyResponses:
                      verifiedHelps,

                    verifiedServiceMinutes,

                    peopleHelped,

                    contributionBreakdown,

                    contributionIds,

                    contributionCount:
                      contributionIds.length,

                    snapshotHash,

                    verificationStatus:
                      "issued",

                    issuedBy:
                      issuerUid,

                    issuedByUid:
                      issuerUid,

                    issuedByName:
                      issuerName,

                    issuedByRole:
                      issuerRole,

                    issuerOrganization:
                      "VolunServe",

                    issuedAt:
                      FieldValue.serverTimestamp(),

                    createdAt:
                      FieldValue.serverTimestamp(),

                    updatedAt:
                      FieldValue.serverTimestamp(),
                  },
              );

              // =======================================
              // PUBLIC SAFE VERIFICATION
              // =======================================
              transaction.create(
                  publicVerificationRef,

                  {
                    certificateId,

                    certificateType:
                      "verified_volunteer_service",

                    certificateTitle:
                      "Certificate of Volunteer Service",

                    volunteerName,

                    verifiedHelps,

                    verifiedServiceMinutes,

                    peopleHelped,

                    contributionBreakdown,

                    issuerOrganization:
                      "VolunServe",

                    issuedByName:
                      issuerName,

                    verificationStatus:
                      "issued",

                    snapshotHash,

                    issuedAt:
                      FieldValue.serverTimestamp(),

                    createdAt:
                      FieldValue.serverTimestamp(),
                  },
              );

              // =======================================
              // VOLUNTEER NOTIFICATION
              // =======================================
              transaction.set(
                  notificationRef,

                  {
                    userId:
                      volunteerId,

                    title:
                      "Volunteer certificate issued",

                    message:
                      "An authorized administrator issued your verified volunteer service certificate.",

                    type:
                      "certificate_issued",

                    certificateId,

                    read:
                      false,

                    createdAt:
                      FieldValue.serverTimestamp(),
                  },

                  {
                    merge: true,
                  },
              );

              return {
                certificateId,
                alreadyIssued:
                  false,
              };
            },
        );

      // -----------------------------------------------
      // SERVER AUDIT LOG
      // -----------------------------------------------
      logger.info(
          "Volunteer certificate issued",

          {
            certificateId:
              result.certificateId,

            volunteerUidHash:
              crypto
                  .createHash(
                      "sha256",
                  )
                  .update(
                      volunteerId,
                  )
                  .digest(
                      "hex",
                  )
                  .slice(
                      0,
                      12,
                  ),

            issuerUidHash:
              crypto
                  .createHash(
                      "sha256",
                  )
                  .update(
                      issuerUid,
                  )
                  .digest(
                      "hex",
                  )
                  .slice(
                      0,
                      12,
                  ),

            alreadyIssued:
              result.alreadyIssued,
          },
      );

      return {
        ok:
          true,

        certificateId:
          result.certificateId,

        alreadyIssued:
          result.alreadyIssued,

        verifiedHelps,

        verifiedServiceMinutes,

        peopleHelped,
      };
    },
);