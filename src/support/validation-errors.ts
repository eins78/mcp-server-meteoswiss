/**
 * Helper functions for handling validation errors in a user-friendly way
 */

import type { z } from 'zod';

/**
 * Formats a Zod error into a user-friendly message
 * @param error - The Zod error to format
 * @returns A formatted error message string
 */
export function formatZodError(error: z.ZodError): string {
  const messages = error.errors.map((err) => {
    if (err.path.length > 0) {
      return `${err.path.join('.')}: ${err.message}`;
    }
    return err.message;
  });

  // Return a clean, user-friendly message
  if (messages.length === 1) {
    return messages[0] ?? 'Validation error';
  }

  return `Multiple validation errors:\n${messages.map((m) => `- ${m}`).join('\n')}`;
}

/**
 * Creates a validation wrapper that provides better error messages
 * @param schema - The Zod schema to validate against
 * @param toolName - The name of the tool for error context
 * @returns A validation function that throws user-friendly errors
 */
export function createValidator<T>(schema: z.ZodSchema<T>, toolName: string) {
  return async (params: unknown): Promise<T> => {
    const result = await schema.safeParseAsync(params);
    if (!result.success) {
      const formattedError = formatZodError(result.error);
      throw new Error(`Invalid parameters for ${toolName}: ${formattedError}`);
    }
    return result.data;
  };
}
