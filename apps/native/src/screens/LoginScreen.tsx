import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { testShelvarrConnection } from '../services/api/shelvarr';

const POLL_INTERVAL_MS = 3000;

/**
 * Sign-in for the app.
 *
 * The phone cannot open its own magic link, so it asks the server to email
 * one and then waits: whoever opens that link — on this phone or on a laptop —
 * approves the request, and the next poll collects the session.
 */
export default function LoginScreen() {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const setShelvarrUrl = useSettingsStore((s) => s.setShelvarrUrl);

  const pending = useAuthStore((s) => s.pending);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const serverStatus = useAuthStore((s) => s.serverStatus);
  const beginLogin = useAuthStore((s) => s.beginLogin);
  const pollPendingLogin = useAuthStore((s) => s.pollPendingLogin);
  const cancelLogin = useAuthStore((s) => s.cancelLogin);
  const refresh = useAuthStore((s) => s.refresh);
  const clearError = useAuthStore((s) => s.clearError);

  const [urlInput, setUrlInput] = useState(shelvarrUrl);
  const [email, setEmail] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);

  // Ref rather than state: the interval closure would otherwise capture a
  // stale poll function and keep calling the first one forever.
  const pollRef = useRef(pollPendingLogin);
  pollRef.current = pollPendingLogin;

  useEffect(() => {
    setUrlInput(shelvarrUrl);
  }, [shelvarrUrl]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void pollRef.current();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pending]);

  const handleSaveUrl = async () => {
    setSavingUrl(true);
    setUrlError(null);
    const result = await testShelvarrConnection(urlInput);
    setSavingUrl(false);
    if (!result.ok) {
      setUrlError(result.error);
      return;
    }
    setShelvarrUrl(urlInput);
    await refresh();
  };

  const handleSignIn = async () => {
    clearError();
    await beginLogin(email);
  };

  if (!shelvarrUrl) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Connect to Shelvarr</Text>
        <Text style={styles.body}>Enter the address of your Shelvarr server to get started.</Text>
        <TextInput
          style={styles.input}
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="http://192.168.1.100:3000"
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {urlError ? <Text style={styles.error}>{urlError}</Text> : null}
        <TouchableOpacity
          style={[styles.button, savingUrl && styles.buttonDisabled]}
          onPress={handleSaveUrl}
          disabled={savingUrl || !urlInput.trim()}
        >
          {savingUrl ? <ActivityIndicator color="#333" /> : <Text style={styles.buttonText}>Connect</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  if (pending) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          {pending.emailSent
            ? `We sent a sign-in link to ${pending.email}. Open it on any device to approve this one.`
            : pending.message ??
              'This server cannot send email. Ask the administrator for the sign-in link from the server log, then open it.'}
        </Text>

        {pending.userCode ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>This device&apos;s code</Text>
            <Text style={styles.code}>{pending.userCode}</Text>
            <Text style={styles.codeHint}>The email shows the same code.</Text>
          </View>
        ) : null}

        <View style={styles.waitingRow}>
          <ActivityIndicator color="#8b5e3c" />
          <Text style={styles.waiting}>Waiting for approval…</Text>
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => void cancelLogin()}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.body}>
        {serverStatus?.allowSignup
          ? 'Enter your email. We will send you a link — a new address gets an account.'
          : 'Enter your email and we will send you a sign-in link. No password needed.'}
      </Text>

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.button, (busy || !email.trim()) && styles.buttonDisabled]}
        onPress={() => void handleSignIn()}
        disabled={busy || !email.trim()}
      >
        {busy ? <ActivityIndicator color="#333" /> : <Text style={styles.buttonText}>Email me a link</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => {
          setShelvarrUrl('');
        }}
      >
        <Text style={styles.linkButtonText}>Use a different server</Text>
      </TouchableOpacity>

      <Text style={styles.server}>{shelvarrUrl}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f5f1eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#222',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: '#555',
    marginBottom: 20,
    lineHeight: 21,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d5d0c8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#e8e4de',
    borderWidth: 1,
    borderColor: '#d5d0c8',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#8b5e3c',
    fontSize: 15,
    fontWeight: '500',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#8b5e3c',
    fontSize: 14,
  },
  error: {
    color: '#a33',
    fontSize: 14,
    marginBottom: 12,
  },
  codeBox: {
    backgroundColor: '#e8e4de',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 13,
    color: '#666',
  },
  code: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#222',
    marginVertical: 6,
  },
  codeHint: {
    fontSize: 12,
    color: '#777',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waiting: {
    fontSize: 15,
    color: '#555',
  },
  server: {
    marginTop: 24,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
