import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export const checkAchievements = async (uid: string): Promise<string[]> => {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) return [];

  const data: any = userSnap.data();

  const points = data.points || 0;
  const joined = data.joined || 0;
  const completed = data.completed || 0;

  const achievements: string[] = data.achievements || [];
  const newlyUnlocked: string[] = [];

  const addAchievement = (achievement: string) => {
    if (!achievements.includes(achievement)) {
      achievements.push(achievement);
      newlyUnlocked.push(achievement);
    }
  };

  if (joined >= 1) {
    addAchievement("🥉 First Event Joined");
  }

  if (completed >= 1) {
    addAchievement("⭐ First Completed Event");
  }

  if (completed >= 5) {
    addAchievement("🥈 Active Volunteer");
  }

  if (points >= 20) {
    addAchievement("🥇 Top Performer");
  }

  if (points >= 50) {
    addAchievement("🏆 Elite Volunteer");
  }

  if (newlyUnlocked.length > 0) {
    await updateDoc(userRef, {
      achievements,
    });
  }

  return newlyUnlocked;
};