import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  status: 'pending' | 'in-transit' | 'resolved';
};

export default function StatusBadge({ status }: Props) {
  const bgColor =
    status === 'pending'
      ? '#facc15'
      : status === 'in-transit'
      ? '#3b82f6'
      : '#22c55e';

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={styles.text}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});