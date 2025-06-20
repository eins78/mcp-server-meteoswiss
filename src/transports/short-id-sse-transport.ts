import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { ServerResponse } from 'node:http';
import { generateShortId } from '../support/short-id.js';

/**
 * Custom SSE transport that uses short session IDs instead of full UUIDs
 */
export class ShortIdSSEServerTransport extends SSEServerTransport {
  private _shortSessionId: string;

  constructor(endpoint: string, res: ServerResponse) {
    super(endpoint, res);

    // Generate a short session ID
    this._shortSessionId = generateShortId();

    // Override the sessionId getter to return our short ID
    Object.defineProperty(this, '_sessionId', {
      value: this._shortSessionId,
      writable: false,
      configurable: false,
    });
  }

  /**
   * Override sessionId getter to ensure we always return the short ID
   */
  override get sessionId(): string {
    return this._shortSessionId;
  }
}
