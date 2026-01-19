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

  test('should return timestamp', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();
    expect(data).toHaveProperty('status');
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

test.describe('API - Browse Endpoint', () => {
  test('should list root directories', async ({ request }) => {
    const response = await request.get('/api/browse');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('current');
    expect(data).toHaveProperty('directories');
    expect(Array.isArray(data.directories)).toBe(true);
  });

  test('should handle non-existent path by falling back to root', async ({ request }) => {
    const response = await request.get('/api/browse?path=/nonexistent/path/12345');
    // API falls back to root for non-existent paths
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.current).toBe('/');
  });
});
