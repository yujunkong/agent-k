/**
 * C7-T42: E2E — MCP 실 클라이언트 API (RW-C57-03-R2)
 *
 * 착각 금지: serverCount / 없는 메서드 호출 금지.
 * 공개 API: registerServer, connect, getAllTools, callTool, isConnected, disconnectAll, getToolMeta
 */
import * as assert from 'assert';
import { MCPClient, MCPServerConfig } from '../../src/mcp/MCPClient';

suite('E2E: MCP — Client API (C7-T42 / RW-C57-03-R2)', () => {
  test('MCPClient 생성 및 서버 등록', () => {
    const client = new MCPClient();
    const config: MCPServerConfig = {
      name: 'test-server',
      command: 'node',
      args: ['-e', 'process.exit(0)']
    };
    client.registerServer(config);
    // Registered but not connected yet
    assert.strictEqual(client.isConnected('test-server'), false);
    assert.strictEqual(client.getAllTools().length, 0);
  });

  test('서버 등록 없이 connect 시 에러 (not registered)', async () => {
    const client = new MCPClient();
    try {
      await client.connect('nonexistent');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(/not registered/i.test(String(err)), `expected "not registered", got: ${err}`);
    }
  });

  test('getAllTools() — 연결 전 빈 배열', () => {
    const client = new MCPClient();
    const tools = client.getAllTools();
    assert.ok(Array.isArray(tools));
    assert.strictEqual(tools.length, 0);
  });

  test('disconnectAll — 도구 맵 정리', async () => {
    const client = new MCPClient();
    const config: MCPServerConfig = {
      name: 's1',
      command: 'echo',
      args: ['hello']
    };
    client.registerServer(config);
    await client.disconnectAll();
    assert.strictEqual(client.getAllTools().length, 0);
    assert.strictEqual(client.isConnected('s1'), false);
  });

  test('getToolMeta / generateSchemas — 빈 상태', () => {
    const client = new MCPClient();
    assert.deepStrictEqual(client.getToolMeta(), []);
    assert.deepStrictEqual(Object.keys(client.generateSchemas()), []);
  });
});
