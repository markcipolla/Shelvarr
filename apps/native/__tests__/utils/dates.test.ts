import { sqlTimeToIso, parseSqlTime } from '../../src/utils/dates';

describe('sqlTimeToIso', () => {
  it('marks a stored timestamp as the UTC instant it is', () => {
    expect(sqlTimeToIso('2026-09-16 01:54:53')).toBe('2026-09-16T01:54:53Z');
    expect(sqlTimeToIso('2026-09-16 01:54:53.123')).toBe('2026-09-16T01:54:53.123Z');
  });

  it('leaves alone anything that already carries a zone', () => {
    expect(sqlTimeToIso('2026-09-16T01:54:53.000Z')).toBe('2026-09-16T01:54:53.000Z');
    expect(sqlTimeToIso(sqlTimeToIso('2026-09-16 01:54:53'))).toBe('2026-09-16T01:54:53Z');
    expect(sqlTimeToIso('2026-09-16T11:54:53+10:00')).toBe('2026-09-16T11:54:53+10:00');
  });
});

describe('parseSqlTime', () => {
  it('reads a stored timestamp as UTC, not as the device timezone', () => {
    expect(parseSqlTime('2026-09-16 01:54:53')!.toISOString()).toBe('2026-09-16T01:54:53.000Z');
  });

  it('reads a value the sync payload already marked', () => {
    expect(parseSqlTime('2026-09-16T01:54:53.000Z')!.toISOString()).toBe('2026-09-16T01:54:53.000Z');
  });

  // The mirror holds both spellings — sync writes one, the REST cache the
  // other — and a stale-check that returns NaN silently never refreshes.
  it('never returns an unusable date', () => {
    expect(parseSqlTime(null)).toBeNull();
    expect(parseSqlTime(undefined)).toBeNull();
    expect(parseSqlTime('')).toBeNull();
    expect(parseSqlTime('not a date')).toBeNull();
  });
});
