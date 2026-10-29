import { Ionicons } from "@expo/vector-icons";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { auth } from "../../lib/firebase";

type PasswordResetModalProps = {
  visible: boolean;
  initialEmail: string;
  onClose: () => void;
  administrative?: boolean;
};

const RESET_CONFIRMATION =
  "If this email belongs to a VolunServe account with a password, a reset link will arrive shortly. Check your Inbox and Spam folder. Google-only accounts should use Continue with Google instead.";

/**
 * Branded in-place reset dialog for BOTH Resident/Volunteer and LGU logins.
 * No account existence is disclosed. The reset continues through Firebase Auth.
 * A user can request the link only by submitting the email inside this modal.
 */
export default function PasswordResetModal({
  visible, initialEmail, onClose, administrative = false,
}: PasswordResetModalProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setEmail(initialEmail.trim());
      setBusy(false);
      setComplete(false);
      setError("");
    }
  }, [visible, initialEmail]);

  const close = () => { if (!busy) onClose(); };
  const send = async () => {
    if (busy || complete) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email address to receive your reset link.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setComplete(true);
    } catch (err: any) {
      const code = String(err?.code || "");
      if (code === "auth/user-not-found") {
        // Older Firebase projects can return this; never reveal account existence.
        setComplete(true);
      } else if (code === "auth/invalid-email") {
        setError("Enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many requests. Try again later.");
      } else {
        setError("The reset request could not be completed. Please check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade"
      onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close}
          accessibilityRole="button" accessibilityLabel="Close password reset" disabled={busy} />
        <View style={styles.dialog} accessibilityViewIsModal accessibilityLabel="Reset your password">
          <View style={styles.heading}>
            <View style={styles.iconBox}>
              <Ionicons name="lock-open-outline" size={22} color="#54DFC0" />
            </View>
            <Text style={styles.title}>Reset your password</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close password reset dialog"
              style={styles.close} onPress={close} disabled={busy}>
              <Ionicons name="close" size={23} color="#B5C4C3" />
            </TouchableOpacity>
          </View>

          <Text style={styles.explanation}>
            Enter the email address linked to your {administrative ? "LGU administrative" : "VolunServe"} account.
            {" "}If eligible, we will send a secure password reset link.
          </Text>

          {complete ? (
            <View accessibilityRole="alert" style={styles.successPanel}>
              <Ionicons name="checkmark-circle-outline" size={22} color="#75E6BC" />
              <View style={styles.messageColumn}>
                <Text style={styles.successTitle}>Check your email</Text>
                <Text style={styles.successText}>
                  {administrative
                    ? "If this email belongs to an authorized LGU password account, a reset link will arrive shortly. Check your Inbox and Spam folder."
                    : RESET_CONFIRMATION}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                accessibilityLabel="Password reset email address"
                value={email}
                onChangeText={value => { setEmail(value); setError(""); }}
                autoCapitalize="none" autoCorrect={false} autoComplete="email"
                textContentType="emailAddress" keyboardType="email-address"
                placeholder="name@example.com" placeholderTextColor="#8B9BA8"
                editable={!busy} returnKeyType="send"
                onSubmitEditing={() => void send()}
                style={styles.input}
              />
              {!!error && (
                <View style={styles.errorPanel} accessibilityRole="alert">
                  <Ionicons name="alert-circle-outline" size={18} color="#FFA09B" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" onPress={close}
              disabled={busy} style={styles.cancel}>
              <Text style={styles.cancelText}>{complete ? "Close" : "Cancel"}</Text>
            </TouchableOpacity>
            {!complete && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send password reset link"
                disabled={busy} onPress={() => void send()}
                style={[styles.submit, busy && styles.disabled]}>
                {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <Text style={styles.submitText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {flex:1, justifyContent:"center", alignItems:"center", padding:18,
    backgroundColor:"rgba(7,19,25,0.67)"},
  dialog: {width:"100%", maxWidth:430, padding:22, borderRadius:18,
    backgroundColor:"#22262E", borderWidth:1, borderColor:"#3B4D4D",
    shadowColor:"#000000", shadowOpacity:0.32, shadowRadius:30,
    shadowOffset:{width:0,height:15}, elevation:15},
  heading: {flexDirection:"row", alignItems:"center", gap:12, marginBottom:18},
  iconBox: {width:40, height:40, borderRadius:12, backgroundColor:"#103E41",
    justifyContent:"center", alignItems:"center"},
  title: {flex:1, color:"#F5F8F7", fontSize:17, fontWeight:"800"},
  close: {width:35, height:38, alignItems:"center", justifyContent:"center"},
  explanation: {fontSize:13, lineHeight:21, color:"#C1CDD2", marginBottom:19},
  label: {color:"#DEE6E5", fontWeight:"700", fontSize:12, marginBottom:8},
  input: {height:48, borderColor:"#42515C", borderWidth:1,
    backgroundColor:"#20242C", borderRadius:10, paddingHorizontal:13,
    color:"#FFFFFF", fontSize:14},
  actions: {flexDirection:"row", justifyContent:"flex-end", alignItems:"center",
    marginTop:20, gap:10},
  cancel: {minHeight:44, paddingHorizontal:18, borderWidth:1,
    borderColor:"#404953", borderRadius:10, justifyContent:"center"},
  cancelText: {fontSize:13, fontWeight:"700", color:"#D7DEE6"},
  submit: {minHeight:44, borderRadius:10, paddingHorizontal:17,
    backgroundColor:"#087B66", alignItems:"center", justifyContent:"center"},
  submitText: {fontSize:13, fontWeight:"800", color:"#FFFFFF"},
  disabled: {opacity:0.6},
  errorPanel: {flexDirection:"row", gap:8, marginTop:12, alignItems:"flex-start"},
  errorText: {flex:1, color:"#FFADA8", fontSize:12, lineHeight:18},
  successPanel: {flexDirection:"row", alignItems:"flex-start", gap:10,
    borderRadius:10, borderWidth:1, borderColor:"#386F60",
    backgroundColor:"#153B34", padding:13},
  messageColumn: {flex:1, gap:4},
  successTitle: {color:"#C4F4DC", fontWeight:"800", fontSize:14},
  successText: {color:"#CFDFD9", fontSize:12, lineHeight:19},
});
