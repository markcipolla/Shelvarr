/**
 * Unit tests for AboutTab component
 * Verifies app version, build version, and static metadata display.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import '../../../tests/setup-react.js';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { AboutTab } from '../../../components/settings/AboutTab.js';
import {
  APP_NAME,
  APP_VERSION,
  BUILD_VERSION,
  FRAMEWORK,
  REPOSITORY_URL,
} from '../../../lib/constants.js';

describe('AboutTab Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Header', () => {
    it('should render the app name as heading', () => {
      render(<AboutTab />);
      assert.ok(screen.getByRole('heading', { name: APP_NAME }));
    });

    it('should render the app tagline', () => {
      render(<AboutTab />);
      assert.ok(
        screen.getByText(/Self-hosted book and comic metadata management/i)
      );
    });
  });

  describe('Version info card', () => {
    it('should render "Version" label', () => {
      render(<AboutTab />);
      assert.ok(screen.getByText('Version'));
    });

    it('should render the APP_VERSION value', () => {
      render(<AboutTab />);
      assert.ok(screen.getByText(APP_VERSION));
    });

    it('should render "Build" label', () => {
      render(<AboutTab />);
      assert.ok(screen.getByText('Build'));
    });

    it('should render the BUILD_VERSION value', () => {
      render(<AboutTab />);
      assert.ok(screen.getByText(BUILD_VERSION));
    });

    it('should render the build version with monospace font', () => {
      render(<AboutTab />);
      const buildValue = screen.getByText(BUILD_VERSION);
      assert.ok(buildValue.className.includes('font-mono'));
    });

    it('should render the framework label and value', () => {
      render(<AboutTab />);
      assert.ok(screen.getByText('Framework'));
      assert.ok(screen.getByText(FRAMEWORK));
    });

    it('should render the database label and value', () => {
      render(<AboutTab />);
      assert.ok(screen.getByText('Database'));
      assert.ok(screen.getByText('SQLite'));
    });
  });

  describe('Links', () => {
    it('should render the GitHub Repository link', () => {
      render(<AboutTab />);
      const link = screen.getByRole('link', { name: 'GitHub Repository' });
      assert.strictEqual(link.getAttribute('href'), REPOSITORY_URL);
      assert.strictEqual(link.getAttribute('target'), '_blank');
      assert.ok(link.getAttribute('rel')?.includes('noopener'));
    });

    it('should render the Report an Issue link', () => {
      render(<AboutTab />);
      const link = screen.getByRole('link', { name: 'Report an Issue' });
      assert.strictEqual(link.getAttribute('href'), `${REPOSITORY_URL}/issues`);
      assert.strictEqual(link.getAttribute('target'), '_blank');
    });
  });
});
