/**
 * The shared request-pacing helper.
 *
 * The suite runs with SHELVARR_DISABLE_REQUEST_PACING=1 (see .env.test), so the
 * "waits" case here has to set the variable back for the length of the test —
 * which is also the only place the enabled path gets exercised at all.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  pace,
  paceSource,
  parseRetryAfter,
  resetSourcePacing,
} from '@shelvarr/services/utils/pacing';

const FLAG = 'SHELVARR_DISABLE_REQUEST_PACING';

describe('pace', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[FLAG];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  });

  it('waits for the requested interval when pacing is on', async () => {
    delete process.env[FLAG];

    const started = Date.now();
    await pace(50);

    // Timers fire on or after their deadline, and can be a millisecond shy of
    // it by Date.now()'s reckoning, so allow a little slack.
    assert.ok(Date.now() - started >= 45, `only waited ${Date.now() - started}ms`);
  });

  it('returns immediately when pacing is disabled', async () => {
    process.env[FLAG] = '1';

    const started = Date.now();
    await pace(5_000);

    assert.ok(Date.now() - started < 100, `waited ${Date.now() - started}ms`);
  });

  it('only treats an exact "1" as disabled, so a stray value cannot skip the wait', async () => {
    process.env[FLAG] = 'false';

    const started = Date.now();
    await pace(50);

    assert.ok(Date.now() - started >= 45, `only waited ${Date.now() - started}ms`);
  });

  it('does not wait for a zero or negative interval', async () => {
    delete process.env[FLAG];

    const started = Date.now();
    await pace(0);
    await pace(-1);

    assert.ok(Date.now() - started < 100, `waited ${Date.now() - started}ms`);
  });
});

/**
 * Per-source pacing (E1-6): `pace` spaces one caller's own loop, this spaces
 * everything that talks to a source, however many downloads are in flight.
 */
describe('paceSource', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[FLAG];
    resetSourcePacing();
  });

  afterEach(() => {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
    resetSourcePacing();
  });

  it('spaces successive requests to the same source', async () => {
    delete process.env[FLAG];

    const started = Date.now();
    // The first call is free — nothing has talked to this source yet — so
    // only the second one waits.
    await paceSource('zlibrary', 40);
    await paceSource('zlibrary', 40);

    assert.ok(Date.now() - started >= 35, `only waited ${Date.now() - started}ms`);
  });

  it('holds two downloads starting in the same tick apart from each other', async () => {
    delete process.env[FLAG];

    // Why the reservation is made synchronously, before the await: both
    // callers read the same "now", and the second still has to wait its turn
    // rather than firing alongside the first.
    const started = Date.now();
    await Promise.all([paceSource('annas', 40), paceSource('annas', 40)]);

    assert.ok(Date.now() - started >= 35, `only waited ${Date.now() - started}ms`);
  });

  it('paces each source independently', async () => {
    delete process.env[FLAG];

    await paceSource('libgen', 5_000);

    const started = Date.now();
    await paceSource('getcomics', 0);

    assert.ok(Date.now() - started < 100, `waited ${Date.now() - started}ms`);
  });
});

/** The `Retry-After` header, in both the shapes RFC 9110 allows. */
describe('parseRetryAfter', () => {
  it('reads a delay in seconds', () => {
    assert.strictEqual(parseRetryAfter('120'), 120_000);
    assert.strictEqual(parseRetryAfter(' 30 '), 30_000);
  });

  it('reads an HTTP-date as the time remaining until it', () => {
    const now = Date.parse('2026-09-17T00:00:00Z');
    assert.strictEqual(parseRetryAfter('Thu, 17 Sep 2026 01:00:00 GMT', now), 3_600_000);
  });

  it('treats a date already in the past as no wait at all', () => {
    const now = Date.parse('2026-09-17T00:00:00Z');
    assert.strictEqual(parseRetryAfter('Wed, 16 Sep 2026 23:00:00 GMT', now), 0);
  });

  it('returns null for a missing or unparseable header, so the caller picks its own wait', () => {
    assert.strictEqual(parseRetryAfter(null), null);
    assert.strictEqual(parseRetryAfter(undefined), null);
    assert.strictEqual(parseRetryAfter(''), null);
    assert.strictEqual(parseRetryAfter('soon'), null);
  });
});
