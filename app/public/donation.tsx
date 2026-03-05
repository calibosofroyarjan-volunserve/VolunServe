import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
    Alert,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

export default function PublicDonation() {
  const [amount, setAmount] = useState("");
  const [refNumber, setRefNumber] = useState("");

  const handleDonation = () => {
    Alert.alert(
      "Login Required",
      "Please login or create an account to submit a donation.",
      [{ text: "OK" }]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Make a Donation</Text>
      <Text style={styles.subtitle}>
        Your contribution supports disaster response and community assistance.
      </Text>

      {/* QR CARD */}
      <View style={styles.qrCard}>
        <Image
          source={require("../../assets/images/lgu-qr.png")}
          style={{ width: 200, height: 200 }}
          resizeMode="contain"
        />
        <Text style={styles.qrTitle}>Scan the QR Code to Donate</Text>
        <Text style={styles.qrSubtitle}>
          Use GCash or your mobile banking app to complete the transfer.
        </Text>
      </View>

      {/* IMPORTANT NOTICE */}
      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Important Reminder</Text>
        <Text style={styles.noticeText}>
          After sending your donation, login to record your reference number
          for official verification.
        </Text>
      </View>

      {/* Donor Card (Public Placeholder) */}
      <View style={styles.infoCard}>
        <Text style={styles.label}>Donor</Text>
        <Text style={styles.value}>Login required to show donor name</Text>
      </View>

      {/* Barangay Card */}
      <View style={styles.infoCard}>
        <Text style={styles.label}>Barangay</Text>
        <Text style={styles.value}>Login required</Text>
      </View>

      {/* Amount */}
      <View style={styles.inputCard}>
        <Text style={styles.label}>Donation Amount (PHP)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="Enter exact amount sent"
        />
      </View>

      {/* Reference */}
      <View style={styles.inputCard}>
        <Text style={styles.label}>GCash Reference Number</Text>
        <TextInput
          style={styles.input}
          value={refNumber}
          onChangeText={setRefNumber}
          keyboardType="numeric"
          placeholder="Enter 13-digit reference number"
          maxLength={13}
        />
      </View>

      <TouchableOpacity onPress={handleDonation}>
        <LinearGradient
          colors={["#6a11cb", "#2575fc"]}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            Confirm Donation
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.note}>
        Login required to submit donation details.
      </Text>
    </ScrollView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    backgroundColor: "#f4f7fb",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  qrCard: {
    width: CARD_WIDTH,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
    elevation: 3,
  },
  qrTitle: {
    marginTop: 15,
    fontWeight: "600",
  },
  qrSubtitle: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginTop: 5,
  },
  noticeCard: {
    width: CARD_WIDTH,
    backgroundColor: "#fff7ed",
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#f97316",
  },
  noticeTitle: {
    fontWeight: "700",
    marginBottom: 5,
    color: "#c2410c",
  },
  noticeText: {
    fontSize: 12,
    color: "#7c2d12",
    marginBottom: 5,
  },
  infoCard: {
    width: CARD_WIDTH,
    backgroundColor: "#ffffff",
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
  },
  inputCard: {
    width: CARD_WIDTH,
    backgroundColor: "#ffffff",
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
  },
  label: {
    fontSize: 12,
    color: "#64748b",
  },
  value: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 5,
  },
  input: {
    marginTop: 5,
    fontSize: 16,
  },
  button: {
    width: CARD_WIDTH,
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  note: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
});