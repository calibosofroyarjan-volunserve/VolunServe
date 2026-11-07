/**
 * VolunServe full staging project guard. Browser config only; NEVER service credentials.
 * This file is used only when EXPO_PUBLIC_VOLUNSERVE_STAGING_MODE=1.
 * DO NOT deploy this branch to production.
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

const EXPECTED = Object.freeze({
  projectId: "volunserve-full-staging",
  authDomain: "volunserve-full-staging.firebaseapp.com",
  storageBucket: "volunserve-full-staging.firebasestorage.app",
  messagingSenderId: "429213950126",
  appId: "1:429213950126:web:955dbf575697826b674d3f",
});
const NAMES: (keyof StagingFirebaseConfig)[] = [
  "apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId",
];

export function requireIsolatedStagingFirebaseConfig(
  values: StagingFirebaseEnvironment
): StagingFirebaseConfig {
  const input = {} as StagingFirebaseConfig;
  for (const field of NAMES) {
    const value = values[field]?.trim();
    if (!value) {
      throw new Error("STAGING BLOCKED: missing isolated Firebase field " + field);
    }
    input[field] = value;
  }
  if (!/^AIza[A-Za-z0-9_-]{20,}$/.test(input.apiKey)) {
    throw new Error("STAGING BLOCKED: invalid public Firebase Web API key format");
  }
  for (const field of Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]) {
    if (input[field] !== EXPECTED[field]) {
      throw new Error("STAGING BLOCKED: wrong full staging Firebase " + field);
    }
  }
  return input;
}
