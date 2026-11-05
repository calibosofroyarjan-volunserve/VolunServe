import React from "react";
import { Text, View } from "react-native";

type Assignment = { id: string; volunteerId?: string; volunteerName?: string; status?: string };
type Props = { caseId: string; latitude: number; longitude: number; assignments: Assignment[] };

export default function EmergencyIncidentMap({ latitude, longitude }: Props) {
  return (
    <View style={{ borderWidth: 1, borderColor: "#DCE8E2", borderRadius: 12, backgroundColor: "#F4FAF7", padding: 18 }}>
      <Text style={{ color: "#174B3D", fontSize: 15, fontWeight: "800" }}>Emergency incident location</Text>
      <Text style={{ color: "#49675E", marginTop: 7 }}>
        {Number.isFinite(latitude) && Number.isFinite(longitude)
          ? latitude.toFixed(6) + ", " + longitude.toFixed(6)
          : "No verified GPS coordinates for this report"}
      </Text>
      <Text style={{ color: "#49675E", marginTop: 8 }}>
        Use Open Full Live Map to view authorized Volunteer GPS and routes.
      </Text>
    </View>
  );
}
