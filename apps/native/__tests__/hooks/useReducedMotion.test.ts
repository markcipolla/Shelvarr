import { useSyncExternalStore } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { createReducedMotionStore, useReducedMotion } from '../../src/hooks/useReducedMotion';

describe('useReducedMotion', () => {
  let changeListener: ((enabled: boolean) => void) | undefined;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    changeListener = undefined;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      handler: (enabled: boolean) => void,
    ) => {
      changeListener = handler;
      return { remove: jest.fn() };
    }) as never);
  });

  // A fresh store per test, since the app's own is shared for its lifetime.
  const renderStore = (store = createReducedMotionStore()) =>
    renderHook(() => useSyncExternalStore(store.subscribe, store.getSnapshot));

  it('starts out false and picks up the system setting', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { result } = renderStore();
    expect(result.current).toBe(false);

    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('follows the setting as it changes', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const { result } = renderStore();
    await act(async () => {});
    expect(result.current).toBe(false);

    act(() => changeListener!(true));
    expect(result.current).toBe(true);

    // The same value again changes nothing.
    act(() => changeListener!(true));
    expect(result.current).toBe(true);

    act(() => changeListener!(false));
    expect(result.current).toBe(false);
  });

  it('asks the system once, however many components are watching', async () => {
    const isEnabled = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const store = createReducedMotionStore();

    const first = renderStore(store);
    const second = renderStore(store);
    await act(async () => {});

    expect(isEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(1);

    first.unmount();
    act(() => changeListener!(true));
    expect(second.result.current).toBe(true);
    second.unmount();
  });

  it('stays false if the system cannot say', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValue(new Error('unavailable'));

    const { result } = renderStore();
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it('reads the app-wide setting through the hook', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);

    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});
    expect(result.current).toBe(false);
  });
});
