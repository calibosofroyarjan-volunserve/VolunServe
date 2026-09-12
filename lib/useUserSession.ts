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
    let unsubscribeProfile:
      | (() => void)
      | undefined;

    const unsubscribeAuth =
      onAuthChange((user) => {
        unsubscribeProfile?.();
        unsubscribeProfile = undefined;

        if (!user) {
          setState({
            loading: false,
            user: null,
            profile: null,
          });

          return;
        }

        setState((current) => ({
          ...current,
          loading: true,
          user,
        }));

        unsubscribeProfile = onSnapshot(
          doc(db, "users", user.uid),

          (snapshot) => {
            const profileData =
              snapshot.exists()
                ? (snapshot.data() as UserProfile)
                : null;

            setState({
              loading: false,
              user,
              profile: profileData,
            });
          },

          () => {
            setState({
              loading: false,
              user,
              profile: null,
            });
          }
        );
      });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  return state;
}