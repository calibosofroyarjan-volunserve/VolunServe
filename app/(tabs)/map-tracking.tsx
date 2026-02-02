import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

export default function MapTracking() {
  const locations = [
    { id: '1', type: 'Flood', barangay: 'Muzon', status: 'Ongoing' },
    { id: '2', type: 'Fire', barangay: 'Francisco Homes', status: 'Responding' },
    { id: '3', type: 'Relief Center', barangay: 'Tungko', status: 'Open' },
    { id: '4', type: 'Flood', barangay: 'Kaypian', status: 'Monitoring' },
    { id: '5', type: 'Relief Hub', barangay: 'Sto. Cristo', status: 'Active' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Map Tracking</Text>
      <Text style={styles.subtitle}>SJDM, Bulacan</Text>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.type}>{item.type}</Text>
            <Text>Barangay: {item.barangay}</Text>
            <Text>Status: {item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F8F9FA' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2563EB' },
  subtitle: { fontSize: 16, marginBottom: 15 },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    elevation: 2,
  },
  type: { fontSize: 18, fontWeight: 'bold' },
});
