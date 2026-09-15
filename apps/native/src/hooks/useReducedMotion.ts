import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system's reduce-motion setting, watched through one subscription that
 * every caller shares: a grid of covers would otherwise ask the OS once per
 * card as it scrolls into view.
 */
export function createReducedMotionStore() {
  let reduceMotion = false;
  let watching = false;
  const listeners = new Set<() => void>();

  const update = (value: boolean) => {
    if (value === reduceMotion) return;
    reduceMotion = value;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener: () => void) {
      if (!watching) {
        watching = true;
        AccessibilityInfo.isReduceMotionEnabled().then(update, () => {});
        AccessibilityInfo.addEventListener('reduceMotionChanged', update);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return reduceMotion;
    },
  };
}

const store = createReducedMotionStore();

/** Whether the user has asked the system to reduce motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
