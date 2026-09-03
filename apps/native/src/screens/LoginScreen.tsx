import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import SignInPanel from '../components/SignInPanel';
import { useAuthStore } from '../stores/useAuthStore';
import { useSettingsStore } from '../stores/useSettingsStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

/**
 * Signing in from inside the app, once the library is already set up.
 *
 * The flow itself lives in `SignInPanel`; this only decides when the screen
 * has served its purpose and should get out of the way.
 */
export default function LoginScreen({ navigation, route }: Props) {
  const mode = route.params?.mode ?? 'login';
  const authState = useAuthStore((s) => s.state);
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const setOnboardingComplete = useSettingsStore((s) => s.setOnboardingComplete);

  // Nothing left to ask for: either the link was opened, or this server turned
  // out not to want a login at all.
  useEffect(() => {
    if (authState === 'signed-in' || authState === 'disabled') navigation.goBack();
  }, [authState, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SignInPanel mode={mode} />

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => setOnboardingComplete(false)}
        >
          <Text style={styles.linkButtonText}>Use a different server</Text>
        </TouchableOpacity>

        <Text style={styles.server}>{shelvarrUrl}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  linkButton: { marginTop: 16, alignItems: 'center', paddingVertical: 6 },
  linkButtonText: { color: '#8b5e3c', fontSize: 14 },
  server: {
    marginTop: 24,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
