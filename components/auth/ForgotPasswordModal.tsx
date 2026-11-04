import { Ionicons } from "@expo/vector-icons";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth, usingFirebaseEmulators } from "../../lib/firebase";
import { getResetErrorMessage } from "../../lib/authUserMessages";
import { getRegistrationEmailError } from "../../lib/registrationEmailPolicy";

type ForgotPasswordModalProps = {
  visible: boolean;
  initialEmail: string;
  onClose: () => void;
};

/** A dedicated, accessible reset flow that does not require login-field entry.
 * No raw provider errors or existence disclosures in production.
 */
export default function ForgotPasswordModal({
  visible,
  initialEmail,
  onClose,
}: ForgotPasswordModalProps) {
  const [email, setEmail] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const emailError = getRegistrationEmailError(email);

  useEffect(() => {
    if (visible) {
      setEmail(initialEmail.trim().toLowerCase());
      setError("");
      setNotice("");
      setSubmitted(false);
    }
  }, [visible, initialEmail]);

  const requestReset = async () => {
    if (working) return;
    setSubmitted(true);
    setError("");
    setNotice("");
    if (emailError) {
      setError(emailError);
      return;
    }
    try {
      setWorking(true);
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setNotice(usingFirebaseEmulators
        ? "Local test mode: open the terminal running the test services and use its password-reset link. No real email is sent during testing."
        : "If this email has a VolunServe password account, check Inbox and Spam for the reset link. If you use Google sign-in only, continue with Google instead.");
    } catch (reason: unknown) {
      const friendly = getResetErrorMessage(reason, usingFirebaseEmulators);
      if (friendly) setError(friendly);
      else setNotice("If this email has a VolunServe password account, check Inbox and Spam for the reset link.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => { if (!working) onClose(); }}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <Ionicons name="key-outline" size={22} color="#08684F" />
              <Text style={styles.title}>Forgot Password?</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close password reset"
              disabled={working}
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={22} color="#285A4A" />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Enter the email used for your VolunServe account. You do not need
            your current password to request a reset.
          </Text>
          <Text style={styles.label}>Email Address *</Text>
          <View style={[
            styles.inputRow,
            (submitted || email.length > 0) && emailError ? styles.inputInvalid : null,
          ]}>
            <Ionicons name="mail-outline" size={19} color="#365F52" />
            <TextInput
              accessibilityLabel="Email address for password reset"
              style={styles.input}
              placeholder="name@gmail.com"
              placeholderTextColor="#8BA0B4"
              value={email}
              onChangeText={(value) => {
                setEmail(value.trim().toLowerCase());
                setError("");
                setNotice("");
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              editable={!working}
              onSubmitEditing={() => void requestReset()}
              returnKeyType="send"
            />
          </View>
          {(submitted || email.length > 0) && emailError ? (
            <Text style={styles.errorText}>{emailError}</Text>
          ) : null}
          {error && !emailError ? (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
              <Text style={styles.errorContent}>{error}</Text>
            </View>
          ) : null}
          {!!notice && (
            <View accessibilityRole="alert" style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#0A7656" />
              <Text style={styles.successContent}>{notice}</Text>
            </View>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Send password reset link"
            disabled={working}
            onPress={() => void requestReset()}
            style={[styles.submit, working && styles.disabled]}
          >
            {working ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onClose}
            disabled={working}
            style={styles.back}
          >
            <Text style={styles.backText}>Back to Login</Text>
          </TouchableOpacity>
          <Text style={styles.footnote}>
            Your VolunServe password is separate from your Google password.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(7,30,24,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  card: {
    backgroundColor: "#F5FFFA",
    borderRadius: 20,
    padding: 22,
    width: "100%",
    maxWidth: 450,
    gap: 10,
  },
  header: {flexDirection: "row", justifyContent: "space-between", alignItems: "center"},
  heading: {flexDirection: "row", gap: 9, alignItems: "center", flexShrink: 1},
  title: {fontSize: 22, fontWeight: "800", color: "#073F31"},
  close: {padding: 6, minHeight: 35, minWidth: 35, alignItems: "center", justifyContent: "center"},
  description: {fontSize: 13, lineHeight: 20, color: "#466A5C"},
  label: {fontSize: 13, fontWeight: "700", color: "#19493B", marginTop: 4},
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFFFFF", borderColor: "#B8D9C8",
    borderRadius: 12, borderWidth: 1, minHeight: 52, paddingHorizontal: 12,
  },
  input: {flex: 1, color: "#123E32", fontSize: 15, paddingVertical: 12},
  inputInvalid: {borderColor: "#DC2626", borderWidth: 2},
  errorText: {color: "#B42318", fontSize: 12, lineHeight: 18},
  errorBox: {
    flexDirection: "row", gap: 8, borderWidth: 1, borderColor: "#F4C9C1",
    padding: 11, borderRadius: 10, backgroundColor: "#FFF4F1",
  },
  errorContent: {flex: 1, fontSize: 12, color: "#922C22", lineHeight: 19},
  successBox: {
    flexDirection: "row", gap: 8, borderWidth: 1, borderColor: "#B8DFC8",
    padding: 11, borderRadius: 10, backgroundColor: "#EDF9F1",
  },
  successContent: {flex: 1, fontSize: 12, color: "#17654A", lineHeight: 19},
  submit: {
    backgroundColor: "#087553", minHeight: 49, justifyContent: "center",
    alignItems: "center", borderRadius: 12, marginTop: 7,
  },
  submitText: {fontSize: 15, fontWeight: "800", color: "#FFFFFF"},
  disabled: {opacity: 0.55},
  back: {minHeight: 37, alignItems: "center", justifyContent: "center"},
  backText: {fontSize: 13, fontWeight: "700", color: "#087553"},
  footnote: {fontSize: 11, lineHeight: 17, textAlign: "center", color: "#668477"},
});
