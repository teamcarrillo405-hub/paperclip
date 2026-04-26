import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { CompanySwitcher } from '../components/CompanySwitcher';
import { Colors, FontSize, FontWeight, Radii, Spacing } from '../theme';

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar + Name */}
        <View style={styles.heroSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{user?.name ?? 'User'}</Text>
          <Text style={styles.email}>{user?.email ?? ''}</Text>
          {user?.role ? (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user.role}</Text>
            </View>
          ) : null}
        </View>

        {/* Company switcher section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Company</Text>
          <CompanySwitcher />
        </View>

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardRowLabel}>Email</Text>
              <Text style={styles.cardRowValue}>{user?.email ?? '--'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.cardRow}>
              <Text style={styles.cardRowLabel}>Name</Text>
              <Text style={styles.cardRowValue}>{user?.name ?? '--'}</Text>
            </View>
            {user?.role ? (
              <>
                <View style={styles.divider} />
                <View style={styles.cardRow}>
                  <Text style={styles.cardRowLabel}>Role</Text>
                  <Text style={styles.cardRowValue}>{user.role}</Text>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* App info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Application</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardRowLabel}>Version</Text>
              <Text style={styles.cardRowValue}>1.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.cardRow}>
              <Text style={styles.cardRowLabel}>Platform</Text>
              <Text style={styles.cardRowValue}>Avero Enterprise</Text>
            </View>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[styles.signOutBtn, loggingOut && styles.signOutBtnDisabled]}
          onPress={handleSignOut}
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          <Text style={styles.signOutBtnText}>
            {loggingOut ? 'Signing Out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  heroSection: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  avatarText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
  },
  name: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  email: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.badge,
    backgroundColor: `${Colors.primary}22`,
    borderWidth: 1,
    borderColor: `${Colors.primary}55`,
    marginTop: Spacing.xs,
  },
  roleBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.primary,
    textTransform: 'capitalize',
  },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  cardRowLabel: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
  },
  cardRowValue: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  signOutBtn: {
    backgroundColor: `${Colors.statusError}22`,
    borderWidth: 1,
    borderColor: Colors.statusError,
    borderRadius: Radii.button,
    paddingVertical: Spacing.md - 2,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  signOutBtnDisabled: { opacity: 0.5 },
  signOutBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.statusError,
  },
});
