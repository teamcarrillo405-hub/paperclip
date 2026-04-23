import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { StatusBadge } from '../components/StatusBadge';
import { listApprovals, respondToApproval } from '../api/approvals';
import type { Approval, ApprovalStatus } from '../types';
import type { ApprovalsStackParamList } from '../navigation/AppNavigator';

type Props = StackScreenProps<ApprovalsStackParamList, 'ApprovalDetail'>;

const statusTone: Record<ApprovalStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  denied: 'error',
  expired: 'neutral',
};

export function ApprovalDetailScreen({ route, navigation }: Props) {
  const { approvalId } = route.params;
  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const approvals = await listApprovals();
        const found = approvals.find((a) => a.id === approvalId) ?? null;
        if (!cancelled) setApproval(found);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load approval';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [approvalId]);

  const submit = async (approved: boolean) => {
    if (!approval) return;
    setSubmitting(true);
    try {
      const updated = await respondToApproval(approval.id, approved, reason || undefined);
      setApproval(updated);
      navigation.goBack();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit response';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  if (error || !approval) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.error}>{error ?? 'Approval not found'}</Text>
      </SafeAreaView>
    );
  }

  const isPending = approval.status === 'pending';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{approval.title}</Text>
          <StatusBadge label={approval.status} tone={statusTone[approval.status]} />
        </View>
        {approval.agentName ? (
          <Text style={styles.meta}>From: {approval.agentName}</Text>
        ) : null}
        {approval.summary ? <Text style={styles.summary}>{approval.summary}</Text> : null}
        {approval.details ? <Text style={styles.details}>{approval.details}</Text> : null}

        {isPending ? (
          <View style={styles.actions}>
            <TextInput
              style={styles.input}
              placeholder="Optional reason…"
              value={reason}
              onChangeText={setReason}
              multiline
            />
            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.button, styles.denyButton]}
                onPress={() => submit(false)}
                disabled={submitting}
              >
                <Text style={[styles.buttonText, styles.denyText]}>Deny</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.approveButton]}
                onPress={() => submit(true)}
                disabled={submitting}
              >
                <Text style={[styles.buttonText, styles.approveText]}>Approve</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', flex: 1, paddingRight: 12 },
  meta: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  summary: { fontSize: 15, color: '#374151', lineHeight: 22, marginBottom: 12 },
  details: { fontSize: 14, color: '#4b5563', lineHeight: 20, marginBottom: 16 },
  actions: { marginTop: 16 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  denyButton: { backgroundColor: '#fee2e2' },
  approveButton: { backgroundColor: '#2563eb' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  denyText: { color: '#991b1b' },
  approveText: { color: '#ffffff' },
  error: { color: '#991b1b', fontSize: 14 },
});
