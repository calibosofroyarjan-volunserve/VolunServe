
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
import { requireIsolatedStagingFirebaseConfig } from "./stagingFirebaseConfig";

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

// Only an EXPLICITLY enabled staging build may load the separate Firebase project.
// In production this remains the exact unchanged original Firebase config.
export const isIsolatedStagingBuild =
  process.env.EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE === "1";

const isolatedStagingConfig = isIsolatedStagingBuild
  ? requireIsolatedStagingFirebaseConfig({
      apiKey: process.env.EXPO_PUBLIC_STAGING_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_STAGING_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_STAGING_FIREBASE_PROJECT_ID,
      storageBucket: process.env.EXPO_PUBLIC_STAGING_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.EXPO_PUBLIC_STAGING_FIREBASE_SENDER_ID,
      appId: process.env.EXPO_PUBLIC_STAGING_FIREBASE_APP_ID,
    })
  : null;

export const firebaseConfig = isIsolatedStagingBuild
  ? isolatedStagingConfig!
  : usingFirebaseEmulators
    ? localConfig
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
