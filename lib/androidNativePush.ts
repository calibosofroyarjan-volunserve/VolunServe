/** Browser and iOS PWA use a separate Web Push implementation. */
export async function enableAndroidPhoneAlerts(): Promise<string> {
  throw new Error("Android push alerts require the installed Android APK.");
}
export async function disableAndroidPhoneAlerts(): Promise<string> {
  return "Android device push is not available on this platform.";
}
