/**
 * E2E Tests for API Endpoints
 */

import { test, expect } from '@playwright/test';

test.describe('API Health', () => {
  test('should have healthy API', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('should return version info', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('timestamp');
  });
});

test.describe('API - Books Endpoint', () => {
  test('should return 404 for non-existent book file', async ({ request }) => {
    const response = await request.get('/api/books/99999999/file');
    expect(response.status()).toBe(404);
  });

  test('should return error for invalid book ID', async ({ request }) => {
    const response = await request.get('/api/books/invalid/file');
    expect(response.status()).toBe(400);
  });
});

test.describe('API - Folders Endpoint', () => {
  test('should list root folders', async ({ request }) => {
    const response = await request.get('/api/folders');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('should handle non-existent path', async ({ request }) => {
    const response = await request.get('/api/folders?path=/nonexistent/path/12345');
    // Should either return empty array or error
    expect([200, 400, 404]).toContain(response.status());
  });
});
