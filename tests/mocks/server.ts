/**
 * MSW Server Setup for Node.js Testing
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

// Create the mock server with all handlers
export const server = setupServer(...handlers);

// Export handlers for extending in individual tests
export { handlers } from './handlers.js';
export { http, HttpResponse } from 'msw';
