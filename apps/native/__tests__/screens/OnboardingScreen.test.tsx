import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import OnboardingScreen from '../../src/screens/OnboardingScreen';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { testShelvarrConnection } from '../../src/services/api/shelvarr';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/shelvarr', () => ({
  testShelvarrConnection: jest.fn(),
}));

const mockTestConnection = testShelvarrConnection as jest.Mock;

const initialAuthState = useAuthStore.getState();
const initialSettingsState = useSettingsStore.getState();

const setShelvarrUrl = jest.fn();
const setOnboardingComplete = jest.fn();

/** Stand in for a server answering the auth-status probe a given way. */
function serverAnswers(state: string, serverStatus: Record<string, unknown> | null = null) {
  const refresh = jest.fn().mockImplementation(async () => {
    useAuthStore.setState({ state: state as never, serverStatus: serverStatus as never });
  });
  useAuthStore.setState({ refresh });
  return refresh;
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ ...initialAuthState, state: 'signed-out' });
  useSettingsStore.setState({
    ...initialSettingsState,
    shelvarrUrl: '',
    setShelvarrUrl,
    setOnboardingComplete,
  });
  mockTestConnection.mockResolvedValue({ ok: true });
});

/** Walk from the welcome step to the server step and type an address. */
function enterServer(url = 'http://nas.local:3000') {
  const utils = render(<OnboardingScreen />);
  fireEvent.press(utils.getByText('Get started'));
  fireEvent.changeText(utils.getByPlaceholderText('http://192.168.1.100:3000'), url);
  return utils;
}

describe('OnboardingScreen', () => {
  it('opens on a welcome rather than a form', () => {
    const { getByText } = render(<OnboardingScreen />);

    expect(getByText('Welcome to Stackarr')).toBeTruthy();
  });

  it('asks for the server address next', () => {
    const { getByText } = render(<OnboardingScreen />);
    fireEvent.press(getByText('Get started'));

    expect(getByText("Where's your library?")).toBeTruthy();
  });

  it('goes back to the welcome from the address', () => {
    const { getByText } = enterServer();
    fireEvent.press(getByText('Back'));

    expect(getByText('Welcome to Stackarr')).toBeTruthy();
  });

  it('starts from the address already stored, when there is one', () => {
    useSettingsStore.setState({ shelvarrUrl: 'http://old.local' });

    const { getByText, getByDisplayValue } = render(<OnboardingScreen />);
    fireEvent.press(getByText('Get started'));

    expect(getByDisplayValue('http://old.local')).toBeTruthy();
  });

  it('explains an address it could not reach, and keeps nothing', async () => {
    mockTestConnection.mockResolvedValue({ ok: false, error: 'Could not reach server' });

    const { getByText } = enterServer('http://typo.local');
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(getByText('Could not reach server')).toBeTruthy();
    });
    expect(setShelvarrUrl).not.toHaveBeenCalled();
  });

  it('skips the sign-in step on a server without accounts', async () => {
    serverAnswers('disabled');

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(getByText("You're all set")).toBeTruthy();
    });
    expect(setShelvarrUrl).toHaveBeenCalledWith('http://nas.local:3000');
  });

  it('skips the sign-in step when the stored session still works', async () => {
    serverAnswers('signed-in');

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(getByText("You're all set")).toBeTruthy();
    });
  });

  it('asks for a sign-in when the server wants one', async () => {
    serverAnswers('signed-out', {
      enabled: true,
      setupRequired: false,
      allowSignup: false,
      emailConfigured: true,
    });

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(getByText('Welcome back')).toBeTruthy();
    });
  });

  it('opens on signup wording where the server takes new accounts', async () => {
    serverAnswers('signed-out', {
      enabled: true,
      setupRequired: false,
      allowSignup: true,
      emailConfigured: true,
    });

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(getByText('Make yourself an account')).toBeTruthy();
    });
  });

  it('sends an unfinished server back to a browser instead of asking for an email', async () => {
    serverAnswers('signed-out', {
      enabled: true,
      setupRequired: true,
      allowSignup: false,
      emailConfigured: true,
    });

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(getByText(/has not been set up yet/i)).toBeTruthy();
    });
  });

  it('moves on by itself once the emailed link is opened', async () => {
    serverAnswers('signed-out', {
      enabled: true,
      setupRequired: false,
      allowSignup: false,
      emailConfigured: true,
    });

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));
    await waitFor(() => expect(getByText('Welcome back')).toBeTruthy());

    useAuthStore.setState({ state: 'signed-in' });

    await waitFor(() => {
      expect(getByText("You're all set")).toBeTruthy();
    });
  });

  it('lets the sign-in be put off, and still finishes setup', async () => {
    serverAnswers('signed-out', {
      enabled: true,
      setupRequired: false,
      allowSignup: false,
      emailConfigured: true,
    });

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));
    await waitFor(() => expect(getByText('Welcome back')).toBeTruthy());

    fireEvent.press(getByText('Skip for now'));

    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
  });

  it('offers a way back to the address from the sign-in step', async () => {
    serverAnswers('signed-out', {
      enabled: true,
      setupRequired: false,
      allowSignup: false,
      emailConfigured: true,
    });

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));
    await waitFor(() => expect(getByText('Welcome back')).toBeTruthy());

    fireEvent.press(getByText('Use a different server'));

    expect(getByText("Where's your library?")).toBeTruthy();
  });

  it('marks setup done on the last step', async () => {
    serverAnswers('disabled');

    const { getByText } = enterServer();
    fireEvent.press(getByText('Connect'));
    await waitFor(() => expect(getByText("You're all set")).toBeTruthy());

    fireEvent.press(getByText('Start reading'));

    expect(setOnboardingComplete).toHaveBeenCalledWith(true);
  });
});
