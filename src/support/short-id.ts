import short from 'short-uuid';
import { randomUUID } from 'node:crypto';

// Create a translator instance for consistent short UUID generation
const translator = short();

/**
 * Generate a short session ID from a UUID
 * @param uuid - Optional UUID to convert. If not provided, generates a new one
 * @returns A shortened version of the UUID
 */
export function generateShortId(uuid?: string): string {
  const fullUuid = uuid ?? randomUUID();
  return translator.fromUUID(fullUuid);
}

/**
 * Convert a short ID back to a UUID (if needed for compatibility)
 * @param shortId - The short ID to convert
 * @returns The full UUID
 */
export function shortIdToUuid(shortId: string): string {
  return translator.toUUID(shortId);
}
