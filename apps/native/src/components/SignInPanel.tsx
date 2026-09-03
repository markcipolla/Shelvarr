import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import CodeInput from './CodeInput';

/** Logging in and signing up are the same request; only the wording differs. */
export type AuthMode = 'login' | 'signup';

interface SignInPanelProps {
  /** Which wording to open with. Ignored once the person switches. */
  mode?: AuthMode;
}

const COPY: Record<AuthMode, { title: string; body: string; button: string }> = {
  login: {
    title: 'Welcome back',
    body: "Pop in your email and we'll send you a code to type. No password to remember.",
    button: 'Email me a code',
  },
  signup: {
    title: 'Make yourself an account',
    body: "Pop in your email and we'll send you a code to type. That's the whole sign-up.",
    button: 'Email me a code',
  },
};

/**
 * Email entry, then the code that arrives at it.
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
  const submitCode = useAuthStore((s) => s.submitCode);
  const cancelLogin = useAuthStore((s) => s.cancelLogin);
  const clearError = useAuthStore((s) => s.clearError);

  const [activeMode, setActiveMode] = useState<AuthMode>(mode);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  if (pending) {
    // Takes the code rather than reading state: `onComplete` fires from the
    // same render that filled the last box, so `code` is still one character
    // behind at that point.
    const send = async (entered: string) => {
      if (busy || entered.length < pending.codeLength) return;
      const accepted = await submitCode(entered);
      // A rejected code is retyped from scratch; the boxes are cleared so it
      // is obvious the old one is gone.
      if (!accepted) setCode('');
    };

    return (
      <View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          {pending.emailSent
            ? `We sent a ${pending.codeLength}-character code to ${pending.email}. Type it in below.`
            : (pending.message ??
              'This server cannot send email. Ask whoever runs it for the code from the server log.')}
        </Text>

        <CodeInput
          value={code}
          onChangeText={setCode}
          onComplete={(entered) => void send(entered)}
          length={pending.codeLength}
          editable={!busy}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, (busy || code.length < pending.codeLength) && styles.buttonDisabled]}
          onPress={() => void send(code)}
          disabled={busy || code.length < pending.codeLength}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => {
            setCode('');
            void beginLogin(pending.email);
          }}
          disabled={busy}
        >
          <Text style={styles.linkButtonText}>Send a new code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => {
            setCode('');
            cancelLogin();
          }}
        >
          <Text style={styles.linkButtonText}>Use a different email</Text>
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
          setCode('');
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
});
