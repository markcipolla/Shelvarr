/**
 * Test Environment Setup
 *
 * Loads .env.test to provide dummy API keys and config for tests.
 * Existing env vars take precedence (so CI overrides still work).
 * This file must be loaded before any application modules via --import.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envTestPath = resolve(import.meta.dirname, '..', '.env.test');

try {
  const content = readFileSync(envTestPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    // Don't override existing env vars
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.test not found - tests will rely on env vars being set externally
}
