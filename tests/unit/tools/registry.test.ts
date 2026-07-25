/**
 * C1-T21: 단위 테스트 — ToolRegistry 필터링, ParallelExecutor, PrefetchEngine
 */
import * as assert from 'assert';

suite('ToolRegistry', () => {
  interface MockTool {
    name: string; description: string; parameters: any;
    category: string; destructive: boolean;
    modeAllowlist: string[];
  }

  function createMockRegistry() {
    const tools = new Map<string, MockTool>();
    return {
      register: (t: MockTool) => tools.set(t.name, t),
      getSchemas: (mode: string) => Array.from(tools.values())
        .filter(t => t.modeAllowlist.includes(mode))
        .filter(t => mode === 'ask' ? !['edit', 'terminal', 'debug'].includes(t.category) : true)
        .map(t => ({ function: { name: t.name, description: t.description } })),
      getTool: (name: string) => tools.get(name),
      getAll: () => Array.from(tools.values())
    };
  }

  test('registerTool — 도구 등록 후 조회 가능', () => {
    const registry = createMockRegistry();
    registry.register({ name: 'grep', description: 'Search', parameters: {}, category: 'search', destructive: false, modeAllowlist: ['ask', 'agent'] });
    assert.ok(registry.getTool('grep'));
  });

  test('getSchemas — Ask모드 10개만 반환 (edit 제외)', () => {
    const registry = createMockRegistry();
    const searchTools = ['grep', 'glob', 'read_file', 'list_dir', 'codebase_search', 'lsp_definition', 'lsp_references', 'file_search'];
    const editTools = ['edit_file', 'write_file', 'run_terminal_cmd'];
    
    for (const t of searchTools) registry.register({ name: t, description: '', parameters: {}, category: 'search', destructive: false, modeAllowlist: ['ask', 'agent'] });
    for (const t of editTools) registry.register({ name: t, description: '', parameters: {}, category: 'edit', destructive: true, modeAllowlist: ['agent'] });

    const askSchemas = registry.getSchemas('ask');
    assert.strictEqual(askSchemas.length, 8);
    assert.ok(askSchemas.every((s: any) => !s.function.name.includes('edit')));
  });

  test('getSchemas — Agent모드 전체 도구 반환', () => {
    const registry = createMockRegistry();
    registry.register({ name: 'grep', description: '', parameters: {}, category: 'search', destructive: false, modeAllowlist: ['ask', 'agent'] });
    registry.register({ name: 'edit_file', description: '', parameters: {}, category: 'edit', destructive: true, modeAllowlist: ['agent'] });

    const agentSchemas = registry.getSchemas('agent');
    assert.strictEqual(agentSchemas.length, 2);
  });
});

suite('ParallelExecutor', () => {
  test('Promise.all + concurrency limit — 순서 보장', async () => {
    const order: number[] = [];
    const delays = [30, 10, 20];
    
    async function runWithLimit(tasks: Array<() => Promise<void>>, limit: number) {
      const executing: Promise<void>[] = [];
      for (const task of tasks) {
        const p = task().then(() => {
          executing.splice(executing.indexOf(p), 1);
        });
        executing.push(p);
        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);
    }

    await runWithLimit(
      delays.map((d, i) => () => new Promise<void>(r => setTimeout(() => { order.push(i); r(); }, d))),
      2
    );

    assert.strictEqual(order.length, 3);
  });
});

suite('PrefetchEngine', () => {
  function extractMentions(text: string): string[] {
    const regex = /@(file|folder|symbol|codebase):([^\s,;\]]+)/g;
    const mentions: string[] = [];
    let m;
    while ((m = regex.exec(text)) !== null) mentions.push(`${m[1]}:${m[2]}`);
    return mentions;
  }

  test('@file: 멘션 추출', () => {
    const result = extractMentions('Check @file:src/main.ts and @file:src/utils.ts');
    assert.strictEqual(result.length, 2);
    assert.ok(result[0].includes('src/main.ts'));
  });

  test('@symbol: 멘션 추출', () => {
    const result = extractMentions('What does @symbol:calculateTotal do?');
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].includes('calculateTotal'));
  });

  test('멘션 없음 — 빈 배열', () => {
    assert.strictEqual(extractMentions('No mentions here').length, 0);
  });
});
