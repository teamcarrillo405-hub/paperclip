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
import { ApprovalCard } from '../components/ApprovalCard';
import { useApprovals } from '../hooks/useApprovals';
import type { ApprovalsStackParamList } from '../navigation/AppNavigator';

type Props = StackScreenProps<ApprovalsStackParamList, 'ApprovalsList'>;

export function ApprovalsScreen({ navigation }: Props) {
  const { approvals, loading, error, refresh, respond } = useApprovals();

  const handleQuickAction = async (id: string, approved: boolean) => {
    try {
      await respond(id, approved);
    } catch {
      // swallow — user can retry from detail screen
    }
  };

  if (loading && approvals.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['top']}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.heading}>Approvals</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={approvals}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        renderItem={({ item }) => (
          <ApprovalCard
            approval={item}
            onPress={(a) =>
              navigation.navigate('ApprovalDetail', { approvalId: a.id })
            }
            onApprove={(a) => handleQuickAction(a.id, true)}
            onDeny={(a) => handleQuickAction(a.id, false)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No pending approvals.</Text>
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
