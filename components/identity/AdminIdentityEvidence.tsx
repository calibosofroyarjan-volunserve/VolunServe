import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Image, Modal, ScrollView, Text, TouchableOpacity,
  View, useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const API = "https://volunserve.onrender.com";
type AuthUser = { getIdToken: (forceRefresh?: boolean) => Promise<string> };
type EvidenceImage = { url: string; expiresAt: number };
type EvidenceResponse = {
  ok: boolean;
  verificationId: string;
  expiresAt?: string;
  images: { front?: EvidenceImage; back?: EvidenceImage; selfie?: EvidenceImage };
};

const LABELS = [
  { key: "front", label: "National ID — Front", icon: "id-card-outline" as const },
  { key: "back", label: "National ID — Back", icon: "card-outline" as const },
  { key: "selfie", label: "Live Selfie", icon: "scan-outline" as const },
] as const;

/**
 * Never fetch identity photos from Firestore or publicly exposed URLs.
 * The protected backend validates an approved operational Admin token before
 * issuing short-lived authenticated Cloudinary URLs.
 */
export default function AdminIdentityEvidence({
  uid, user,
}: {
  uid: string;
  user: AuthUser | null;
}) {
  const { width } = useWindowDimensions();
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [expanded, setExpanded] = useState<{ label: string; uri: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setExpanded(null);
    setEvidence(null);
    setError("");
    if (!user || !uid) return () => { cancelled = true; };
    const run = async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken(true);
        const res = await fetch(
          API + "/api/admin/identity/reviews/" + encodeURIComponent(uid) + "/evidence",
          { headers: { Authorization: "Bearer " + token, "Cache-Control": "no-store" }, cache: "no-store" },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message || "Private identity images could not be retrieved.");
        }
        if (!cancelled) setEvidence(body as EvidenceResponse);
      } catch (caught: any) {
        if (!cancelled) setError(String(caught?.message || "Could not load secure ID evidence."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [uid, user, refreshIndex]);

  const wide = width >= 850;
  return (
    <View style={{ marginTop: 10, marginBottom: 22, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: "#172B3A" }}>Secure Identity Evidence</Text>
          <Text style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
            Original captured ID photos and selfie · authorized Admin access only
          </Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh private identity pictures"
          onPress={() => setRefreshIndex((index) => index + 1)}
          style={{ backgroundColor: "#EEF6F3", borderRadius: 9, padding: 9 }}>
          <Ionicons name="refresh-outline" size={19} color="#08765A" />
        </TouchableOpacity>
      </View>
      {loading ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
        <ActivityIndicator color="#08765A" />
        <Text style={{ color: "#64748B", fontSize: 12 }}>Opening protected evidence...</Text>
      </View> : null}
      {error ? <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#FECACA", padding: 14, backgroundColor: "#FFF7F7" }}>
        <Text style={{ color: "#991B1B", fontSize: 12, fontWeight: "600" }}>Evidence not available</Text>
        <Text style={{ color: "#7F1D1D", fontSize: 12, marginTop: 4 }}>{error}</Text>
        <Text style={{ color: "#7F1D1D", fontSize: 11, marginTop: 5 }}>
          Do not approve on an AI score alone. Request resubmission or use an independent LGU-approved validation method.
        </Text>
      </View> : null}
      {evidence && !loading ? <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {LABELS.map(({ key, label, icon }) => {
            const photo = evidence.images?.[key];
            return (
              <View key={key} style={{
                minWidth: wide ? 185 : 138, flexGrow: 1, flexBasis: wide ? "28%" : "46%",
                borderRadius: 11, backgroundColor: "#F8FAFC",
                borderColor: "#DCE6ED", borderWidth: 1, overflow: "hidden",
              }}>
                {photo?.url ? (
                  <TouchableOpacity onPress={() => setExpanded({ label, uri: photo.url })}
                    accessibilityRole="button" accessibilityLabel={"Enlarge " + label}>
                    <Image source={{ uri: photo.url }} resizeMode="contain"
                      style={{ width: "100%", height: wide ? 172 : 145, backgroundColor: "#E8EEF2" }} />
                  </TouchableOpacity>
                ) : (
                  <View style={{ height: wide ? 172 : 145, backgroundColor: "#F1F5F9",
                    justifyContent: "center", alignItems: "center", gap: 8 }}>
                    <Ionicons name={icon} size={32} color="#94A3B8" />
                    <Text style={{ fontSize: 11, color: "#64748B" }}>Not submitted</Text>
                  </View>
                )}
                <View style={{ paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row",
                  justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: "#243647", fontWeight: "600" }}>{label}</Text>
                  <Ionicons name={photo ? "expand-outline" : "alert-circle-outline"}
                    size={16} color={photo ? "#08765A" : "#B45309"} />
                </View>
              </View>
            );
          })}
        </View>
        <Text style={{ fontSize: 11, color: "#64748B" }}>
          Compare the ID portrait with the selfie and review the independent AI screening below.
          Access links expire in 5 minutes; refresh to continue reviewing.
          Evidence access is audited.
        </Text>
      </> : null}
      <Modal visible={!!expanded} animationType="fade" transparent
        onRequestClose={() => setExpanded(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,20,30,0.96)", padding: 18 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 18 }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>{expanded?.label || "Identity Evidence"}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close photo preview"
              onPress={() => setExpanded(null)} style={{ padding: 12 }}>
              <Ionicons name="close" size={25} color="white" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            {expanded ? <Image source={{ uri: expanded.uri }} resizeMode="contain"
              style={{ width: "100%", height: Math.max(320, width < 800 ? 440 : 620) }} /> : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
