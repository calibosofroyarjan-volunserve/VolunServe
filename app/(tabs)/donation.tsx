import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Donation() {
  const donations = [
    { id: '1', name: 'Froy Arjan Caliboso', amount: 500 },
    { id: '2', name: 'Mc Iver Basinal', amount: 1000 },
    { id: '3', name: 'Anonymous', amount: 250 },
  ];

  const total = donations.reduce((sum, d) => sum + d.amount, 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Donations</Text>
      <Text style={styles.total}>Total Donations: ₱{total}</Text>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Scan QR to Donate</Text>
      </TouchableOpacity>

      <Text style={styles.subtitle}>Donation History</Text>
      <FlatList
        data={donations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <MaterialIcons name="person" size={24} color="#2563EB" />
            <Text style={styles.itemText}>{item.name} - ₱{item.amount}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F8F9FA' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2563EB', marginBottom: 10 },
  total: { fontSize: 20, fontWeight: 'bold', color: '#444', marginBottom: 20 },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  button: {
    backgroundColor: '#4CAF50',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
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
  itemText: { marginLeft: 10, fontSize: 16 },
});
