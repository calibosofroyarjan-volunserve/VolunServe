import {
    collection,
    doc,
    onSnapshot,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../../lib/firebase";

type NotificationItem = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type?: string;
  read?: boolean;
  createdAt?: any;
};

const toMillis = (value: any) => {
  try {
    if (!value) return 0;
    if (value?.toDate?.()) return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  } catch {
    return 0;
  }
};

const formatDate = (value: any) => {
  try {
    const ms = toMillis(value);
    if (!ms) return "-";
    return new Date(ms).toLocaleString();
  } catch {
    return "-";
  }
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as NotificationItem[];

        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

        setNotifications(list);
        setLoading(false);
      },
      (error) => {
        console.log("Notifications error:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), {
        read: true,
      });
    } catch (error) {
      console.log("Mark read error:", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🔔 Notifications</Text>

      {notifications.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyText}>
            Reminders from organizers will appear here.
          </Text>
        </View>
      ) : (
        notifications.map((item) => (
          <View
            key={item.id}
            style={[
              styles.card,
              item.read ? styles.readCard : styles.unreadCard,
            ]}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.title}</Text>

              {!item.read && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>NEW</Text>
                </View>
              )}
            </View>

            <Text style={styles.message}>{item.message}</Text>

            <Text style={styles.date}>{formatDate(item.createdAt)}</Text>

            {!item.read && (
              <TouchableOpacity
                style={styles.readBtn}
                onPress={() => markAsRead(item.id)}
              >
                <Text style={styles.readBtnText}>Mark as Read</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f1f5f9",
    flexGrow: 1,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
  },

  loadingText: {
    marginTop: 10,
    color: "#64748b",
    fontWeight: "700",
  },

  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 16,
  },

  emptyCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },

  emptyText: {
    marginTop: 6,
    color: "#64748b",
    lineHeight: 18,
  },

  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },

  unreadCard: {
    borderColor: "#2563eb",
  },

  readCard: {
    borderColor: "#e5e7eb",
    opacity: 0.75,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },

  badge: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },

  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },

  message: {
    marginTop: 8,
    color: "#334155",
    lineHeight: 19,
    fontWeight: "600",
  },

  date: {
    marginTop: 8,
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },

  readBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },

  readBtnText: {
    color: "#fff",
    fontWeight: "900",
  },
});