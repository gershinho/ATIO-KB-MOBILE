import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: 20 + insets.top }]}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Preferences and app options</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666' },
});
