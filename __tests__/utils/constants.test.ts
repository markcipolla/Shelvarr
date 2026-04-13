import {
  DOWNLOADS_DIR,
  EXTRACTED_DIR,
  PROGRESS_SYNC_DEBOUNCE_MS,
  PAGE_SIZE,
  SECURE_STORE_KEYS,
} from '../../src/utils/constants';

describe('constants', () => {
  it('exports DOWNLOADS_DIR', () => {
    expect(DOWNLOADS_DIR).toBe('komga-downloads');
  });

  it('exports EXTRACTED_DIR', () => {
    expect(EXTRACTED_DIR).toBe('komga-extracted');
  });

  it('exports PROGRESS_SYNC_DEBOUNCE_MS', () => {
    expect(PROGRESS_SYNC_DEBOUNCE_MS).toBe(3000);
  });

  it('exports PAGE_SIZE', () => {
    expect(PAGE_SIZE).toBe(20);
  });

  it('exports SECURE_STORE_KEYS with all expected keys', () => {
    expect(SECURE_STORE_KEYS).toEqual({
      SERVER_URL: 'komga_server_url',
      USERNAME: 'komga_username',
      PASSWORD: 'komga_password',
      API_KEY: 'komga_api_key',
      AUTH_TYPE: 'komga_auth_type',
      SESSION_COOKIE: 'komga_session',
    });
  });
});
