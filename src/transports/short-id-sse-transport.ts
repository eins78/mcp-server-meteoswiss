import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { ServerResponse } from 'node:http';
import short from 'short-uuid';
import { randomUUID } from 'node:crypto';

const translator = short();

/**
 * Custom SSE transport that uses short session IDs instead of full UUIDs
 */
export class ShortIdSSEServerTransport extends SSEServerTransport {
  private readonly _shortId: string;

  constructor(endpoint: string, res: ServerResponse) {
    super(endpoint, res);

    // Generate short ID from UUID
    this._shortId = translator.fromUUID(randomUUID());

    // Override internal session ID
    Object.defineProperty(this, '_sessionId', {
      value: this._shortId,
      writable: false,
      configurable: false,
    });
  }

  override get sessionId(): string {
    return this._shortId;
  }
}
