/**
 * Re-export RuntimeServices accessors for older import paths (RW-C6-04 / RW-C7-03).
 * Prefer importing from ../core/RuntimeServices directly.
 */
export {
  RuntimeServices
} from '../core/RuntimeServices';

import { RuntimeServices } from '../core/RuntimeServices';
import type { DebugLogServer } from './DebugLogServer';
import type { MCPClient } from '../mcp/MCPClient';

export function setDebugLogServer(server: DebugLogServer): void {
  RuntimeServices.setDebugLogServer(server);
}

export function getDebugLogServer(): DebugLogServer {
  const s = RuntimeServices.getDebugLogServer();
  if (!s) throw new Error('DebugLogServer not initialized');
  return s;
}

export function setMCPClient(client: MCPClient): void {
  RuntimeServices.setMcpClient(client);
}

export function getMCPClient(): MCPClient {
  const c = RuntimeServices.getMcpClient();
  if (!c) throw new Error('MCPClient not initialized');
  return c;
}

export function clearDebugServices(): void {
  // no-op clear for tests — RuntimeServices holds module-level refs
}
