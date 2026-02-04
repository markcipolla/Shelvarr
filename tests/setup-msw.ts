/**
 * MSW Test Setup
 *
 * Import this at the top of test files that need HTTP mocking:
 * import '../setup-msw.js';
 *
 * Or use the server directly for custom handlers:
 * import { server, http, HttpResponse } from '../mocks/server.js';
 */

import { server } from './mocks/server.js';

// Start server before all tests
server.listen({ onUnhandledRequest: 'bypass' });

// Reset handlers after each test (handled by test files)
// server.resetHandlers();

// Close server after all tests
process.on('beforeExit', () => {
  server.close();
});

export { server };
