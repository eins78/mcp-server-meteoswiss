/**
 * Jest test setup
 */

// Set test environment variables
process.env.USE_TEST_FIXTURES = 'true';
process.env.NODE_ENV = 'test';

// Extend test timeout for inspector tests
jest.setTimeout(30000);