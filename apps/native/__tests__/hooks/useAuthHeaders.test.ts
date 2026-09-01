import { renderHook } from '@testing-library/react-native';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';
import { useAuthStore } from '../../src/stores/useAuthStore';

const initialState = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(initialState);
});

describe('useAuthHeaders', () => {
  it('returns no headers when signed out', () => {
    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current).toEqual({});
  });

  it('carries the session token as a bearer header when signed in', () => {
    useAuthStore.setState({ token: 'session-abc' });

    const { result } = renderHook(() => useAuthHeaders());

    expect(result.current).toEqual({ Authorization: 'Bearer session-abc' });
  });

  it('keeps the same object while the token is unchanged', () => {
    useAuthStore.setState({ token: 'session-abc' });

    const { result, rerender } = renderHook(() => useAuthHeaders());
    const first = result.current;
    rerender({});

    // Image and download components take these headers as a prop; a new
    // object every render would restart every request.
    expect(result.current).toBe(first);
  });
});
