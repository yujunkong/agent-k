/**
 * MCP-001 / MCP-005 / MCP-006 unit tests.
 */
import { describe, expect, it } from 'vitest';
import { parseMcpServersMap } from '@agent-k/shared';
import { checkMcpToolPermission } from './McpPermissions';
import { shouldDeferMcpServer } from './DeferredMCPTools';
import { MCPClient } from './MCPClient';

describe('parseMcpServersMap (MCP-006)', () => {
  it('parses Continue-style command arrays', () => {
    const configs = parseMcpServersMap({
      searxng: {
        type: 'local',
        command: ['python3', '/tmp/server.py'],
        enabled: true,
      },
    });
    expect(configs).toHaveLength(1);
    expect(configs[0]?.name).toBe('searxng');
    expect(configs[0]?.command).toBe('python3');
    expect(configs[0]?.args).toEqual(['/tmp/server.py']);
  });

  it('skips disabled servers', () => {
    expect(
      parseMcpServersMap({
        x: { command: 'echo', enabled: false },
      }),
    ).toHaveLength(0);
  });
});

describe('checkMcpToolPermission (MCP-005)', () => {
  it('denies when feature disabled', () => {
    expect(
      checkMcpToolPermission('s', 't', { enabled: false }).allowed,
    ).toBe(false);
  });

  it('denies denyServers / denyTools', () => {
    expect(
      checkMcpToolPermission('bad', 't', { denyServers: ['bad'] }).allowed,
    ).toBe(false);
    expect(
      checkMcpToolPermission('s', 'evil', { denyTools: ['evil'] }).allowed,
    ).toBe(false);
  });

  it('allows by default', () => {
    expect(checkMcpToolPermission('s', 't').allowed).toBe(true);
  });
});

describe('shouldDeferMcpServer (MCP-006)', () => {
  it('defers when over budget', () => {
    const d = shouldDeferMcpServer(
      [{ name: 'a' }, { name: 'b' }],
      10,
      () => 100,
    );
    expect(d.connectNow).toBe(false);
    expect(d.reason).toContain('budget');
  });
});

describe('MCPClient (MCP-001)', () => {
  it('records HTTP servers as error without crashing', async () => {
    const client = new MCPClient();
    const info = await client.connectOne({
      name: 'remote',
      command: '',
      transport: 'http',
      url: 'https://example.com/mcp',
    });
    expect(info.status).toBe('error');
    expect(info.error).toMatch(/HTTP/);
  });

  it('permission gate blocks callTool', async () => {
    const client = new MCPClient({
      permission: { enabled: false },
    });
    await expect(client.callTool('s', 't', {})).rejects.toThrow(/disabled/i);
  });
});
