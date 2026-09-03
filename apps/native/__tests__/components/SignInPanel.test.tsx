import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SignInPanel from '../../src/components/SignInPanel';
import { useAuthStore } from '../../src/stores/useAuthStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

const authActions = {
  beginLogin: jest.fn(),
  submitCode: jest.fn(),
  cancelLogin: jest.fn(),
  clearError: jest.fn(),
};

/** What the store holds once a code has been sent and is being waited on. */
const PENDING = { email: 'reader@example.com', emailSent: true, codeLength: 6 };

/** Type a whole code into the row of boxes, one character per box. */
function typeCode(getByLabelText: (label: string) => unknown, code: string) {
  for (let index = 0; index < code.length; index++) {
    fireEvent.changeText(
      getByLabelText(`Character ${index + 1} of ${code.length}`) as never,
      code[index]
    );
  }
}

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ ...initialAuthState, ...authActions });
});

describe('SignInPanel', () => {
  describe('asking for a code', () => {
    it('opens in login wording by default', () => {
      const { getByText } = render(<SignInPanel />);

      expect(getByText('Welcome back')).toBeTruthy();
      expect(getByText('Email me a code')).toBeTruthy();
    });

    it('opens in signup wording when asked to', () => {
      const { getByText } = render(<SignInPanel mode="signup" />);

      expect(getByText('Make yourself an account')).toBeTruthy();
      expect(getByText('Email me a code')).toBeTruthy();
    });

    it('sends the address the person typed', async () => {
      const { getByText, getByPlaceholderText } = render(<SignInPanel />);

      fireEvent.changeText(getByPlaceholderText('you@example.com'), 'reader@example.com');
      fireEvent.press(getByText('Email me a code'));

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

      expect(queryByText('Email me a code')).toBeNull();
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

  describe('typing the code in', () => {
    beforeEach(() => {
      useAuthStore.setState({ pending: PENDING });
      authActions.submitCode.mockResolvedValue(true);
    });

    it('says where the code went', () => {
      const { getByText } = render(<SignInPanel />);

      expect(getByText(/we sent a 6-character code to reader@example.com/i)).toBeTruthy();
    });

    it('explains what to do when the server cannot send email', () => {
      useAuthStore.setState({
        pending: { ...PENDING, emailSent: false, message: 'Ask the administrator for the code.' },
      });

      const { getByText } = render(<SignInPanel />);

      expect(getByText('Ask the administrator for the code.')).toBeTruthy();
    });

    it('falls back to its own wording when the server offers no message', () => {
      useAuthStore.setState({ pending: { ...PENDING, emailSent: false } });

      const { getByText } = render(<SignInPanel />);

      expect(getByText(/this server cannot send email/i)).toBeTruthy();
    });

    it('offers one box per character', () => {
      const { getByLabelText } = render(<SignInPanel />);

      expect(getByLabelText('Character 1 of 6')).toBeTruthy();
      expect(getByLabelText('Character 6 of 6')).toBeTruthy();
    });

    it('submits the moment the last box is filled', async () => {
      const { getByLabelText } = render(<SignInPanel />);

      typeCode(getByLabelText, 'ABC234');

      await waitFor(() => {
        expect(authActions.submitCode).toHaveBeenCalledWith('ABC234');
      });
    });

    it('spreads a code that arrives all at once across the boxes', async () => {
      const { getByLabelText } = render(<SignInPanel />);

      // Autofill from a mail notification drops the whole code into box one.
      fireEvent.changeText(getByLabelText('Character 1 of 6'), 'ABC234');

      await waitFor(() => {
        expect(authActions.submitCode).toHaveBeenCalledWith('ABC234');
      });
    });

    it('ignores characters a code can never contain', () => {
      const { getByLabelText } = render(<SignInPanel />);

      fireEvent.changeText(getByLabelText('Character 1 of 6'), '!');

      expect(getByLabelText('Character 1 of 6').props.value).toBe('');
    });

    it('shows what the server said about a wrong code', () => {
      useAuthStore.setState({
        pending: PENDING,
        error: 'That code is not right, or it has expired. Ask for a new one.',
      });

      const { getByText } = render(<SignInPanel />);

      expect(getByText(/that code is not right/i)).toBeTruthy();
    });

    it('can ask for a fresh code without retyping the address', () => {
      const { getByText } = render(<SignInPanel />);

      fireEvent.press(getByText('Send a new code'));

      expect(authActions.beginLogin).toHaveBeenCalledWith('reader@example.com');
    });

    it('lets the sign-in be abandoned', () => {
      const { getByText } = render(<SignInPanel />);

      fireEvent.press(getByText('Use a different email'));

      expect(authActions.cancelLogin).toHaveBeenCalled();
    });
  });
});
