import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {GoogleAuthProvider, signInWithCredential} from "firebase/auth";
import {Platform} from "react-native";
import {auth} from "./firebase";
import {connectGoogleAccountWeb} from "./firebaseAuth";
import {googleSignInErrorMessage} from "./googleSignInFeedback";

WebBrowser.maybeCompleteAuthSession();

/**
 * Shared Google authentication for Login and Signup.
 * Web uses Firebase's supported popup flow; Android keeps its native
 * authorization-code + PKCE exchange, without changing the OAuth clients.
 */
export function useSignupGoogle() {
  const [request, , promptAsync] = Google.useAuthRequest({
    webClientId: "233201250762-ton2r7m31pomrc42rgfjl7vb292e0var.apps.googleusercontent.com",
    androidClientId: "233201250762-d7tnic7h4q3f6ohip52a36ng22uqrvl5.apps.googleusercontent.com",
    redirectUri: AuthSession.makeRedirectUri({scheme: "com.froyarjan123.volunserve"}),
    scopes: ["openid", "profile", "email"],
    shouldAutoExchangeCode: false,
  });

  return async () => {
    if (Platform.OS === "web") {
      // Unlike the Expo web AuthSession, Firebase's popup provides a usable
      // Firebase credential, handles web redirects, and reports popup errors.
      return connectGoogleAccountWeb();
    }

    if (!request) {
      throw new Error("Google sign-in is still initializing. Try again in a moment.");
    }
    const result = await promptAsync();
    if (result.type === "cancel" || result.type === "dismiss") {
      throw new Error("Google sign-in was cancelled. Tap Continue with Google to try again.");
    }
    if (result.type !== "success") {
      throw new Error("Google authorization did not finish. Please try again.");
    }

    let token = result.params?.id_token || result.authentication?.idToken;
    if (!token && result.params?.code) {
      if (!request.codeVerifier) {
        throw new Error("Google authorization session expired. Please try again.");
      }
      try {
        const exchanged = await AuthSession.exchangeCodeAsync({
          clientId: request.clientId,
          code: result.params.code,
          redirectUri: request.redirectUri,
          extraParams: {code_verifier: request.codeVerifier},
        }, Google.discovery);
        token = exchanged.idToken;
      } catch (error) {
        throw new Error(googleSignInErrorMessage(error));
      }
    }
    if (!token) {
      throw new Error("Google did not return a valid sign-in token. Please try again.");
    }
    try {
      return (await signInWithCredential(auth, GoogleAuthProvider.credential(token))).user;
    } catch (error) {
      throw new Error(googleSignInErrorMessage(error));
    }
  };
}
