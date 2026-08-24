import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { auth, db } from "../../lib/firebase";

type CertificateData = {
  userId: string;
  name: string;
  task: string;
  date: string;
  certificateId: string;
  eventId?: string;
};

import { useLocalSearchParams } from "expo-router";

export default function CertificateScreen() {
    const { eventId } = useLocalSearchParams();
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  loadCertificate();
}, [eventId]);

  const loadCertificate = async () => {
    try {
      const user = auth.currentUser;

      if (!user) {
        setLoading(false);
        return;
      }

      const certQuery = query(
        collection(db, "certificates"),
        where("userId", "==", user.uid),
        where("eventId", "==", String(eventId))
      );

      const snapshot = await getDocs(certQuery);

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as CertificateData;
        setCert(data);
      }
    } catch (error) {
      console.log("Load certificate error:", error);
      Alert.alert("Error", "Failed to load certificate.");
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!cert) return;

    try {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 40px;
                color: #0f172a;
              }
              .box {
                border: 6px solid #0f766e;
                padding: 40px;
              }
              h1 {
                color: #0f766e;
                font-size: 36px;
                margin-bottom: 10px;
              }
              h2 {
                font-size: 28px;
                margin-bottom: 30px;
              }
              .name {
                font-size: 30px;
                font-weight: bold;
                margin: 20px 0;
              }
              .task {
                font-size: 22px;
                font-weight: bold;
                margin: 20px 0;
              }
              .id {
                margin-top: 40px;
                font-size: 12px;
                color: #64748b;
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>VolunServe</h1>
              <h2>Certificate of Completion</h2>

              <p>This certifies that</p>
              <div class="name">${cert.name}</div>

              <p>has successfully completed</p>
              <div class="task">${cert.task}</div>

              <p>Date: ${new Date(cert.date).toLocaleDateString()}</p>

              <p class="id">Certificate ID: ${cert.certificateId}</p>
            </div>
          </body>
        </html>
      `;

      const file = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert("PDF Created", file.uri);
      }
    } catch (error) {
      console.log("PDF error:", error);
      Alert.alert("Error", "Failed to generate PDF.");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Loading certificate...</Text>
      </View>
    );
  }

  if (!cert) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No Certificate Found</Text>
        <Text style={styles.emptyText}>
          Complete and check out from a volunteer event first.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Certificate</Text>

      <View style={styles.card}>
        <Text style={styles.brand}>VOLUNSERVE</Text>
        <Text style={styles.subtitle}>Certificate of Completion</Text>

        <Text style={styles.text}>This certifies that</Text>
        <Text style={styles.name}>{cert.name}</Text>

        <Text style={styles.text}>has successfully completed</Text>
        <Text style={styles.task}>{cert.task}</Text>

        <Text style={styles.date}>
          {new Date(cert.date).toLocaleDateString()}
        </Text>

        <View style={styles.qrBox}>
          <QRCode value={cert.certificateId} size={120} />
        </View>

        <Text style={styles.certId}>ID: {cert.certificateId}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={generatePDF}>
        <Text style={styles.buttonText}>Generate PDF</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f1f5f9",
    flexGrow: 1,
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f1f5f9",
  },
  loadingText: {
    marginTop: 10,
    color: "#64748b",
    fontWeight: "700",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 22,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0f766e",
    marginBottom: 20,
  },
  brand: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f766e",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 24,
  },
  text: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 6,
  },
  name: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginVertical: 10,
    textAlign: "center",
  },
  task: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginVertical: 10,
    textAlign: "center",
  },
  date: {
    fontSize: 14,
    color: "#475569",
    marginTop: 8,
  },
  qrBox: {
    marginTop: 24,
    backgroundColor: "#ffffff",
    padding: 10,
  },
  certId: {
    marginTop: 10,
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
  },
  button: {
    width: "100%",
    backgroundColor: "#0f766e",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 15,
  },
});