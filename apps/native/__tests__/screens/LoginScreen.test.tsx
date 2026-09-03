import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import LoginScreen from '../../src/screens/LoginScreen';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';
import { testShelvarrConnection } from '../../src/services/api/shelvarr';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/services/api/shelvarr');

const mockTestConnection = testShelvarrConnection as jest.Mock;

const authActions = {
  beginLogin: jest.fn(),
  pollPendingLogin: jest.fn(),
  cancelLogin: jest.fn(),
  refresh: jest.fn(),
  clearError: jest.fn(),
};

const initialAuthState = useAuthStore.getState();
const initialSettingsState = useSettingsStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ ...initialAuthState, ...authActions });
  useSettingsStore.setState({ ...initialSettingsState, shelvarrUrl: 'http://books.local' });
  jest.spyOn(useSettingsStore.getState(), 'setShelvarrUrl').mockImplementation(() => {});
});

describe('LoginScreen', () => {
  describe('when no server is configured', () => {
    beforeEach(() => {
      useSettingsStore.setState({ shelvarrUrl: '' });
    });

    it('asks for the server address first', () => {
      const { getByText, getByPlaceholderText } = render(<LoginScreen />);

      expect(getByText('Connect to Shelvarr')).toBeTruthy();
      expect(getByPlaceholderText('http://192.168.1.100:3000')).toBeTruthy();
    });

    it('saves a reachable address and re-checks the sign-in state', async () => {
      mockTestConnection.mockResolvedValue({ ok: true });
      const setShelvarrUrl = jest.fn();
      useSettingsStore.setState({ setShelvarrUrl });

      const { getByText, getByPlaceholderText } = render(<LoginScreen />);
      fireEvent.changeText(getByPlaceholderText('http://192.168.1.100:3000'), 'http://nas.local:3000');
      fireEvent.press(getByText('Connect'));

      await waitFor(() => {
        expect(setShelvarrUrl).toHaveBeenCalledWith('http://nas.local:3000');
      });
      expect(authActions.refresh).toHaveBeenCalled();
    });

    it('explains an address it could not reach, and saves nothing', async () => {
      mockTestConnection.mockResolvedValue({ ok: false, error: 'Could not reach server' });
      const setShelvarrUrl = jest.fn();
      useSettingsStore.setState({ setShelvarrUrl });

      const { getByText, getByPlaceholderText } = render(<LoginScreen />);
      fireEvent.changeText(getByPlaceholderText('http://192.168.1.100:3000'), 'http://typo.local');
      fireEvent.press(getByText('Connect'));

      await waitFor(() => {
        expect(getByText('Could not reach server')).toBeTruthy();
      });
      expect(setShelvarrUrl).not.toHaveBeenCalled();
    });
  });

  describe('asking for a link', () => {
    it('sends the address the person typed', async () => {
      const { getByText, getByPlaceholderText } = render(<LoginScreen />);

      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'reader@example.com');
      fireEvent.press(getByText('Email me a link'));

      await waitFor(() => {
        expect(authActions.beginLogin).toHaveBeenCalledWith('reader@example.com');
      });
    });

    it('says a new address gets an account when the server allows it', () => {
      useAuthStore.setState({
        serverStatus: { enabled: true, setupRequired: false, allowSignup: true, emailConfigured: true },
      });

      const { getByText } = render(<LoginScreen />);

      expect(getByText(/a new address gets an account/i)).toBeTruthy();
    });

    it('shows what went wrong', () => {
      useAuthStore.setState({ error: 'Too many sign-in emails requested.' });

      const { getByText } = render(<LoginScreen />);

      expect(getByText('Too many sign-in emails requested.')).toBeTruthy();
    });
  });

  describe('while waiting for approval', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      useAuthStore.setState({
        pending: {
          email: 'reader@example.com',
          deviceCode: 'device-1',
          userCode: 'ABC-DEF',
          emailSent: true,
        },
      });
      authActions.pollPendingLogin.mockResolvedValue('pending');
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows the code so it can be matched against the email', () => {
      const { getByText } = render(<LoginScreen />);

      expect(getByText('ABC-DEF')).toBeTruthy();
      expect(getByText(/we sent a sign-in link to reader@example.com/i)).toBeTruthy();
    });

    it('explains what to do when the server cannot send email', () => {
      useAuthStore.setState({
        pending: {
          email: 'reader@example.com',
          deviceCode: 'device-1',
          userCode: 'ABC-DEF',
          emailSent: false,
          message: 'Ask the administrator for the link.',
        },
      });

      const { getByText } = render(<LoginScreen />);

      expect(getByText('Ask the administrator for the link.')).toBeTruthy();
    });

    it('polls until the link is opened', async () => {
      render(<LoginScreen />);

      await act(async () => {
        jest.advanceTimersByTime(9000);
      });

      expect(authActions.pollPendingLogin).toHaveBeenCalledTimes(3);
    });

    it('stops polling once the wait is over', async () => {
      const { rerender } = render(<LoginScreen />);
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      useAuthStore.setState({ pending: null });
      rerender(<LoginScreen />);
      await act(async () => {
        jest.advanceTimersByTime(9000);
      });

      expect(authActions.pollPendingLogin).toHaveBeenCalledTimes(1);
    });

    it('lets the wait be abandoned', () => {
      const { getByText } = render(<LoginScreen />);

      fireEvent.press(getByText('Cancel'));

      expect(authActions.cancelLogin).toHaveBeenCalled();
    });
  });

  it('offers a way back to the server address', () => {
    const setShelvarrUrl = jest.fn();
    useSettingsStore.setState({ setShelvarrUrl });

    const { getByText } = render(<LoginScreen />);
    fireEvent.press(getByText('Use a different server'));

    expect(setShelvarrUrl).toHaveBeenCalledWith('');
  });
});
