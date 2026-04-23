import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { getAgent } from '../api/agents';
import { StatusBadge } from '../components/StatusBadge';
import type { Agent, AgentStatus } from '../types';
import type { AgentsStackParamList } from '../navigation/AppNavigator';

type Props = StackScreenProps<AgentsStackParamList, 'AgentDetail'>;

const statusTone: Record<AgentStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  running: 'success',
  idle: 'neutral',
  error: 'error',
  paused: 'warning',
};

export function AgentDetailScreen({ route }: Props) {
  const { agentId } = route.params;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAgent(agentId);
        if (!cancelled) setAgent(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load agent';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  if (error || !agent) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.error}>{error ?? 'Agent not found'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name}>{agent.name}</Text>
          <StatusBadge label={agent.status} tone={statusTone[agent.status]} />
        </View>
        {agent.role ? <Text style={styles.role}>{agent.role}</Text> : null}
        {agent.description ? (
          <Text style={styles.description}>{agent.description}</Text>
        ) : null}
        {agent.lastActivityAt ? (
          <Text style={styles.meta}>Last activity: {agent.lastActivityAt}</Text>
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
    alignItems: 'center',
    marginBottom: 8,
  },
  name: { fontSize: 22, fontWeight: '700', color: '#111827', flex: 1, paddingRight: 12 },
  role: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  description: { fontSize: 15, color: '#374151', lineHeight: 22, marginBottom: 12 },
  meta: { fontSize: 12, color: '#9ca3af' },
  error: { color: '#991b1b', fontSize: 14 },
});
