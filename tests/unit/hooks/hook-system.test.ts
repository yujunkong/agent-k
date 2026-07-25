/**
 * C4-T35: HookSystem — pre/post hooks, allow/block/modify, secret scan
 */
import * as assert from 'assert';

suite('HookSystem', () => {
  type HookAction = 'allow' | 'block' | 'modify';

  class SimulatedHookSystem {
    private preHooks: Array<(tool: string, args: any) => HookAction> = [];
    private postHooks: Array<(tool: string, result: any) => HookAction> = [];

    addPreHook(hook: (tool: string, args: any) => HookAction) { this.preHooks.push(hook); }
    addPostHook(hook: (tool: string, result: any) => HookAction) { this.postHooks.push(hook); }

    async runPre(tool: string, args: any): Promise<HookAction> {
      for (const hook of this.preHooks) {
        const result = hook(tool, args);
        if (result !== 'allow') return result;
      }
      return 'allow';
    }

    async runPost(tool: string, result: any): Promise<HookAction> {
      for (const hook of this.postHooks) {
        const r = hook(tool, result);
        if (r !== 'allow') return r;
      }
      return 'allow';
    }
  }

  test('Pre-hook 도구 차단', async () => {
    const hs = new SimulatedHookSystem();
    hs.addPreHook((tool) => tool === 'dangerous-tool' ? 'block' : 'allow');
    assert.strictEqual(await hs.runPre('dangerous-tool', {}), 'block');
    assert.strictEqual(await hs.runPre('safe-tool', {}), 'allow');
  });

  test('Post-hook 결과 수정', async () => {
    const hs = new SimulatedHookSystem();
    hs.addPostHook((tool, result) => {
      if (result.error) return 'modify';
      return 'allow';
    });
    assert.strictEqual(await hs.runPost('edit_file', { error: 'failed' }), 'modify');
    assert.strictEqual(await hs.runPost('edit_file', { success: true }), 'allow');
  });

  test('Secret Scan — API 키 감지', () => {
    const patterns = [
      /sk-[a-zA-Z0-9]{20,}/,   // OpenAI key
      /ghp_[a-zA-Z0-9]{36}/,    // GitHub PAT
      /password\s*=\s*.+/i
    ];
    function scan(text: string): boolean {
      return patterns.some(p => p.test(text));
    }
    assert.ok(scan('sk-proj-abc123def456ghi789jkl012'));
    assert.ok(scan('ghp_abc123def456ghi789jkl012mno345pqr'));
    assert.ok(scan('password = super_secret'));
    assert.ok(!scan('normal text without secrets'));
  });
});
