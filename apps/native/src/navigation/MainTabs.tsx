import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import BooksScreen from '../screens/BooksScreen';
import ComicsScreen from '../screens/ComicsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

function SettingsButton() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <TouchableOpacity
      onPress={() => nav.navigate('Settings')}
      style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
    >
      <Text style={{ color: '#222', fontSize: 26 }}>⚙</Text>
    </TouchableOpacity>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#e8e4de' },
        headerTintColor: '#222',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => <SettingsButton />,
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
    </Tab.Navigator>
  );
}
