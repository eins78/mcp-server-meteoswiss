/**
 * Type definitions for MCP prompt messages
 *
 * These types provide proper type safety for MCP prompts while following
 * TypeScript best practices. Uses const objects instead of enums.
 */

/**
 * Valid roles for MCP prompt messages
 * @see https://spec.modelcontextprotocol.io/specification/basic/prompts/
 */
export const MCP_PROMPT_ROLES = ['user', 'assistant'] as const;

/**
 * Role of a message in an MCP prompt conversation
 */
export type McpPromptRole = (typeof MCP_PROMPT_ROLES)[number];

/**
 * Valid content types for MCP prompt messages
 * @see https://spec.modelcontextprotocol.io/specification/basic/prompts/
 */
export const MCP_PROMPT_CONTENT_TYPES = ['text'] as const;

/**
 * Type of content in an MCP prompt message
 */
export type McpPromptContentType = (typeof MCP_PROMPT_CONTENT_TYPES)[number];

/**
 * Content structure for MCP prompt messages
 *
 * The [x: string]: unknown index signature allows for future extensions
 * while maintaining type safety for known properties.
 */
export interface McpPromptContent {
  [x: string]: unknown;
  type: McpPromptContentType;
  text: string;
}

/**
 * Message structure for MCP prompts
 *
 * The [x: string]: unknown index signature allows for future extensions
 * while maintaining type safety for known properties.
 */
export interface McpPromptMessage {
  [x: string]: unknown;
  role: McpPromptRole;
  content: McpPromptContent;
}

/**
 * Structure returned by MCP prompt functions
 *
 * The [x: string]: unknown index signature allows for future extensions
 * while maintaining type safety for known properties.
 */
export interface McpPromptResponse {
  [x: string]: unknown;
  messages: McpPromptMessage[];
}

/**
 * Type guard to check if a value is a valid McpPromptRole
 * @param value - Value to check
 * @returns True if the value is a valid McpPromptRole
 */
export function isMcpPromptRole(value: unknown): value is McpPromptRole {
  return typeof value === 'string' && (MCP_PROMPT_ROLES as readonly string[]).includes(value);
}

/**
 * Type guard to check if a value is a valid McpPromptContentType
 * @param value - Value to check
 * @returns True if the value is a valid McpPromptContentType
 */
export function isMcpPromptContentType(value: unknown): value is McpPromptContentType {
  return (
    typeof value === 'string' && (MCP_PROMPT_CONTENT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Type guard to check if a value is a valid McpPromptContent
 * @param value - Value to check
 * @returns True if the value is a valid McpPromptContent
 */
export function isMcpPromptContent(value: unknown): value is McpPromptContent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'text' in value &&
    isMcpPromptContentType(value.type) &&
    typeof value.text === 'string'
  );
}

/**
 * Type guard to check if a value is a valid McpPromptMessage
 * @param value - Value to check
 * @returns True if the value is a valid McpPromptMessage
 */
export function isMcpPromptMessage(value: unknown): value is McpPromptMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    'content' in value &&
    isMcpPromptRole(value.role) &&
    isMcpPromptContent(value.content)
  );
}

/**
 * Type guard to check if a value is a valid McpPromptResponse
 * @param value - Value to check
 * @returns True if the value is a valid McpPromptResponse
 */
export function isMcpPromptResponse(value: unknown): value is McpPromptResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'messages' in value &&
    Array.isArray(value.messages) &&
    value.messages.every(isMcpPromptMessage)
  );
}
