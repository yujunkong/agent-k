/**
 * Re-export MCP parse helpers from @agent-k/shared (MCP-006).
 * Keeps Settings McpTab import path stable.
 */
export {
  parseMcpServersMap,
  type McpServerEntryRaw,
  type MCPServerConfig,
  type McpFraming,
} from '@agent-k/shared';
