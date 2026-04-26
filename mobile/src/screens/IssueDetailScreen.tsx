import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { useIssue, useAddComment, useUpdateIssueStatus } from '../hooks/useIssues';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { Colors, FontSize, FontWeight, Radii, Spacing } from '../theme';
import type { IssueStatus } from '../api/issues';
import type { IssuesStackParamList } from '../navigation/MainNavigator';

type NavProp = StackNavigationProp<IssuesStackParamList, 'IssueDetail'>;
type RoutePropType = RouteProp<IssuesStackParamList, 'IssueDetail'>;

type Props = {
  navigation: NavProp;
  route: RoutePropType;
};

const STATUS_OPTIONS: IssueStatus[] = ['open', 'in-progress', 'done'];
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function IssueDetailScreen({ route }: Props) {
  const { issueId } = route.params;
  const { data: issue, isLoading, error } = useIssue(issueId);
  const addComment = useAddComment(issueId);
  const updateStatus = useUpdateIssueStatus();
  const [comment, setComment] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  async function handleSendComment() {
    if (!comment.trim()) return;
    const text = comment.trim();
    setComment('');
    await addComment.mutateAsync({ content: text });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  }

  async function handleStatusChange(status: IssueStatus) {
    if (!issue) return;
    await updateStatus.mutateAsync({ id: issue.id, status });
  }

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error || !issue) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="!" title="Issue not found" subtitle="It may have been deleted or you lack access." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {/* Title + Status */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{issue.title}</Text>
          </View>

          {/* Status selector */}
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.statusChip,
                  issue.status === s && {
                    backgroundColor: `${STATUS_COLOR[s]}22`,
                    borderColor: STATUS_COLOR[s],
                  },
                ]}
                onPress={() => handleStatusChange(s)}
                activeOpacity={0.75}
                disabled={updateStatus.isPending}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    issue.status === s && { color: STATUS_COLOR[s] },
                  ]}
                >
                  {STATUS_LABEL[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Meta */}
          <View style={styles.metaCard}>
            {issue.assignedAgentName ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Assigned to</Text>
                <Text style={styles.metaValue}>{issue.assignedAgentName}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Created</Text>
              <Text style={styles.metaValue}>{formatDate(issue.createdAt)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Updated</Text>
              <Text style={styles.metaValue}>{formatDate(issue.updatedAt)}</Text>
            </View>
          </View>

          {/* Description */}
          {issue.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descriptionText}>{issue.description}</Text>
            </View>
          ) : null}

          {/* Activity thread */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Activity ({issue.activity?.length ?? 0})
            </Text>
            {(issue.activity ?? []).map((entry) => (
              <View key={entry.id} style={styles.activityItem}>
                <View style={styles.activityHeader}>
                  <View style={styles.activityAvatar}>
                    <Text style={styles.activityAvatarText}>
                      {entry.authorName[0]?.toUpperCase() ?? 'U'}
                    </Text>
                  </View>
                  <Text style={styles.activityAuthor}>{entry.authorName}</Text>
                  <Text style={styles.activityTime}>{formatDate(entry.createdAt)}</Text>
                </View>
                <Text style={styles.activityContent}>{entry.content}</Text>
              </View>
            ))}
            {(issue.activity?.length ?? 0) === 0 ? (
              <Text style={styles.emptyActivity}>No activity yet. Add a comment below.</Text>
            ) : null}
          </View>
        </ScrollView>

        {/* Comment input */}
        <View style={styles.commentBar}>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!comment.trim() || addComment.isPending) && styles.sendBtnDisabled,
            ]}
            onPress={handleSendComment}
            disabled={!comment.trim() || addComment.isPending}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.lg },
  titleRow: { marginBottom: Spacing.xs },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  statusChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
  },
  metaCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaKey: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  metaValue: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  descriptionText: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    lineHeight: 22,
  },
  activityItem: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  activityAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityAvatarText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
  },
  activityAuthor: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    flex: 1,
  },
  activityTime: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
  },
  activityContent: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    lineHeight: 21,
  },
  emptyActivity: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  commentBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.bg,
  },
});
