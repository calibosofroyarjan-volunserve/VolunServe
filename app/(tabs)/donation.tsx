import { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function DonationHistory() {
  const [donations, setDonations] = useState([
    {
      id: '1',
      name: 'Froy Arjan Caliboso',
      amount: '₱500',
      date: '2026-02-01',
      status: 'Completed',
    },
  ]);

  const addDonation = (source: 'Manual' | 'QR') => {
    const newDonation = {
      id: Date.now().toString(),
      name: source === 'QR' ? 'QR Donor' : 'Anonymous',
      amount: '₱' + (Math.floor(Math.random() * 900) + 100),
      date: new Date().toISOString().split('T')[0],
      status: 'Completed',
    };

    setDonations([newDonation, ...donations]);
  };

  const handleScanQR = () => {
    // Demo-safe QR simulation
    Alert.alert(
      'QR Scan Successful',
      'Donation recorded successfully.',
      [{ text: 'OK', onPress: () => addDonation('QR') }]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Donation History</Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => addDonation('Manual')}>
          <Text style={styles.buttonText}>Add Donation</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleScanQR}>
          <Text style={styles.secondaryText}>Scan QR</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={donations}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text>Amount: {item.amount}</Text>
            <Text>Date: {item.date}</Text>
            <Text>Status: {item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryText: {
    color: '#111827',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 2,
  },
  name: {
    fontWeight: '600',
    marginBottom: 4,
  },
});
