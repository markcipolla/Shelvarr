import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LoginScreen from '../../src/screens/LoginScreen';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

const initialAuthState = useAuthStore.getState();
const initialSettingsState = useSettingsStore.getState();

const goBack = jest.fn();
const navigation = { goBack } as any;

function renderScreen(mode?: 'login' | 'signup') {
  const route = { key: 'Login', name: 'Login', params: mode ? { mode } : undefined } as any;
  return render(<LoginScreen navigation={navigation} route={route} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ ...initialAuthState, state: 'signed-out' });
  useSettingsStore.setState({
    ...initialSettingsState,
    shelvarrUrl: 'http://books.local',
    setOnboardingComplete: jest.fn(),
  });
});

describe('LoginScreen', () => {
  it('opens in login wording by default', () => {
    const { getByText } = renderScreen();

    expect(getByText('Welcome back')).toBeTruthy();
  });

  it('opens in signup wording when that is what was asked for', () => {
    const { getByText } = renderScreen('signup');

    expect(getByText('Make yourself an account')).toBeTruthy();
  });

  it('shows which server it is signing in to', () => {
    const { getByText } = renderScreen();

    expect(getByText('http://books.local')).toBeTruthy();
  });

  it('steps aside once the link has been opened', () => {
    useAuthStore.setState({ state: 'signed-in' });

    renderScreen();

    expect(goBack).toHaveBeenCalled();
  });

  it('steps aside on a server that has no accounts at all', () => {
    useAuthStore.setState({ state: 'disabled' });

    renderScreen();

    expect(goBack).toHaveBeenCalled();
  });

  it('stays put while there is still a sign-in to do', () => {
    renderScreen();

    expect(goBack).not.toHaveBeenCalled();
  });

  it('hands a change of server back to setup', () => {
    const setOnboardingComplete = jest.fn();
    useSettingsStore.setState({ setOnboardingComplete });

    const { getByText } = renderScreen();
    fireEvent.press(getByText('Use a different server'));

    expect(setOnboardingComplete).toHaveBeenCalledWith(false);
  });
});
