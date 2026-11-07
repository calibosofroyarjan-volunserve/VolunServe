import { User } from "firebase/auth";

import {
    doc,
    onSnapshot,
} from "firebase/firestore";

import {
    useEffect,
    useState,
} from "react";

import {
    auth,
    db,
} from "./firebase";

import {
    onAuthChange,
    UserProfile,
} from "./firebaseAuth";

type SessionState = {
  loading: boolean;
  user: User | null;
  profile: UserProfile | null;
  connectionError: string | null;
};

export function useUserSession(): SessionState & { retryProfile: () => void } {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] =
    useState<SessionState>({
      loading: true,
      user: auth.currentUser,
      profile: null,
      connectionError: null,
    });

  useEffect(() => {
    let unsubscribeProfile:
      | (() => void)
      | undefined;
    let profileListenerVersion = 0;

    const unsubscribeAuth =
      onAuthChange((user) => {
        const version = ++profileListenerVersion;
        unsubscribeProfile?.();
        unsubscribeProfile = undefined;

        if (!user) {
          setState({
            loading: false,
            user: null,
            profile: null,
            connectionError: null,
          });

          return;
        }

        setState((current) => ({
          loading: true,
          user,
          // Do not expose a previous account's profile on auth changes.
          profile: current.user?.uid === user.uid ? current.profile : null,
          connectionError: null,
        }));

        unsubscribeProfile = onSnapshot(
          doc(db, "users", user.uid),

          (snapshot) => {
            if (profileListenerVersion !== version) return;
            const profileData =
              snapshot.exists()
                ? (snapshot.data() as UserProfile)
                : null;

            setState({
              loading: false,
              user,
              profile: profileData,
              connectionError: null,
            });
          },

          () => {
            if (profileListenerVersion !== version) return;
            // A transient Firestore listener failure does not revoke the
            // current user's previously verified profile. Only a real
            // signed-out event or verified account-status change can do that.
            // Server rules still enforce all protected reads/writes.
            setState((current) => ({
              loading: false,
              user,
              profile: current.user?.uid === user.uid ? current.profile : null,
              connectionError: current.user?.uid === user.uid && current.profile
                ? null : "We couldn't load your account profile. Check your connection and try again.",
            }));
          }
        );
      });

    return () => {
      profileListenerVersion++;
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [reloadKey]);

  return { ...state, retryProfile: () => setReloadKey((value) => value + 1) };
}