import { canResumeEmailFirstSignup } from "../lib/signupFeature";

import { useFonts } from "expo-font";
import AppDialogHost from "../components/ui/AppDialogHost";
import {
  Stack,
  useRouter,
  useSegments,
} from "expo-router";
import { GoogleAuthProvider, type User } from "firebase/auth";
import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useAndroidPushNavigation } from "../lib/useAndroidPushNavigation";
import {
  getUserProfile,
  homeRouteForProfile,
  isApprovedProfile,
  isLguPersonnelProfile,
  logoutUser,
  onAuthChange,
  type UserProfile,
} from "../lib/firebaseAuth";

const ioniconsFont = require(
  "@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"
);

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [fontsLoaded, fontError] = useFonts({
    Ionicons: ioniconsFont,
    ionicons: ioniconsFont,
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [guardLoading, setGuardLoading] = useState(false);
  const [profileReadError, setProfileReadError] = useState<string | null>(null);
  const [authUser, setAuthUser] =
    useState<User | null>(null);
  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  /*
   * These refs prevent duplicate protected-route profile retries and stop
   * an old async request from writing a profile after the signed-in user
   * has changed.
   */
  const currentAuthUidRef =
    useRef<string | null>(null);
  const profileRetryInFlightRef =
    useRef(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthChange(
      async (user) => {
        if (!active) {
          return;
        }
        currentAuthUidRef.current =
          user?.uid ?? null;
        profileRetryInFlightRef.current = false;
        setAuthUser(user);
        setProfileReadError(null);
        if (!user) {
          setProfile(null);
          setProfileLoading(false);
          setGuardLoading(false);
          setAuthChecked(true);
          return;
        }
        setProfileLoading(true);
        try {
          const userProfile =
            await getUserProfile(user.uid);
          if (
            !active ||
            currentAuthUidRef.current !== user.uid
          ) {
            return;
          }
          setProfile(userProfile);
          setProfileReadError(null);
        } catch (error) {
          if (
            !active ||
            currentAuthUidRef.current !== user.uid
          ) {
            return;
          }
          /*
           * During registration, Firebase Authentication can become
           * active before users/{uid} has finished being created.
           *
           * Do not immediately sign the user out here. The route guard
           * below will re-check the profile before allowing access to a
           * protected route.
           */
          setProfile(null);
          // A temporary Firestore outage must NEVER sign out a valid
          // Firebase Auth session. Keep protected routes blocked and allow retry.
          if (!(error instanceof Error && error.message === "Profile not found.")) {
            setProfileReadError("We could not check your account. Check your connection and try again.");
          }
        } finally {
          if (
            active &&
            currentAuthUidRef.current === user.uid
          ) {
            setProfileLoading(false);
            setAuthChecked(true);
          }
        }
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const retryProfileAccess = async () => {
    if (!authUser || profileRetryInFlightRef.current) return;
    const uid = authUser.uid;
    profileRetryInFlightRef.current = true;
    setGuardLoading(true);
    try {
      const refreshed = await getUserProfile(uid);
      if (currentAuthUidRef.current !== uid) return;
      setProfile(refreshed);
      setProfileReadError(null);
    } catch (error) {
      if (currentAuthUidRef.current !== uid) return;
      if (error instanceof Error && error.message === "Profile not found." &&
          canResumeEmailFirstSignup(authUser)) {
        // Auth-only registration belongs in the existing signup wizard,
        // not in a newly created Guest profile or a forced logout loop.
        setProfileReadError(null);
        router.replace("/signup");
      } else {
        setProfileReadError(
          error instanceof Error && error.message === "Profile not found."
            ? "No VolunServe profile was found. Sign out and complete your registration."
            : "We could not check your account. Check your connection and try again."
        );
      }
    } finally {
      if (currentAuthUidRef.current === uid) setGuardLoading(false);
      profileRetryInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (
      (!fontsLoaded && !fontError) ||
      !authChecked ||
      profileLoading
    ) {
      return;
    }

    /*
     * Widen this to string intentionally.
     *
     * Expo Router gives useSegments() a generated literal-union type.
     * Using a normal string here avoids false TS2367 errors when checking
     * route groups/folders such as "public".
     */
    const rootSegment: string =
      segments[0] ?? "";
    const isPublicRoute =
      rootSegment === "public";

    // Public certificate validation is accessible without signing in.
    // Check the route path, not the whole tabs group.
    const childSegment: string =
      (segments as readonly string[])[1] ?? "";
    const isCertificateVerificationRoute =
      rootSegment === "verify-certificate" ||
      (rootSegment === "(tabs)" &&
        childSegment === "verify-certificate");

    const isLoginRoute =
      rootSegment === "login";
    const isAdministrativeLoginRoute =
      rootSegment === "admin-login";
    const isAdminRequestRoute = rootSegment === "admin-request";
    const isSignupRoute =
      rootSegment === "signup";
    const isIdentityVerificationRoute =
      rootSegment === "identity-verification";
    const isTabsRoute =
      rootSegment === "(tabs)";
    const isAdminRoute =
      rootSegment === "(admin)";
    const isSuperAdminRoute =
      rootSegment === "(superadmin)";
    const isLguRoute =
      rootSegment === "(lgu)";

    /*
     * Public Mode and certificate verification are available whether
     * the user is signed in or not.
     */
    if (isPublicRoute || isCertificateVerificationRoute || isAdminRequestRoute) {
      return;
    }

    /*
     * Signed-out users may only remain on Login, Signup,
     * Public Mode, or public certificate verification.
     */
    if (!authUser) {
      if (!isLoginRoute && !isSignupRoute && !isAdministrativeLoginRoute) {
        router.replace("/login");
      }
      return;
    }

    /*
     * Firebase Auth can finish slightly before users/{uid} is available
     * after registration. Retry the profile only when the signed-in user
     * is trying to enter a protected route.
     *
     * Important: this retry intentionally uses a ref instead of toggling
     * profileLoading inside this effect. Toggling profileLoading here would
     * immediately re-run/clean up this same effect and could cancel the
     * retry before the Firestore profile is returned.
     */
    if (profileReadError) {
      // No protected content is mounted while the profile cannot be checked.
      // Do not retry automatically on every render or turn this into a redirect loop.
      return;
    }

    if (!profile) {
      if (isLoginRoute || isSignupRoute || isAdministrativeLoginRoute) {
        return;
      }
      if (profileRetryInFlightRef.current) {
        return;
      }
      const retryUid = authUser.uid;
      profileRetryInFlightRef.current = true;
      setGuardLoading(true);
      void (async () => {
        try {
          const refreshedProfile =
            await getUserProfile(retryUid);
          if (
            currentAuthUidRef.current !== retryUid
          ) {
            return;
          }
          setProfile(refreshedProfile);
        } catch (error) {
          if (currentAuthUidRef.current !== retryUid) {
            return;
          }
          // A Google-authenticated user can exist before they have finished
          // their VolunServe Basic Account registration. The protected-route
          // guard must not sign them out or bounce them to Login.
          const hasGoogleIdentity = authUser.providerData.some(
            (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID
          );
          const profileMissing = error instanceof Error &&
            error.message === "Profile not found.";
          if (!profileMissing) {
            // Transient network/Firestore failure is not invalid credentials.
            // Preserve Firebase Auth and display a retryable blocking screen.
            setProfileReadError("We could not check your account. Check your connection and try again.");
          } else if (hasGoogleIdentity || canResumeEmailFirstSignup(authUser)) {
            router.replace("/signup");
          } else {
            // Only a confirmed missing profile without a registration flow
            // keeps the old fail-closed logout behavior.
            try {
              await logoutUser();
            } finally {
              router.replace("/login");
            }
          }
        } finally {
          if (
            currentAuthUidRef.current === retryUid
          ) {
            setGuardLoading(false);
          }
          profileRetryInFlightRef.current = false;
        }
      })();
      return;
    }

    /*
     * Rejected, suspended, or old pending accounts cannot enter
     * protected VolunServe areas.
     */
    if (!isApprovedProfile(profile)) {
      if (!isLoginRoute && !isAdministrativeLoginRoute) {
        void (async () => {
          try {
            await logoutUser();
          } finally {
            router.replace("/login");
          }
        })();
      }
      return;
    }

    /*
     * LGU Personnel accounts are staff-controlled accounts.
     * An LGU role must also be verified and actively employed before
     * it can enter the LGU responder portal.
     */
    if (
      profile.role === "lgu_personnel" &&
      !isLguPersonnelProfile(profile)
    ) {
      if (!isLoginRoute && !isAdministrativeLoginRoute) {
        void (async () => {
          try {
            await logoutUser();
          } finally {
            router.replace("/login");
          }
        })();
      }
      return;
    }

    // Public email/password accounts must confirm inbox ownership before
    // entering Resident/Volunteer routes. Staff and Google OAuth are handled
    // by their independent authentication and authorization flows.
    const communityAccount =
      profile.role === "resident" ||
      profile.role === "volunteer" ||
      profile.role === "applicant";
    const usesPassword = authUser.providerData.some(
      provider => provider.providerId === "password"
    );
    if (communityAccount && usesPassword && !authUser.emailVerified) {
      if (!isLoginRoute && !isSignupRoute) {
        void logoutUser().finally(() => router.replace("/login"));
      }
      return;
    }

    const destination =
      homeRouteForProfile(profile);

    /*
     * An already signed-in approved account should not remain on
     * Login or Signup.
     */
    if (
      isLoginRoute ||
      isAdministrativeLoginRoute ||
      isSignupRoute ||
      !rootSegment
    ) {
      router.replace(destination as any);
      return;
    }

    /*
     * ROLE SEPARATION
     *
     * Community account:
     *   - may use (tabs)
     *   - may use approved top-level community routes such as
     *     identity-verification
     *   - may NOT enter Admin, Super Admin, or LGU route groups
     *
     * Admin:
     *   - may use (admin)
     *   - may NOT enter community tabs, identity verification,
     *     Super Admin, or LGU routes
     *
     * Super Admin:
     *   - may use (superadmin)
     *   - may NOT enter community tabs, identity verification,
     *     operational Admin, or LGU routes
     *
     * LGU Personnel:
     *   - may use (lgu)
     *   - may NOT enter community tabs, identity verification,
     *     Admin, or Super Admin routes
     */
    if (profile.role === "superadmin") {
      if (
        isTabsRoute ||
        isAdminRoute ||
        isLguRoute ||
        isIdentityVerificationRoute
      ) {
        router.replace(destination as any);
      }
      return;
    }

    if (profile.role === "admin") {
      if (
        isTabsRoute ||
        isSuperAdminRoute ||
        isLguRoute ||
        isIdentityVerificationRoute
      ) {
        router.replace(destination as any);
      }
      return;
    }

    if (profile.role === "lgu_personnel") {
      if (
        isTabsRoute ||
        isAdminRoute ||
        isSuperAdminRoute ||
        isIdentityVerificationRoute
      ) {
        router.replace(destination as any);
      }
      return;
    }

    /*
     * Residents and approved Volunteers use the same community account.
     * Volunteer is a permission/mode, not a separate login account.
     */
    if (
      isAdminRoute ||
      isSuperAdminRoute ||
      isLguRoute
    ) {
      router.replace(destination as any);
    }
  }, [
    authChecked,
    authUser,
    fontError,
    fontsLoaded,
    profile,
    profileLoading,
    profileReadError,
    router,
    segments,
  ]);

  useAndroidPushNavigation(authChecked, authUser?.uid ?? null, profile, router);

  if (
    (!fontsLoaded && !fontError) ||
    !authChecked ||
    profileLoading ||
    guardLoading
  ) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator
          size="large"
          color="#078C83"
        />
        <Text style={styles.loadingText}>
          {!authChecked ||
          profileLoading ||
          guardLoading
            ? "Checking your account..."
            : "Loading VolunServe..."}
        </Text>
      </View>
    );
  }

  const route: string = segments[0] ?? "";
  const publicAuthRoute = ["login","signup","admin-login","admin-request","public"].includes(route) ||
    route === "verify-certificate" ||
    (route === "(tabs)" && (segments as readonly string[])[1] === "verify-certificate");

  if (authUser && profileReadError && !publicAuthRoute) {
    return (
      <View style={styles.recoveryScreen}>
        <Text style={styles.recoveryTitle}>Account connection interrupted</Text>
        <Text style={styles.recoveryText}>{profileReadError}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry checking account"
          style={styles.recoveryButton} onPress={() => void retryProfileAccess()}>
          <Text style={styles.recoveryButtonText}>Try Again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out"
          style={styles.recoverySecondary}
          onPress={() => void logoutUser().finally(() => router.replace("/login"))}>
          <Text style={styles.recoverySecondaryText}>Sign Out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="public" />
        <Stack.Screen name="login" />
        <Stack.Screen name="admin-login" />
        <Stack.Screen name="admin-request" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="identity-verification" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(superadmin)" />
        <Stack.Screen name="(lgu)" />
      </Stack>
      <AppDialogHost />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
  },
  recoveryScreen: {
    flex:1,alignItems:"center",justifyContent:"center",
    padding:24,backgroundColor:"#F8FAFC",
  },
  recoveryTitle: {fontSize:19,fontWeight:"700",color:"#173D32",textAlign:"center"},
  recoveryText: {fontSize:13,lineHeight:20,color:"#64748B",marginTop:10,
    maxWidth:390,textAlign:"center"},
  recoveryButton: {minHeight:44,backgroundColor:"#075F47",borderRadius:8,
    alignItems:"center",justifyContent:"center",paddingHorizontal:26,marginTop:22},
  recoveryButtonText: {fontSize:13,fontWeight:"700",color:"#FFFFFF"},
  recoverySecondary: {paddingHorizontal:22,paddingVertical:14,marginTop:6},
  recoverySecondaryText: {fontSize:12,fontWeight:"600",color:"#64748B"},
});
