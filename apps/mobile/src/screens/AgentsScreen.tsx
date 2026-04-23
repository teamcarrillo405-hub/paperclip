import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackScreenProps } from '@react-navigation/stack';
import { AgentCard } from '../components/AgentCard';
import { useAgents } from '../hooks/useAgents';
import type { AgentsStackParamList } from '../navigation/AppNavigator';

type Props = StackScreenProps<AgentsStackParamList, 'AgentsList'>;

export function AgentsScreen({ navigation }: Props) {
  const { agents, loading, error, refresh } = useAgents();

  if (loading && agents.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.heading}>Agents</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={agents}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <AgentCard
            agent={item}
            onPress={(a) => navigation.navigate('AgentDetail', { agentId: a.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No agents yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  list: { padding: 16 },
  error: { color: '#991b1b', paddingHorizontal: 16, paddingBottom: 8 },
  empty: { alignItems: 'center', padding: 32 },
  emptyText: { color: '#6b7280', fontSize: 14 },
});
