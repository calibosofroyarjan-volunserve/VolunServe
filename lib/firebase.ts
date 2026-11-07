
import {
  getApp,
  getApps,
  initializeApp,
} from "firebase/app";

import {
  connectAuthEmulator,
  getAuth,
} from "firebase/auth";

import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";

import {
  connectFunctionsEmulator,
  getFunctions,
} from "firebase/functions";

import { getStorage } from "firebase/storage";

export const productionConfig = {
  apiKey: "AIzaSyAPPi-UxUxyMvoNeaBLUOPOls63dEDLUmI",
  authDomain: "volunserve-3aa5b.firebaseapp.com",
  projectId: "volunserve-3aa5b",
  storageBucket: "volunserve-3aa5b.firebasestorage.app",
  messagingSenderId: "233201250762",
  appId: "1:233201250762:web:c50ff914c6107b1f68df33",
};

const localConfig = {
  apiKey: "demo-volunserve-key",
  authDomain: "demo-volunserve.firebaseapp.com",
  projectId: "demo-volunserve",
  storageBucket: "demo-volunserve.appspot.com",
  messagingSenderId: "000000000000",
  appId: "demo-volunserve-local-web",
};

const ENABLE_LOCAL_TESTING = false;

const isLocalBrowser =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export const usingFirebaseEmulators =
  ENABLE_LOCAL_TESTING && isLocalBrowser;

// Opt-in staging builds must never silently fall back to production Firebase.
// Unset in production builds: the existing production configuration is unchanged.
export const usingStagingFirebase =
  process.env.EXPO_PUBLIC_VOLUNSERVE_ENV === "staging";

const stagingConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || "",
};

if (usingStagingFirebase) {
  // Reject missing or mixed project settings before Firebase is initialized.
  if (
    Object.values(stagingConfig).some((value) => !value) ||
    stagingConfig.projectId === productionConfig.projectId ||
    stagingConfig.authDomain !== `${stagingConfig.projectId}.firebaseapp.com` ||
    !stagingConfig.storageBucket.startsWith(`${stagingConfig.projectId}.`)
  ) {
    throw new Error(
      "Unsafe staging Firebase configuration: provide a complete, separate Firebase project."
    );
  }
}

export const firebaseConfig = usingFirebaseEmulators
  ? localConfig
  : usingStagingFirebase
    ? stagingConfig
    : productionConfig;

const existingApp =
  getApps().length > 0 ? getApp() : null;

if (
  existingApp &&
  existingApp.options.projectId !== firebaseConfig.projectId
) {
  throw new Error(
    "Firebase project changed. Restart Expo and reload the browser."
  );
}

const app = existingApp || initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

if (usingFirebaseEmulators) {
  connectAuthEmulator(
    auth,
    "http://127.0.0.1:9099",
    { disableWarnings: true }
  );

  connectFirestoreEmulator(
    db,
    "127.0.0.1",
    8080
  );

  connectFunctionsEmulator(
    functions,
    "127.0.0.1",
    5001
  );

  console.log(
    "VolunServe LOCAL TEST MODE — demo-volunserve"
  );
}
