import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Font from 'expo-font';
import RootNavigator from './src/navigation/RootNavigator';
import LoginScreen from './src/screens/LoginScreen';
import { useAuthStore } from './src/stores/useAuthStore';
import { useSettingsStore } from './src/stores/useSettingsStore';
import { useDownloadStore } from './src/stores/useDownloadStore';
import { useNextUpStore } from './src/stores/useNextUpStore';
import { useComicDownloadStore } from './src/stores/useComicDownloadStore';
import { useUpdateStore } from './src/stores/useUpdateStore';
import { retryOfflineQueue } from './src/services/progressSync';
import UpdateBanner from './src/components/UpdateBanner';

export default function App() {
  const [fontsReady, setFontsReady] = useState(false);
  const authState = useAuthStore((s) => s.state);

  useEffect(() => {
    // Settings first: the auth check needs the server URL to know where to ask.
    useSettingsStore
      .getState()
      .loadSettings()
      .then(() => useAuthStore.getState().loadAuth());
    useDownloadStore.getState().loadDownloads();
    useNextUpStore.getState().loadDismissed();
    useComicDownloadStore.getState().loadDownloads();
    retryOfflineQueue();
    // Look for a newer release once per cold start. Failures are swallowed by
    // the store, so this is a no-op when the phone is offline.
    const updates = useUpdateStore.getState();
    updates.loadDismissed().then(() => updates.check({ silent: true }));
    Font.loadAsync({
      'Literata-Regular': require('./assets/fonts/Literata-Regular.ttf'),
      'Literata-Bold': require('./assets/fonts/Literata-Bold.ttf'),
      'Literata-Italic': require('./assets/fonts/Literata-Italic.ttf'),
      'Literata-BoldItalic': require('./assets/fonts/Literata-BoldItalic.ttf'),
    })
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true)); // continue without custom fonts
  }, []);

  if (!fontsReady || authState === 'unknown') {
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
      {authState === 'signed-out' ? <LoginScreen /> : <RootNavigator />}
      {/* Outside the sign-in gate on purpose: an old build is exactly what
          gets refused by a server that now wants a login, so the update
          prompt has to be reachable from the sign-in screen too. */}
      <UpdateBanner />
    </NavigationContainer>
  );
}
