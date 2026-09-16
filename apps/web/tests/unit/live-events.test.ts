/**
 * The live event bus: what background work announces itself on, and what the
 * SSE endpoint forwards to open pages.
 *
 * The parts worth pinning down are the ones that exist to stop a busy download
 * flooding every open tab — progress events are held and overwritten rather
 * than sent one per chunk — and the ordering rule that keeps a finished task
 * from being redrawn as if it were still running.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { setTimeout as delay } from 'node:timers/promises';
import { publish, subscribe, listenerCount } from '@shelvarr/services/events/index';
import type { LiveEvent } from '@shelvarr/services/events/index';

/** Longer than the bus's coalescing window, so a held event has come out. */
const AFTER_COALESCE_MS = 600;

function taskEvent(overrides: Partial<Extract<LiveEvent, { kind: 'task' }>> = {}) {
  return {
    kind: 'task' as const,
    event: 'progress' as const,
    id: 1,
    taskType: 'scan' as const,
    status: 'running' as const,
    progress: 0,
    total: 100,
    ...overrides,
  };
}

describe('live event bus', () => {
  let received: LiveEvent[];
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    received = [];
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  const listen = () => {
    unsubscribe = subscribe((event) => received.push(event));
  };

  it('delivers a status change straight away', () => {
    listen();

    publish(taskEvent({ event: 'completed', status: 'completed', progress: 100 }));

    assert.equal(received.length, 1);
    assert.equal(received[0]?.event, 'completed');
  });

  it('sends only the newest progress for a task', async () => {
    listen();

    for (const progress of [10, 20, 30, 40]) {
      publish(taskEvent({ progress }));
    }

    // Nothing yet: they are being gathered.
    assert.equal(received.length, 0);

    await delay(AFTER_COALESCE_MS);

    assert.equal(received.length, 1);
    assert.equal((received[0] as { progress: number }).progress, 40);
  });

  it('keeps separate tasks separate while coalescing', async () => {
    listen();

    publish(taskEvent({ id: 1, progress: 10 }));
    publish(taskEvent({ id: 2, progress: 70 }));
    publish(taskEvent({ id: 1, progress: 20 }));

    await delay(AFTER_COALESCE_MS);

    assert.equal(received.length, 2);
    const byId = new Map(received.map((e) => [e.id, e as { progress: number }]));
    assert.equal(byId.get(1)?.progress, 20);
    assert.equal(byId.get(2)?.progress, 70);
  });

  it('drops held progress when the task finishes', async () => {
    listen();

    publish(taskEvent({ progress: 30 }));
    publish(taskEvent({ event: 'completed', status: 'completed', progress: 100 }));

    await delay(AFTER_COALESCE_MS);

    // The stale progress must not arrive after the completion and redraw a
    // finished task as running.
    assert.deepEqual(
      received.map((e) => e.event),
      ['completed']
    );
  });

  it('publishes nothing when nobody is listening', async () => {
    publish(taskEvent({ progress: 50 }));
    publish(taskEvent({ event: 'completed', status: 'completed' }));

    listen();
    await delay(AFTER_COALESCE_MS);

    // Including the progress held from before anyone connected: a page renders
    // from the database when it loads and does not want a stale catch-up.
    assert.equal(received.length, 0);
  });

  it('stops delivering once unsubscribed', () => {
    listen();
    unsubscribe?.();
    unsubscribe = null;

    publish(taskEvent({ event: 'completed', status: 'completed' }));

    assert.equal(received.length, 0);
  });

  it('tells every listener, and survives one that throws', () => {
    const quiet: LiveEvent[] = [];
    const angry = subscribe(() => {
      throw new Error('this listener is broken');
    });
    const calm = subscribe((event) => quiet.push(event));

    publish(taskEvent({ event: 'failed', status: 'failed', error: 'nope' }));

    assert.equal(quiet.length, 1);

    angry();
    calm();
  });

  it('counts listeners so publishers can skip the work entirely', () => {
    const before = listenerCount();
    listen();
    assert.equal(listenerCount(), before + 1);
    unsubscribe?.();
    unsubscribe = null;
    assert.equal(listenerCount(), before);
  });

  it('carries download events too', () => {
    listen();

    publish({
      kind: 'download',
      event: 'state',
      id: 7,
      volumeId: 42,
      state: 'completed',
      progress: 1024,
      size: 1024,
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.kind, 'download');
  });
});
