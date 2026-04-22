import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

import MainTabs from './MainTabs';
import LibraryScreen from '../screens/LibraryScreen';
import SeriesScreen from '../screens/SeriesScreen';
import BookDetailScreen from '../screens/BookDetailScreen';
import EpubReaderScreen from '../screens/EpubReaderScreen';
import PdfReaderScreen from '../screens/PdfReaderScreen';
import ComicReaderScreen from '../screens/ComicReaderScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: '#e8e4de' },
  headerTintColor: '#222',
  headerTitleStyle: { fontWeight: '600' as const },
  contentStyle: { backgroundColor: '#f5f1eb' },
  statusBarStyle: 'dark' as const,
  statusBarColor: '#e8e4de',
};

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Library" component={LibraryScreen} />
      <Stack.Screen name="Series" component={SeriesScreen} />
      <Stack.Screen
        name="BookDetail"
        component={BookDetailScreen}
        options={{ title: 'Book' }}
      />
      <Stack.Screen
        name="EpubReader"
        component={EpubReaderScreen}
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="PdfReader"
        component={PdfReaderScreen}
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="ComicReader"
        component={ComicReaderScreen}
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Stack.Navigator>
  );
}
