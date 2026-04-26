import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Issue, IssueStatus } from '../api/issues';
import { Colors, FontSize, FontWeight, Radii, Spacing } from '../theme';

type Props = {
  issue: Issue;
  onPress: () => void;
};

const STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  'in-progress': 'In Progress',
  done: 'Done',
};

const STATUS_COLOR: Record<IssueStatus, string> = {
  open: Colors.statusOpen,
  'in-progress': Colors.statusInProgress,
  done: Colors.statusDone,
};

function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: `${STATUS_COLOR[status]}22`, borderColor: STATUS_COLOR[status] },
      ]}
    >
      <View style={[styles.badgeDot, { backgroundColor: STATUS_COLOR[status] }]} />
      <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function IssueCard({ issue, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.header}>
        <StatusBadge status={issue.status} />
        <Text style={styles.time}>{formatRelativeTime(issue.updatedAt)}</Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {issue.title}
      </Text>

      {issue.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {issue.description}
        </Text>
      ) : null}

      {issue.assignedAgentName ? (
        <View style={styles.agentRow}>
          <View style={styles.agentAvatar}>
            <Text style={styles.agentAvatarText}>
              {issue.assignedAgentName[0]?.toUpperCase() ?? 'A'}
            </Text>
          </View>
          <Text style={styles.agentName}>{issue.assignedAgentName}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radii.badge,
    borderWidth: 1,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
  },
  title: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  description: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  agentAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentAvatarText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
  },
  agentName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
});
