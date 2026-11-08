import { Stack } from "expo-router";
import {onAuthStateChanged, signOut} from "firebase/auth";
import {useCallback, useEffect, useState} from "react";
import {ActivityIndicator, Pressable, Text, View} from "react-native";
import {auth} from "../../lib/firebase";

/**
 * Guest is a public, account-free preview, NEVER a Firebase role or profile.
 *
 * The explicit Login "Continue as Guest" button signs out first, but a user
 * can also paste /public directly. Isolate THAT entry point too so an active
 * verified, pending, or anonymous Auth session cannot ride into Guest Mode.
 * The guest navigator mounts only AFTER Firebase confirms signed-out state.
 */
export default function PublicLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const clearSession = useCallback(async () => {
    setReady(false);
    setError("");
    try {
      await signOut(auth);
    } catch {
      setError("Guest Preview could not end your account session. Please try again.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    let clearing = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (!user) {
        clearing = false;
        setReady(true);
        setError("");
        return;
      }
      if (clearing) return;
      clearing = true;
      setReady(false);
      void signOut(auth).catch(() => {
        if (active) {
          clearing = false;
          setError("Guest Preview could not end your account session. Please try again.");
        }
      });
    }, () => {
      if (active) setError("Could not verify signed-out Guest Mode. Check your connection and try again.");
    });
    return () => {active = false; unsubscribe();};
  }, [retry]);

  if (!ready || auth.currentUser) {
    return <View style={{flex: 1, backgroundColor: "#F6F8F7", justifyContent: "center", alignItems: "center", padding: 24}}>
      {error ? (
        <>
          <Text accessibilityRole="alert" style={{color: "#991B1B", textAlign: "center", marginBottom: 14}}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => {
            void clearSession().then(() => setRetry(v => v + 1));
          }} style={{backgroundColor: "#176B52", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24}}>
            <Text style={{color: "#FFFFFF", fontWeight: "700"}}>Retry Guest Preview</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color="#176B52" size="large"/>
          <Text style={{color: "#17382E", marginTop: 12}}>Opening account-free Guest Preview…</Text>
        </>
      )}
    </View>;
  }
  // No account hooks, Firebase reads/writes, or session data in guest pages.
  return <Stack screenOptions={{headerShown: false}} />;
}
