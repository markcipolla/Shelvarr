import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import LoginScreen from '../../src/screens/LoginScreen';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { validateCredentials } from '../../src/services/api/auth';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));
jest.mock('../../src/stores/useAuthStore');
jest.mock('../../src/services/api/auth', () => ({
  validateCredentials: jest.fn(),
}));

const mockLogin = jest.fn().mockResolvedValue(undefined);
const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockValidate = validateCredentials as jest.Mock;

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockUseAuthStore.mockImplementation((selector: any) =>
      selector({ login: mockLogin })
    );
  });

  it('renders login form', () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    expect(getByText('Stacks')).toBeTruthy();
    expect(getByText('Connect to your Komga server')).toBeTruthy();
    expect(getByPlaceholderText('Address (e.g. https://komga.local)')).toBeTruthy();
    expect(getByPlaceholderText('Port')).toBeTruthy();
    expect(getByText('Connect')).toBeTruthy();
  });

  it('shows error when server address is empty', () => {
    const { getByText } = render(<LoginScreen />);
    fireEvent.press(getByText('Connect'));
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Please enter a server address');
  });

  it('validates and logs in with basic auth', async () => {
    mockValidate.mockResolvedValue(true);
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Address (e.g. https://komga.local)'), 'https://myserver.com');
    fireEvent.changeText(getByPlaceholderText('Port'), '');
    fireEvent.changeText(getByPlaceholderText('Username'), 'user');
    fireEvent.changeText(getByPlaceholderText('Password'), 'pass');
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(mockValidate).toHaveBeenCalled();
      expect(mockLogin).toHaveBeenCalled();
    });
  });

  it('shows error on failed validation', async () => {
    mockValidate.mockResolvedValue(false);
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Address (e.g. https://komga.local)'), 'http://server');
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Could not connect. Check your credentials and server URL.');
    });
  });

  it('shows error on network failure', async () => {
    mockValidate.mockRejectedValue(new Error('Network error'));
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Address (e.g. https://komga.local)'), 'http://server');
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Connection failed. Is the server reachable?');
    });
  });

  it('switches to API Key auth', () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.press(getByText('API Key'));
    expect(getByPlaceholderText('API Key')).toBeTruthy();
  });

  it('submits with API Key auth', async () => {
    mockValidate.mockResolvedValue(true);
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);

    fireEvent.press(getByText('API Key'));
    fireEvent.changeText(getByPlaceholderText('Address (e.g. https://komga.local)'), 'myserver');
    fireEvent.changeText(getByPlaceholderText('API Key'), 'my-api-key');
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({ authType: 'apikey', apiKey: 'my-api-key' })
      );
      expect(mockLogin).toHaveBeenCalled();
    });
  });

  it('switches back to basic auth from apikey', () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />);
    fireEvent.press(getByText('API Key'));
    expect(getByPlaceholderText('API Key')).toBeTruthy();
    fireEvent.press(getByText('Basic Auth'));
    expect(getByPlaceholderText('Username')).toBeTruthy();
  });

  it('prefixes http when no protocol given', async () => {
    mockValidate.mockResolvedValue(true);
    const { getByPlaceholderText, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByPlaceholderText('Address (e.g. https://komga.local)'), 'myserver');
    fireEvent.press(getByText('Connect'));

    await waitFor(() => {
      expect(mockValidate).toHaveBeenCalledWith(
        expect.objectContaining({ serverUrl: 'http://myserver:25600' })
      );
    });
  });
});
