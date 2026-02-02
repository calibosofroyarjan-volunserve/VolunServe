import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function Resident() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Resident Dashboard</Text>
      <Text style={styles.subtitle}>
        Community status and assistance overview
      </Text>

      {/* Quick Stats */}
      <View style={styles.row}>
        <LinearGradient colors={['#0ea5e9', '#38bdf8']} style={styles.card}>
          <MaterialIcons name="assignment" size={32} color="#fff" />
          <Text style={styles.cardTitle}>Active Requests</Text>
          <Text style={styles.cardValue}>3</Text>
        </LinearGradient>

        <LinearGradient colors={['#22c55e', '#4ade80']} style={styles.card}>
          <MaterialIcons name="groups" size={32} color="#fff" />
          <Text style={styles.cardTitle}>Volunteers Nearby</Text>
          <Text style={styles.cardValue}>12</Text>
        </LinearGradient>
      </View>

      {/* Alerts */}
      <LinearGradient colors={['#f97316', '#fb923c']} style={styles.alertCard}>
        <MaterialIcons name="warning" size={28} color="#fff" />
        <Text style={styles.alertText}>
          Flood alert in Muzon, SJDM — Stay alert
        </Text>
      </LinearGradient>

      {/* My Requests */}
      <Text style={styles.sectionTitle}>My Relief Requests</Text>

      <View style={styles.requestCard}>
        <Text style={styles.requestTitle}>Food Assistance</Text>
        <Text style={styles.requestStatusPending}>Pending</Text>
      </View>

      <View style={styles.requestCard}>
        <Text style={styles.requestTitle}>Medical Supplies</Text>
        <Text style={styles.requestStatusTransit}>In Transit</Text>
      </View>

      <View style={styles.requestCard}>
        <Text style={styles.requestTitle}>Evacuation Support</Text>
        <Text style={styles.requestStatusDone}>Resolved</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    width: '48%',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    elevation: 5,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
  },
  cardValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  alertText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  requestCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    elevation: 2,
  },
  requestTitle: {
    fontSize: 15,
    color: '#1e293b',
  },
  requestStatusPending: {
    color: '#f97316',
    fontWeight: 'bold',
  },
  requestStatusTransit: {
    color: '#2563eb',
    fontWeight: 'bold',
  },
  requestStatusDone: {
    color: '#16a34a',
    fontWeight: 'bold',
  },
});
