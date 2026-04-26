import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { useAgent } from '../hooks/useAgents';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { sendMessageToAgent } from '../api/agents';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Colors, FontSize, FontWeight, Radii, Spacing } from '../theme';
import type { AgentsStackParamList } from '../navigation/MainNavigator';

type NavProp = StackNavigationProp<AgentsStackParamList, 'Chat'>;
type RoutePropType = RouteProp<AgentsStackParamList, 'Chat'>;

type Props = {
  navigation: NavProp;
  route: RoutePropType;
};

type LocalMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
  pending?: boolean;
  error?: boolean;
};

function MessageBubble({ message }: { message: LocalMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleWrapper, isUser ? styles.bubbleWrapperRight : styles.bubbleWrapperLeft]}>
      {!isUser && (
        <View style={styles.agentAvatar}>
          <Text style={styles.agentAvatarText}>A</Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAgent,
          message.error && styles.bubbleError,
        ]}
      >
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAgent]}>
          {message.content}
        </Text>
        {message.pending && (
          <Text style={styles.pendingText}>Sending...</Text>
        )}
        {message.error && (
          <Text style={styles.errorIndicator}>Failed to send</Text>
        )}
      </View>
    </View>
  );
}

export function ChatScreen({ navigation, route }: Props) {
  const { agentId } = route.params;
  const { data: agent, isLoading } = useAgent(agentId);
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<LocalMessage>>(null);

  // Set header title once agent loads
  useEffect(() => {
    if (agent) {
      navigation.setOptions({ title: agent.name });
    }
  }, [agent, navigation]);

  // Greeting message from agent on mount
  useEffect(() => {
    if (agent) {
      setMessages([
        {
          id: 'greeting',
          role: 'agent',
          content: `Hi! I'm ${agent.name}. ${agent.description ?? 'How can I help you today?'}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, [agent]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  async function handleSend() {
    if (!input.trim() || sending || !selectedCompanyId) return;

    const text = input.trim();
    setInput('');

    const userMsg: LocalMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    const placeholderMsg: LocalMessage = {
      id: `agent-pending-${Date.now()}`,
      role: 'agent',
      content: 'Thinking...',
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, placeholderMsg]);
    scrollToBottom();
    setSending(true);

    try {
      const response = await sendMessageToAgent({
        agentId,
        companyId: selectedCompanyId,
        message: text,
      });

      const agentMsg: LocalMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        content: response.reply || 'Task created successfully. I will get started on that.',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) =>
        prev.filter((m) => m.id !== placeholderMsg.id).concat(agentMsg),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderMsg.id
            ? { ...m, content: 'Failed to reach agent. Please try again.', pending: false, error: true }
            : m,
        ),
      );
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  if (isLoading) return <LoadingSpinner fullScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Agent header strip */}
      {agent && (
        <View style={styles.agentHeader}>
          <View style={styles.agentHeaderAvatar}>
            <Text style={styles.agentHeaderAvatarText}>
              {agent.name[0]?.toUpperCase() ?? 'A'}
            </Text>
          </View>
          <View style={styles.agentHeaderInfo}>
            <Text style={styles.agentHeaderName}>{agent.name}</Text>
            {agent.description ? (
              <Text style={styles.agentHeaderDesc} numberOfLines={1}>
                {agent.description}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.onlineDot,
              {
                backgroundColor:
                  agent.status === 'online' ? Colors.statusDone : Colors.textDisabled,
              },
            ]}
          />
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToBottom}
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={`Message ${agent?.name ?? 'agent'}...`}
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={4000}
            returnKeyType="default"
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            <Text style={styles.sendBtnText}>
              {sending ? '...' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  agentHeaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  agentHeaderAvatarText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
  },
  agentHeaderInfo: { flex: 1 },
  agentHeaderName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  agentHeaderDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  listContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    maxWidth: '82%',
  },
  bubbleWrapperLeft: {
    alignSelf: 'flex-start',
    gap: Spacing.xs,
  },
  bubbleWrapperRight: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  agentAvatarText: {
    fontSize: 12,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
  },
  bubble: {
    borderRadius: Radii.card,
    padding: Spacing.sm + 2,
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAgent: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleError: {
    borderColor: Colors.statusError,
    backgroundColor: `${Colors.statusError}11`,
  },
  bubbleText: {
    fontSize: FontSize.base,
    lineHeight: 21,
  },
  bubbleTextUser: { color: Colors.bg },
  bubbleTextAgent: { color: Colors.textPrimary },
  pendingText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  errorIndicator: {
    fontSize: FontSize.xs,
    color: Colors.statusError,
    marginTop: 2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radii.button,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    minWidth: 64,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.bg,
  },
});
