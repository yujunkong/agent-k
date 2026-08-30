/**
 * SHARED-MCP — MCP server config wire types (no I/O).
 * MCP-001 / MCP-006 contract surface for settings + host bootstrap.
 */

/** JSON-RPC framing over stdio (many servers use Content-Length headers). */
export type McpFraming = 'content-length' | 'newline';

/** One configured MCP server (Continue / OpenCode-compatible). */
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
  framing?: McpFraming;
  enabled?: boolean;
}

/** Tool descriptor returned by tools/list. */
export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  server?: string;
}

/** Connection status snapshot for host / settings. */
export type McpServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'deferred'
  | 'error';

export interface McpServerRuntimeInfo {
  name: string;
  status: McpServerStatus;
  toolCount?: number;
  error?: string;
  deferredReason?: string;
}
