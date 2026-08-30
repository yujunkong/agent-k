/**
 * SHARED-MCP parse tests.
 */
import { describe, expect, it } from 'vitest';
import { parseMcpServersMap } from './parseMcpServers';

describe('parseMcpServersMap', () => {
  it('parses string command + args', () => {
    const configs = parseMcpServersMap({
      demo: { command: 'npx', args: ['-y', 'demo-mcp'], enabled: true },
    });
    expect(configs[0]).toMatchObject({
      name: 'demo',
      command: 'npx',
      args: ['-y', 'demo-mcp'],
    });
  });

  it('parses HTTP url-only entries', () => {
    const configs = parseMcpServersMap({
      remote: { url: 'https://example.com/mcp' },
    });
    expect(configs[0]?.transport).toBe('http');
    expect(configs[0]?.url).toContain('example.com');
  });
});
