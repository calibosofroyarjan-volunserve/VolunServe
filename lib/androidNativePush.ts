import * as Notifications from "expo-notifications";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { auth, functions } from "./firebase";

/**
 * Android APK native FCM registration. Web (including the iPhone PWA) has a
 * different Web Push transport and must never call the native SDK.
 *
 * Calling this function must follow a direct user action: never prompt for
 * OS permission automatically during login, signup, or initial render.
 */
export async function enableAndroidPhoneAlerts(): Promise<string> {
  if (Platform.OS !== "android") {
    throw new Error("Android phone alerts are only available in the Android app.");
  }

  const initialUserId = auth.currentUser?.uid;
  if (!initialUserId) throw new Error("Please sign in to activate phone alerts.");

  await Notifications.setNotificationChannelAsync("volunserve-updates", {
    name: "VolunServe Updates",
    description: "Community, account and volunteering updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 160, 250],
    lightColor: "#118464",
  });
  await Notifications.setNotificationChannelAsync("volunserve-urgent", {
    name: "Emergency Response",
    description: "Important community emergency updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 100, 250, 100, 350],
    lightColor: "#0B8662",
  });

  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.granted || current.status === "granted"
      ? current
      : await Notifications.requestPermissionsAsync();

  if (!(permission.granted || permission.status === "granted")) {
    throw new Error("Notification permission was not granted. You can still read alerts in the app.");
  }

  const nativeToken = await Notifications.getDevicePushTokenAsync();
  if (nativeToken.type !== "android") {
    throw new Error("This installation did not return an Android FCM registration token.");
  }
  const token = String(nativeToken.data || "");
  if (!token || auth.currentUser?.uid !== initialUserId) {
    throw new Error("Session changed before device registration. Please sign in again.");
  }

  const register = httpsCallable<{ token: string }, { registered: boolean }>(
    functions, "registerAndroidPushToken",
  );
  const result = await register({ token });
  if (!result.data.registered) throw new Error("Device registration was not confirmed.");
  return "Phone alerts enabled for this account.";
}

/**
 * Stop server-side pushes to this device. Android OS notification permission
 * remains managed by Android Settings; this only unregisters server delivery.
 */
export async function disableAndroidPhoneAlerts(): Promise<string> {
  if (Platform.OS !== "android") return "Phone alerts are unavailable on this platform.";
  if (!auth.currentUser?.uid) throw new Error("Sign in first to manage phone alerts.");
  const existing = await Notifications.getPermissionsAsync();
  if (!existing.granted && existing.status !== "granted") {
    return "Phone alerts are already disabled in Android settings.";
  }
  const nativeToken = await Notifications.getDevicePushTokenAsync();
  if (nativeToken.type !== "android") throw new Error("No Android device token was found.");
  const unregister = httpsCallable<{ token: string }, { unregistered: boolean }>(
    functions, "unregisterAndroidPushToken",
  );
  const result = await unregister({ token: String(nativeToken.data || "") });
  if (!result.data.unregistered) throw new Error("Could not confirm removal of device registration.");
  return "Phone alerts disabled on this device.";
}

if (Platform.OS === "android") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
