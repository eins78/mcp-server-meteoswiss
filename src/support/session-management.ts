import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

interface Session {
  transport: Transport;
  lastActivity: number;
}

/**
 * Manages transport sessions with automatic cleanup
 */
export class SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly maxSessions: number,
    private readonly sessionTimeoutMs: number
  ) {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Run cleanup every minute
  }

  /**
   * Add a new session
   * @throws {Error} If max sessions limit is reached
   */
  add(sessionId: string, transport: Transport): void {
    if (this.sessions.size >= this.maxSessions && !this.sessions.has(sessionId)) {
      throw new Error(`Maximum sessions limit (${this.maxSessions}) reached`);
    }

    this.sessions.set(sessionId, {
      transport,
      lastActivity: Date.now(),
    });
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): Transport | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      return session.transport;
    }
    return undefined;
  }

  /**
   * Remove a session
   */
  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Close the transport if it has a close method
      if ('close' in session.transport && typeof session.transport.close === 'function') {
        session.transport.close();
      }
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Clean up expired sessions
   */
  cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > this.sessionTimeoutMs) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      console.error(`Session ${sessionId} expired, removing...`);
      this.remove(sessionId);
    }
  }

  /**
   * Stop the session manager and clean up all sessions
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    for (const sessionId of this.sessions.keys()) {
      this.remove(sessionId);
    }
  }

  /**
   * Get current session count
   */
  get size(): number {
    return this.sessions.size;
  }
}