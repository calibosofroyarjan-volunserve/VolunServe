import { useRouter } from "expo-router";
import { type UserProfile } from "./firebaseAuth";

/** Web and iOS PWA do not load expo-notifications native APIs. */
export function useAndroidPushNavigation(
  _authChecked: boolean,
  _uid: string | null,
  _profile: UserProfile | null,
  _router: ReturnType<typeof useRouter>,
) {
  // The website has its own in-app Firestore inbox.
}
