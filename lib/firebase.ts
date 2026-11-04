
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

export const stagingConfig = {
  // Firebase Web App config: VolunServe Auth Staging, separate Spark project.
  // Public client identifiers, NOT a service-account credential.
  apiKey: "AIzaSyDQgSgUT2QQivfq8CHbQKM0Df0mkCTFXFI",
  authDomain: "volunserve-auth-staging.firebaseapp.com",
  projectId: "volunserve-auth-staging",
  storageBucket: "volunserve-auth-staging.firebasestorage.app",
  messagingSenderId: "916160317396",
  appId: "1:916160317396:web:0626f2a622b6aa25027841",
};

const localConfig = {
  apiKey: "demo-volunserve-key",
  authDomain: "demo-volunserve.firebaseapp.com",
  projectId: "demo-volunserve",
  storageBucket: "demo-volunserve.appspot.com",
  messagingSenderId: "000000000000",
  appId: "demo-volunserve-local-web",
};

const ENABLE_LOCAL_TESTING =
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";

const isLocalBrowser =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export const usingFirebaseEmulators =
  ENABLE_LOCAL_TESTING && isLocalBrowser;

// Defaults to production for existing APKs and the production website.
// An exported staging build MUST explicitly set EXPO_PUBLIC_FIREBASE_TARGET=staging.
const requestedTarget = process.env.EXPO_PUBLIC_FIREBASE_TARGET;
if (
  requestedTarget &&
  requestedTarget !== "production" &&
  requestedTarget !== "staging"
) {
  throw new Error("Unrecognized Firebase target. Use staging or production.");
}

export const usingFirebaseStaging =
  !usingFirebaseEmulators && requestedTarget === "staging";

export const firebaseConfig = usingFirebaseEmulators
  ? localConfig
  : usingFirebaseStaging
    ? stagingConfig
    : productionConfig;

// Prevent accidental cross-project access if a build is published to the
// wrong Hosting project or staging config is missing during Expo export.
if (typeof window !== "undefined") {
  const hostname = window.location.hostname.toLowerCase();
  const isProductionWebsite =
    hostname === "volunserve.com" || hostname === "www.volunserve.com";
  const isStagingWebsite =
    (hostname.endsWith(".web.app") || hostname.endsWith(".firebaseapp.com"))
    && hostname.startsWith("volunserve-auth-staging");

  if (isProductionWebsite && firebaseConfig.projectId !== productionConfig.projectId) {
    throw new Error("Incorrect Firebase project for VolunServe production website.");
  }
  if (isStagingWebsite && firebaseConfig.projectId !== stagingConfig.projectId) {
    throw new Error("Staging build missing. Export with EXPO_PUBLIC_FIREBASE_TARGET=staging.");
  }
}

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
