import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SignInPanel from '../components/SignInPanel';
import { useAuthStore } from '../stores/useAuthStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { testShelvarrConnection } from '../services/api/shelvarr';

/**
 * `signin` is skipped entirely on servers without accounts, so the steps are
 * a path through this list rather than a straight walk down it.
 */
type Step = 'welcome' | 'server' | 'signin' | 'done';

const STEPS: Step[] = ['welcome', 'server', 'signin', 'done'];

/**
 * First-run setup.
 *
 * A fresh install knows nothing: not where the library is, and not whether
 * that server wants a login. This asks for the address, works the second part
 * out for itself, and only asks for an email when the server actually needs
 * one — so an unauthenticated home server is two taps from reading.
 */
export default function OnboardingScreen() {
  const shelvarrUrl = useSettingsStore((s) => s.shelvarrUrl);
  const setShelvarrUrl = useSettingsStore((s) => s.setShelvarrUrl);
  const setOnboardingComplete = useSettingsStore((s) => s.setOnboardingComplete);

  const authState = useAuthStore((s) => s.state);
  const serverStatus = useAuthStore((s) => s.serverStatus);
  const refresh = useAuthStore((s) => s.refresh);

  const [step, setStep] = useState<Step>('welcome');
  const [urlInput, setUrlInput] = useState(shelvarrUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Signing in is the last thing the wizard asks for, so a session arriving —
  // whether from this device or the link being opened on a laptop — is the
  // cue to move on.
  useEffect(() => {
    if (step === 'signin' && authState === 'signed-in') setStep('done');
  }, [step, authState]);

  const finish = () => setOnboardingComplete(true);

  /**
   * Check the address, keep it, and let the server tell us what comes next.
   */
  const connect = async () => {
    setChecking(true);
    setUrlError(null);

    const reachable = await testShelvarrConnection(urlInput);
    if (!reachable.ok) {
      setChecking(false);
      setUrlError(reachable.error);
      return;
    }

    setShelvarrUrl(urlInput);
    await refresh();
    setChecking(false);

    const { state, serverStatus: status } = useAuthStore.getState();
    // No accounts on this server, or we already hold a session it accepts.
    if (state === 'disabled' || state === 'signed-in') {
      setStep('done');
      return;
    }
    // The server wants accounts but nobody has made the first one yet; that
    // has to happen in a browser, so there is nothing to sign in to.
    if (status?.setupRequired) {
      setUrlError(
        'This server has not been set up yet. Open it in a browser to create the first account, then try again.'
      );
      return;
    }
    setStep('signin');
  };

  const progress = (
    <View style={styles.dots}>
      {STEPS.map((name) => (
        <View
          key={name}
          style={[styles.dot, name === step ? styles.dotActive : null]}
          testID={`onboarding-dot-${name}`}
        />
      ))}
    </View>
  );

  let content: React.ReactNode;

  if (step === 'welcome') {
    content = (
      <View>
        <Text style={styles.hero}>📚</Text>
        <Text style={styles.title}>Welcome to Stackarr</Text>
        <Text style={styles.body}>
          Your books and comics, on your phone, from your own Shelvarr server. Let&apos;s point
          this app at it — it only takes a moment.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => setStep('server')}>
          <Text style={styles.buttonText}>Get started</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (step === 'server') {
    content = (
      <View>
        <Text style={styles.hero}>🔌</Text>
        <Text style={styles.title}>Where&apos;s your library?</Text>
        <Text style={styles.body}>
          Enter the address of your Shelvarr server. It usually looks like the example below.
        </Text>

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
          style={[styles.button, (checking || !urlInput.trim()) && styles.buttonDisabled]}
          onPress={() => void connect()}
          disabled={checking || !urlInput.trim()}
        >
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => setStep('welcome')}>
          <Text style={styles.linkButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (step === 'signin') {
    content = (
      <View>
        <SignInPanel mode={serverStatus?.allowSignup ? 'signup' : 'login'} />

        <TouchableOpacity style={styles.linkButton} onPress={finish}>
          <Text style={styles.linkButtonText}>Skip for now</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={() => setStep('server')}>
          <Text style={styles.linkButtonText}>Use a different server</Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    content = (
      <View>
        <Text style={styles.hero}>🎉</Text>
        <Text style={styles.title}>You&apos;re all set</Text>
        <Text style={styles.body}>
          {shelvarrUrl} is connected. Download anything you want to keep, and it&apos;ll be
          readable even when you&apos;re nowhere near a signal.
        </Text>
        <TouchableOpacity style={styles.button} onPress={finish}>
          <Text style={styles.buttonText}>Start reading</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {content}
        {progress}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f1eb' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  hero: { fontSize: 48, textAlign: 'center', marginBottom: 20 },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#222',
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    color: '#555',
    lineHeight: 23,
    marginBottom: 24,
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
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { marginTop: 16, alignItems: 'center', paddingVertical: 6 },
  linkButtonText: { color: '#8b5e3c', fontSize: 15, fontWeight: '500' },
  error: { color: '#a33', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d5d0c8',
  },
  dotActive: { backgroundColor: '#8b5e3c' },
});
