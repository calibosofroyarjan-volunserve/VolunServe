import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

type VolunteerStats = {
  uid: string;
  totalHours: number;
  totalEventsCompleted: number;
  totalCheckIns: number;
  updatedAt: any;
};

const hoursBetween = (checkIn: Date, checkOut: Date) => {
  const ms = checkOut.getTime() - checkIn.getTime();
  const hrs = ms / (1000 * 60 * 60);
  return Math.max(0, Number(hrs.toFixed(2)));
};

/**
 * Call this AFTER checkout is saved.
 * It will add hours + completed event to volunteerStats/{uid}
 */
export async function updateVolunteerStatsAfterCheckout(params: {
  uid: string;
  eventId: string;
  checkedInAt: any;
  checkedOutAt: any;
}) {
  const { uid, checkedInAt, checkedOutAt } = params;

  const inDate: Date | null =
    checkedInAt?.toDate?.() ? checkedInAt.toDate() : checkedInAt instanceof Date ? checkedInAt : null;

  const outDate: Date | null =
    checkedOutAt?.toDate?.() ? checkedOutAt.toDate() : checkedOutAt instanceof Date ? checkedOutAt : null;

  if (!inDate || !outDate) return;

  const sessionHours = hoursBetween(inDate, outDate);

  const statsRef = doc(db, "volunteerStats", uid);
  const snap = await getDoc(statsRef);

  if (!snap.exists()) {
    const initial: VolunteerStats = {
      uid,
      totalHours: sessionHours,
      totalEventsCompleted: 1,
      totalCheckIns: 1,
      updatedAt: serverTimestamp(),
    };

    await setDoc(statsRef, initial);
    return;
  }

  const data: any = snap.data();

  const totalHours = Number(data.totalHours || 0) + sessionHours;
  const totalEventsCompleted = Number(data.totalEventsCompleted || 0) + 1;
  const totalCheckIns = Number(data.totalCheckIns || 0) + 1;

  await setDoc(
    statsRef,
    {
      uid,
      totalHours: Number(totalHours.toFixed(2)),
      totalEventsCompleted,
      totalCheckIns,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
