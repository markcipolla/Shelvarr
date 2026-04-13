import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Font from 'expo-font';
import RootNavigator from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/useAuthStore';
import { useSettingsStore } from './src/stores/useSettingsStore';
import { retryOfflineQueue } from './src/services/progressSync';

export default function App() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const loadCredentials = useAuthStore((s) => s.loadCredentials);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    loadCredentials();
    useSettingsStore.getState().loadSettings();
    retryOfflineQueue();
    Font.loadAsync({
      'Literata-Regular': require('./assets/fonts/Literata-Regular.ttf'),
      'Literata-Bold': require('./assets/fonts/Literata-Bold.ttf'),
      'Literata-Italic': require('./assets/fonts/Literata-Italic.ttf'),
      'Literata-BoldItalic': require('./assets/fonts/Literata-BoldItalic.ttf'),
    })
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true)); // continue without custom fonts
  }, []);

  if (isLoading || !fontsReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f1eb' }}>
        <ActivityIndicator size="large" color="#8b5e3c" />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: '#8b5e3c',
          background: '#f5f1eb',
          card: '#e8e4de',
          text: '#222',
          border: '#d5d0c8',
          notification: '#8b5e3c',
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '900' },
        },
      }}
    >
      <StatusBar style="dark" />
      <RootNavigator />
    </NavigationContainer>
  );
}
