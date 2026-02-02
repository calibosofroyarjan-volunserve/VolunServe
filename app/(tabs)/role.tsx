import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function RoleSelector() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Your Role</Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.cardTitle}>Resident</Text>
        <Text style={styles.desc}>Request help, track relief</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, { backgroundColor: '#2563eb' }]}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.cardTitle}>Volunteer</Text>
        <Text style={styles.desc}>Join events & disaster response</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#22c55e',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  desc: {
    color: '#e5e7eb',
    marginTop: 4,
  },
});
