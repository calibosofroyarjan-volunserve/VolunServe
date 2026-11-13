import { Stack, useRouter } from "expo-router";
import {onAuthStateChanged} from "firebase/auth";
import {useEffect, useState} from "react";
import {ActivityIndicator, Pressable, Text, View} from "react-native";
import {auth} from "../../lib/firebase";

/**
 * Public Guest Preview is an account-free, read-only page.
 *
 * IMPORTANT: Do not sign out here. An authenticated user can temporarily
 * navigate to /public during a login/route transition. The previous
 * onAuthStateChanged -> signOut caused a race against the root layout's
 * approved Resident/Admin redirect and destroyed the session.
 *
 * Only the explicit "Continue as Guest" action on the Login screen signs out.
 * A direct /public visit with an active Firebase session leaves this group
 * and lets the root login/profile guard choose the authorized destination.
 * This component never creates, links, or changes a Firebase profile.
 */
export default function PublicLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (user) {
        // Don't show Guest while signed in, but NEVER invalidate the session.
        // RootLayout sends approved users from /login to their profile route,
        // or shows normal login/profile-completion guidance if ineligible.
        setReady(false);
        router.replace("/login");
        return;
      }
      setReady(true);
      setError("");
    }, () => {
      if (!active) return;
      setReady(false);
      setError("Could not check your Guest Preview session. Return to Sign In.");
    });
    return () => { active = false; unsubscribe(); };
  }, [router]);

  if (!ready || auth.currentUser) {
    return (
      <View style={{
        flex: 1, backgroundColor: "#F6F8F7", justifyContent: "center",
        alignItems: "center", padding: 24,
      }}>
        {error ? (
          <>
            <Text accessibilityRole="alert" style={{
              color: "#991B1B", textAlign: "center", marginBottom: 14,
            }}>{error}</Text>
            <Pressable accessibilityRole="button"
              onPress={() => router.replace("/login")}
              style={{
                backgroundColor: "#176B52", borderRadius: 10,
                paddingVertical: 12, paddingHorizontal: 24,
              }}>
              <Text style={{color: "#FFFFFF", fontWeight: "700"}}>
                Return to Sign In
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color="#176B52" size="large" />
            <Text style={{color: "#17382E", marginTop: 12}}>
              Checking your session…
            </Text>
          </>
        )}
      </View>
    );
  }

  // Only a signed-out session renders public pages. No guest account is made.
  return <Stack screenOptions={{headerShown: false}} />;
}
