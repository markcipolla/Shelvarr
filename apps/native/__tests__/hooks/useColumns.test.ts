import { renderHook, act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { useColumns } from '../../src/hooks/useColumns';

describe('useColumns', () => {
  let listeners: Array<(event: any) => void> = [];
  const mockRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    listeners = [];
    jest.spyOn(Dimensions, 'addEventListener').mockImplementation((_event, handler) => {
      listeners.push(handler as any);
      return { remove: mockRemove } as any;
    });
  });

  it('returns 2 columns for narrow screens', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 400, height: 800, scale: 1, fontScale: 1 });
    const { result } = renderHook(() => useColumns());
    expect(result.current).toBe(2);
  });

  it('returns 5 columns for wide screens', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 800, height: 600, scale: 1, fontScale: 1 });
    const { result } = renderHook(() => useColumns());
    expect(result.current).toBe(5);
  });

  it('returns 5 columns at exactly 600 width', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 600, height: 600, scale: 1, fontScale: 1 });
    const { result } = renderHook(() => useColumns());
    expect(result.current).toBe(5);
  });

  it('updates columns on dimension change', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 400, height: 800, scale: 1, fontScale: 1 });
    const { result } = renderHook(() => useColumns());
    expect(result.current).toBe(2);

    act(() => {
      listeners.forEach((l) => l({ window: { width: 800, height: 600 } }));
    });
    expect(result.current).toBe(5);

    act(() => {
      listeners.forEach((l) => l({ window: { width: 400, height: 800 } }));
    });
    expect(result.current).toBe(2);
  });

  it('cleans up listener on unmount', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 400, height: 800, scale: 1, fontScale: 1 });
    const { unmount } = renderHook(() => useColumns());
    unmount();
    expect(mockRemove).toHaveBeenCalled();
  });
});
