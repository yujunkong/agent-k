/**
 * MCP-006 — Bootstrap helpers: parse settings + connect.
 */
import {
  parseMcpServersMap,
  type MCPServerConfig,
  type McpServerEntryRaw,
  type McpServerRuntimeInfo,
} from '@agent-k/shared';
import { MCPClient, type MCPClientOptions } from './MCPClient';

export interface BootstrapMcpInput {
  /** Raw `agent-k.mcp.servers` bag. */
  servers?: Record<string, McpServerEntryRaw> | McpServerEntryRaw[] | null;
  /** Parsed configs (skips parse when set). */
  configs?: MCPServerConfig[];
  maxSchemaTokens?: number;
  featureEnabled?: boolean;
  signal?: AbortSignal;
  clientOptions?: MCPClientOptions;
}

export interface BootstrapMcpResult {
  client: MCPClient;
  configs: MCPServerConfig[];
  status: McpServerRuntimeInfo[];
  skipped?: string;
}

/** Create client and connect enabled servers (no-op when feature disabled). */
export async function bootstrapMcp(
  input: BootstrapMcpInput,
): Promise<BootstrapMcpResult> {
  const client = new MCPClient({
    maxSchemaTokens: input.maxSchemaTokens,
    ...(input.clientOptions || {}),
  });

  if (input.featureEnabled === false) {
    client.setPermissionPolicy({ enabled: false });
    return {
      client,
      configs: [],
      status: [],
      skipped: 'agent-k.features.mcp disabled',
    };
  }

  const configs =
    input.configs || parseMcpServersMap(input.servers || null);
  if (input.maxSchemaTokens != null) {
    client.setMaxSchemaTokens(input.maxSchemaTokens);
  }

  const status = await client.connectAll(configs, input.signal);
  return { client, configs, status };
}
