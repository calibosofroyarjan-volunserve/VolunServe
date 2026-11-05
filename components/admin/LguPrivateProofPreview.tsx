import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { loadLguProofForSuperAdmin } from "../../lib/lguCredentialImages";

type State = { status: "loading" | "ready" | "error"; idPhoto: string | null; appointment: string | null };

export default function LguPrivateProofPreview({
  uid, onReady,
}: { uid: string; onReady?: (uid: string, complete: boolean) => void }) {
  const [state, setState] = useState<State>({ status: "loading", idPhoto: null, appointment: null });
  useEffect(() => {
    let active = true;
    setState({ status: "loading", idPhoto: null, appointment: null });
    onReady?.(uid, false);
    void Promise.all([
      loadLguProofForSuperAdmin(uid, "staff-id"),
      loadLguProofForSuperAdmin(uid, "appointment-letter"),
    ]).then(([idPhoto, appointment]) => {
      if (!active) return;
      setState({ status: "ready", idPhoto, appointment });
      onReady?.(uid, !!idPhoto && !!appointment);
    }).catch(() => {
      if (!active) return;
      setState({ status: "error", idPhoto: null, appointment: null });
      onReady?.(uid, false);
    });
    return () => { active = false; };
  }, [uid, onReady]);

  const caption = { color: "#426B59", fontSize: 12, fontWeight: "700" as const };
  const frame = { width: "100%" as const, height: 205, borderRadius: 9, backgroundColor: "#F1F6F3" };

  return (
    <View style={{ padding: 14, backgroundColor: "#F7FAF8", borderRadius: 12, gap: 12, marginTop: 12, borderColor: "#D6E7DD", borderWidth: 1 }}>
      <Text style={{ color: "#125D47", fontSize: 13, fontWeight: "800" }}>PRIVATE LGU STAFF DOCUMENTS · SUPER ADMIN ONLY</Text>
      {state.status === "loading" ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <ActivityIndicator color="#087D60" />
          <Text style={caption}>Retrieving credentials securely…</Text>
        </View>
      ) : state.status === "error" ? (
        <Text style={{ color: "#B42336", fontSize: 12 }}>Cannot retrieve credential images. Verify Super Admin permission and Firebase Storage access before approving.</Text>
      ) : (
        <>
          <View style={{ gap: 5 }}>
            <Text style={caption}>Valid staff / government ID</Text>
            {state.idPhoto ? <Image source={{ uri: state.idPhoto }} style={frame} resizeMode="contain" /> :
              <Text style={{ color: "#B42336", fontSize: 12 }}>No ID image submitted. Ask the applicant to resubmit before approval.</Text>}
          </View>
          <View style={{ gap: 5 }}>
            <Text style={caption}>Appointment letter / proof of employment</Text>
            {state.appointment ? <Image source={{ uri: state.appointment }} style={frame} resizeMode="contain" /> :
              <Text style={{ color: "#B42336", fontSize: 12 }}>No appointment/employment proof submitted. Ask the applicant to resubmit before approval.</Text>}
          </View>
        </>
      )}
      <Text style={{ fontSize: 11, lineHeight: 17, color: "#547665" }}>
        Images are fetched using authenticated Firebase Storage requests. No public download links are created or saved.
      </Text>
    </View>
  );
}
