import { renderHook } from '@testing-library/react-native';
import { useAuthHeaders } from '../../src/hooks/useAuthHeaders';

describe('useAuthHeaders', () => {
  it('returns empty headers (no auth layer)', () => {
    const { result } = renderHook(() => useAuthHeaders());
    expect(result.current).toEqual({});
  });

  it('returns a stable empty object shape', () => {
    const { result } = renderHook(() => useAuthHeaders());
    expect(Object.keys(result.current)).toHaveLength(0);
  });
});
