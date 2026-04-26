import React, { useMemo } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useIssues } from '../hooks/useIssues';
import { useAgents } from '../hooks/useAgents';
import { IssueCard } from '../components/IssueCard';
import { CompanySwitcher } from '../components/CompanySwitcher';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Colors, FontSize, FontWeight, Radii, Spacing } from '../theme';
import type { MainTabParamList } from '../navigation/MainNavigator';

type NavProp = BottomTabNavigationProp<MainTabParamList>;

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <View style={[styles.metricCard, accent ? { borderTopColor: accent, borderTopWidth: 2 } : null]}>
      <Text style={[styles.metricValue, accent ? { color: accent } : null]}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function DashboardScreen() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const navigation = useNavigation<NavProp>();

  const { data: issues, isLoading: issuesLoading, refetch: refetchIssues } = useIssues();
  const { data: agents, isLoading: agentsLoading, refetch: refetchAgents } = useAgents();

  const isRefreshing = issuesLoading || agentsLoading;

  const metrics = useMemo(() => {
    const open = issues?.filter((i) => i.status === 'open').length ?? 0;
    const inProgress = issues?.filter((i) => i.status === 'in-progress').length ?? 0;
    const activeAgents = agents?.filter((a) => a.status === 'online').length ?? agents?.length ?? 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActivity = issues?.filter(
      (i) => new Date(i.updatedAt) >= today,
    ).length ?? 0;

    return { open, inProgress, activeAgents, todayActivity };
  }, [issues, agents]);

  const recentIssues = useMemo(
    () =>
      [...(issues ?? [])]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [issues],
  );

  async function onRefresh() {
    await Promise.all([refetchIssues(), refetchAgents()]);
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Good day, {firstName}</Text>
            {selectedCompany ? (
              <Text style={styles.subtitle}>{selectedCompany.name}</Text>
            ) : null}
          </View>
          <CompanySwitcher />
        </View>

        {/* Metrics */}
        {issuesLoading && !issues ? (
          <LoadingSpinner />
        ) : (
          <View style={styles.metricsRow}>
            <MetricCard
              label="Open Issues"
              value={metrics.open}
              accent={Colors.statusOpen}
            />
            <MetricCard
              label="In Progress"
              value={metrics.inProgress}
              accent={Colors.statusInProgress}
            />
            <MetricCard
              label="Active Agents"
              value={metrics.activeAgents}
              accent={Colors.statusDone}
            />
          </View>
        )}

        {/* Today's Activity banner */}
        <View style={styles.activityBanner}>
          <Text style={styles.activityLabel}>Today's Activity</Text>
          <Text style={styles.activityValue}>
            {metrics.todayActivity} update{metrics.todayActivity !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Recent Issues */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Issues</Text>
          {recentIssues.length === 0 && !issuesLoading ? (
            <Text style={styles.emptyText}>No issues yet.</Text>
          ) : (
            recentIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onPress={() =>
                  navigation.navigate('Issues', {
                    screen: 'IssueDetail',
                    params: { issueId: issue.id },
                  } as never)
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  headerLeft: { flex: 1, gap: 2 },
  greeting: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  metricLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  activityBanner: {
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
    borderRadius: Radii.card,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  activityValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    padding: Spacing.lg,
  },
});
