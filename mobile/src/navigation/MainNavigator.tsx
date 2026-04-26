import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { DashboardScreen } from '../screens/DashboardScreen';
import { IssuesScreen } from '../screens/IssuesScreen';
import { IssueDetailScreen } from '../screens/IssueDetailScreen';
import { AgentsScreen } from '../screens/AgentsScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { Colors, FontSize, FontWeight } from '../theme';

// ─── Param lists ────────────────────────────────────────────────────────────

export type MainTabParamList = {
  Dashboard: undefined;
  Issues: undefined;
  Agents: undefined;
  Profile: undefined;
};

export type IssuesStackParamList = {
  IssuesList: undefined;
  IssueDetail: { issueId: string };
};

export type AgentsStackParamList = {
  AgentsList: undefined;
  Chat: { agentId: string };
};

// ─── Sub-stacks ─────────────────────────────────────────────────────────────

const IssuesStack = createStackNavigator<IssuesStackParamList>();

function IssuesNavigator() {
  return (
    <IssuesStack.Navigator screenOptions={screenOptions}>
      <IssuesStack.Screen
        name="IssuesList"
        component={IssuesScreen}
        options={{ title: 'Issues' }}
      />
      <IssuesStack.Screen
        name="IssueDetail"
        component={IssueDetailScreen}
        options={{ title: 'Issue Detail' }}
      />
    </IssuesStack.Navigator>
  );
}

const AgentsStack = createStackNavigator<AgentsStackParamList>();

function AgentsNavigator() {
  return (
    <AgentsStack.Navigator screenOptions={screenOptions}>
      <AgentsStack.Screen
        name="AgentsList"
        component={AgentsScreen}
        options={{ headerShown: false }}
      />
      <AgentsStack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'Chat' }}
      />
    </AgentsStack.Navigator>
  );
}

// ─── Tab icon helper ─────────────────────────────────────────────────────────

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: 'D',
    Issues: 'I',
    Agents: 'A',
    Profile: 'P',
  };
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text
        style={{
          fontSize: 18,
          color: focused ? Colors.primary : Colors.textDisabled,
          fontWeight: focused ? FontWeight.bold : FontWeight.regular,
        }}
      >
        {icons[label] ?? label[0]}
      </Text>
    </View>
  );
}

// ─── Bottom tab navigator ────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textDisabled,
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: FontWeight.medium,
        },
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen
        name="Issues"
        component={IssuesNavigator}
        options={{ tabBarLabel: 'Issues' }}
      />
      <Tab.Screen
        name="Agents"
        component={AgentsNavigator}
        options={{ tabBarLabel: 'Agents' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

// ─── Shared screen options ───────────────────────────────────────────────────

const screenOptions = {
  headerStyle: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  } as const,
  headerTintColor: Colors.textPrimary,
  headerTitleStyle: {
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  } as const,
  cardStyle: { backgroundColor: Colors.bg },
};
