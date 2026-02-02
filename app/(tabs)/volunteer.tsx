import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Volunteer() {
  const events = [
    { id: '1', name: 'Street Cleanup' },
    { id: '2', name: 'Tree Planting' },
    { id: '3', name: 'Food Drive' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Volunteer</Text>
      <Text style={styles.subtitle}>Available Events</Text>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <MaterialIcons name="event" size={24} color="#2563EB" />
            <Text style={styles.itemText}>{item.name}</Text>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Join Event</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F8F9FA' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2563EB', marginBottom: 10 },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  itemText: { flex: 1, marginLeft: 10, fontSize: 16 },
  button: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
