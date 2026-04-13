import { PROGRESS_SYNC_DEBOUNCE_MS } from '../../src/utils/constants';

jest.mock('../../src/services/api/books', () => ({
  updateReadProgress: jest.fn().mockResolvedValue(undefined),
  updateEpubProgression: jest.fn().mockResolvedValue(undefined),
}));

import { updateReadProgress, updateEpubProgression } from '../../src/services/api/books';
import {
  syncProgress,
  syncEpubProgress,
  flushProgress,
  flushAllProgress,
  retryOfflineQueue,
} from '../../src/services/progressSync';

const mockedUpdateRead = updateReadProgress as jest.Mock;
const mockedUpdateEpub = updateEpubProgression as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  // Flush any remaining timers to clean up module state
  jest.runAllTimers();
  jest.useRealTimers();
});

describe('syncProgress', () => {
  it('debounces calls and flushes after timeout', () => {
    syncProgress('b1', 5);
    syncProgress('b1', 6);
    syncProgress('b1', 7);

    expect(mockedUpdateRead).not.toHaveBeenCalled();

    jest.advanceTimersByTime(PROGRESS_SYNC_DEBOUNCE_MS);

    expect(mockedUpdateRead).toHaveBeenCalledTimes(1);
    expect(mockedUpdateRead).toHaveBeenCalledWith('b1', 7, false);
  });

  it('tracks different books independently', () => {
    syncProgress('b1', 3);
    syncProgress('b2', 5);

    jest.advanceTimersByTime(PROGRESS_SYNC_DEBOUNCE_MS);

    expect(mockedUpdateRead).toHaveBeenCalledTimes(2);
    expect(mockedUpdateRead).toHaveBeenCalledWith('b1', 3, false);
    expect(mockedUpdateRead).toHaveBeenCalledWith('b2', 5, false);
  });

  it('passes completed flag', () => {
    syncProgress('b1', 10, true);
    jest.advanceTimersByTime(PROGRESS_SYNC_DEBOUNCE_MS);
    expect(mockedUpdateRead).toHaveBeenCalledWith('b1', 10, true);
  });
});

describe('syncEpubProgress', () => {
  it('clears existing timer when called again for same book', () => {
    syncEpubProgress('b1', 0.3, false, 'ch1.xhtml');
    syncEpubProgress('b1', 0.5, false, 'ch1.xhtml');

    jest.advanceTimersByTime(PROGRESS_SYNC_DEBOUNCE_MS);

    expect(mockedUpdateEpub).toHaveBeenCalledTimes(1);
    expect(mockedUpdateEpub).toHaveBeenCalledWith('b1', 0.5, false, 'ch1.xhtml');
  });

  it('debounces and sends epub progression', async () => {
    syncEpubProgress('b1', 0.5, false, 'ch1.xhtml');

    jest.advanceTimersByTime(PROGRESS_SYNC_DEBOUNCE_MS);
    await Promise.resolve();

    expect(mockedUpdateEpub).toHaveBeenCalledWith('b1', 0.5, false, 'ch1.xhtml');
  });

  it('flushes epub progress directly', async () => {
    syncEpubProgress('b1', 0.75, true, 'ch2.xhtml');
    await flushProgress('b1');
    expect(mockedUpdateEpub).toHaveBeenCalledWith('b1', 0.75, true, 'ch2.xhtml');
  });

  it('uses default parameters when not provided', async () => {
    syncEpubProgress('b1', 0.5);
    await flushProgress('b1');
    expect(mockedUpdateEpub).toHaveBeenCalledWith('b1', 0.5, false, '');
  });
});

describe('flushProgress', () => {
  it('does nothing when no pending entry', async () => {
    await flushProgress('nonexistent');
    expect(mockedUpdateRead).not.toHaveBeenCalled();
    expect(mockedUpdateEpub).not.toHaveBeenCalled();
  });

  it('flushes non-epub progress', async () => {
    syncProgress('b1', 5);
    await flushProgress('b1');
    expect(mockedUpdateRead).toHaveBeenCalledWith('b1', 5, false);
  });

  it('flushes epub progress', async () => {
    syncEpubProgress('b1', 0.6, false, 'href.xhtml');
    await flushProgress('b1');
    expect(mockedUpdateEpub).toHaveBeenCalledWith('b1', 0.6, false, 'href.xhtml');
  });

  it('pushes to offline queue on error', async () => {
    mockedUpdateRead.mockRejectedValueOnce(new Error('Network error'));

    syncProgress('b1', 5);
    await flushProgress('b1');

    mockedUpdateRead.mockResolvedValueOnce(undefined);
    await retryOfflineQueue();
    expect(mockedUpdateRead).toHaveBeenCalledTimes(2);
  });
});

describe('flushAllProgress', () => {
  it('flushes all pending progress', async () => {
    syncProgress('b1', 3);
    syncProgress('b2', 7);

    await flushAllProgress();

    expect(mockedUpdateRead).toHaveBeenCalledTimes(2);
  });
});

describe('retryOfflineQueue', () => {
  it('retries and re-queues failed items', async () => {
    mockedUpdateRead.mockRejectedValueOnce(new Error('fail'));
    syncProgress('b1', 5);
    await flushProgress('b1');

    mockedUpdateRead.mockRejectedValueOnce(new Error('fail again'));
    await retryOfflineQueue();

    mockedUpdateRead.mockResolvedValueOnce(undefined);
    await retryOfflineQueue();
    expect(mockedUpdateRead).toHaveBeenCalledTimes(3);
  });

  it('retries epub progress items', async () => {
    mockedUpdateEpub.mockRejectedValueOnce(new Error('fail'));
    syncEpubProgress('b1', 0.3, false, 'ch.xhtml');
    await flushProgress('b1');

    mockedUpdateEpub.mockResolvedValueOnce(undefined);
    await retryOfflineQueue();
    expect(mockedUpdateEpub).toHaveBeenCalledTimes(2);
  });

  it('re-queues epub items that fail on retry', async () => {
    mockedUpdateEpub.mockRejectedValueOnce(new Error('fail'));
    syncEpubProgress('b1', 0.3, false, 'ch.xhtml');
    await flushProgress('b1');

    mockedUpdateEpub.mockRejectedValueOnce(new Error('fail again'));
    await retryOfflineQueue();

    mockedUpdateEpub.mockResolvedValueOnce(undefined);
    await retryOfflineQueue();
    expect(mockedUpdateEpub).toHaveBeenCalledTimes(3);
  });
});
