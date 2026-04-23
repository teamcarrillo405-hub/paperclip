import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';

export function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.value}>{user?.name ?? user?.email ?? 'Unknown'}</Text>
        {user?.email ? <Text style={styles.secondary}>{user.email}</Text> : null}
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
        onPress={() => {
          void logout();
        }}
      >
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: { fontSize: 12, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' },
  value: { fontSize: 16, color: '#111827', fontWeight: '600' },
  secondary: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  logoutButton: {
    backgroundColor: '#fee2e2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  pressed: { opacity: 0.8 },
  logoutText: { color: '#991b1b', fontWeight: '600', fontSize: 15 },
});
