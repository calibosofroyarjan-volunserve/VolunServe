import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40; // almost full width with padding

export default function Dashboard() {
  const router = useRouter();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={true} // vertical scroll
    >
      <Text style={styles.title}>VolunServe</Text>
      <Text style={styles.subtitle}>Community • Action • Response</Text>

      {/* Donation */}
      <TouchableOpacity onPress={() => router.push('/donation')}>
        <LinearGradient colors={['#ff6a00', '#ee0979']} style={styles.card}>
          <Ionicons name="heart" size={36} color="#fff" />
          <Text style={styles.cardText}>Donations</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Volunteers */}
      <TouchableOpacity onPress={() => router.push('/volunteer')}>
        <LinearGradient colors={['#2193b0', '#6dd5ed']} style={styles.card}>
          <Ionicons name="people" size={36} color="#fff" />
          <Text style={styles.cardText}>Volunteers</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Residents */}
      <TouchableOpacity onPress={() => router.push('/resident')}>
        <LinearGradient colors={['#56ab2f', '#a8e063']} style={styles.card}>
          <Ionicons name="home" size={36} color="#fff" />
          <Text style={styles.cardText}>Residents</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Disaster Volunteers */}
      <TouchableOpacity onPress={() => router.push('/disaster-volunteer')}>
        <LinearGradient colors={['#cb2d3e', '#ef473a']} style={styles.card}>
          <Ionicons name="warning" size={36} color="#fff" />
          <Text style={styles.cardText}>Disaster Response</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Map Tracking */}
      <TouchableOpacity onPress={() => router.push('/map-tracking')}>
        <LinearGradient colors={['#373b44', '#4286f4']} style={styles.card}>
          <Ionicons name="map" size={36} color="#fff" />
          <Text style={styles.cardText}>Map Tracking</Text>
          <Text style={styles.cardSub}>SJDM Only</Text>
        </LinearGradient>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
  },
  card: {
    width: CARD_WIDTH,       // almost full width
    height: 140,             // big card
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    marginTop: 12,
    color: '#fff',
    fontWeight: '600',
    fontSize: 18,
    textAlign: 'center',
  },
  cardSub: {
    color: '#eee',
    fontSize: 12,
    marginTop: 4,
  },
});
