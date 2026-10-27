import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { homeRouteForProfile, type UserProfile } from "./firebaseAuth";

/** Notification destinations are selected by current authorized role, not
 * arbitrary remote payload links. Routing waits for the auth/profile guard. */
export function useAndroidPushNavigation(
  authChecked: boolean,
  uid: string | null,
  profile: UserProfile | null,
  router: ReturnType<typeof useRouter>,
) {
  const handledId = useRef<string | null>(null);
  useEffect(() => {
    if (!authChecked || !uid || !profile) return;
    let alive = true;
    const openInApp = (response: Notifications.NotificationResponse) => {
      const info = response.notification;
      if (!alive || info.request.content.data?.route !== "/notifications") return;
      if (handledId.current === info.request.identifier) return;
      handledId.current = info.request.identifier;
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      if (profile.role === "admin" || profile.role === "superadmin" ||
          profile.role === "lgu_personnel") {
        router.push(homeRouteForProfile(profile) as any);
      } else {
        router.push("/(tabs)/notifications" as any);
      }
    };
    const sub = Notifications.addNotificationResponseReceivedListener(openInApp);
    void Notifications.getLastNotificationResponseAsync()
      .then(response => { if (response) openInApp(response); })
      .catch(() => undefined);
    return () => { alive = false; sub.remove(); };
  }, [authChecked, uid, profile, router]);
}
