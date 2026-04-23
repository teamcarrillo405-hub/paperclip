import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBadge } from './StatusBadge';
import type { Agent, AgentStatus } from '../types';

const statusTone: Record<AgentStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  running: 'success',
  idle: 'neutral',
  error: 'error',
  paused: 'warning',
};

export interface AgentCardProps {
  agent: Agent;
  onPress?: (agent: Agent) => void;
}

export function AgentCard({ agent, onPress }: AgentCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress?.(agent)}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name}>{agent.name}</Text>
          {agent.role ? <Text style={styles.role}>{agent.role}</Text> : null}
        </View>
        <StatusBadge label={agent.status} tone={statusTone[agent.status]} />
      </View>
      {agent.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {agent.description}
        </Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  info: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  role: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  description: {
    marginTop: 8,
    fontSize: 13,
    color: '#4b5563',
  },
});
