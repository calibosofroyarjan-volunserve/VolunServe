import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {GoogleAuthProvider, signInWithCredential} from "firebase/auth";
import {auth} from "./firebase";

WebBrowser.maybeCompleteAuthSession();

/** Preserve production OAuth clients/scheme; own the PKCE exchange exactly once. */
export function useSignupGoogle() {
  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: "233201250762-ton2r7m31pomrc42rgfjl7vb292e0var.apps.googleusercontent.com",
    androidClientId: "233201250762-d7tnic7h4q3f6ohip52a36ng22uqrvl5.apps.googleusercontent.com",
    redirectUri: AuthSession.makeRedirectUri({scheme: "com.froyarjan123.volunserve"}),
    scopes: ["openid", "profile", "email"],
    shouldAutoExchangeCode: false,
  });
  return async () => {
    if (!request) throw new Error("Google sign-in is loading. Please try again.");
    const result = await promptAsync();
    if (result.type !== "success") throw new Error("Google sign-in was cancelled.");
    let token = result.params.id_token || result.authentication?.idToken;
    if (!token && result.params.code) {
      if (!request.codeVerifier) throw new Error("Google sign-in expired. Please try again.");
      const exchanged = await AuthSession.exchangeCodeAsync({
        clientId: request.clientId,
        code: result.params.code,
        redirectUri: request.redirectUri,
        extraParams: {code_verifier: request.codeVerifier},
      }, Google.discovery);
      token = exchanged.idToken;
    }
    if (!token) throw new Error("Google did not return a sign-in token. Please try again.");
    return (await signInWithCredential(auth, GoogleAuthProvider.credential(token))).user;
  };
}
