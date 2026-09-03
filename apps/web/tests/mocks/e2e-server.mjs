/**
 * MSW for the e2e suite.
 *
 * The requests worth mocking in e2e are made by the server, not the browser —
 * rendering /settings/downloads fetches source statuses during the server
 * component render — so Playwright's page.route() cannot see them and msw/node
 * has to run inside the dev server itself. playwright.config.js loads this
 * through NODE_OPTIONS, after no-network.mjs.
 *
 * Handlers are fixed for the whole run. A test cannot call server.use(),
 * because it lives in a different process from this one, and the msw API for
 * driving a server remotely is not in the version we have.
 *
 * Anything without a handler is passed through to the guard loaded before us,
 * which blocks it and says so. That is the intended way to find out a new
 * external call has appeared: add a handler here.
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers.mjs';

setupServer(...handlers).listen({ onUnhandledRequest: 'bypass' });

// Playwright only pipes the dev server's stderr, so this has to be a warning
// to show up in the test output at all.
console.warn('[e2e] mocking external APIs with msw');
