import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function DisasterVolunteer() {
  const incidents = [
    { id: '1', type: 'House Fire', barangay: 'Muzon', response: 'Fire Assistance' },
    { id: '2', type: 'Flood', barangay: 'Francisco Homes', response: 'Evacuation Support' },
    { id: '3', type: 'Flood', barangay: 'Tungko', response: 'Relief Distribution' },
    { id: '4', type: 'Fire', barangay: 'Kaypian', response: 'Emergency Response' },
    { id: '5', type: 'Flood', barangay: 'Sto. Cristo', response: 'Rescue Ops' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Disaster Volunteer</Text>
      <Text style={styles.subtitle}>SJDM, Bulacan</Text>

      <FlatList
        data={incidents}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.incident}>
              🚨 {item.type}
            </Text>
            <Text>Barangay: {item.barangay}</Text>
            <Text>Needed: {item.response}</Text>

            <TouchableOpacity style={styles.joinButton}>
              <Text style={styles.joinText}>Respond</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F8F9FA' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#DC2626' },
  subtitle: { fontSize: 16, marginBottom: 15 },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  incident: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  joinButton: {
    marginTop: 10,
    backgroundColor: '#DC2626',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  joinText: { color: '#fff', fontWeight: 'bold' },
});
