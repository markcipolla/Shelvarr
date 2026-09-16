/**
 * The client half of live updates: one event stream for the whole app, and
 * the rules about when an event is worth re-rendering a page for.
 *
 * The behaviour worth holding still is the restraint. A burst of events must
 * cost one re-render rather than one each, and a tab nobody is looking at must
 * cost none at all until it is looked at again — otherwise a library scan
 * turns every open tab into a few hundred server renders.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import { render, waitFor, cleanup, act } from '@testing-library/react';

const mockRefresh = mock.fn();

mock.module('next/navigation', {
  namedExports: {
    useRouter: () => ({
      push: () => {},
      refresh: mockRefresh,
      replace: () => {},
      prefetch: () => {},
      back: () => {},
    }),
  },
});

/**
 * jsdom has no EventSource, so this stands in for one and lets a test push
 * events down it by hand.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  listeners = new Map<string, ((event: { data: string }) => void)[]>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(kind: string, handler: (event: { data: string }) => void) {
    const existing = this.listeners.get(kind) ?? [];
    this.listeners.set(kind, [...existing, handler]);
  }

  close() {
    this.closed = true;
  }

  /** Deliver an event as the server would. */
  emit(kind: string, payload: unknown) {
    for (const handler of this.listeners.get(kind) ?? []) {
      handler({ data: JSON.stringify(payload) });
    }
  }
}

(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;

const { LiveEventsProvider, useLiveRefresh } = await import(
  '../../../components/live/LiveEvents.js'
);
const { LiveRefresh } = await import('../../../components/live/LiveRefresh.js');

function taskEvent(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'task',
    event: 'completed',
    id: 1,
    taskType: 'scan',
    status: 'completed',
    progress: 0,
    total: null,
    error: null,
    ...overrides,
  };
}

/** The stream the provider opened. */
function stream(): FakeEventSource {
  const found = FakeEventSource.instances.at(-1);
  assert.ok(found, 'expected the provider to have opened a stream');
  return found;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    configurable: true,
  });
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
}

describe('live updates in the browser', () => {
  beforeEach(() => {
    mockRefresh.mock.resetCalls();
    FakeEventSource.instances = [];
    setHidden(false);
  });

  afterEach(() => {
    cleanup();
  });

  const renderWith = (child: React.ReactNode) =>
    render(<LiveEventsProvider>{child}</LiveEventsProvider>);

  it('opens one stream for the whole app, however many pages listen', () => {
    renderWith(
      <>
        <LiveRefresh taskTypes={['scan']} />
        <LiveRefresh taskTypes={['organize']} />
        <LiveRefresh downloads />
      </>
    );

    assert.equal(FakeEventSource.instances.length, 1);
    assert.equal(stream().url, '/api/events');
  });

  it('re-renders the page when a task it cares about changes', async () => {
    renderWith(<LiveRefresh taskTypes={['scan']} />);

    act(() => stream().emit('task', taskEvent({ taskType: 'scan' })));

    await waitFor(() => assert.equal(mockRefresh.mock.callCount(), 1));
  });

  it('ignores task types the page does not show', async () => {
    renderWith(<LiveRefresh taskTypes={['scan']} />);

    act(() => stream().emit('task', taskEvent({ taskType: 'comic_download' })));

    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(mockRefresh.mock.callCount(), 0);
  });

  it('never re-renders for progress alone', async () => {
    renderWith(<LiveRefresh taskTypes={['scan']} />);

    act(() =>
      stream().emit(
        'task',
        taskEvent({ event: 'progress', status: 'running', progress: 5, total: 10 })
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(mockRefresh.mock.callCount(), 0);
  });

  it('costs one re-render for a burst, not one each', async () => {
    renderWith(<LiveRefresh />);

    act(() => {
      for (let id = 1; id <= 20; id += 1) {
        stream().emit('task', taskEvent({ id }));
      }
    });

    await waitFor(() => assert.equal(mockRefresh.mock.callCount(), 1));

    // And it stays at one: the rest were gathered into that render.
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(mockRefresh.mock.callCount(), 1);
  });

  it('leaves a tab nobody is looking at alone, and catches it up when they are', async () => {
    renderWith(<LiveRefresh />);

    setHidden(true);
    act(() => stream().emit('task', taskEvent()));

    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(mockRefresh.mock.callCount(), 0, 'a hidden tab should not re-render');

    setHidden(false);
    act(() => {
      document.dispatchEvent(new window.Event('visibilitychange'));
    });

    await waitFor(() => assert.equal(mockRefresh.mock.callCount(), 1));
  });

  it('does not re-render on becoming visible when nothing happened', async () => {
    renderWith(<LiveRefresh />);

    setHidden(true);
    setHidden(false);
    act(() => {
      document.dispatchEvent(new window.Event('visibilitychange'));
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(mockRefresh.mock.callCount(), 0);
  });

  it('tells a page about downloads only when it asked for them', async () => {
    const downloadEvent = {
      kind: 'download',
      event: 'state',
      id: 3,
      volumeId: 9,
      state: 'completed',
      progress: 10,
      size: 10,
    };

    renderWith(<LiveRefresh taskTypes={['scan']} />);
    act(() => stream().emit('download', downloadEvent));

    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(mockRefresh.mock.callCount(), 0);

    cleanup();
    FakeEventSource.instances = [];

    renderWith(<LiveRefresh downloads />);
    act(() => stream().emit('download', downloadEvent));

    await waitFor(() => assert.equal(mockRefresh.mock.callCount(), 1));
  });

  it('closes the stream when the app unmounts', () => {
    renderWith(<LiveRefresh />);
    const opened = stream();

    cleanup();

    assert.equal(opened.closed, true);
  });

  it('survives a page whose handler throws', async () => {
    function Exploding() {
      useLiveRefresh(() => {
        throw new Error('this page is broken');
      });
      return null;
    }

    renderWith(
      <>
        <Exploding />
        <LiveRefresh />
      </>
    );

    act(() => stream().emit('task', taskEvent()));

    // The working page still re-renders.
    await waitFor(() => assert.equal(mockRefresh.mock.callCount(), 1));
  });
});
