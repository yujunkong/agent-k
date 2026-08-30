/**
 * MCP-005 — MCP tool permission gate (deny list + optional allowlist).
 */
export interface McpPermissionPolicy {
  /** When false, all MCP calls denied. */
  enabled?: boolean;
  /** Deny specific server names. */
  denyServers?: string[];
  /** Deny tool names (bare or server/tool). */
  denyTools?: string[];
  /** If set, only these servers are allowed. */
  allowServers?: string[];
}

export interface McpPermissionDecision {
  allowed: boolean;
  reason?: string;
}

export function checkMcpToolPermission(
  server: string,
  tool: string,
  policy?: McpPermissionPolicy,
): McpPermissionDecision {
  if (policy?.enabled === false) {
    return { allowed: false, reason: 'MCP feature disabled' };
  }
  const s = server.trim();
  const t = tool.trim();
  if (!s || !t) {
    return { allowed: false, reason: 'server and tool required' };
  }
  if (policy?.denyServers?.includes(s)) {
    return { allowed: false, reason: `MCP server "${s}" denied` };
  }
  if (policy?.allowServers && !policy.allowServers.includes(s)) {
    return { allowed: false, reason: `MCP server "${s}" not in allowlist` };
  }
  const deny = policy?.denyTools || [];
  if (deny.includes(t) || deny.includes(`${s}/${t}`)) {
    return { allowed: false, reason: `MCP tool "${s}/${t}" denied` };
  }
  return { allowed: true };
}
