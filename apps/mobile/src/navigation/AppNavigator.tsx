import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { DashboardScreen } from '../screens/DashboardScreen';
import { AgentsScreen } from '../screens/AgentsScreen';
import { AgentDetailScreen } from '../screens/AgentDetailScreen';
import { ApprovalsScreen } from '../screens/ApprovalsScreen';
import { ApprovalDetailScreen } from '../screens/ApprovalDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type AgentsStackParamList = {
  AgentsList: undefined;
  AgentDetail: { agentId: string };
};

export type ApprovalsStackParamList = {
  ApprovalsList: undefined;
  ApprovalDetail: { approvalId: string };
};

export type AppTabParamList = {
  Dashboard: undefined;
  Agents: undefined;
  Approvals: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();
const AgentsStack = createStackNavigator<AgentsStackParamList>();
const ApprovalsStack = createStackNavigator<ApprovalsStackParamList>();

function AgentsStackNavigator() {
  return (
    <AgentsStack.Navigator screenOptions={{ headerShown: false }}>
      <AgentsStack.Screen name="AgentsList" component={AgentsScreen} />
      <AgentsStack.Screen
        name="AgentDetail"
        component={AgentDetailScreen}
        options={{ headerShown: true, title: 'Agent' }}
      />
    </AgentsStack.Navigator>
  );
}

function ApprovalsStackNavigator() {
  return (
    <ApprovalsStack.Navigator screenOptions={{ headerShown: false }}>
      <ApprovalsStack.Screen name="ApprovalsList" component={ApprovalsScreen} />
      <ApprovalsStack.Screen
        name="ApprovalDetail"
        component={ApprovalDetailScreen}
        options={{ headerShown: true, title: 'Approval' }}
      />
    </ApprovalsStack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#6b7280',
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Agents" component={AgentsStackNavigator} />
      <Tab.Screen name="Approvals" component={ApprovalsStackNavigator} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
