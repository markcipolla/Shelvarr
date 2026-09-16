import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import BooksScreen from '../screens/BooksScreen';
import ComicsScreen from '../screens/ComicsScreen';
import WantedListScreen from '../screens/WantedListScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#e8e4de' },
        headerTintColor: '#222',
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: '#8b5e3c',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#e8e4de',
          borderTopColor: '#d5d0c8',
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen as any}
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>🏠</Text>,
        }}
      />
      <Tab.Screen
        name="Books"
        component={BooksScreen as any}
        options={{
          title: 'Books',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>📚</Text>,
        }}
      />
      <Tab.Screen
        name="Comics"
        component={ComicsScreen as any}
        options={{
          title: 'Comics',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>💥</Text>,
        }}
      />
      <Tab.Screen
        name="Wanted"
        component={WantedListScreen as any}
        options={{
          title: 'Wanted',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>✨</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen as any}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
