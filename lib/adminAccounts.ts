import { deleteApp, initializeApp } from "firebase/app";

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
      barangay: "",
      address:
        "City of San Jose del Monte, Bulacan",

      occupation:
        "VolunServe Administrator",

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
        `Created administrator account for ${email}.`,

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