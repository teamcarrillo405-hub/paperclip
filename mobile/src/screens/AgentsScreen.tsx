import React from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AgentCard } from '../components/AgentCard';
import { EmptyState } from '../components/EmptyState';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAgents } from '../hooks/useAgents';
import { Colors, FontSize, FontWeight, Spacing } from '../theme';
import type { AgentsStackParamList } from '../navigation/MainNavigator';

type NavProp = StackNavigationProp<AgentsStackParamList, 'AgentsList'>;

type Props = {
  navigation: NavProp;
};

export function AgentsScreen({ navigation }: Props) {
  const { data: agents, isLoading, refetch, isRefetching } = useAgents();

  if (isLoading && !agents) return <LoadingSpinner fullScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Agents</Text>
        <Text style={styles.count}>
          {agents?.length ?? 0} available
        </Text>
      </View>

      <FlatList
        data={agents}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <AgentCard
            agent={item}
            onPress={() => navigation.navigate('Chat', { agentId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="R"
            title="No agents available"
            subtitle="Agents will appear here once configured for your company"
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  heading: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  count: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  row: {
    gap: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
    flexGrow: 1,
  },
});
