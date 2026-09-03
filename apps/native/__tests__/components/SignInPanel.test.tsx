import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import SignInPanel from '../../src/components/SignInPanel';
import { useAuthStore } from '../../src/stores/useAuthStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

const authActions = {
  beginLogin: jest.fn(),
  pollPendingLogin: jest.fn(),
  cancelLogin: jest.fn(),
  clearError: jest.fn(),
};

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ ...initialAuthState, ...authActions });
});

describe('SignInPanel', () => {
  describe('asking for a link', () => {
    it('opens in login wording by default', () => {
      const { getByText } = render(<SignInPanel />);

      expect(getByText('Welcome back')).toBeTruthy();
      expect(getByText('Email me a login link')).toBeTruthy();
    });

    it('opens in signup wording when asked to', () => {
      const { getByText } = render(<SignInPanel mode="signup" />);

      expect(getByText('Make yourself an account')).toBeTruthy();
      expect(getByText('Email me a signup link')).toBeTruthy();
    });

    it('sends the address the person typed', async () => {
      const { getByText, getByPlaceholderText } = render(<SignInPanel />);

      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'reader@example.com');
      fireEvent.press(getByText('Email me a login link'));

      await waitFor(() => {
        expect(authActions.beginLogin).toHaveBeenCalledWith('reader@example.com');
      });
    });

    it('shows what went wrong', () => {
      useAuthStore.setState({ error: 'Too many sign-in emails requested.' });

      const { getByText } = render(<SignInPanel />);

      expect(getByText('Too many sign-in emails requested.')).toBeTruthy();
    });

    it('waits rather than sending twice while a request is in flight', () => {
      useAuthStore.setState({ busy: true });

      const { queryByText } = render(<SignInPanel />);

      expect(queryByText('Email me a login link')).toBeNull();
    });
  });

  describe('switching between logging in and signing up', () => {
    it('offers a way across when the server takes new accounts', () => {
      useAuthStore.setState({
        serverStatus: { enabled: true, setupRequired: false, allowSignup: true, emailConfigured: true },
      });

      const { getByText } = render(<SignInPanel />);
      fireEvent.press(getByText('New here? Sign up'));

      expect(getByText('Make yourself an account')).toBeTruthy();
      expect(getByText('Already have an account? Log in')).toBeTruthy();
      expect(authActions.clearError).toHaveBeenCalled();
    });

    it('goes back to logging in', () => {
      useAuthStore.setState({
        serverStatus: { enabled: true, setupRequired: false, allowSignup: true, emailConfigured: true },
      });

      const { getByText } = render(<SignInPanel mode="signup" />);
      fireEvent.press(getByText('Already have an account? Log in'));

      expect(getByText('Welcome back')).toBeTruthy();
    });

    it('says nothing about signing up on a server that will not take new accounts', () => {
      useAuthStore.setState({
        serverStatus: { enabled: true, setupRequired: false, allowSignup: false, emailConfigured: true },
      });

      const { queryByText } = render(<SignInPanel />);

      expect(queryByText('New here? Sign up')).toBeNull();
    });

    it('says nothing about signing up before the server has been asked', () => {
      const { queryByText } = render(<SignInPanel />);

      expect(queryByText('New here? Sign up')).toBeNull();
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
      const { getByText } = render(<SignInPanel />);

      expect(getByText('ABC-DEF')).toBeTruthy();
      expect(getByText(/we sent a link to reader@example.com/i)).toBeTruthy();
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

      const { getByText } = render(<SignInPanel />);

      expect(getByText('Ask the administrator for the link.')).toBeTruthy();
    });

    it('falls back to its own wording when the server offers no message', () => {
      useAuthStore.setState({
        pending: {
          email: 'reader@example.com',
          deviceCode: 'device-1',
          userCode: null,
          emailSent: false,
        },
      });

      const { getByText, queryByText } = render(<SignInPanel />);

      expect(getByText(/this server cannot send email/i)).toBeTruthy();
      expect(queryByText("This device's code")).toBeNull();
    });

    it('polls until the link is opened', async () => {
      render(<SignInPanel />);

      await act(async () => {
        jest.advanceTimersByTime(9000);
      });

      expect(authActions.pollPendingLogin).toHaveBeenCalledTimes(3);
    });

    it('stops polling once the wait is over', async () => {
      const { rerender } = render(<SignInPanel />);
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });

      useAuthStore.setState({ pending: null });
      rerender(<SignInPanel />);
      await act(async () => {
        jest.advanceTimersByTime(9000);
      });

      expect(authActions.pollPendingLogin).toHaveBeenCalledTimes(1);
    });

    it('lets the wait be abandoned', () => {
      const { getByText } = render(<SignInPanel />);

      fireEvent.press(getByText('Cancel'));

      expect(authActions.cancelLogin).toHaveBeenCalled();
    });
  });
});
