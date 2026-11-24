import { getSafeVolunServeBackendBaseUrl } from "./stagingExpoServiceIsolation";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { auth } from "./firebase";

/**
 * Keeps an opted-in member's presence fresh while VolunServe is actively
 * being used, including across authenticated Resident/Volunteer modules.
 * The server decides the canonical current mode from users/{uid}.
 * No Firestore rules change or client-side presence writes.
 */
export function useCommunityPresenceHeartbeat(uid?: string | null, mode?: string) {
  useEffect(() => {
    if (!uid) return;
    let closed = false;
    let foreground = AppState.currentState !== "background";
    const visible = () => foreground &&
      (Platform.OS !== "web" || typeof document === "undefined" || document.visibilityState === "visible");

    const ping = async () => {
      if (closed || !visible()) return;
      try {
        const current = auth.currentUser;
        if (!current || current.uid !== uid) return;
        const token = await current.getIdToken();
        if (closed || !visible() || auth.currentUser?.uid !== uid) return;
        await fetch(`${getSafeVolunServeBackendBaseUrl()}/api/community/presence/heartbeat`,{
          method:"POST", headers:{Authorization:`Bearer ${token}`},
        });
      }catch {
        // Fail closed; the backend TTL expires rather than showing stale online.
      }
    };
    void ping();
    const interval = setInterval(() => {void ping();},40000);
    const appState = AppState.addEventListener("change", state => {
      foreground = state === "active";
      if (foreground) void ping();
    });
    const onVisibility = () => {if(visible())void ping();};
    if(Platform.OS==="web" && typeof document!=="undefined")
      document.addEventListener("visibilitychange",onVisibility);
    return () => {
      closed=true;clearInterval(interval);appState.remove();
      if(Platform.OS==="web" && typeof document!=="undefined")
        document.removeEventListener("visibilitychange",onVisibility);
    };
  },[uid,mode]);
}
