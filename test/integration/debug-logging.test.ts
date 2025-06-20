/**
 * Test debug logging with ISO timestamps and session IDs
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import debugModule from 'debug';
import { runWithSession, getSessionId } from '../../src/support/logging.js';

describe('Debug Logging with Timestamps and Session IDs', () => {
  let originalFormatArgs: typeof debugModule.formatArgs;
  let capturedLogs: string[] = [];

  beforeEach(() => {
    // Store original formatArgs
    originalFormatArgs = debugModule.formatArgs;
    
    // Enable debug for testing
    debugModule.enable('test:*');
    
    // Capture debug output
    debugModule.log = function(...args: unknown[]) {
      capturedLogs.push(args.join(' '));
    };
    
    // Clear captured logs
    capturedLogs = [];
  });

  afterEach(() => {
    // Restore original formatArgs
    debugModule.formatArgs = originalFormatArgs;
    debugModule.disable();
    capturedLogs = [];
  });

  it('should include ISO timestamp in debug output', async () => {
    // Re-import to get our custom formatArgs
    await import('../../src/support/logging.js');
    
    const testDebug = debugModule('test:timestamp');
    testDebug('Test message');
    
    expect(capturedLogs).toHaveLength(1);
    const log = capturedLogs[0]!;
    
    // Check for ISO timestamp format
    const timestampMatch = log.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(timestampMatch).not.toBeNull();
  });

  it('should include session ID when running in session context', async () => {
    // Re-import to get our custom formatArgs
    await import('../../src/support/logging.js');
    
    const testDebug = debugModule('test:session');
    const testSessionId = 'test-session-123456789';
    
    runWithSession(testSessionId, () => {
      testDebug('Test message with session');
    });
    
    expect(capturedLogs).toHaveLength(1);
    const log = capturedLogs[0]!;
    
    // Check for session ID (first 8 chars)
    expect(log).toContain('[test-ses]');
  });

  it('should not include session ID when not in session context', async () => {
    // Re-import to get our custom formatArgs
    await import('../../src/support/logging.js');
    
    const testDebug = debugModule('test:nosession');
    testDebug('Test message without session');
    
    expect(capturedLogs).toHaveLength(1);
    const log = capturedLogs[0]!;
    
    // Should not contain session brackets
    expect(log).not.toMatch(/\[\w{8}\]/);
  });

  it('should format logs with timestamp, session, namespace, and message', async () => {
    // Re-import to get our custom formatArgs
    await import('../../src/support/logging.js');
    
    const testDebug = debugModule('test:full');
    const testSessionId = 'full-test-session-id';
    
    runWithSession(testSessionId, () => {
      testDebug('Complete log format test');
    });
    
    expect(capturedLogs).toHaveLength(1);
    const log = capturedLogs[0]!;
    
    // Log the actual format for debugging
    console.log('Actual log format:', log);
    
    // Check that all components are present
    expect(log).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/); // ISO timestamp
    expect(log).toContain('[full-tes]'); // Session ID (first 8 chars)
    expect(log).toContain('test:full'); // Namespace
    expect(log).toContain('Complete log format test'); // Message
  });

  it('should provide correct session ID through getSessionId', () => {
    const testSessionId = 'context-test-id';
    
    // Outside session context
    expect(getSessionId()).toBeUndefined();
    
    // Inside session context
    runWithSession(testSessionId, () => {
      expect(getSessionId()).toBe(testSessionId);
    });
    
    // After session context
    expect(getSessionId()).toBeUndefined();
  });

  it('should support nested session contexts', () => {
    const outerSessionId = 'outer-session';
    const innerSessionId = 'inner-session';
    
    runWithSession(outerSessionId, () => {
      expect(getSessionId()).toBe(outerSessionId);
      
      runWithSession(innerSessionId, () => {
        expect(getSessionId()).toBe(innerSessionId);
      });
      
      expect(getSessionId()).toBe(outerSessionId);
    });
  });
});