import { deleteApp, initializeApp } from "firebase/app";
import { SJDM_BARANGAYS } from "../constants/sjdmBarangays";

import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    signOut,
    updateProfile,
} from "firebase/auth";

import {
    collection,
    doc,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";

import {
    auth,
    db,
    firebaseConfig,
} from "./firebase";

export type CreateAdminInput = {
  fullName: string;
  email: string;
  password: string;
  lguOffice: string;
  barangay: string;
  lguPosition: string;
  appointmentReference: string;
  credentialsReviewed: boolean;
};

export async function createAdminAccount(
  input: CreateAdminInput
) {
  const creator = auth.currentUser;

  if (!creator) {
    throw new Error(
      "Super administrator session not found."
    );
  }

  const fullName = input.fullName
    .trim()
    .replace(/\s+/g, " ");

  const email = input.email
    .trim()
    .toLowerCase();

  const lguOffice = input.lguOffice.trim();
  const lguPosition = input.lguPosition.trim();
  const appointmentReference = input.appointmentReference.trim();

  // Manual authorization by the trusted Super Admin is required. This
  // declaration does not validate the authenticity of external documents.
  if (!input.credentialsReviewed ||
      fullName.length < 5 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      lguOffice.length < 3 ||
      !SJDM_BARANGAYS.includes(input.barangay) ||
      lguPosition.length < 3 ||
      appointmentReference.length < 5 ||
      input.password.length < 12 ||
      !/[A-Z]/.test(input.password) ||
      !/[a-z]/.test(input.password) ||
      !/[0-9]/.test(input.password) ||
      !/[^A-Za-z0-9]/.test(input.password)) {
    throw new Error("Enter complete LGU office, position and appointment reference, review the official credentials, and use a strong 12+ character temporary password.");
  }

  const secondaryApp = initializeApp(
    firebaseConfig,
    `admin-provision-${Date.now()}`
  );

  const secondaryAuth = getAuth(secondaryApp);

  let createdUser: Awaited<
    ReturnType<typeof createUserWithEmailAndPassword>
  >["user"] | null = null;

  try {
    const credential =
      await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        input.password
      );

    createdUser = credential.user;

    await updateProfile(createdUser, {
      displayName: fullName,
    });

    const batch = writeBatch(db);

    const userReference = doc(
      db,
      "users",
      createdUser.uid
    );

    const logReference = doc(
      collection(db, "adminLogs")
    );

    batch.set(userReference, {
      uid: createdUser.uid,
      fullName,

      age: 0,
      email,
      phoneNumber: "",

      region: "Region III – Central Luzon",
      province: "Bulacan",
      city: "City of San Jose del Monte",
      barangay: input.barangay,
      address:
        "City of San Jose del Monte, Bulacan",

      occupation: "LGU Administrator",
      lguOffice,
      lguPosition,
      // Use a safe appointment memorandum reference, not a government ID number.
      appointmentReference,
      credentialsReviewedBy: creator.uid,
      credentialsReviewedAt: serverTimestamp(),
      credentialReviewMethod: "manual_lgu_appointment_review",
      // User's authorized separate Firebase login, not a promoted Resident.
      adminStatus: "active",
      role: "admin",
      status: "approved",

      profilePictureUrl: "",

      createdAt: serverTimestamp(),
      createdBy: creator.uid,

      reviewedAt: serverTimestamp(),
      reviewedBy: creator.uid,
    });

    batch.set(logReference, {
      actionType: "admin_account_created",
      targetType: "user",
      targetId: createdUser.uid,
      adminUid: creator.uid,

      description:
        `Created independent LGU Admin account for ${email} after manual appointment review (reference: ${appointmentReference}).`,

      createdAt: serverTimestamp(),
    });

    await batch.commit();

    return {
      uid: createdUser.uid,
      email,
    };
  } catch (error) {
    if (createdUser) {
      await deleteUser(createdUser)
        .catch(() => undefined);
    }

    throw error;
  } finally {
    await signOut(secondaryAuth)
      .catch(() => undefined);

    await deleteApp(secondaryApp)
      .catch(() => undefined);
  }
}