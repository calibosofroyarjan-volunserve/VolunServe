import { Ionicons } from "@expo/vector-icons";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../lib/firebase";

type Props = {
  visible: boolean;
  initialEmail: string;
  onClose: () => void;
  audience?: "resident" | "admin";
};

/**
 * Shared Resident/Volunteer and LGU/System Admin reset-password popup.
 * No password reset is sent until the user confirms inside this modal.
 * Keeps sensitive auth feedback out of the main login form.
 */
export default function PasswordResetDialog({ visible, initialEmail, onClose, audience = "resident" }: Props) {
  const [resetEmail, setResetEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (visible) {
      setResetEmail(initialEmail.trim());
      setSent(false);
      setErrorMessage("");
      setSending(false);
    }
  }, [visible, initialEmail]);

  const dismiss = () => {
    if (!sending) onClose();
  };

  const sendLink = async () => {
    if (sending || sent) return;
    const address = resetEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setErrorMessage("Enter a valid email address to receive your reset link.");
      return;
    }

    setErrorMessage("");
    setSending(true);
    try {
      await sendPasswordResetEmail(auth, address);
      // Do not disclose whether an email belongs to a VolunServe account.
      setSent(true);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "auth/too-many-requests") {
        setErrorMessage("Too many requests. Please try again later.");
      } else if (code === "auth/invalid-email") {
        setErrorMessage("Please enter a valid email address.");
      } else if (code === "auth/network-request-failed") {
        setErrorMessage("Network connection failed. Check your connection and retry.");
      } else if (code === "auth/user-not-found") {
        // Same response as success to avoid revealing account membership.
        setSent(true);
      } else {
        setErrorMessage("Unable to send the link. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  const dialog = (
        <View style={styles.dialog} accessibilityViewIsModal accessibilityLabel={audience === "admin" ? "Administrative password reset form" : "Resident password reset form"}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name={sent ? "checkmark-circle-outline" : "key-outline"} size={26} color="#047857" />
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close password reset popup"
              onPress={dismiss}
              disabled={sending}
              style={styles.close}
            >
              <Ionicons name="close" size={22} color="#376558" />
            </TouchableOpacity>
          </View>

          {sent ? (
            <>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.description}>
                If this address has a VolunServe email/password account, you'll receive a password reset link. Check your inbox and Spam folder.
              </Text>
              <Text style={styles.note}>
                {audience === "admin" ? "Return to the LGU & System Admin login to sign in with your administrative credentials." : "Registered using Google only? Use Continue with Google on the login screen instead."}
              </Text>
              <TouchableOpacity accessibilityRole="button" style={styles.submit} onPress={dismiss}>
                <Text style={styles.submitText}>Back to login</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>{audience === "admin" ? "Reset administrative password" : "Forgot your password?"}</Text>
              <Text style={styles.description}>
                Enter your registered email address and we'll send you a secure password reset link.
              </Text>

              <Text style={styles.fieldLabel}>Email address</Text>
              <View style={[styles.inputWrap, !!errorMessage && styles.inputInvalid]}>
                <Ionicons name="mail-outline" size={20} color="#376558" />
                <TextInput
                  value={resetEmail}
                  onChangeText={value => { setResetEmail(value); setErrorMessage(""); }}
                  placeholder="you@example.com"
                  placeholderTextColor="#819E91"
                  accessibilityLabel="Password reset email address"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={() => void sendLink()}
                  editable={!sending}
                  style={styles.input}
                />
              </View>
              {!!errorMessage && <Text style={styles.error} accessibilityRole="alert">{errorMessage}</Text>}
              <Text style={styles.note}>
                {audience === "admin" ? "Use your authorized LGU or System Admin email address." : "For Google-only accounts, sign in using Continue with Google."}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Send password reset link"
                disabled={sending}
                style={[styles.submit, sending && styles.submitDisabled]}
                onPress={() => void sendLink()}
              >
                {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="mail-outline" color="#FFFFFF" size={19} />}
                <Text style={styles.submitText}>{sending ? "Sending link..." : "Send reset link"}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={styles.cancel} disabled={sending} onPress={dismiss}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
  );

  // Use a viewport-fixed overlay on web rather than a nested React Native
  // Modal. This avoids scroll container clipping and keeps the reset form
  // visible above the shared premium authentication shell on desktop/mobile web.
  if (Platform.OS === "web") {
    if (!visible) return null;
    return (
      <View style={[styles.overlay, styles.webOverlay]} accessibilityLabel="Password reset popup overlay">
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismiss} accessibilityLabel="Close password reset popup" />
        {dialog}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismiss} accessibilityLabel="Close password reset popup" />
        {dialog}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(2, 29, 23, 0.68)", justifyContent: "center",
    alignItems: "center", paddingHorizontal: 18, paddingVertical: 24,
  },
  webOverlay: {
    position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 2147483647, width: "100%", height: "100%",
  } as any,
  dialog: {
    backgroundColor: "#FFFFFF", borderRadius: 22, width: "100%", maxWidth: 430,
    padding: 26, borderWidth: 1, borderColor: "#CCE8DB",
    shadowColor: "#00190F", shadowOpacity: 0.22, shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }, elevation: 16,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  iconCircle: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#E4F8ED", alignItems: "center", justifyContent: "center" },
  close: { padding: 8, marginRight: -8, alignItems: "center", justifyContent: "center" },
  title: { color: "#073F32", fontSize: 23, fontWeight: "900", marginBottom: 10 },
  description: { color: "#557267", fontSize: 14, lineHeight: 21, marginBottom: 20 },
  fieldLabel: { color: "#16493A", fontWeight: "800", fontSize: 13, marginBottom: 8 },
  inputWrap: { minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: "#BEDBCD", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10, backgroundColor: "#FCFFFD" },
  inputInvalid: { borderColor: "#C43C3C" },
  input: { flex: 1, fontSize: 15, color: "#123F30", paddingVertical: 13, minWidth: 0 },
  error: { color: "#B42318", fontSize: 12, lineHeight: 18, marginTop: 8, fontWeight: "700" },
  note: { color: "#647B70", fontSize: 12, lineHeight: 19, marginTop: 12, marginBottom: 17 },
  submit: { minHeight: 52, borderRadius: 13, backgroundColor: "#047857", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 14 },
  submitDisabled: { opacity: 0.65 },
  submitText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  cancel: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  cancelText: { color: "#376558", fontSize: 13, fontWeight: "800" },
});
