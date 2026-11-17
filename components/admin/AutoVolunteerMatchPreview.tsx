import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";

import { db } from "../../lib/firebase";
import {
  AUTO_VOLUNTEER_MATCH_UI_PREVIEW,
  previewFromExistingAdminData,
} from "../../lib/automaticVolunteerMatchPreview";

/**
 * Staging-only, READ-ONLY diagnostic. Does not create offers, mutate cases,
 * update notifications or replace the original Admin Volunteer matching UI.
 * The existing Volunteer assignment controls remain the sole live workflow.
 */
type Props = {
  incident: Record<string, any>;
  approvedVolunteers: Record<string, any>[];
  assignments: Record<string, any>[];
  knownBarangays: readonly string[];
  authorized: boolean;
};

export default function AutoVolunteerMatchPreview({
  incident,
  approvedVolunteers,
  assignments,
  knownBarangays,
  authorized,
}: Props) {
  const [locks, setLocks] = useState<Record<string, unknown> | undefined>();
  const [lockStatus, setLockStatus] =
    useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (!AUTO_VOLUNTEER_MATCH_UI_PREVIEW || !authorized) return;
    // One conditional, staging-only subscription. Missing/failed locks are
    // NEVER treated as an empty set of available Volunteers.
    return onSnapshot(
      collection(db, "responderLocks"),
      (snapshot) => {
        const next: Record<string, unknown> = Object.create(null);
        snapshot.docs.forEach((item) => {
          next[item.id] = item.data();
        });
        setLocks(next);
        setLockStatus("ready");
      },
      () => {
        setLocks(undefined);
        setLockStatus("failed");
      },
    );
  }, [authorized]);

  const result = useMemo(
    () =>
      previewFromExistingAdminData({
        incident,
        approvedVolunteers,
        assignments,
        responderLocksByUid: locks,
        knownBarangays: Array.from(knownBarangays),
      }),
    [incident, approvedVolunteers, assignments, locks, knownBarangays],
  );

  if (!AUTO_VOLUNTEER_MATCH_UI_PREVIEW || !authorized) return null;

  const message =
    lockStatus === "failed"
      ? "Responder-lock permissions unavailable. Recommendation blocked."
      : lockStatus === "loading"
        ? "Reading responder locks before checking eligible Volunteers…"
        : result.status === "offer"
          ? `Illustrative Wave ${result.wave || 0} match. No task has been sent.`
          : `No safe offer recommended: ${result.reason || result.status}.`;

  return (
    <View
      accessible
      accessibilityLabel="Staging only automatic Volunteer preview"
      style={{
        backgroundColor: "#f5faf9",
        borderColor: "#cde6dd",
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ fontSize: 12, color: "#075e49", fontWeight: "800" }}>
        AUTOMATIC VOLUNTEER MATCHING — STAGING PREVIEW ONLY
      </Text>
      <Text style={{ fontSize: 12, color: "#334155", marginTop: 6 }}>
        {message}
      </Text>
      {result.requiresOfficialEscalation && (
        <Text style={{ fontSize: 12, color: "#9a3412", marginTop: 5 }}>
          High/critical incident: contact official emergency services. Volunteer
          support is never an official dispatch replacement.
        </Text>
      )}
      <Text style={{ fontSize: 11, color: "#64748b", marginTop: 7 }}>
        Existing manual assignments, notifications and cases remain unchanged.
        No Firebase write, automatic task offer or production activation occurs here.
      </Text>
    </View>
  );
}
