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

const POLL_INTERVAL_MS = 3000;

/** Logging in and signing up are the same request; only the wording differs. */
export type AuthMode = 'login' | 'signup';

interface SignInPanelProps {
  /** Which wording to open with. Ignored once the person switches. */
  mode?: AuthMode;
}

const COPY: Record<AuthMode, { title: string; body: string; button: string }> = {
  login: {
    title: 'Welcome back',
    body: "Pop in your email and we'll send you a link to tap. No password to remember.",
    button: 'Email me a login link',
  },
  signup: {
    title: 'Make yourself an account',
    body: "Pop in your email and we'll send you a link to tap. That's the whole sign-up.",
    button: 'Email me a signup link',
  },
};

/**
 * Email entry and the wait that follows it.
 *
 * The phone cannot open its own magic link, so it asks the server to email
 * one and then waits: whoever opens that link — on this phone or on a laptop —
 * approves the request, and the next poll collects the session.
 *
 * Shared by the sign-in screen and the first-run wizard so the two can never
 * disagree about what the flow says.
 */
export default function SignInPanel({ mode = 'login' }: SignInPanelProps) {
  const pending = useAuthStore((s) => s.pending);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const serverStatus = useAuthStore((s) => s.serverStatus);
  const beginLogin = useAuthStore((s) => s.beginLogin);
  const pollPendingLogin = useAuthStore((s) => s.pollPendingLogin);
  const cancelLogin = useAuthStore((s) => s.cancelLogin);
  const clearError = useAuthStore((s) => s.clearError);

  const [activeMode, setActiveMode] = useState<AuthMode>(mode);
  const [email, setEmail] = useState('');

  // Ref rather than state: the interval closure would otherwise capture a
  // stale poll function and keep calling the first one forever.
  const pollRef = useRef(pollPendingLogin);
  pollRef.current = pollPendingLogin;

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void pollRef.current();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pending]);

  if (pending) {
    return (
      <View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          {pending.emailSent
            ? `We sent a link to ${pending.email}. Open it on any device to let this one in.`
            : pending.message ??
              'This server cannot send email. Ask whoever runs it for the sign-in link from the server log, then open it.'}
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
          <Text style={styles.waiting}>Waiting for you to tap it…</Text>
        </View>

        <TouchableOpacity style={styles.linkButton} onPress={() => void cancelLogin()}>
          <Text style={styles.linkButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const copy = COPY[activeMode];
  const canSwitch = serverStatus?.allowSignup ?? false;

  const switchMode = () => {
    clearError();
    setActiveMode(activeMode === 'login' ? 'signup' : 'login');
  };

  return (
    <View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>

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
        onPress={() => {
          clearError();
          void beginLogin(email);
        }}
        disabled={busy || !email.trim()}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{copy.button}</Text>
        )}
      </TouchableOpacity>

      {canSwitch ? (
        <TouchableOpacity style={styles.linkButton} onPress={switchMode}>
          <Text style={styles.linkButtonText}>
            {activeMode === 'login' ? 'New here? Sign up' : 'Already have an account? Log in'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#8b5e3c',
    borderWidth: 1,
    borderColor: '#8b5e3c',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 6,
  },
  linkButtonText: {
    color: '#8b5e3c',
    fontSize: 15,
    fontWeight: '500',
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
});
