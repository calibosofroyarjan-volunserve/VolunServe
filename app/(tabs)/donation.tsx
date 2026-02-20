import { LinearGradient } from "expo-linear-gradient";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
import { auth, db } from "../../lib/firebase";
import { getUserProfile } from "../../lib/firebaseAuth";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

/* 🔒 Mask Name for Privacy */
const maskName = (name: string) => {
  const trimmed = name.trim();
  if (trimmed.length <= 2) return trimmed[0] + "*";
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const stars = "*".repeat(trimmed.length - 2);
  return first + stars + last;
};

export default function Donation() {
  const [profileName, setProfileName] = useState("");
  const [profileBarangay, setProfileBarangay] = useState("");
  const [amount, setAmount] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [loading, setLoading] = useState(false);

  /* 🔥 Load Profile */
  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const profile = await getUserProfile(user.uid);

      setProfileName(profile?.fullName || "");

      // ✅ FIX: Use address as barangay
      setProfileBarangay(profile?.address || "");
    };

    loadProfile();
  }, []);

  const handleDonation = async () => {
    if (!amount || !refNumber) {
      Alert.alert(
        "Incomplete Information",
        "Please enter the donation amount and reference number."
      );
      return;
    }

    if (!profileName || !profileBarangay) {
      Alert.alert(
        "Profile Incomplete",
        "Please update your address in your profile before making a donation."
      );
      return;
    }

    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Invalid Amount", "Enter a valid donation amount.");
      return;
    }

    if (numericAmount < 10) {
      Alert.alert("Minimum Donation", "Minimum donation is PHP 10.");
      return;
    }

    // 🔐 STRICT 13-digit numeric validation
    if (!/^\d{13}$/.test(refNumber)) {
      Alert.alert(
        "Invalid Reference",
        "Reference number must be exactly 13 digits."
      );
      return;
    }

    try {
      setLoading(true);

      const donationRef = doc(db, "donations", refNumber);
      const existing = await getDoc(donationRef);

      if (existing.exists()) {
        Alert.alert(
          "Duplicate Reference",
          "This reference number has already been submitted."
        );
        return;
      }

      await setDoc(donationRef, {
        donorUid: auth.currentUser?.uid || null,
        donorName: maskName(profileName),
        amount: numericAmount,
        refNumber,
        barangay: profileBarangay,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      Alert.alert(
        "Submission Successful",
        "Your donation has been recorded and is awaiting manual verification."
      );

      setAmount("");
      setRefNumber("");
    } catch (error) {
      console.log(error);
      Alert.alert(
        "System Error",
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
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
          After successfully sending your donation, you are required to enter
          the exact donation amount and the official GCash reference number
          below. This ensures your contribution is properly recorded,
          verified by administrators, and officially acknowledged by the LGU.
        </Text>
        <Text style={styles.noticeText}>
          Failure to submit accurate details may result in your donation
          not being matched or recognized in the system.
        </Text>
      </View>

      {/* Donor Card */}
      <View style={styles.infoCard}>
        <Text style={styles.label}>Donor</Text>
        <Text style={styles.value}>{profileName}</Text>
      </View>

      {/* Barangay Card */}
      <View style={styles.infoCard}>
        <Text style={styles.label}>Barangay</Text>
        <Text style={styles.value}>
          {profileBarangay || "No address set in profile"}
        </Text>
      </View>

      {/* Amount Card */}
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

      {/* Reference Card */}
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

      <TouchableOpacity onPress={handleDonation} disabled={loading}>
        <LinearGradient
          colors={["#6a11cb", "#2575fc"]}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {loading ? "Submitting..." : "Confirm Donation"}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      <Text style={styles.note}>
        All donations are subject to manual verification before approval.
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
