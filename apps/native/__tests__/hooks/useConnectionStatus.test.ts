import { renderHook } from '@testing-library/react-native';
import { useConnectionStatus } from '../../src/hooks/useConnectionStatus';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useSettingsStore } from '../../src/stores/useSettingsStore';

jest.mock('../../src/services/api/client', () => ({
  getApiClient: jest.fn(),
  resetApiClient: jest.fn(),
}));

const initialAuthState = useAuthStore.getState();
const initialSettingsState = useSettingsStore.getState();

beforeEach(() => {
  useAuthStore.setState({ ...initialAuthState });
  useSettingsStore.setState({ ...initialSettingsState });
});

describe('useConnectionStatus', () => {
  it('reports a missing server address first, whatever the sign-in state', () => {
    useSettingsStore.setState({ shelvarrUrl: '' });
    useAuthStore.setState({ state: 'signed-out' });

    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current).toBe('no-server');
  });

  it('reports being signed out', () => {
    useSettingsStore.setState({ shelvarrUrl: 'http://books.local' });
    useAuthStore.setState({ state: 'signed-out' });

    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current).toBe('signed-out');
  });

  it('is ready once there is a server and a session', () => {
    useSettingsStore.setState({ shelvarrUrl: 'http://books.local' });
    useAuthStore.setState({ state: 'signed-in' });

    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current).toBe('ready');
  });

  it('is ready on a server that does not ask for a login', () => {
    useSettingsStore.setState({ shelvarrUrl: 'http://books.local' });
    useAuthStore.setState({ state: 'disabled' });

    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current).toBe('ready');
  });
});
