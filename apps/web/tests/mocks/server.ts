/**
 * MSW Server Setup for Node.js Testing
 *
 * For the e2e equivalent — the same handlers, loaded into the dev server
 * Playwright drives — see e2e-server.mjs.
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers.mjs';

// Create the mock server with all handlers
export const server = setupServer(...handlers);

// Export handlers for extending in individual tests
export { handlers } from './handlers.mjs';
export { http, HttpResponse } from 'msw';
