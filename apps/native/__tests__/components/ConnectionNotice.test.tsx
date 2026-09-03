import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ConnectionNotice from '../../src/components/ConnectionNotice';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

// The global setup hands back a fresh jest.fn each render, which can't be
// asserted on; this one keeps the same spy across the whole test.
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const initialAuthState = useAuthStore.getState();
const initialSettingsState = useSettingsStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ ...initialAuthState });
  useSettingsStore.setState({ ...initialSettingsState, setOnboardingComplete: jest.fn() });
});

describe('ConnectionNotice', () => {
  describe('with no server address', () => {
    it('explains what is missing and offers to set it up', () => {
      const setOnboardingComplete = jest.fn();
      useSettingsStore.setState({ setOnboardingComplete });

      const { getByText } = render(<ConnectionNotice status="no-server" />);

      expect(getByText('No server yet')).toBeTruthy();
      fireEvent.press(getByText('Set up Stackarr'));

      expect(setOnboardingComplete).toHaveBeenCalledWith(false);
    });
  });

  describe('when signed out', () => {
    it('says so plainly and offers a way in', () => {
      const { getByText } = render(<ConnectionNotice status="signed-out" />);

      expect(getByText('Not logged in')).toBeTruthy();
      fireEvent.press(getByText('Log in'));

      expect(mockNavigate).toHaveBeenCalledWith('Login', { mode: 'login' });
    });

    it('offers signing up only where the server takes new accounts', () => {
      useAuthStore.setState({
        serverStatus: { enabled: true, setupRequired: false, allowSignup: true, emailConfigured: true },
      });

      const { getByText } = render(<ConnectionNotice status="signed-out" />);
      fireEvent.press(getByText('Sign up'));

      expect(mockNavigate).toHaveBeenCalledWith('Login', { mode: 'signup' });
    });

    it('keeps quiet about signing up when the server will not have it', () => {
      useAuthStore.setState({
        serverStatus: { enabled: true, setupRequired: false, allowSignup: false, emailConfigured: true },
      });

      const { queryByText } = render(<ConnectionNotice status="signed-out" />);

      expect(queryByText('Sign up')).toBeNull();
    });
  });

  describe('when offline', () => {
    it('says why the shelves are bare', () => {
      const { getByText } = render(<ConnectionNotice status="offline" />);

      expect(getByText("You're offline")).toBeTruthy();
    });

    it('offers another go when the screen can retry', () => {
      const onRetry = jest.fn();

      const { getByText } = render(<ConnectionNotice status="offline" onRetry={onRetry} />);
      fireEvent.press(getByText('Try again'));

      expect(onRetry).toHaveBeenCalled();
    });

    it('offers nothing to press when the screen cannot retry', () => {
      const { queryByText } = render(<ConnectionNotice status="offline" />);

      expect(queryByText('Try again')).toBeNull();
    });
  });
});
