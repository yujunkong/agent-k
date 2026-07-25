/**
 * C7-T42: E2E — MCP 도구 등록 → Agent가 호출 → 결과 반환
 */
import * as assert from 'assert';
import { MCPClient } from '../../../src/mcp/MCPClient';

suite('C7-T42: MCP E2E', () => {
  let client: MCPClient;

  setup(() => {
    client = new MCPClient('mcp_');
  });

  test('MCP 서버 등록 및 연결', async () => {
    client.registerServer({
      name: 'test-server',
      command: 'echo',
      transport: 'stdio'
    });

    const tools = await client.connect('test-server');
    assert.ok(tools.length > 0);
    assert.ok(tools.every(t => t.name.startsWith('mcp_test-server_')));
  });

  test('MCP 도구 메타 및 스키마 생성', async () => {
    client.registerServer({ name: 'gh', command: 'gh', transport: 'stdio' });
    await client.connect('gh');

    const meta = client.getToolMeta();
    assert.ok(meta.every(m => m.category === 'mcp'));

    const schemas = client.generateSchemas();
    assert.ok(Object.keys(schemas).length > 0);
  });
});
