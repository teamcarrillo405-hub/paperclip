import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgents } from '../hooks/useAgents';
import { useApprovals } from '../hooks/useApprovals';
import { StatusBadge } from '../components/StatusBadge';

export function DashboardScreen() {
  const { agents, loading: agentsLoading, refresh: refreshAgents } = useAgents();
  const {
    approvals,
    loading: approvalsLoading,
    refresh: refreshApprovals,
  } = useApprovals();

  const pendingApprovals = approvals.filter((a) => a.status === 'pending').length;
  const runningAgents = agents.filter((a) => a.status === 'running').length;
  const erroredAgents = agents.filter((a) => a.status === 'error').length;

  const refreshing = agentsLoading || approvalsLoading;
  const onRefresh = async () => {
    await Promise.all([refreshAgents(), refreshApprovals()]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.heading}>Dashboard</Text>

        <View style={styles.statsRow}>
          <StatCard label="Agents running" value={runningAgents} />
          <StatCard label="Errors" value={erroredAgents} tone="error" />
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Pending approvals" value={pendingApprovals} tone="warning" />
          <StatCard label="Total agents" value={agents.length} />
        </View>

        <Text style={styles.sectionTitle}>Recent activity</Text>
        {approvals.slice(0, 3).map((a) => (
          <View key={a.id} style={styles.activityRow}>
            <Text style={styles.activityTitle} numberOfLines={1}>
              {a.title}
            </Text>
            <StatusBadge
              label={a.status}
              tone={a.status === 'pending' ? 'warning' : 'neutral'}
            />
          </View>
        ))}
        {approvals.length === 0 ? (
          <Text style={styles.empty}>No recent activity.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  tone = 'info',
}: {
  label: string;
  value: number;
  tone?: 'info' | 'warning' | 'error';
}) {
  const colorMap = {
    info: '#2563eb',
    warning: '#d97706',
    error: '#dc2626',
  } as const;
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: colorMap[tone] }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16 },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  activityTitle: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    paddingRight: 8,
  },
  empty: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});
