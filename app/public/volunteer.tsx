import React from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function PublicVolunteer() {
  const requireLogin = () => {
    Alert.alert(
      "Login Required",
      "Please login or create an account to access volunteer features."
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Volunteer Application</Text>

      <Text style={styles.formHint}>
        Submit your volunteer application to join disaster response and
        community programs.
      </Text>

      {/* Application Form Preview */}
      <TextInput
        placeholder="Phone Number"
        style={styles.input}
        editable={false}
      />

      <TextInput
        placeholder="Skills (comma separated) e.g. First aid, Driving"
        style={styles.input}
        editable={false}
      />

      <TextInput
        placeholder="Availability e.g. Weekends, Night shifts"
        style={styles.input}
        editable={false}
      />

      <TouchableOpacity style={styles.button} onPress={requireLogin}>
        <Text style={styles.buttonText}>Submit Application</Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={{ height: 30 }} />

      <Text style={styles.title}>Volunteer Events</Text>

      {/* Sample Event Preview */}
      <View style={styles.card}>
        <Text style={styles.name}>Disaster Response Deployment</Text>
        <Text style={styles.meta}>Type: DISASTER</Text>
        <Text style={styles.meta}>Location: San Jose del Monte</Text>
        <Text style={styles.meta}>Date: Upcoming</Text>
        <Text style={styles.meta}>Volunteers: -- / --</Text>

        <TouchableOpacity style={styles.button} onPress={requireLogin}>
          <Text style={styles.buttonText}>Join Event</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.name}>Emergency Preparedness Training</Text>
        <Text style={styles.meta}>Type: TRAINING</Text>
        <Text style={styles.meta}>Location: City Hall</Text>
        <Text style={styles.meta}>Date: Upcoming</Text>
        <Text style={styles.meta}>Volunteers: -- / --</Text>

        <TouchableOpacity style={styles.button} onPress={requireLogin}>
          <Text style={styles.buttonText}>Join Event</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.note}>
        Login required to apply, join events, and record attendance.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#f4f7fb" },

  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },

  formHint: { color: "#64748b", marginBottom: 16, lineHeight: 18 },

  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#fff",
  },

  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  name: { fontSize: 16, fontWeight: "800", marginBottom: 6, color: "#0f172a" },
  meta: { color: "#64748b", marginBottom: 4 },

  button: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
    alignItems: "center",
  },

  buttonText: { color: "#fff", fontWeight: "700" },

  note: {
    marginTop: 20,
    color: "#64748b",
    textAlign: "center",
    fontSize: 12,
  },
});