import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { AuthCredentials } from '../types/komga';
import { validateCredentials } from '../services/api/auth';

export default function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [serverAddress, setServerAddress] = useState(process.env['EXPO_PUBLIC_DEFAULT_SERVER_ADDRESS'] || '');
  const [serverPort, setServerPort] = useState(process.env['EXPO_PUBLIC_DEFAULT_SERVER_PORT'] || '3001');
  const [authType, setAuthType] = useState<'basic' | 'apikey'>('basic');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const address = serverAddress.trim();
    if (!address) {
      Alert.alert('Error', 'Please enter a server address');
      return;
    }
    const port = serverPort.trim();
    const base = /^https?:\/\//i.test(address) ? address : `http://${address}`;
    const url = port ? `${base}:${port}` : base;

    const creds: AuthCredentials = { serverUrl: url, authType };
    if (authType === 'basic') {
      creds.username = username;
      creds.password = password;
    } else {
      creds.apiKey = apiKey;
    }

    setLoading(true);
    try {
      const valid = await validateCredentials(creds);
      if (valid) {
        await login(creds);
      } else {
        Alert.alert('Error', 'Could not connect. Check your credentials and server URL.');
      }
    } catch {
      Alert.alert('Error', 'Connection failed. Is the server reachable?');
    } finally {
      setLoading(false);
    }
  };

  /* istanbul ignore next */
  const kavBehavior = Platform.OS === 'ios' ? 'padding' as const : undefined;
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={kavBehavior}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Stacks</Text>
        <Text style={styles.subtitle}>Connect to your Komga server</Text>

        <View style={styles.addressRow}>
          <TextInput
            style={[styles.input, styles.addressInput]}
            placeholder="Address (e.g. https://komga.local)"
            placeholderTextColor="#888"
            value={serverAddress}
            onChangeText={setServerAddress}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={[styles.input, styles.portInput]}
            placeholder="Port"
            placeholderTextColor="#888"
            value={serverPort}
            onChangeText={setServerPort}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>

        <View style={styles.authToggle}>
          <TouchableOpacity
            style={[styles.authButton, authType === 'basic' && styles.authButtonActive]}
            onPress={() => setAuthType('basic')}
          >
            <Text style={[styles.authButtonText, authType === 'basic' && styles.authButtonTextActive]}>
              Basic Auth
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.authButton, authType === 'apikey' && styles.authButtonActive]}
            onPress={() => setAuthType('apikey')}
          >
            <Text style={[styles.authButtonText, authType === 'apikey' && styles.authButtonTextActive]}>
              API Key
            </Text>
          </TouchableOpacity>
        </View>

        {authType === 'basic' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#888"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="API Key"
            placeholderTextColor="#888"
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity
          style={[styles.loginButton, loading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>Connect</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#222', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#777', textAlign: 'center', marginBottom: 32, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    color: '#222',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  addressRow: { flexDirection: 'row', gap: 8 },
  addressInput: { flex: 1 },
  portInput: { width: 80 },
  authToggle: { flexDirection: 'row', marginBottom: 16 },
  authButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#e8e4de',
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d5d0c8',
  },
  authButtonActive: { backgroundColor: '#d5d0c8', borderColor: '#8b5e3c' },
  authButtonText: { color: '#888', fontSize: 14 },
  authButtonTextActive: { color: '#222', fontWeight: '600' },
  loginButton: {
    backgroundColor: '#8b5e3c',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
