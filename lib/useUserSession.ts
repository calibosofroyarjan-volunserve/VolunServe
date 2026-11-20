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
};

export function useUserSession(): SessionState {
  const [state, setState] =
    useState<SessionState>({
      loading: true,
      user: auth.currentUser,
      profile: null,
    });

  useEffect(() => {
    let active = true;
    let authRevision = 0;
    let unsubscribeProfile: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const cancelProfileWatch = () => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    const unsubscribeAuth = onAuthChange((user) => {
      const revision = ++authRevision;
      cancelProfileWatch();

      if (!user) {
        setState({ loading: false, user: null, profile: null });
        return;
      }

      // A signed-in Auth UID is not enough to grant access. An absent profile
      // or a Firestore listener failure must not become "signed out" or
      // authorize protected screens using stale account permissions.
      setState({ loading: true, user, profile: null });
      let failedAttempts = 0;
      const stillCurrent = () =>
        active && authRevision === revision && auth.currentUser?.uid === user.uid;

      const subscribeProfile = () => {
        if (!stillCurrent()) return;
        unsubscribeProfile?.();
        unsubscribeProfile = onSnapshot(
          doc(db, "users", user.uid),
          (snapshot) => {
            if (!stillCurrent()) return;
            failedAttempts = 0;
            const exists = snapshot.exists();
            setState({
              // Auth-only accounts are resolved by the root registration guard.
              // Do not redirect them to Login before that guard runs.
              loading: !exists,
              user,
              profile: exists ? (snapshot.data() as UserProfile) : null,
            });
          },
          () => {
            if (!stillCurrent()) return;
            // onSnapshot error callbacks end the listener. Retry the read
            // without dropping Firebase Auth or presenting stale privileges.
            setState({ loading: true, user, profile: null });
            failedAttempts += 1;
            const delay = Math.min(30000, 1500 * 2 ** Math.min(failedAttempts - 1, 4));
            retryTimer = setTimeout(subscribeProfile, delay);
          }
        );
      };
      subscribeProfile();
    });

    return () => {
      active = false;
      authRevision += 1;
      cancelProfileWatch();
      unsubscribeAuth();
    };
  }, []);

  return state;
}