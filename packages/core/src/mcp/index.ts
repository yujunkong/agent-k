/**
 * MCP domain barrel — MCP-001…006.
 */
export { MCPClient, type MCPClientOptions } from './MCPClient';
export { StdioMcpSession } from './StdioMcpSession';
export {
  shouldDeferMcpServer,
  type DeferredDecision,
} from './DeferredMCPTools';
export {
  checkMcpToolPermission,
  type McpPermissionDecision,
  type McpPermissionPolicy,
} from './McpPermissions';
export {
  bootstrapMcp,
  type BootstrapMcpInput,
  type BootstrapMcpResult,
} from './bootstrapMcp';
