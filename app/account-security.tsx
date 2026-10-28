import { AppAlert } from "../lib/appDialog";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { auth } from "../lib/firebase";
import {
  hasPasswordSignInProvider,
  logoutUser,
  setVolunServePasswordForCurrentGoogleUser,
} from "../lib/firebaseAuth";

export default function AccountSecurity() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const googleLinked = useMemo(
    () =>
      Boolean(
        user?.providerData.some(
          (provider) => provider.providerId === "google.com"
        )
      ),
    [user]
  );

  const passwordLinked = useMemo(
    () => hasPasswordSignInProvider(user),
    [user]
  );

  const validPassword =
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    newPassword === confirmPassword;

  const savePassword = async () => {
    if (!user || saving) return;

    if (!googleLinked) {
      setErrorMessage(
        "For this one-time setup, sign in with Google first so VolunServe can verify that you own the account."
      );
      return;
    }

    if (!validPassword) {
      setErrorMessage(
        "Use at least 8 characters with uppercase, lowercase, and a number, then make sure both passwords match."
      );
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");

      await setVolunServePasswordForCurrentGoogleUser(newPassword);

      AppAlert.alert(
        "Password saved",
        "Google sign-in still works. You can now sign in manually with this email and password.",
        [{
          text: "Continue to Login",
          onPress: () => {
            void logoutUser().finally(() => router.replace("/login" as any));
          },
        }],
        { cancelable: false },
      );
    } catch (error: any) {
      setErrorMessage(
        error?.message || "Unable to save your VolunServe password."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Checking your account...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={42} color="#64748b" />
        <Text style={styles.emptyTitle}>Sign in required</Text>
        <Text style={styles.emptyText}>
          Sign in with Google first, then return to Account Security.
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/login" as any)}
        >
          <Text style={styles.backButtonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark-outline" size={30} color="#0f766e" />
        </View>

        <Text style={styles.title}>Account Security</Text>
        <Text style={styles.subtitle}>
          Set one VolunServe password for manual Email + Password sign-in. Your
          Google sign-in will continue to work on the same Firebase account.
        </Text>

        <View style={styles.accountBox}>
          <Ionicons name="mail-outline" size={20} color="#0f766e" />
          <View style={styles.accountCopy}>
            <Text style={styles.accountLabel}>SIGNED-IN ACCOUNT</Text>
            <Text style={styles.accountEmail}>{user.email || "No email"}</Text>
          </View>
        </View>

        <View style={styles.providerRow}>
          <View style={styles.providerItem}>
            <Text style={styles.providerLabel}>Google</Text>
            <Text
              style={[
                styles.providerStatus,
                googleLinked ? styles.statusOk : styles.statusMuted,
              ]}
            >
              {googleLinked ? "Connected" : "Not connected"}
            </Text>
          </View>

          <View style={styles.providerItem}>
            <Text style={styles.providerLabel}>Email + Password</Text>
            <Text
              style={[
                styles.providerStatus,
                passwordLinked ? styles.statusOk : styles.statusMuted,
              ]}
            >
              {passwordLinked ? "Connected" : "Not set"}
            </Text>
          </View>
        </View>

        {!googleLinked ? (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle-outline" size={19} color="#92400e" />
            <Text style={styles.warningText}>
              Sign out and use Continue with Google for this account before
              setting a VolunServe password.
            </Text>
          </View>
        ) : null}

        <Text style={styles.label}>
          {passwordLinked ? "New VolunServe Password" : "Create VolunServe Password"}
        </Text>
        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={20} color="#64748b" />
          <TextInput
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              setErrorMessage("");
            }}
            placeholder="Enter new password"
            placeholderTextColor="#94a3b8"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            style={styles.input}
          />
          <TouchableOpacity
            disabled={saving}
            onPress={() => setShowPassword((current) => !current)}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={21}
              color="#64748b"
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Confirm Password</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#64748b" />
          <TextInput
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setErrorMessage("");
            }}
            placeholder="Confirm new password"
            placeholderTextColor="#94a3b8"
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            style={styles.input}
            onSubmitEditing={() => void savePassword()}
          />
          <TouchableOpacity
            disabled={saving}
            onPress={() => setShowConfirmPassword((current) => !current)}
          >
            <Ionicons
              name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
              size={21}
              color="#64748b"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.rulesBox}>
          <Text style={styles.rule}>• At least 8 characters</Text>
          <Text style={styles.rule}>• At least one uppercase letter</Text>
          <Text style={styles.rule}>• At least one lowercase letter</Text>
          <Text style={styles.rule}>• At least one number</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={19} color="#b91c1c" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={saving || !googleLinked || !validPassword}
          onPress={() => void savePassword()}
          style={({ pressed }) => [
            styles.saveButton,
            (pressed || saving || !googleLinked || !validPassword) &&
              styles.saveButtonDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="key-outline" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>
                {passwordLinked ? "Change VolunServe Password" : "Set VolunServe Password"}
              </Text>
            </>
          )}
        </Pressable>

        <Text style={styles.note}>
          This changes only your VolunServe/Firebase password. It does not change
          your Gmail password and does not create another VolunServe profile.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  page: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  center: {
    flex: 1,
    minHeight: 520,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f1f5f9",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  emptyTitle: {
    marginTop: 12,
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 7,
    maxWidth: 460,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 21,
  },
  backButton: {
    marginTop: 18,
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e",
  },
  backButtonText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  card: {
    width: "100%",
    maxWidth: 590,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 24,
    padding: 32,
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "#ccfbf1",
  },
  title: {
    marginTop: 15,
    color: "#0f172a",
    fontSize: 27,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  accountBox: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#f0fdfa",
  },
  accountCopy: {
    flex: 1,
    marginLeft: 10,
  },
  accountLabel: {
    color: "#0f766e",
    fontSize: 10,
    letterSpacing: 0.8,
    fontWeight: "900",
  },
  accountEmail: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  providerRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  providerItem: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12,
  },
  providerLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
  },
  providerStatus: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "900",
  },
  statusOk: {
    color: "#15803d",
  },
  statusMuted: {
    color: "#64748b",
  },
  warningBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    color: "#92400e",
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    marginTop: 17,
    marginBottom: 7,
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  inputWrap: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#f8fafc",
  },
  input: {
    flex: 1,
    marginHorizontal: 10,
    color: "#0f172a",
    fontSize: 14,
    outlineStyle: "none",
  } as any,
  rulesBox: {
    marginTop: 14,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rule: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "600",
  },
  errorBox: {
    marginTop: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorText: {
    flex: 1,
    marginLeft: 8,
    color: "#991b1b",
    fontSize: 12,
    lineHeight: 18,
  },
  saveButton: {
    minHeight: 56,
    marginTop: 19,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    backgroundColor: "#0f766e",
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  note: {
    marginTop: 12,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
});
