/**
 * Staging Firebase isolation. Expo public keys are browser-visible project IDs,
 * never service accounts. This is NOT a staging backend by itself.
 *
 * Refuse a partially configured or production-linked preview before Firebase
 * Auth/Firestore/Storage/Functions can be initialized.
 */
export type StagingFirebaseEnvironment = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

export type StagingFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const LIVE_PROJECT = "volunserve-3aa5b";

export function requireIsolatedStagingFirebaseConfig(
  values: StagingFirebaseEnvironment
): StagingFirebaseConfig {
  const names: (keyof StagingFirebaseConfig)[] = [
    "apiKey", "authDomain", "projectId",
    "storageBucket", "messagingSenderId", "appId",
  ];
  const input = {} as StagingFirebaseConfig;
  for (const field of names) {
    const value = values[field]?.trim();
    if (!value) {
      throw new Error("STAGING BLOCKED: missing isolated Firebase field " + field);
    }
    input[field] = value;
  }
  const normalized = Object.values(input).map(v => v.toLowerCase());
  if (normalized.some(v => v.includes(LIVE_PROJECT))) {
    throw new Error("STAGING BLOCKED: preview cannot use production VolunServe Firebase resources");
  }
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(input.projectId) ||
      input.projectId === "demo-volunserve" ||
      !input.projectId.startsWith("volunserve-")) {
    throw new Error("STAGING BLOCKED: use a separate VolunServe Firebase project ID");
  }
  if (input.authDomain !== input.projectId + ".firebaseapp.com") {
    throw new Error("STAGING BLOCKED: staging Auth domain must match its staging project");
  }
  if (!(input.storageBucket === input.projectId + ".firebasestorage.app" ||
        input.storageBucket === input.projectId + ".appspot.com")) {
    throw new Error("STAGING BLOCKED: staging Storage bucket must match its staging project");
  }
  if (!/^\d{6,20}$/.test(input.messagingSenderId)) {
    throw new Error("STAGING BLOCKED: staging messaging sender ID is invalid");
  }
  return input;
}
