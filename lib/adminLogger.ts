import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export const createAdminLog = async ({
  actionType,
  targetType,
  targetId,
  adminUid,
  adminName,
  description,
}: {
  actionType: string;
  targetType: string;
  targetId: string;
  adminUid: string;
  adminName: string;
  description: string;
}) => {
  try {
    await addDoc(collection(db, "adminLogs"), {
      actionType,
      targetType,
      targetId,
      adminUid,
      adminName,
      description,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.log("Admin log error:", error);
  }
};