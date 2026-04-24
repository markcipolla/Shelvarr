import { SCHEMA_SQL } from '../../../src/services/db/schema';

describe('SCHEMA_SQL', () => {
  it('creates all expected tables', () => {
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS comics');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS comic_issues');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS books');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS sync_state');
  });

  it('defines indexes for common lookups', () => {
    expect(SCHEMA_SQL).toContain('idx_comics_title');
    expect(SCHEMA_SQL).toContain('idx_comics_updated_at');
    expect(SCHEMA_SQL).toContain('idx_comic_issues_volume');
    expect(SCHEMA_SQL).toContain('idx_books_updated_at');
  });

  it('uses IF NOT EXISTS so re-init is idempotent', () => {
    const creates = SCHEMA_SQL.match(/CREATE TABLE/g) ?? [];
    const idempotent = SCHEMA_SQL.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];
    expect(creates.length).toBe(idempotent.length);
  });
});
