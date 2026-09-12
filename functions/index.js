const crypto = require("crypto");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions");
const {onCall, HttpsError} = require("firebase-functions/https");
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