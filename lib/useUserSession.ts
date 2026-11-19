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
    let unsubscribeProfile:
      | (() => void)
      | undefined;

    const unsubscribeAuth =
      onAuthChange((user) => {
        const revision = ++authRevision;
        unsubscribeProfile?.();
        unsubscribeProfile = undefined;
        if (!active) return;

        if (!user) {
          setState({
            loading: false,
            user: null,
            profile: null,
          });
          return;
        }

        // Never carry the previous account's data into a new session.
        setState({ loading: true, user, profile: null });
        const isCurrentSession = () =>
          active &&
          authRevision === revision &&
          auth.currentUser?.uid === user.uid;

        unsubscribeProfile = onSnapshot(
          doc(db, "users", user.uid),
          (snapshot) => {
            if (!isCurrentSession()) return;
            const profileData = snapshot.exists()
              ? (snapshot.data() as UserProfile)
              : null;
            setState({ loading: false, user, profile: profileData });
          },
          () => {
            if (!isCurrentSession()) return;
            setState({ loading: false, user, profile: null });
          }
        );
      });

    return () => {
      active = false;
      ++authRevision;
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  return state;
}