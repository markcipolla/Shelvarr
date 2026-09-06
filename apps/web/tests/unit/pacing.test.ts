/**
 * The shared request-pacing helper.
 *
 * The suite runs with SHELVARR_DISABLE_REQUEST_PACING=1 (see .env.test), so the
 * "waits" case here has to set the variable back for the length of the test —
 * which is also the only place the enabled path gets exercised at all.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { pace } from '@shelvarr/services';

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
