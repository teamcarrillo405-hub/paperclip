import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBadge } from './StatusBadge';
import type { Approval, ApprovalStatus } from '../types';

const statusTone: Record<ApprovalStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  denied: 'error',
  expired: 'neutral',
};

export interface ApprovalCardProps {
  approval: Approval;
  onPress?: (approval: Approval) => void;
  onApprove?: (approval: Approval) => void;
  onDeny?: (approval: Approval) => void;
}

export function ApprovalCard({ approval, onPress, onApprove, onDeny }: ApprovalCardProps) {
  const isPending = approval.status === 'pending';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress?.(approval)}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {approval.title}
        </Text>
        <StatusBadge label={approval.status} tone={statusTone[approval.status]} />
      </View>
      {approval.summary ? (
        <Text style={styles.summary} numberOfLines={3}>
          {approval.summary}
        </Text>
      ) : null}
      {approval.agentName ? (
        <Text style={styles.agent}>Agent: {approval.agentName}</Text>
      ) : null}
      {isPending && (onApprove || onDeny) ? (
        <View style={styles.actions}>
          {onDeny ? (
            <Pressable
              style={[styles.button, styles.denyButton]}
              onPress={() => onDeny(approval)}
            >
              <Text style={[styles.buttonText, styles.denyText]}>Deny</Text>
            </Pressable>
          ) : null}
          {onApprove ? (
            <Pressable
              style={[styles.button, styles.approveButton]}
              onPress={() => onApprove(approval)}
            >
              <Text style={[styles.buttonText, styles.approveText]}>Approve</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.9,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    paddingRight: 12,
  },
  summary: {
    marginTop: 8,
    fontSize: 14,
    color: '#4b5563',
  },
  agent: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  denyButton: {
    backgroundColor: '#fee2e2',
  },
  approveButton: {
    backgroundColor: '#2563eb',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  denyText: {
    color: '#991b1b',
  },
  approveText: {
    color: '#ffffff',
  },
});
