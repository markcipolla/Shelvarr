import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import EmptyState, { EmptyStateAction } from './EmptyState';
import { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../stores/useAuthStore';
import { useSettingsStore } from '../stores/useSettingsStore';

/** The three reasons a tab has nothing to show that aren't about the library. */
export type NoticeStatus = 'no-server' | 'signed-out' | 'offline';

interface ConnectionNoticeProps {
  status: NoticeStatus;
  /** Offline only: lets the screen retry the fetch that failed. */
  onRetry?: () => void;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The standard "we can't show your library, and here's what to do about it"
 * panel. Shared by every tab so the wording, the artwork and the buttons don't
 * drift apart one screen at a time.
 */
export default function ConnectionNotice({ status, onRetry }: ConnectionNoticeProps) {
  const navigation = useNavigation<Nav>();
  const allowSignup = useAuthStore((s) => s.serverStatus?.allowSignup ?? false);
  const setOnboardingComplete = useSettingsStore((s) => s.setOnboardingComplete);

  if (status === 'no-server') {
    return (
      <EmptyState
        icon="🔌"
        title="No server yet"
        body="Stackarr needs to know where your Shelvarr server lives before these shelves can fill up."
        actions={[
          {
            label: 'Set up Stackarr',
            // Hands the job back to the first-run wizard rather than
            // half-repeating it here.
            onPress: () => setOnboardingComplete(false),
            primary: true,
          },
        ]}
      />
    );
  }

  if (status === 'signed-out') {
    const actions: EmptyStateAction[] = [
      {
        label: 'Log in',
        onPress: () => navigation.navigate('Login', { mode: 'login' }),
        primary: true,
      },
    ];
    if (allowSignup) {
      actions.push({
        label: 'Sign up',
        onPress: () => navigation.navigate('Login', { mode: 'signup' }),
      });
    }

    return (
      <EmptyState
        icon="👋"
        title="Not logged in"
        body="Log in to browse your library. Anything you've already downloaded stays readable."
        actions={actions}
      />
    );
  }

  return (
    <EmptyState
      icon="📡"
      title="You're offline"
      body="Nothing is saved to this device yet, so there's nothing to read until you're back on the network."
      actions={onRetry ? [{ label: 'Try again', onPress: onRetry, primary: true }] : []}
    />
  );
}
