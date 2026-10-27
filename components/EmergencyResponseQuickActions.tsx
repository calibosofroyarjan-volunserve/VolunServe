import { useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { db } from "../lib/firebase";
import { DISPATCH_VEHICLES, vehicleInfo } from "../lib/emergencyMapTypes";

type ActiveCase = {
  id: string;
  category?: string;
  title?: string;
  status?: string;
  responseVehicleType?: string;
  activeLguResponderUid?: string;
  createdAt?: { toMillis?: () => number };
  updatedAt?: { toMillis?: () => number };
};

const statusLabel: Record<string, string> = {
  reported: "Submitted · awaiting LGU review",
  validated: "Validated by LGU",
  assigned: "Response assigned",
  in_progress: "Response in progress",
  resolved: "Resolved",
  closed: "Closed",
};
const activeStatuses = new Set(["reported", "validated", "assigned", "in_progress"]);

export default function EmergencyResponseQuickActions({ residentUid }: { residentUid: string }) {
  const router = useRouter();
  const [cases, setCases] = useState<ActiveCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [callNotice, setCallNotice] = useState("");

  useEffect(() => {
    setCases([]);
    setError(false);
    setLoading(true);
    if (!residentUid) { setLoading(false); return; }
    // The same reporter-only query used by My Emergency Reports.
    // Do not read any responder GPS or another Resident's report here.
    return onSnapshot(
      query(collection(db, "disasterCases"), where("reporterUid", "==", residentUid)),
      snapshot => {
        setCases(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as ActiveCase)));
        setLoading(false);
        setError(false);
      },
      () => { setCases([]); setError(true); setLoading(false); },
    );
  }, [residentUid]);

  const active = useMemo(() => cases
    .filter(item => activeStatuses.has(item.status || ""))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) -
      (a.createdAt?.toMillis?.() || 0))[0] || null, [cases]);

  const call911 = async () => {
    setCallNotice("");
    try {
      await Linking.openURL("tel:911");
      // Opening a dialer is not proof that a call was placed or answered.
    } catch {
      setCallNotice("Unable to open the phone dialer on this device. Dial 911 directly.");
    }
  };

  const gotoTracking = () => {
    if (!active) return;
    router.push({ pathname: "/map-tracking", params: { caseId: active.id } } as any);
  };

  const assignedVehicle = active?.activeLguResponderUid &&
    DISPATCH_VEHICLES.some(vehicle => vehicle.id === active.responseVehicleType) &&
    ["assigned", "in_progress"].includes(active.status || "")
    ? vehicleInfo(active.responseVehicleType) : null;

  return (
    <View style={styles.container} accessibilityLabel="Emergency help and report tracking">
      <View style={styles.help}>
        <View style={{flex:1,minWidth:195}}>
          <Text style={styles.eyebrow}>IMMEDIATE EMERGENCY HELP</Text>
          <Text style={styles.heading}>Danger right now? Call 911.</Text>
          <Text style={styles.copy}>
            For urgent police, fire or medical emergencies, contact the official hotline.
            VolunServe reports are reviewed and do not automatically call or dispatch 911.
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open phone dialer for national emergency hotline 911"
          onPress={() => void call911()} style={styles.hotline}>
          <Text style={styles.hotlineText}>Call 911</Text>
          <Text style={styles.hotlineSub}>National hotline</Text>
        </Pressable>
      </View>
      {!!callNotice && <Text accessibilityRole="alert" style={styles.errorText}>{callNotice}</Text>}
      {active ? (
        <View style={styles.caseRow}>
          <View style={{flex:1,minWidth:170}}>
            <Text style={styles.eyebrow}>YOUR LATEST ACTIVE EMERGENCY · FIRESTORE STATUS</Text>
            <Text style={styles.caseTitle} numberOfLines={2}>
              {active.title || active.category || "Emergency report"}
            </Text>
            <Text style={styles.status}>
              {statusLabel[active.status || ""] || "LGU status pending"}
            </Text>
            {assignedVehicle && (
              <Text style={styles.vehicle}>{assignedVehicle.symbol} LGU response type: {assignedVehicle.label} · live GPS shown only in tracking map</Text>
            )}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Track your active emergency response"
            onPress={gotoTracking} style={styles.track}>
            <Text style={styles.trackText}>Track response</Text>
          </Pressable>
        </View>
      ) : error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          Cannot load your report status. Use My Emergency Reports to check your case.
        </Text>
      ) : loading ? (
        <Text style={styles.loading}>Checking your existing emergency reports…</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{borderWidth:1,borderColor:"#D4E4DC",backgroundColor:"#FCFDFC",
    borderRadius:14,overflow:"hidden",marginVertical:14},
  help:{padding:15,flexDirection:"row",flexWrap:"wrap",gap:13,alignItems:"center"},
  eyebrow:{fontSize:10,fontWeight:"800",letterSpacing:0.8,color:"#47685A"},
  heading:{fontSize:15,fontWeight:"800",color:"#183B31",marginTop:3},
  copy:{fontSize:11.5,color:"#61766D",lineHeight:17,marginTop:5},
  hotline:{backgroundColor:"#AF3040",borderRadius:10,minWidth:114,
    paddingHorizontal:16,paddingVertical:12,alignItems:"center"},
  hotlineText:{fontSize:16,color:"#FFFFFF",fontWeight:"900"},
  hotlineSub:{fontSize:10,color:"#FFFFFF",marginTop:2},
  caseRow:{padding:14,backgroundColor:"#F0F7F2",borderTopWidth:1,
    borderColor:"#DDE9E1",gap:12,flexDirection:"row",flexWrap:"wrap",alignItems:"center"},
  caseTitle:{fontSize:13,fontWeight:"800",color:"#174F3B",marginTop:4},
  status:{fontSize:12,color:"#346D54",fontWeight:"700",marginTop:5},
  vehicle:{fontSize:11,color:"#5A7768",marginTop:5},
  track:{backgroundColor:"#0D7959",paddingVertical:11,paddingHorizontal:16,
    borderRadius:9,alignItems:"center",justifyContent:"center"},
  trackText:{fontSize:12,color:"#FFFFFF",fontWeight:"800"},
  errorText:{fontSize:11.5,color:"#9E3340",paddingHorizontal:14,paddingBottom:11},
  loading:{fontSize:11.5,color:"#60776A",paddingHorizontal:14,paddingBottom:11},
});
